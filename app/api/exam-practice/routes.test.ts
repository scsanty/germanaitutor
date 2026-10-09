import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
  });

  afterEach(() => {
    closeDb();
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
    const res = await post(start, { formatId: 'telc-b1', partId: 'hoeren-1' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'part_unavailable' });
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
