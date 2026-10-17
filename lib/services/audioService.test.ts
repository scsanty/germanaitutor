// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createAudioService } from './audioService';
import { createTeilSetService } from './teilSetService';
import { audioDir, audioPath, hasAudio, listAudioFiles, writeAudio } from '../audio/audioStore';
import { createLocalSpeechProvider } from '../speech/localSpeechProvider';
import { getSpeechUrl, isUnreachableError, SpeechServiceError } from '../speech/speechProvider';
import { setSetting } from './appSettings';

const T = '@filter phone\n[Anrufer m] Hallo, hier ist Thomas.';

function fakeProvider(ok = true) {
  return {
    health: vi.fn(async () => ({ ok, voices: [] })),
    render: vi.fn(async () => {
      if (!ok) throw new Error('connect ECONNREFUSED');
      return Buffer.from('OggS-fake');
    }),
    convert: vi.fn(async (b: Buffer) => Buffer.concat([Buffer.from('OggS-'), b])),
  };
}

// A healthy service whose render fails with an HTTP error: a real failure that counts as an attempt.
function brokenRenderer() {
  return {
    health: vi.fn(async () => ({ ok: true, voices: [] })),
    render: vi.fn(async (): Promise<Buffer> => {
      throw new Error('speech service 500: ffmpeg failed');
    }),
    convert: vi.fn(async (b: Buffer) => b),
  };
}

const job = (db: ReturnType<typeof createDbClient>, hash: string) =>
  db.prepare('SELECT status, attempts FROM audio_jobs WHERE hash = ?').get(hash) as { status: string; attempts: number } | undefined;

describe('audioService', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-audio-'));
  });
  afterEach(() => {
    rmSync(process.env.GAIT_DATA_DIR!, { recursive: true, force: true });
    delete process.env.GAIT_DATA_DIR;
  });

  it('queues a transcript once, renders it in the background, and serves it from the cache', async () => {
    const db = createDbClient(':memory:');
    const provider = fakeProvider();
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    expect(service.enqueue(T)).toBe(hash);
    await service.processPending();
    expect(hasAudio(hash)).toBe(true);
    expect(provider.render).toHaveBeenCalledWith({ segments: [{ text: 'Hallo, hier ist Thomas.', voice: 'thorsten' }], filter: 'phone', pauseMs: 600 });
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-fake');
    expect(provider.render).toHaveBeenCalledTimes(1);
    expect(job(db, hash)).toEqual({ status: 'done', attempts: 0 });
  });

  it('returns null for an invalid transcript and ignores non-audio content', () => {
    const db = createDbClient(':memory:');
    const service = createAudioService(db, { provider: fakeProvider() });
    expect(service.enqueue('no speaker tag here')).toBeNull();
    expect(service.enqueueFromContent('passage_questions', { transcript: T })).toBeNull();
    expect(service.enqueueFromContent('audio_questions', { transcript: T })).toBe(service.enqueue(T));
    expect((db.prepare('SELECT COUNT(*) AS n FROM audio_jobs').get() as { n: number }).n).toBe(1);
  });

  it('retries failures with backoff and marks the job failed after 5 attempts, raising a problem', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    let now = new Date('2026-09-29T10:00:00Z');
    const provider = brokenRenderer();
    const service = createAudioService(db, { provider, notify, now: () => now });
    const hash = service.enqueue(T)!;
    await service.processPending();
    expect(job(db, hash)).toEqual({ status: 'pending', attempts: 1 });
    // Backoff: not due again within 2 minutes.
    await service.processPending();
    expect(provider.render).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      now = new Date(now.getTime() + 3_600_000);
      await service.processPending();
    }
    expect(job(db, hash)).toEqual({ status: 'failed', attempts: 5 });
    expect(provider.render).toHaveBeenCalledTimes(5);
    expect(notify.raise).toHaveBeenCalledTimes(1);
    expect(notify.raise).toHaveBeenCalledWith('audio_failed', `audio_failed:${hash}`, expect.any(String), expect.stringContaining('ffmpeg failed'));
  });

  // S1: with the service down, nothing is attempted and nothing is raised.
  it('burns no attempts and raises nothing while the speech service is down', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    let now = new Date('2026-09-29T10:00:00Z');
    const down = fakeProvider(false);
    const service = createAudioService(db, { provider: down, notify, now: () => now });
    const hash = service.enqueue(T)!;
    for (let i = 0; i < 10; i++) {
      await service.processPending();
      now = new Date(now.getTime() + 3_600_000);
    }
    expect(job(db, hash)).toEqual({ status: 'pending', attempts: 0 });
    expect(down.render).not.toHaveBeenCalled();
    expect(notify.raise).not.toHaveBeenCalled();

    // Healthy at the check, then the connection drops mid-render: still not an attempt, but the job
    // backs off instead of being retried every tick.
    const flaky = { ...fakeProvider(false), health: vi.fn(async () => ({ ok: true, voices: [] })) };
    const second = createAudioService(db, { provider: flaky, notify, now: () => now });
    for (let i = 0; i < 10; i++) await second.processPending();
    expect(flaky.render).toHaveBeenCalledTimes(1);
    expect(job(db, hash)).toEqual({ status: 'pending', attempts: 0 });
    expect(db.prepare('SELECT next_try_at FROM audio_jobs WHERE hash = ?').get(hash)).toEqual({ next_try_at: new Date(now.getTime() + 5 * 60_000).toISOString() });
    expect(notify.raise).not.toHaveBeenCalled();
  });

  // Review finding 1: a render that keeps timing out must not starve the jobs behind it.
  it('a job whose render keeps timing out does not block the rest of the queue', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    let now = new Date('2026-09-29T10:00:00Z');
    const slow = '[Sprecher m] Ein sehr langer Text.';
    const provider = {
      ...fakeProvider(),
      render: vi.fn(async (input: { segments: { text: string }[] }) => {
        if (input.segments[0].text === 'Ein sehr langer Text.') {
          const err = new Error('The operation was aborted due to timeout');
          err.name = 'TimeoutError';
          throw err;
        }
        return Buffer.from('OggS-fake');
      }),
    };
    const service = createAudioService(db, { provider, notify, now: () => now });
    const stuck = service.enqueue(slow)!;
    now = new Date(now.getTime() + 1000);
    const other = service.enqueue(T)!;
    // One job per run, so the stuck job is first in line every time it is due.
    for (let i = 0; i < 4; i++) {
      await service.processPending(1);
      now = new Date(now.getTime() + 5000);
    }
    expect(job(db, other)).toEqual({ status: 'done', attempts: 0 });
    expect(job(db, stuck)).toEqual({ status: 'pending', attempts: 0 });
    expect(notify.raise).not.toHaveBeenCalled();
    // Once its backoff has passed it is tried again.
    now = new Date(now.getTime() + 5 * 60_000);
    await service.processPending(1);
    expect(provider.render.mock.calls.filter(([input]) => input.segments[0].text === 'Ein sehr langer Text.')).toHaveLength(2);
  });

  // Review finding 4
  it('fails a job at once when the service refuses the request (4xx)', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    const provider = {
      ...fakeProvider(),
      render: vi.fn(async (): Promise<Buffer> => {
        throw new SpeechServiceError('speech service 400: too many segments (max 200)', 400);
      }),
    };
    const service = createAudioService(db, { provider, notify });
    const hash = service.enqueue(T)!;
    await service.processPending();
    expect(job(db, hash)).toEqual({ status: 'failed', attempts: 1 });
    expect(notify.raise).toHaveBeenCalledWith('audio_failed', `audio_failed:${hash}`, expect.any(String), expect.stringContaining('too many segments'));
    await service.processPending();
    expect(provider.render).toHaveBeenCalledTimes(1);
  });

  it('marks an unparseable transcript failed without retrying (S21)', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    const provider = fakeProvider();
    const service = createAudioService(db, { provider, notify });
    const hash = 'a'.repeat(64);
    await service.upload(hash, Buffer.from('mine'));
    service.regenerate(hash);
    await service.processPending();
    expect(job(db, hash)).toEqual({ status: 'failed', attempts: 0 });
    expect(provider.render).not.toHaveBeenCalled();
    expect(notify.raise).toHaveBeenCalledWith('audio_failed', `audio_failed:${hash}`, expect.any(String), expect.stringContaining("can't be rendered"));
  });

  // Review Focus 2
  it('never lets the worker replace an uploaded recording; regenerate is explicit', async () => {
    const db = createDbClient(':memory:');
    const provider = fakeProvider();
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    await service.upload(hash, Buffer.from('mine'));
    service.enqueue(T);
    await service.processPending();
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-mine');
    expect(provider.render).not.toHaveBeenCalled();
    service.regenerate(hash);
    await service.processPending();
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-fake');
  });

  it('keeps an upload that arrives while a render is running', async () => {
    const db = createDbClient(':memory:');
    let finish!: (b: Buffer) => void;
    const provider = { ...fakeProvider(), render: vi.fn(() => new Promise<Buffer>((r) => (finish = r))) };
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    const tick = service.processPending();
    await vi.waitFor(() => expect(provider.render).toHaveBeenCalled());
    await service.upload(hash, Buffer.from('mine'));
    finish(Buffer.from('OggS-late'));
    await tick;
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-mine');
    expect(job(db, hash)?.status).toBe('uploaded');
  });

  it('a render that finishes after a backup import closed its database never overwrites the restored file', async () => {
    const db = createDbClient(':memory:');
    let finish!: (b: Buffer) => void;
    const provider = { ...fakeProvider(), render: vi.fn(() => new Promise<Buffer>((r) => (finish = r))) };
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    const tick = service.processPending();
    await vi.waitFor(() => expect(provider.render).toHaveBeenCalled());
    // The import closes the handle and restores the uploaded recording for this hash.
    db.close();
    writeAudio(hash, Buffer.from('restored-upload'));
    finish(Buffer.from('OggS-late'));
    await tick.catch(() => {}); // the closed handle throws; the worker's tick catches it (S2)
    expect(readdirSync(audioDir())).toEqual([`${hash}.ogg`]);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(audioPath(hash), 'utf8')).toBe('restored-upload');
  });

  it('shares one render between the worker and an on-demand request (S15)', async () => {
    const db = createDbClient(':memory:');
    let finish!: (b: Buffer) => void;
    const provider = { ...fakeProvider(), render: vi.fn(() => new Promise<Buffer>((r) => (finish = r))) };
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    const tick = service.processPending();
    await vi.waitFor(() => expect(provider.render).toHaveBeenCalled());
    const request = service.getOrRender(hash);
    finish(Buffer.from('OggS-once'));
    await tick;
    expect((await request)?.toString()).toBe('OggS-once');
    expect(provider.render).toHaveBeenCalledTimes(1);
    expect(readdirSync(audioDir())).toEqual([`${hash}.ogg`]);
  });

  it('returns null from getOrRender when the file is missing and the service is down', async () => {
    const db = createDbClient(':memory:');
    const down = fakeProvider(false);
    const service = createAudioService(db, { provider: down });
    const hash = service.enqueue(T)!;
    expect(await service.getOrRender(hash)).toBeNull();
    expect(await service.getOrRender('b'.repeat(64))).toBeNull();
    // Review finding 2: the health check answers first, so no render waits out its timeout.
    expect(down.health).toHaveBeenCalledTimes(1);
    expect(down.render).not.toHaveBeenCalled();
  });

  it('renders on demand and marks the job done', async () => {
    const db = createDbClient(':memory:');
    const service = createAudioService(db, { provider: fakeProvider() });
    const hash = service.enqueue(T)!;
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-fake');
    expect(job(db, hash)?.status).toBe('done');
  });

  // S19
  it('sweeps listening content without jobs and files that went missing', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    const service = createAudioService(db, { provider: fakeProvider(), notify });
    db.prepare(
      "INSERT INTO teil_sets (id, format_id, part_id, status, content, created_at) VALUES ('s1', 'telc-b1', 'hoeren-1', 'starter', ?, '2026-09-29')"
    ).run(JSON.stringify({ taskType: 'audio_questions', content: { transcript: T, questions: [] }, explanations: [] }));
    const hash = service.enqueue(T)!;
    db.prepare('DELETE FROM audio_jobs').run();

    expect(service.sweep()).toEqual({ queued: 1, requeued: 0, lostUploads: 0 });
    expect(job(db, hash)).toEqual({ status: 'pending', attempts: 0 });

    await service.processPending();
    expect(job(db, hash)?.status).toBe('done');
    rmSync(audioPath(hash));
    // A lost upload with a transcript (it replaced a rendered clip) and one without (review finding 6).
    await service.upload(hash, Buffer.from('mine'));
    rmSync(audioPath(hash));
    const orphan = 'c'.repeat(64);
    await service.upload(orphan, Buffer.from('x'));
    rmSync(audioPath(orphan));
    expect(service.sweep()).toEqual({ queued: 1, requeued: 1, lostUploads: 2 });
    expect(job(db, hash)?.status).toBe('pending');
    expect(job(db, orphan)?.status).toBe('uploaded');
    expect(notify.raise).toHaveBeenCalledWith('content_issues', 'audio_upload_lost', expect.any(String), expect.stringContaining('2 uploaded'));
    await service.processPending();
    expect(job(db, orphan)?.status).toBe('uploaded');
    expect(notify.raise).not.toHaveBeenCalledWith('audio_failed', expect.anything(), expect.anything(), expect.anything());
  });

  it('a notification sink that throws or rejects never breaks rendering', async () => {
    const db = createDbClient(':memory:');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const notify = { raise: vi.fn(() => Promise.reject(new Error('smtp down'))), resolve: vi.fn(() => { throw new Error('boom'); }) };
      const service = createAudioService(db, { provider: fakeProvider(), notify });
      const hash = 'd'.repeat(64);
      await expect(service.upload(hash, Buffer.from('x'))).resolves.toBeUndefined();
      service.regenerate(hash);
      await expect(service.processPending()).resolves.toBeUndefined();
      await new Promise((r) => setTimeout(r, 0));
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('only writes rows when content is saved: a listening Teil set upload never calls the provider', () => {
    const db = createDbClient(':memory:');
    const questions = Array.from({ length: 5 }, (_, i) => ({ question: `Frage ${i + 1}?`, options: ['ja', 'nein', 'vielleicht'], correctIndex: 0, evidence: 'Thomas' }));
    const set = {
      taskType: 'audio_questions' as const,
      content: { transcript: T, questions },
      explanations: questions.map(() => ({ en: 'Because.', de: 'Weil.' })),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      createTeilSetService(db, { setsDir: join(process.env.GAIT_DATA_DIR!, 'none') }).upload('telc-b1', 'hoeren-1', [{ id: 'mine-1', set }]);
      expect(job(db, createAudioService(db).enqueue(T)!)).toEqual({ status: 'pending', attempts: 0 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('audioStore', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-audio-store-'));
  });
  afterEach(() => {
    rmSync(process.env.GAIT_DATA_DIR!, { recursive: true, force: true });
    delete process.env.GAIT_DATA_DIR;
  });

  it('refuses a malformed hash, writes atomically, and lists only clips', () => {
    expect(() => audioPath('../etc/passwd')).toThrow();
    expect(() => audioPath('ABC')).toThrow();
    expect(listAudioFiles()).toEqual([]);
    const hash = 'e'.repeat(64);
    writeAudio(hash, Buffer.from('OggS'));
    expect(audioPath(hash)).toBe(join(process.env.GAIT_DATA_DIR!, 'audio', `${hash}.ogg`));
    expect(listAudioFiles()).toEqual([{ name: `${hash}.ogg`, path: audioPath(hash) }]);
    expect(readdirSync(audioDir()).some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});

// S6: a real HTTP round trip against a loopback server on an ephemeral port (no network access).
describe('localSpeechProvider', () => {
  let server: Server;
  let base: string;
  const seen: { url?: string; type?: string; body: Buffer }[] = [];

  beforeEach(async () => {
    seen.length = 0;
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        seen.push({ url: req.url, type: req.headers['content-type'], body });
        if (req.url === '/health') return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true,"voices":["thorsten","kerstin"]}');
        if (req.url === '/render') {
          const input = JSON.parse(body.toString()) as { segments: unknown[] };
          if (input.segments.length === 0) return res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"no segments"}');
          return res.writeHead(200, { 'Content-Type': 'audio/ogg' }).end(Buffer.from('OggS-rendered'));
        }
        if (req.url === '/convert') return res.writeHead(200, { 'Content-Type': 'audio/ogg' }).end(Buffer.concat([Buffer.from('OggS-'), body]));
        res.writeHead(404).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterEach(async () => {
    await new Promise((r) => server.close(r));
  });

  it('talks to the sidecar: health, render JSON, raw convert, and the {"error"} shape', async () => {
    const provider = createLocalSpeechProvider(base);
    expect(await provider.health()).toEqual({ ok: true, voices: ['thorsten', 'kerstin'] });
    const input = { segments: [{ text: 'Hallo', voice: 'thorsten' }], filter: 'none' as const, pauseMs: 600 };
    expect((await provider.render(input)).toString()).toBe('OggS-rendered');
    expect(seen.at(-1)).toMatchObject({ url: '/render', type: 'application/json' });
    expect(JSON.parse(seen.at(-1)!.body.toString())).toEqual(input);
    expect((await provider.convert(Buffer.from('wav'))).toString()).toBe('OggS-wav');
    expect(seen.at(-1)).toMatchObject({ url: '/convert', type: 'application/octet-stream' });

    const bad = provider.render({ ...input, segments: [] });
    await expect(bad).rejects.toThrow('speech service 400: no segments');
    await bad.catch((err) => expect(isUnreachableError(err)).toBe(false));
  });

  it('refuses oversized bodies before sending them', async () => {
    const provider = createLocalSpeechProvider(base);
    await expect(provider.convert(Buffer.alloc(25 * 1024 * 1024 + 1))).rejects.toThrow('413');
    await expect(provider.render({ segments: [{ text: 'x'.repeat(1024 * 1024), voice: 'thorsten' }], filter: 'none', pauseMs: 600 })).rejects.toThrow('413');
    expect(seen).toHaveLength(0);
  });

  it('reports an unreachable service as down, and its errors as unreachable', async () => {
    await new Promise((r) => server.close(r));
    server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    await new Promise((r) => server.close(r));
    server = createServer().listen(0, '127.0.0.1');
    const provider = createLocalSpeechProvider(`http://127.0.0.1:${port}`);
    expect(await provider.health()).toEqual({ ok: false, voices: [] });
    const err = await provider.render({ segments: [{ text: 'x', voice: 'thorsten' }], filter: 'none', pauseMs: 600 }).catch((e: unknown) => e);
    expect(isUnreachableError(err)).toBe(true);
  });

  it('reads the URL from settings, with the loopback default', () => {
    const db = createDbClient(':memory:');
    expect(getSpeechUrl(db)).toBe('http://127.0.0.1:5002');
    setSetting(db, 'speech_url', 'http://127.0.0.1:6000');
    expect(getSpeechUrl(db)).toBe('http://127.0.0.1:6000');
  });
});
