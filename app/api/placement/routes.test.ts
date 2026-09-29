import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { smallPlacementExam } from '@/test/placementFixtures';
import { GET } from './route';
import { POST as start } from './start/route';
import { POST as answer } from './answer/route';
import { POST as stop } from './stop/route';
import { POST as skip } from './skip/route';

function answerRequest(body: unknown) {
  return answer(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/placement', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-placement-'));
    createPlacementService(getDb()).replaceExam(smallPlacementExam());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET reports the question count and no best result yet', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ best: null, questionCount: 10 });
  });

  it('runs a test from start to Beyond my knowledge', async () => {
    const started = await (await start()).json();
    expect(started).toMatchObject({ status: 'in_progress', question: { id: 'A1-mc', position: 1 } });

    const next = await answerRequest({ questionId: 'A1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({ status: 'in_progress', question: { id: 'A1-fill' } });

    const stopped = await (await stop()).json();
    expect(stopped).toMatchObject({ status: 'finished', outcome: { score: 1, stopReason: 'beyond_my_knowledge' } });
    expect((await (await GET()).json()).best).toMatchObject({ score: 1, placedLevel: 'A1' });
  });

  it('answer returns 400 for a malformed body or the wrong question', async () => {
    await start();
    expect((await answerRequest({ questionId: 'A1-mc' })).status).toBe(400);
    const wrongQuestion = await answerRequest({ questionId: 'C1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(wrongQuestion.status).toBe(400);
    expect(await wrongQuestion.json()).toEqual({ error: 'That question is not the current one' });
  });

  it('answer and stop return 409 when no test is in progress', async () => {
    const res = await answerRequest({ questionId: 'A1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(res.status).toBe(409);
    expect((await stop()).status).toBe(409);
  });

  it('skip marks the placement as skipped', async () => {
    expect(await (await skip()).json()).toMatchObject({ placementStatus: 'skipped' });
  });
});
