// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { SpeechServiceError, SpeechUnreachableError, type SpeechProvider, type Transcription } from '../speech/speechProvider';
import { isValidScope } from '../speech/clips';
import { setSetting } from './appSettings';
import { createSpeechClipService, SpeechClipError, toSpeechClipErrorResponse } from './speechClipService';

const RESULT: Transcription = {
  text: 'Guten Tag',
  language: 'de',
  duration: 2.5,
  words: [
    { word: 'Guten', start: 0, end: 0.5, probability: 0.9 },
    { word: 'Tag', start: 0.5, end: 1, probability: 0.8 },
  ],
};

function fakeProvider(transcribe: SpeechProvider['transcribe'] = async () => RESULT): SpeechProvider {
  return { health: async () => ({ ok: true, voices: [] }), render: async () => Buffer.alloc(0), convert: async (d) => d, transcribe: vi.fn(transcribe) };
}

describe('speechClipService', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gait-clips-'));
    process.env.GAIT_DATA_DIR = dir;
  });
  afterEach(() => {
    delete process.env.GAIT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
  const tmpFiles = () => (existsSync(join(dir, 'speech-tmp')) ? readdirSync(join(dir, 'speech-tmp')) : []);

  it('validates scopes', () => {
    for (const ok of ['lesson:abc-1_x', 'freestyle:spoken', 'teil:12', 'placement']) expect(isValidScope(ok)).toBe(true);
    for (const bad of ['', 'teil:x', 'lesson:', 'lesson:a/b', 'freestyle:other', 'placement:1', 'xplacement', undefined, 3]) expect(isValidScope(bad)).toBe(false);
  });

  it('transcribes with the admin model and stores a student clip (file and row)', async () => {
    const db = createDbClient(':memory:');
    const provider = fakeProvider();
    const service = createSpeechClipService(db, { provider });
    expect((await service.transcribeForScope('lesson:l1', Buffer.from('audio'), 'audio/webm;codecs=opus')).text).toBe('Guten Tag');
    expect(provider.transcribe).toHaveBeenCalledWith(Buffer.from('audio'), 'small');

    setSetting(db, 'whisper_model', 'medium');
    const out = await service.transcribeForScope('lesson:l1', Buffer.from('audio'), 'audio/mp4');
    expect(provider.transcribe).toHaveBeenLastCalledWith(Buffer.from('audio'), 'medium');
    expect(out).toEqual({ clipId: expect.any(String), text: 'Guten Tag', words: RESULT.words, duration: 2.5 });

    const clip = service.getClip(out.clipId)!;
    expect(clip).toMatchObject({ scope: 'lesson:l1', role: 'student', transcript: 'Guten Tag', words: RESULT.words });
    expect(clip.path!.endsWith(`${out.clipId}.m4a`)).toBe(true);
    expect(existsSync(clip.path!)).toBe(true);
    expect(tmpFiles()).toHaveLength(2);
    expect(service.getClip('nope')).toBeNull();
  });

  it('keeps nothing when the provider fails, and maps the failures', async () => {
    const db = createDbClient(':memory:');
    const run = (err: Error) => createSpeechClipService(db, { provider: fakeProvider(async () => { throw err; }) }).transcribeForScope('lesson:l1', Buffer.from('a'), 'audio/webm');
    const caught = async (err: Error) => run(err).catch((e) => e);

    const long = await caught(new SpeechServiceError('speech service 400: audio longer than 5 minutes', 400));
    expect(long).toBeInstanceOf(SpeechClipError);
    expect(long).toMatchObject({ kind: 'bad_request', code: 'audio_too_long' });
    expect(toSpeechClipErrorResponse(long)).toMatchObject({ status: 400, body: { code: 'audio_too_long' } });

    expect(await caught(new SpeechServiceError('speech service 400: could not read the audio', 400))).toMatchObject({ kind: 'bad_request', code: 'bad_request' });
    expect(await caught(new SpeechUnreachableError('speech service unreachable: ECONNREFUSED'))).toMatchObject({ kind: 'unavailable', code: 'speech_unavailable' });
    expect(await caught(new SpeechServiceError('speech service 500: boom', 500))).toMatchObject({ kind: 'unavailable' });
    expect(toSpeechClipErrorResponse(await caught(new SpeechUnreachableError('x')))?.status).toBe(503);
    expect(await caught(new Error('something else'))).not.toBeInstanceOf(SpeechClipError);
    expect(db.prepare('SELECT COUNT(*) AS n FROM speech_clips').get()).toEqual({ n: 0 });
    expect(tmpFiles()).toEqual([]);
  });

  it('refuses an invalid scope, an empty recording, a finished Teil attempt and a missing placement session', async () => {
    const db = createDbClient(':memory:');
    const service = createSpeechClipService(db, { provider: fakeProvider() });
    await expect(service.transcribeForScope('bogus', Buffer.from('a'), 'audio/webm')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.transcribeForScope('placement', Buffer.from('a'), 'audio/webm')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.transcribeForScope('lesson:l1', Buffer.alloc(0))).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.transcribeForScope('teil:99', Buffer.from('a'), 'audio/webm')).rejects.toMatchObject({ kind: 'bad_request' });
    const open = db.prepare("INSERT INTO teil_attempts (format_id, part_id, kind, started_at) VALUES ('f', 'p', 'practice', ?)").run(new Date().toISOString());
    await expect(service.transcribeForScope(`teil:${open.lastInsertRowid}`, Buffer.from('a'), 'audio/webm')).resolves.toMatchObject({ text: 'Guten Tag' });
    db.prepare('UPDATE teil_attempts SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), open.lastInsertRowid);
    await expect(service.transcribeForScope(`teil:${open.lastInsertRowid}`, Buffer.from('a'), 'audio/webm')).rejects.toMatchObject({ kind: 'bad_request' });
    db.prepare("INSERT INTO placement_session (id, started_at, next_position, score, mistakes, answers) VALUES (1, ?, 0, 0, 0, '[]')").run('now');
    await expect(service.transcribeForScope('placement', Buffer.from('a'), 'audio/webm')).resolves.toBeDefined();
  });

  it('takes the container from the bytes when the type is missing, and refuses what it cannot tell', async () => {
    const service = createSpeechClipService(createDbClient(':memory:'), { provider: fakeProvider() });
    const ext = async (bytes: Buffer, type?: string) => (await service.getClip((await service.transcribeForScope('lesson:l1', bytes, type)).clipId)!.path!.split('.').pop());
    await expect(service.transcribeForScope('lesson:l1', Buffer.from('xxxx'), 'application/octet-stream')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(service.transcribeForScope('lesson:l1', Buffer.from('xxxx'))).rejects.toMatchObject({ kind: 'bad_request' });
    expect(tmpFiles()).toEqual([]);
    expect(await ext(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]))).toBe('webm');
    expect(await ext(Buffer.from('OggS....'), 'application/octet-stream')).toBe('ogg');
    expect(await ext(Buffer.from('\0\0\0\x18ftypM4A '))).toBe('m4a');
  });

  it('saves a partner clip, with or without audio', () => {
    const service = createSpeechClipService(createDbClient(':memory:'));
    const withAudio = service.savePartnerClip('freestyle:spoken', Buffer.from('OggS'), 'Hallo!');
    const textOnly = service.savePartnerClip('freestyle:spoken', null, 'Wie geht es dir?');
    expect(service.getClip(withAudio)).toMatchObject({ role: 'partner', transcript: 'Hallo!', words: [] });
    expect(service.getClip(withAudio)!.path!.endsWith(`${withAudio}.ogg`)).toBe(true);
    expect(service.getClip(textOnly)).toMatchObject({ role: 'partner', path: null, transcript: 'Wie geht es dir?' });
    expect(tmpFiles()).toHaveLength(1);
    expect(() => service.savePartnerClip('nope', null, 'x')).toThrow(SpeechClipError);
  });

  it('deleteScope removes the rows and files of that scope only', async () => {
    const db = createDbClient(':memory:');
    const service = createSpeechClipService(db, { provider: fakeProvider() });
    await service.transcribeForScope('lesson:l1', Buffer.from('a'), 'audio/webm');
    service.savePartnerClip('lesson:l1', Buffer.from('OggS'), 'x');
    const other = service.savePartnerClip('lesson:l2', Buffer.from('OggS'), 'y');
    expect(service.deleteScope('lesson:l1')).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM speech_clips WHERE scope = 'lesson:l1'").get()).toEqual({ n: 0 });
    expect(tmpFiles()).toEqual([`${other}.ogg`]);
    expect(service.deleteScope('lesson:l1')).toBe(0);
  });

  it('cleanupOlderThan(6) removes a clip made 7 h ago, keeps a new one, and sweeps old orphan files', () => {
    const db = createDbClient(':memory:');
    const hoursAgo = (h: number) => () => new Date(Date.now() - h * 3600_000);
    const old = createSpeechClipService(db, { now: hoursAgo(7) }).savePartnerClip('placement', Buffer.from('OggS'), 'old');
    const recent = createSpeechClipService(db, { now: hoursAgo(5) }).savePartnerClip('placement', Buffer.from('OggS'), 'recent');
    const service = createSpeechClipService(db);
    const fresh = service.savePartnerClip('placement', Buffer.from('OggS'), 'new');
    const orphanOld = join(dir, 'speech-tmp', 'orphan-old.webm');
    const orphanNew = join(dir, 'speech-tmp', 'orphan-new.webm');
    writeFileSync(orphanOld, 'x');
    writeFileSync(orphanNew, 'x');
    const eightHoursAgo = new Date(Date.now() - 8 * 3600_000);
    utimesSync(orphanOld, eightHoursAgo, eightHoursAgo);

    expect(service.cleanupOlderThan(6)).toBe(1);
    expect(service.getClip(old)).toBeNull();
    expect(service.getClip(recent)).not.toBeNull();
    expect(service.getClip(fresh)).not.toBeNull();
    expect(existsSync(orphanOld)).toBe(false);
    expect(existsSync(orphanNew)).toBe(true);
    expect(tmpFiles().sort()).toEqual([`${recent}.ogg`, `${fresh}.ogg`, 'orphan-new.webm'].sort());
  });

  it('cleanup works before the folder exists', () => {
    mkdirSync(dir, { recursive: true });
    expect(createSpeechClipService(createDbClient(':memory:')).cleanupOlderThan()).toBe(0);
  });
});
