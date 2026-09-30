import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createTestOutService, TestOutError, type TestOutDeps } from './testOutService';
import { addSecondMilestone, markComplete, scheduleReview, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import type { LessonAnswer } from '../tutoring/lessonAnswers';

// Generic A1: "Basics" (rank 1, open) and "Later" (rank 2, the next locked rank) with three
// lessons: 2 + 2 + 2 eligible exercises and one flashcard, so a test-out draws 6.
function setup(deps: Partial<TestOutDeps> = {}) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  addSecondMilestone(db);
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a1-late2', 'generic', 'A1', 'grammar', 'Later two'), ('a1-late3', 'generic', 'A1', 'vocabulary', 'Later three');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late2', 'g-a1-m2'), ('a1-late3', 'g-a1-m2');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late2__ex1', 'a1-late2', 'multiple_choice', '{"question":"Q2?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late2__ex2', 'a1-late2', 'fill_blank', '{"textWithBlank":"Du ___ hier.","correctAnswer":"bin"}'),
      ('a1-late3__ex1', 'a1-late3', 'multiple_choice', '{"question":"Q3?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late3__ex2', 'a1-late3', 'fill_blank', '{"textWithBlank":"Er ___ hier.","correctAnswer":"bin"}'),
      ('a1-late3__card', 'a1-late3', 'flashcard', '{"front":"das Haus","back":"the house"}');
  `);
  let now = new Date('2026-09-29T10:00:00.000Z');
  const service = createTestOutService(db, {
    now: () => now,
    random: () => 0.3,
    aiAvailable: () => false,
    ...deps,
  });
  return { db, service, advance: (hours: number) => (now = new Date(now.getTime() + hours * 3_600_000)) };
}

function exerciseType(db: ReturnType<typeof setup>['db'], id: string): string {
  return (db.prepare('SELECT type FROM exercises WHERE id = ?').get(id) as { type: string }).type;
}

function right(db: ReturnType<typeof setup>['db'], id: string): LessonAnswer {
  return exerciseType(db, id) === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 0 } : { type: 'fill_blank', text: 'bin' };
}

function wrong(db: ReturnType<typeof setup>['db'], id: string): LessonAnswer {
  return exerciseType(db, id) === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 1 } : { type: 'fill_blank', text: 'nope' };
}

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof TestOutError ? err.kind : 'other';
  }
  return undefined;
}

async function kindOfAsync(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return err instanceof TestOutError ? err.kind : 'other';
  }
  return undefined;
}

describe('testOutService.state', () => {
  it('offers a test-out only for the next locked rank', () => {
    const { service } = setup();
    expect(service.state('g-a1-m1').status).toEqual({ status: 'none' });
    expect(service.state('g-a1-m2')).toEqual({
      milestone: { id: 'g-a1-m2', title: 'Later' },
      status: { status: 'available' },
      lastResult: null,
    });
  });

  it('reports too few questions when the draw would have fewer than 5', () => {
    const { db, service } = setup();
    db.exec("DELETE FROM lessons WHERE id IN ('a1-late2', 'a1-late3')");
    expect(service.state('g-a1-m2').status).toEqual({ status: 'too_few_questions' });
  });

  it('answers 404 for an unknown or Unsorted milestone', () => {
    const { service } = setup();
    expect(kindOf(() => service.state('nope'))).toBe('not_found');
  });
});

describe('testOutService.start and answer', () => {
  it('draws eligible questions only, resumes the same attempt, and gives no feedback while answering', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    expect(run.questions).toHaveLength(6);
    expect(run.questions.some((q) => q.type === 'flashcard')).toBe(false);
    expect(run.answered).toBe(0);

    const outcome = await service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id));
    expect(outcome).toEqual({ finished: false, answered: 1, total: 6 });
    expect(service.start('g-a1-m2')).toEqual({ ...run, answered: 1 });
    expect(service.state('g-a1-m2').status).toEqual({ status: 'in_progress', answered: 1, total: 6 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_attempts').get()).toEqual({ n: 0 });
  });

  it('on a pass: completes every lesson, schedules what was not proven, keeps existing reviews, and reviews all answers', async () => {
    const { db, service } = setup();
    scheduleReview(db, 'a1-late3__card', '2026-12-01');
    const run = service.start('g-a1-m2');
    let outcome;
    for (const [i, q] of run.questions.entries()) {
      outcome = await service.answer('g-a1-m2', q.id, i === 5 ? wrong(db, q.id) : right(db, q.id));
    }
    expect(outcome).toMatchObject({ finished: true, result: { passed: true, score: 5, maxScore: 6 } });
    const result = (outcome as { result: { review: { exercise: { id: string }; result: string; correctAnswer: string | null }[] } }).result;
    expect(result.review).toHaveLength(6);
    expect(result.review[5]).toMatchObject({ exercise: { id: run.questions[5].id }, result: 'wrong' });

    expect(db.prepare("SELECT lesson_id, source FROM lesson_completions WHERE source = 'testout' ORDER BY lesson_id").all()).toEqual([
      { lesson_id: 'a1-late', source: 'testout' },
      { lesson_id: 'a1-late2', source: 'testout' },
      { lesson_id: 'a1-late3', source: 'testout' },
    ]);
    const scheduled = db.prepare('SELECT exercise_id, next_due_at FROM exercise_srs_state ORDER BY exercise_id').all() as {
      exercise_id: string;
      next_due_at: string;
    }[];
    // The wrong answer is due tomorrow; the flashcard keeps its existing review; right answers are not scheduled.
    expect(scheduled).toHaveLength(2);
    expect(scheduled).toEqual(
      expect.arrayContaining([
        { exercise_id: 'a1-late3__card', next_due_at: '2026-12-01' },
        { exercise_id: run.questions[5].id, next_due_at: '2026-09-30' },
      ])
    );
    expect(service.state('g-a1-m2').status).toEqual({ status: 'none' });
  });

  it('on a fail: starts a 24-hour cooldown, then offers a fresh attempt', async () => {
    const { db, service, advance } = setup();
    const run = service.start('g-a1-m2');
    for (const q of run.questions) await service.answer('g-a1-m2', q.id, wrong(db, q.id));
    expect(service.state('g-a1-m2')).toMatchObject({
      status: { status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' },
      lastResult: { passed: false, score: 0, maxScore: 6 },
    });
    expect(kindOf(() => service.start('g-a1-m2'))).toBe('cooldown');
    advance(24);
    expect(service.state('g-a1-m2').status).toEqual({ status: 'available' });
    expect(service.start('g-a1-m2').answered).toBe(0);
  });

  it('refuses a test-out that is not offered', () => {
    const { service } = setup();
    expect(kindOf(() => service.start('g-a1-m1'))).toBe('unavailable');
  });

  // Review Focus 2: a double-submitted answer is refused, not stored twice.
  it('refuses an answer that is not for the next question', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    await service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id));
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id)))).toBe('bad_request');
    expect(service.start('g-a1-m2').answered).toBe(1);
  });

  // Review Focus 1: the milestone opened normally while an attempt was open.
  it('refuses answers to a stale attempt once the milestone is open', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(service.state('g-a1-m2').status).toEqual({ status: 'none' });
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id)))).toBe('unavailable');
  });

  // Review Focus 3: an exercise deleted mid-attempt is dropped; the attempt still finishes.
  it('drops a deleted question: answering it is not_found, and resuming skips it', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    db.prepare('DELETE FROM exercises WHERE id = ?').run(run.questions[0].id);
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[1].id)))).toBe('not_found');
    const resumed = service.start('g-a1-m2');
    expect(resumed.questions.map((q) => q.id)).toEqual(run.questions.slice(1).map((q) => q.id));
    let outcome;
    for (const q of resumed.questions) outcome = await service.answer('g-a1-m2', q.id, right(db, q.id));
    expect(outcome).toMatchObject({ finished: true, result: { passed: true, maxScore: 5 } });
  });

  it('draws free text only with a working AI provider, and keeps the question when grading fails', async () => {
    const gradeFreeText = vi.fn(async () => ({ ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const }));
    const { db, service } = setup({ aiAvailable: () => true, gradeFreeText });
    db.exec(`
      DELETE FROM exercises WHERE id IN ('a1-late3__ex1', 'a1-late3__ex2');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late3__free', 'a1-late3', 'free_text', '{"prompt":"Sag hallo.","modelAnswer":"Hallo!"}');
    `);
    const run = service.start('g-a1-m2');
    const freeIndex = run.questions.findIndex((q) => q.type === 'free_text');
    expect(freeIndex).toBeGreaterThanOrEqual(0);
    for (const q of run.questions.slice(0, freeIndex)) await service.answer('g-a1-m2', q.id, right(db, q.id));
    expect(await kindOfAsync(service.answer('g-a1-m2', 'a1-late3__free', { type: 'free_text', text: 'Hallo' }))).toBe('grading_failed');
    expect(service.start('g-a1-m2').answered).toBe(freeIndex);

    const { db: db2, service: noAi } = setup({ aiAvailable: () => false });
    db2.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late3__free', 'a1-late3', 'free_text', '{"prompt":"Sag hallo.","modelAnswer":"Hallo!"}')`);
    expect(noAi.start('g-a1-m2').questions.some((q) => q.type === 'free_text')).toBe(false);
  });
});
