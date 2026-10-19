import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { hasAudio, readAudio, writeAudio } from '@/lib/audio/audioStore';
import { SpeechServiceError } from '@/lib/speech/speechProvider';
import { addListeningExercise, listeningContent, listeningHash, seedTutoringCurriculum } from '@/test/tutoringFixtures';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
// The real service with a fake speech provider, so nothing opens a connection; upload is spied on.
const provider = {
  health: vi.fn(async () => ({ ok: true, voices: [] })),
  render: vi.fn(async () => Buffer.from('OggS-rendered')),
  convert: vi.fn(async (b: Buffer) => Buffer.concat([Buffer.from('OggS-'), b])),
};
const uploadSpy = vi.fn();
vi.mock('@/lib/services/audioService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/audioService')>();
  return {
    ...actual,
    createAudioService: (db: Parameters<typeof actual.createAudioService>[0]) => {
      const service = actual.createAudioService(db, { provider });
      return {
        ...service,
        upload: async (hash: string, data: Buffer) => {
          uploadSpy(hash, data);
          return service.upload(hash, data);
        },
      };
    },
  };
});
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { POST as status } from './route';
import { POST as regenerate, PUT as upload } from './[hash]/route';

const ctx = (hash: string) => ({ params: Promise.resolve({ hash }) });
const post = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const putBytes = (bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
  new Request('http://localhost', { method: 'PUT', body: bytes, headers: { 'Content-Type': 'audio/mpeg', ...headers } });
const jobStatus = (hash: string) => (getDb().prepare('SELECT status FROM audio_jobs WHERE hash = ?').get(hash) as { status: string } | undefined)?.status;

describe('/api/admin/audio', () => {
  let hash: string;
  beforeEach(async () => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-audio-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    uploadSpy.mockReset();
    provider.convert.mockClear();
    const db = getDb();
    seedTutoringCurriculum(db);
    addListeningExercise(db, 'a1-greet__ex9', 'a1-greet');
    hash = await listeningHash();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await status(post({ transcript: listeningContent().transcript }))).status).toBe(401);
    expect((await regenerate(post({}), ctx(hash))).status).toBe(401);
    expect((await upload(putBytes(new Uint8Array([1, 2, 3])), ctx(hash))).status).toBe(401);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('reports the status of a saved transcript, and of one not saved yet', async () => {
    expect(await (await status(post({ transcript: listeningContent().transcript }))).json()).toEqual({
      hash,
      status: null,
      hasFile: false,
      lastError: null,
      saved: true,
    });
    const other = await (await status(post({ transcript: listeningContent('Hamburg').transcript }))).json();
    expect(other).toMatchObject({ hash: await listeningHash('Hamburg'), saved: false });
    const bad = await status(post({ transcript: 'no tag' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("The transcript can't be rendered: line 1 needs a speaker tag like [Name m]");
  });

  it('uploads through audioService.upload and returns { ok: true }', async () => {
    const res = await upload(putBytes(new Uint8Array([1, 2, 3])), ctx(hash));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(uploadSpy).toHaveBeenCalledWith(hash, Buffer.from([1, 2, 3]));
    expect(provider.convert).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(readAudio(hash)!.toString('latin1')).toBe('OggS-\x01\x02\x03');
    expect(jobStatus(hash)).toBe('uploaded');
    // S21: the job keeps the content's transcript.
    expect((getDb().prepare('SELECT transcript FROM audio_jobs WHERE hash = ?').get(hash) as { transcript: string }).transcript).toBe(
      listeningContent().transcript
    );
  });

  it('refuses a recording over 20 MB with 413, by header or by body', async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    expect((await upload(putBytes(new Uint8Array([1]), { 'Content-Length': String(big.length) }), ctx(hash))).status).toBe(413);
    const res = await upload(putBytes(big), ctx(hash));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('The recording is larger than 20 MB');
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('refuses an empty recording, a bad hash, and a hash no saved content owns', async () => {
    expect((await upload(putBytes(new Uint8Array()), ctx(hash))).status).toBe(400);
    expect((await upload(putBytes(new Uint8Array([1])), ctx('../evil'))).status).toBe(400);
    expect((await upload(putBytes(new Uint8Array([1])), ctx(await listeningHash('Hamburg')))).status).toBe(404);
    expect((await regenerate(post({}), ctx(await listeningHash('Hamburg')))).status).toBe(404);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('passes on a conversion the speech service refuses', async () => {
    provider.convert.mockRejectedValueOnce(new SpeechServiceError('speech service 400: unsupported audio', 400));
    const res = await upload(putBytes(new Uint8Array([9])), ctx(hash));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('The recording could not be converted: speech service 400: unsupported audio');
    expect(hasAudio(hash)).toBe(false);
  });

  it('regenerates: queues a fresh render, and replaces an upload only when confirmed (Review Focus 2)', async () => {
    writeAudio(hash, Buffer.from('OggS-old'));
    const queued = await regenerate(post({}), ctx(hash));
    expect(await queued.json()).toEqual({ status: 'queued' });
    expect(hasAudio(hash)).toBe(false);
    expect(jobStatus(hash)).toBe('pending');

    await upload(putBytes(new Uint8Array([7])), ctx(hash));
    const refused = await regenerate(post({}), ctx(hash));
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe('uploaded');
    expect(hasAudio(hash)).toBe(true);
    expect(jobStatus(hash)).toBe('uploaded');

    expect((await regenerate(post({ replaceUpload: true }), ctx(hash))).status).toBe(200);
    expect(hasAudio(hash)).toBe(false);
    expect(jobStatus(hash)).toBe('pending');
  });
});
