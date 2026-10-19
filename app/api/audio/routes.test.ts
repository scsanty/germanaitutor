// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { audioPath, writeAudio } from '@/lib/audio/audioStore';
import { setSetting } from '@/lib/services/appSettings';
import { GET } from './[hash]/route';

const HASH = 'f'.repeat(64);
const BYTES = Buffer.from('OggS-0123456789');

const get = (hash: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/audio/${hash}`, { headers }), { params: Promise.resolve({ hash }) });

describe('/api/audio/[hash]', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gait-audio-route-'));
    process.env.GAIT_DATA_DIR = dir;
    // S6/S7: nothing listens on port 9, so the service is unreachable without any network access.
    setSetting(getDb(), 'speech_url', 'http://127.0.0.1:9');
  });
  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves a cached clip as audio/ogg, revalidated by ETag (S13)', async () => {
    writeAudio(HASH, BYTES);
    const res = await get(HASH);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/ogg');
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES);

    const etag = res.headers.get('ETag')!;
    expect(etag).toMatch(/^".+"$/);
    expect((await get(HASH, { 'If-None-Match': etag })).status).toBe(304);

    // A replaced clip (upload or regenerate) gets a new ETag, so the browser fetches it again.
    writeAudio(HASH, Buffer.from('OggS-uploaded'));
    utimesSync(audioPath(HASH), new Date(), new Date(Date.now() + 5000));
    const replaced = await get(HASH, { 'If-None-Match': etag });
    expect(replaced.status).toBe(200);
    expect(Buffer.from(await replaced.arrayBuffer()).toString()).toBe('OggS-uploaded');
  });

  it('gives a same-size replacement with an unchanged mtime a new ETag (review finding 5)', async () => {
    const { createAudioService } = await import('@/lib/services/audioService');
    const db = getDb();
    const convert = async (b: Buffer) => b;
    const provider = { health: async () => ({ ok: true, voices: [] }), render: async () => Buffer.from('OggS-AAAA'), convert };
    const hash = createAudioService(db, { provider, now: () => new Date('2026-09-29T10:00:00Z') }).enqueue('[Anrufer m] Hallo.')!;
    await createAudioService(db, { provider, now: () => new Date('2026-09-29T10:00:00Z') }).upload(hash, Buffer.from('OggS-AAAA'));
    const mtime = new Date('2026-09-29T10:00:00Z');
    utimesSync(audioPath(hash), mtime, mtime);
    const etag = (await get(hash)).headers.get('ETag')!;

    await createAudioService(db, { provider, now: () => new Date('2026-09-29T10:00:01Z') }).upload(hash, Buffer.from('OggS-BBBB'));
    utimesSync(audioPath(hash), mtime, mtime);
    const res = await get(hash, { 'If-None-Match': etag });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).not.toBe(etag);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('OggS-BBBB');
  });

  it('answers byte ranges for Safari (S14)', async () => {
    writeAudio(HASH, BYTES);
    const first = await get(HASH, { Range: 'bytes=0-1' });
    expect(first.status).toBe(206);
    expect(first.headers.get('Content-Range')).toBe(`bytes 0-1/${BYTES.length}`);
    expect(first.headers.get('Content-Length')).toBe('2');
    expect(Buffer.from(await first.arrayBuffer()).toString()).toBe('Og');

    const open = await get(HASH, { Range: 'bytes=5-' });
    expect(open.status).toBe(206);
    expect(Buffer.from(await open.arrayBuffer()).toString()).toBe('0123456789');

    const suffix = await get(HASH, { Range: 'bytes=-3' });
    expect(Buffer.from(await suffix.arrayBuffer()).toString()).toBe('789');

    const beyond = await get(HASH, { Range: 'bytes=999-' });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('Content-Range')).toBe(`bytes */${BYTES.length}`);
  });

  it('answers 503 audio_unavailable for an unknown clip while the service is unreachable', async () => {
    const res = await get('0'.repeat(64));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'audio_unavailable' });
  });

  it('answers 503 for a queued clip the service cannot render right now', async () => {
    const { createAudioService } = await import('@/lib/services/audioService');
    const hash = createAudioService(getDb()).enqueue('[Anrufer m] Hallo.')!;
    const res = await get(hash);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'audio_unavailable' });
  });

  it('rejects a malformed hash with 400', async () => {
    const res = await get('abc');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'bad_request' });
    expect((await get('../../app.db')).status).toBe(400);
  });
});
