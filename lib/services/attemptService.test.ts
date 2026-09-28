import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { AttemptError, createAttemptService, toAttemptErrorResponse } from './attemptService';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup(options: { day?: number; grade?: ReturnType<typeof vi.fn> } = {}) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  let day = options.day ?? 24;
  const gradeFreeText = options.grade ?? vi.fn().mockResolvedValue({ ok: true, result: 'correct', feedback: 'Gut.' });
  const service = createAttemptService(db, { gradeFreeText, now: () => new Date(2026, 8, day, 10, 0) });
  return {
    db,
    service,
    gradeFreeText,
    profiles: createProfileService(db),
    setDay: (value: number) => {
      day = value;
    },
    srs: (exerciseId: string) =>
      db.prepare('SELECT repetitions, interval_days, next_due_at FROM exercise_srs_state WHERE exercise_id = ?').get(exerciseId),
    count: (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
  };
}

const right = { type: 'multiple_choice', selectedIndex: 0 } as const;
const wrong = { type: 'multiple_choice', selectedIndex: 1 } as const;
const knew = { type: 'flashcard', rating: 'knew' } as const;

describe('attemptService.recordAttempt', () => {
  it('grades a multiple-choice answer and names the correct option', async () => {
    const { service } = setup();
    expect(await service.recordAttempt('a1-greet__ex1', wrong, 'lesson')).toEqual({
      result: 'wrong',
      correctAnswer: 'Hallo',
      feedback: null,
      passedExerciseIds: [],
      lessonCompleted: false,
      justCompleted: false,
    });
  });

  it('completes the lesson once every exercise has passed, and seeds review from first attempts', async () => {
    const { service, srs, count } = setup();
    await service.recordAttempt('a1-greet__ex1', wrong, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(count('lesson_completions')).toBe(0);

    const outcome = await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(outcome).toMatchObject({ result: 'correct', lessonCompleted: true, justCompleted: true });
    expect(outcome.passedExerciseIds).toEqual(['a1-greet__ex1', 'a1-greet__ex2']);
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 0, interval_days: 1, next_due_at: '2026-09-25' });
    expect(srs('a1-greet__ex2')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
  });

  it('keeps a completion when an exercise is added later, and seeds that exercise from its first attempt', async () => {
    const { db, service, srs, count } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex3', 'a1-greet', 'fill_blank', '{"textWithBlank":"___","correctAnswer":"Hallo"}')`);

    const outcome = await service.recordAttempt('a1-greet__ex3', { type: 'fill_blank', text: 'Hallo' }, 'lesson');
    expect(outcome).toMatchObject({ lessonCompleted: true, justCompleted: false });
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex3')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
  });

  it('moves the schedule only on the first answer of the day', async () => {
    const { service, srs, setDay, count } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });

    setDay(27);
    await service.recordAttempt('a1-greet__ex1', right, 'queue');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 2, interval_days: 6, next_due_at: '2026-10-03' });

    await service.recordAttempt('a1-greet__ex1', wrong, 'lesson');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 2, interval_days: 6, next_due_at: '2026-10-03' });
    expect(count('lesson_attempts')).toBe(4);
  });

  it('grades free text with the AI in the UI language and stores the answer and feedback', async () => {
    const { db, service, gradeFreeText, profiles } = setup({
      grade: vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Fast.' }),
    });
    profiles.updateProfile({ uiLanguage: 'de' });
    const outcome = await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(outcome).toMatchObject({ result: 'almost', feedback: 'Fast.', correctAnswer: 'Ich bin müde.' });
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Say that you are tired.',
      modelAnswer: 'Ich bin müde.',
      studentAnswer: 'Ich bin mude.',
      level: 'A1',
      uiLanguage: 'de',
    });
    expect(db.prepare('SELECT answer_text, ai_feedback, source FROM lesson_attempts').get()).toEqual({
      answer_text: 'Ich bin mude.',
      ai_feedback: 'Fast.',
      source: 'lesson',
    });
  });

  it('stores nothing when free-text grading fails', async () => {
    const { service, count } = setup({ grade: vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up' }) });
    await expect(
      service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson')
    ).rejects.toMatchObject({ kind: 'grading_failed', message: 'No AI provider is set up' });
    expect(count('lesson_attempts')).toBe(0);
  });

  it('rejects a locked lesson, an unknown exercise, and a mismatched or impossible answer', async () => {
    const { service } = setup();
    await expect(service.recordAttempt('a2-past__ex1', { type: 'fill_blank', text: 'war' }, 'lesson')).rejects.toMatchObject({
      kind: 'locked',
      message: 'Level A2 is locked',
    });
    await expect(service.recordAttempt('nope', right, 'lesson')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.recordAttempt('a1-greet__ex1', knew, 'lesson')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(
      service.recordAttempt('a1-greet__ex1', { type: 'multiple_choice', selectedIndex: 5 }, 'lesson')
    ).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('unlocks the next level when a completion finishes a level, including through a concept link', async () => {
    const { service, profiles } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(profiles.getProfile().highestUnlockedLevel).toBe('A1');
    // Completing a1-greet also covers Goethe A1's only lesson, which finishes Goethe A1.
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2', activeLevel: 'A1' });
  });
});

describe('attemptService.markLessonDone', () => {
  it('completes a lesson without exercises, and refuses one with exercises', () => {
    const { db, service, count } = setup();
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-read', 'generic', 'A1', 'reading', 'Just read');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-read', 'g-a1-s1', 2);
    `);
    expect(service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(count('lesson_completions')).toBe(1);
    expect(() => service.markLessonDone('a1-greet')).toThrow(AttemptError);
  });

  it('refuses a locked lesson', () => {
    const { service } = setup();
    expect(() => service.markLessonDone('a2-past')).toThrow('Level A2 is locked');
  });
});

describe('toAttemptErrorResponse', () => {
  it('maps error kinds to HTTP statuses', () => {
    expect(toAttemptErrorResponse(new AttemptError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new Error('x'))).toBeNull();
  });
});
