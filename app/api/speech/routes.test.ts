import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpeechProvider, Transcription } from '@/lib/speech/speechProvider';
import { SpeechUnreachableError } from '@/lib/speech/speechProvider';

const provider = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock('@/lib/speech/speechProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/speech/speechProvider')>()),
  getSpeechProvider: () => provider as unknown as SpeechProvider,
}));

import { getDb, closeDb } from '@/lib/db/client';
import { createSpeechClipService } from '@/lib/services/speechClipService';
import { POST as transcribe } from './transcribe/route';
import { DELETE as deleteScope } from './scope/route';
import { GET as getClip } from './clip/[id]/route';

const RESULT: Transcription = { text: 'Hallo Welt', language: 'de', duration: 1.2, words: [{ word: 'Hallo', start: 0, end: 0.5, probability: 0.95 }] };

const upload = (scope: string | null, body: BodyInit | null = new Uint8Array([1, 2, 3]), headers: Record<string, string> = { 'Content-Type': 'audio/webm' }) =>
  transcribe(new Request(`http://localhost/api/speech/transcribe${scope === null ? '' : `?scope=${encodeURIComponent(scope)}`}`, { method: 'POST', body, headers }));
const clipRequest = (id: string) => getClip(new Request(`http://localhost/api/speech/clip/${id}`), { params: Promise.resolve({ id }) });

describe('/api/speech', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-speech-routes-'));
    provider.transcribe.mockReset();
    provider.transcribe.mockResolvedValue(RESULT);
  });
  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('rejects an invalid or missing scope with 400', async () => {
    expect((await upload('nope')).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
    expect((await deleteScope(new Request('http://localhost/api/speech/scope?scope=x', { method: 'DELETE' }))).status).toBe(400);
    expect(provider.transcribe).not.toHaveBeenCalled();
  });

  it('transcribes a raw upload into a clip that can be fetched and then deleted with its scope', async () => {
    const res = await upload('lesson:abc', new Uint8Array([1, 2, 3]), { 'Content-Type': 'audio/ogg' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ clipId: expect.any(String), text: 'Hallo Welt', words: RESULT.words, duration: 1.2 });
    expect(provider.transcribe).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), 'small');

    const audio = await clipRequest(body.clipId);
    expect(audio.status).toBe(200);
    expect(audio.headers.get('Content-Type')).toBe('audio/ogg');
    expect(audio.headers.get('Cache-Control')).toBe('no-store');
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));

    const clip = createSpeechClipService(getDb()).getClip(body.clipId)!;
    const del = await deleteScope(new Request('http://localhost/api/speech/scope?scope=lesson%3Aabc', { method: 'DELETE' }));
    expect(await del.json()).toEqual({ ok: true });
    expect(existsSync(clip.path!)).toBe(false);
    expect((await clipRequest(body.clipId)).status).toBe(404);
  });

  it('serves a partner clip, and 404s one with no audio or an unknown id', async () => {
    const service = createSpeechClipService(getDb());
    const withAudio = service.savePartnerClip('freestyle:spoken', Buffer.from('OggS'), 'Hallo');
    const textOnly = service.savePartnerClip('freestyle:spoken', null, 'Hallo');
    const ok = await clipRequest(withAudio);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('audio/ogg');
    expect((await clipRequest(textOnly)).status).toBe(404);
    expect((await clipRequest('unknown')).status).toBe(404);
  });

  it('answers 503 speech_unavailable when the provider is down, and 400 audio_too_long', async () => {
    provider.transcribe.mockRejectedValueOnce(new SpeechUnreachableError('speech service unreachable: ECONNREFUSED'));
    const down = await upload('lesson:abc');
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: 'speech_unavailable' });

    const { SpeechServiceError } = await import('@/lib/speech/speechProvider');
    provider.transcribe.mockRejectedValueOnce(new SpeechServiceError('speech service 400: audio longer than 5 minutes', 400));
    const long = await upload('lesson:abc');
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ code: 'audio_too_long' });
  });

  it('refuses an empty body with 400 and a body over 10 MB with 413', async () => {
    expect((await upload('lesson:abc', new Uint8Array(0))).status).toBe(400);
    expect((await upload('lesson:abc', new Uint8Array(10 * 1024 * 1024 + 1))).status).toBe(413);
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
});
