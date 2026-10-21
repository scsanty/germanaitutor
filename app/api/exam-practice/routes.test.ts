import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@/lib/services/aiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/aiService')>()),
  generateWithActiveProvider: vi.fn(async () => ({ ok: false, error: 'No provider', code: 'no_provider' })),
}));

import { getDb, closeDb } from '@/lib/db/client';
import { generateWithActiveProvider } from '@/lib/services/aiService';
import { createProfileService } from '@/lib/services/profileService';
import { createTeilSetService } from '@/lib/services/teilSetService';
import { sharedSpeechAvailability } from '@/lib/speech/speechAvailability';
import { getSpeechUrl } from '@/lib/speech/speechProvider';
import { GET as overview } from './route';
import { POST as start } from './start/route';
import { POST as submit } from './submit/route';
import { POST as explain } from './explain/route';
import { POST as startMock } from './mock/start/route';
import { GET as readiness } from './readiness/route';

const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request('http://localhost', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

describe('/api/exam-practice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-exam-practice-'));
    const db = getDb();
    createProfileService(db).updateProfile({ activeTrack: 'telc' });
    createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
    createTeilSetService(db).loadBundled();
    // S7: the speech service is down for these tests, without any network call.
    sharedSpeechAvailability().record(getSpeechUrl(db), false);
  });

  afterEach(() => {
    closeDb();
    sharedSpeechAvailability().clear();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockClear();
  });

  it('GET lists the active format', async () => {
    const res = await overview();
    expect(res.status).toBe(200);
    expect((await res.json()).format.id).toBe('telc-b1');
  });

  it('starts a run, rejects a bad submit body, and grades a good one', async () => {
    const res = await post(start, { formatId: 'telc-b1', partId: 'lesen-1' });
    expect(res.status).toBe(200);
    const run = await res.json();
    expect(run).toMatchObject({ formatId: 'telc-b1', minutes: 20, mockId: null, part: { id: 'lesen-1' } });

    const bad = await post(submit, { attemptId: run.attemptId, answers: { type: 'matching', selected: [0] } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'bad_request' });
    expect((await post(submit, 'not json')).status).toBe(400);
    expect((await post(submit, { attemptId: 'x', answers: {} })).status).toBe(400);

    const ok = await post(submit, { attemptId: run.attemptId, answers: { type: 'matching', selected: [-1, -1, -1, -1, -1] } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ score: 0, maxScore: 25 });
    expect((await post(submit, { attemptId: 9999, answers: {} })).status).toBe(404);
  });

  it('answers 409 part_unavailable for a part without a runner (S7), 404 for an unknown part (S1)', async () => {
    // Listening without cached audio while the speech service is down is unavailable too.
    const listening = await post(start, { formatId: 'telc-b1', partId: 'hoeren-1' });
    expect(listening.status).toBe(409);
    expect(await listening.json()).toMatchObject({ code: 'part_unavailable' });
    // Writing has bundled sets and a runner now; the spoken parts have no runner, and Sprachbausteine run only in the mock.
    for (const partId of ['sprechen-1', 'sprachbausteine-1']) {
      const res = await post(start, { formatId: 'telc-b1', partId });
      expect(res.status, partId).toBe(409);
      expect(await res.json(), partId).toMatchObject({ code: 'part_unavailable' });
    }
    expect((await post(start, { formatId: '../../etc', partId: 'lesen-1' })).status).toBe(404);
    expect((await post(start, { formatId: 'telc-b1', partId: 'nope' })).status).toBe(404);
    expect((await post(start, {})).status).toBe(400);
  });

  it('validates explain and passes an AI failure through', async () => {
    const run = await (await post(start, { formatId: 'telc-b1', partId: 'lesen-1' })).json();
    await post(submit, { attemptId: run.attemptId, answers: { type: 'matching', selected: [-1, -1, -1, -1, -1] } });
    expect((await post(explain, { attemptId: run.attemptId, itemIndex: 0, question: '' })).status).toBe(400);
    expect((await post(explain, { attemptId: run.attemptId, itemIndex: 0, question: 'x'.repeat(501) })).status).toBe(400);
    expect((await post(explain, { attemptId: run.attemptId, itemIndex: -1, question: 'Warum?' })).status).toBe(400);
    const failed = await post(explain, { attemptId: run.attemptId, itemIndex: 0, question: 'Warum?' });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: 'no_provider' });
  });

  // Sprachbausteine parts run only in the mock, so the mock start is where a bad cloze reply would surface.
  it('mock start falls back to a seen set when the AI reply has a null cloze gap, instead of failing', async () => {
    const db = getDb();
    // The mock includes the listening and writing parts: give each one a set, and the speech service is up.
    sharedSpeechAvailability().record(getSpeechUrl(db), true);
    for (const part of ['hoeren-2', 'hoeren-3', 'schreiben']) {
      const fixture = JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', 'teil-sets', 'telc-b1', `${part}.json`), 'utf8'));
      createTeilSetService(db).upload('telc-b1', part, [{ id: `fixture-${part}`, set: fixture.sets[0].set }]);
    }
    db.prepare(
      "INSERT INTO teil_seen (set_id, seen_at) SELECT id, '2026-01-01T00:00:00.000Z' FROM teil_sets WHERE format_id = 'telc-b1' AND part_id = 'sprachbausteine-1'"
    ).run();
    const gaps = Array.from({ length: 10 }, (_, i) => (i === 3 ? null : { mode: 'select', options: ['a', 'b', 'c'], correctIndex: 0 }));
    const text = Array.from({ length: 10 }, (_, i) => `Wort {{${i + 1}}}`).join(' ');
    const explanations = gaps.map(() => ({ en: 'Because.', de: 'Weil.' }));
    vi.mocked(generateWithActiveProvider).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ content: { text, gaps }, explanations }) } as never);
    const res = await post(startMock, { formatId: 'telc-b1' });
    expect(res.status).toBe(200);
    const mock = await res.json();
    expect(mock.runs.find((r: { part: { id: string } }) => r.part.id === 'sprachbausteine-1')).toBeTruthy();
    expect(generateWithActiveProvider).toHaveBeenCalledTimes(1);
    const pool = db.prepare("SELECT COUNT(*) AS n FROM teil_sets WHERE format_id = 'telc-b1' AND part_id = 'sprachbausteine-1' AND status = 'unreviewed'").get() as { n: number };
    expect(pool.n).toBe(0);
  });

  // S4: a letter that is being graded refuses a second submit with 409 letter_grading.
  it('submit answers 409 letter_grading while the letter is being graded', async () => {
    const db = getDb();
    const fixture = JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', 'teil-sets', 'telc-b1', 'schreiben.json'), 'utf8'));
    createTeilSetService(db).upload('telc-b1', 'schreiben', [{ id: 'fixture-schreiben', set: fixture.sets[0].set }]);
    const run = await (await post(start, { formatId: 'telc-b1', partId: 'schreiben' })).json();
    db.prepare('UPDATE teil_attempts SET grading_started_at = ? WHERE id = ?').run(new Date().toISOString(), run.attemptId);
    const res = await post(submit, { attemptId: run.attemptId, answers: { type: 'letter', taskIndex: 0, text: 'Liebe Anna, danke!' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'letter_grading' });
    expect(generateWithActiveProvider).not.toHaveBeenCalled();
  });

  it('mock start validates its body', async () => {
    expect((await post(startMock, {})).status).toBe(400);
    expect((await post(startMock, { formatId: 'telc-z9' })).status).toBe(404);
  });

  it('GET readiness', async () => {
    const res = await readiness();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ formatId: 'telc-b1', parts: expect.any(Array) });
  });
});
