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
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { POST as startBatch } from '../lessons/[id]/practice/route';
import { POST as answer } from './answer/route';

function batch(id: string) {
  return startBatch(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id }) });
}

function grade(body: unknown) {
  return answer(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/tutoring practice routes', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-practice-'));
    const db = getDb();
    seedTutoringCurriculum(db);
    markComplete(db, 'a1-greet');
    for (let i = 1; i <= 5; i++) addPracticeExercise(db, `px-${i}`, 'a1-greet');
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockReset();
  });

  it('serves a batch from the pool, then reports the AI failure when the pool is used up', async () => {
    const first = await batch('a1-greet');
    expect(first.status).toBe(200);
    expect((await first.json()).exercises).toHaveLength(5);

    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' });
    const second = await batch('a1-greet');
    expect(second.status).toBe(502);
    expect(await second.json()).toEqual({ error: 'No AI provider is set up', code: 'no_provider' });
  });

  it('refuses a lesson the student has not completed', async () => {
    const res = await batch('a1-sein');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Finish the lesson first', code: 'lesson_not_completed' });
  });

  it('grades a practice answer, and answers 400 and 404 for bad requests', async () => {
    const ok = await grade({ practiceExerciseId: 'px-1', answer: { type: 'multiple_choice', selectedIndex: 1 } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ result: 'wrong', correctAnswer: 'ja' });

    const malformed = await grade({ practiceExerciseId: 'px-1' });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).code).toBe('bad_request');

    const missing = await grade({ practiceExerciseId: 'px-gone', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe('not_found');
  });
});
