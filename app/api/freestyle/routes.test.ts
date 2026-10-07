import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@/lib/services/aiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/aiService')>()),
  generateWithActiveProvider: vi.fn(),
}));

import { getDb, closeDb } from '@/lib/db/client';
import { generateWithActiveProvider } from '@/lib/services/aiService';
import { GET as overview } from './route';
import { GET as getSession, POST as startSession } from './[mode]/session/route';
import { POST as message } from './[mode]/message/route';
import { POST as end } from './[mode]/end/route';
import { POST as newArticle } from './free_reading/article/route';

type Handler = (r: Request, props: { params: Promise<{ mode: string }> }) => Promise<Response>;
const call = (fn: Handler, mode: string, body?: unknown) =>
  fn(new Request('http://localhost', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: Promise.resolve({ mode }),
  });

describe('/api/freestyle', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-freestyle-'));
    getDb();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockReset();
  });

  it('GET lists the four enabled modes, none open', async () => {
    const body = await (await overview()).json();
    expect(body.modes).toEqual(
      ['conversation', 'grammar_drill', 'free_reading', 'free_writing'].map((mode) => ({ mode, enabled: true, open: false }))
    );
    expect(body.levels).toEqual(['A1']);
    expect(body.aiAvailable).toBe(false);
  });

  it('starts, reads back, and ends a session without a summary', async () => {
    const started = await call(startSession, 'conversation', { level: 'A1', setup: {} });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ mode: 'conversation', level: 'A1', setup: {}, messages: [] });
    expect((await (await call(getSession, 'conversation')).json()).session).toMatchObject({ mode: 'conversation' });
    expect((await (await overview()).json()).modes[0]).toEqual({ mode: 'conversation', enabled: true, open: true });

    const ended = await call(end, 'conversation', { skipSummary: true });
    expect(await ended.json()).toEqual({ summary: null });
    expect(await (await call(getSession, 'conversation')).json()).toEqual({ session: null });
  });

  it('validates the start body: unknown or disabled mode 404, bad level 400, locked level 403, bad setup 400', async () => {
    expect((await call(startSession, 'spoken', { level: 'A1', setup: {} })).status).toBe(404);
    expect((await call(startSession, 'nonsense', { level: 'A1', setup: {} })).status).toBe(404);
    const bad = await call(startSession, 'conversation', { level: 'Z9', setup: {} });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'bad_request' });
    const locked = await call(startSession, 'conversation', { level: 'B1', setup: {} });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: 'level_locked' });
    expect((await call(startSession, 'conversation', { level: 'A1', setup: 'x' })).status).toBe(400);
    const unknownKey = await call(startSession, 'conversation', { level: 'A1', setup: { mood: 'x' } });
    expect(unknownKey.status).toBe(400);
    expect(await unknownKey.json()).toMatchObject({ code: 'bad_request' });
    expect((await call(startSession, 'conversation', { level: 'A1', setup: { scenarioId: 'b1-doctor' } })).status).toBe(400);
  });

  it('message: 400 for empty text, 404 with no session, 502 ai_bad_reply on a malformed reply', async () => {
    const none = await call(message, 'conversation', { text: 'Hallo' });
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ code: 'not_found' });

    await call(startSession, 'conversation', { level: 'A1', setup: {} });
    expect((await call(message, 'conversation', { text: '   ' })).status).toBe(400);
    expect((await call(message, 'conversation', {})).status).toBe(400);

    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: 'not json' });
    const bad = await call(message, 'conversation', { text: 'Hallo' });
    expect(bad.status).toBe(502);
    expect(await bad.json()).toMatchObject({ code: 'ai_bad_reply' });
  });

  it('message returns the new messages', async () => {
    await call(startSession, 'conversation', { level: 'A1', setup: {} });
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: JSON.stringify({ corrections: [], reply: 'Wie geht es dir?' }) });
    const res = await call(message, 'conversation', { text: 'Hallo' });
    expect(res.status).toBe(200);
    expect((await res.json()).messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ['user', 'Hallo'],
      ['assistant', 'Wie geht es dir?'],
    ]);
  });

  it('free_reading/article with no session is 404', async () => {
    const res = await newArticle();
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'not_found' });
  });

  it('end with a summary returns { summary } and closes the session', async () => {
    await call(startSession, 'free_writing', { level: 'A1', setup: {} });
    const summary = { wentWell: [{ en: 'Good', de: 'Gut' }], mistakes: [], words: [{ lemma: 'der Hund', meaningEn: 'dog' }] };
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: JSON.stringify(summary) });
    const res = await call(end, 'free_writing', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary });
    expect(await (await call(getSession, 'free_writing')).json()).toEqual({ session: null });
  });

  it('a second End while one runs is 409 session_ending', async () => {
    await call(startSession, 'free_writing', { level: 'A1', setup: {} });
    let release!: () => void;
    vi.mocked(generateWithActiveProvider).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, text: JSON.stringify({ wentWell: [], mistakes: [], words: [] }) });
        })
    );
    const first = call(end, 'free_writing', {});
    await vi.waitFor(() => expect(generateWithActiveProvider).toHaveBeenCalledTimes(1));
    const second = await call(end, 'free_writing', {});
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: 'session_ending' });
    release();
    expect((await first).status).toBe(200);
    expect(generateWithActiveProvider).toHaveBeenCalledTimes(1);
  });
});
