import { describe, it, expect, vi, type Mock } from 'vitest';
import { createDbClient } from '../db/client';
import { reconcileExercises } from '../curriculum-admin/exerciseReconciliation';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { AttemptError, createAttemptService, toAttemptErrorResponse, type AttemptDeps } from './attemptService';
import { markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

type GradeFreeText = NonNullable<AttemptDeps['gradeFreeText']>;

function setup(options: { day?: number; grade?: Mock<GradeFreeText> } = {}) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  let day = options.day ?? 24;
  const gradeFreeText = options.grade ?? vi.fn<GradeFreeText>().mockResolvedValue({ ok: true, result: 'correct', feedback: { en: 'Good.', de: 'Gut.' } });
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
    const { db, service, srs, count } = setup();
    await service.recordAttempt('a1-greet__ex1', wrong, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(count('lesson_completions')).toBe(0);

    const outcome = await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(outcome).toMatchObject({ result: 'correct', lessonCompleted: true, justCompleted: true });
    expect(outcome.passedExerciseIds).toEqual(['a1-greet__ex1', 'a1-greet__ex2']);
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 0, interval_days: 1, next_due_at: '2026-09-25' });
    // B1: the vocabulary-lesson flashcard is seeded into the deck, not the exercise reviews.
    expect(srs('a1-greet__ex2')).toBeUndefined();
    expect(db.prepare('SELECT s.repetitions, s.interval_days, s.next_due_at FROM vocabulary_srs_state s').get()).toEqual({
      repetitions: 1,
      interval_days: 3,
      next_due_at: '2026-09-27',
    });
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

  it('accepts a queue answer only for a due review in the active track and level, once a day', async () => {
    const { db, service, setDay, count, profiles } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    // Seeded: ex1 due 2026-09-27.
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).rejects.toMatchObject({ code: 'not_due' });
    expect(count('lesson_attempts')).toBe(2);

    setDay(27);
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).resolves.toMatchObject({ result: 'correct' });
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).rejects.toMatchObject({ code: 'not_due' });
    await expect(service.recordAttempt('a1-greet__ex1', right, 'lesson')).resolves.toMatchObject({ result: 'correct' });

    // Review Focus 5: after switching track, a leftover queue item from the old track is refused.
    // (I6: ex1, since the vocabulary flashcard ex2 is no longer a queue item.)
    setDay(28);
    db.prepare("UPDATE exercise_srs_state SET next_due_at = '2026-09-28' WHERE exercise_id = 'a1-greet__ex1'").run();
    profiles.updateProfile({ activeTrack: 'goethe' });
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).rejects.toMatchObject({ code: 'not_due' });
  });

  it('grades free text with the AI and stores the answer and feedback', async () => {
    const { db, service, gradeFreeText, profiles } = setup({
      grade: vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: { en: 'Almost.', de: 'Fast.' } }),
    });
    markComplete(db, 'a1-greet');
    profiles.updateProfile({ uiLanguage: 'de' });
    const outcome = await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(outcome).toMatchObject({ result: 'almost', feedback: { en: 'Almost.', de: 'Fast.' }, correctAnswer: 'Ich bin müde.' });
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Say that you are tired.',
      modelAnswer: 'Ich bin müde.',
      studentAnswer: 'Ich bin mude.',
      level: 'A1',
    });
    expect(db.prepare('SELECT answer_text, ai_feedback, source FROM lesson_attempts').get()).toEqual({
      answer_text: 'Ich bin mude.',
      ai_feedback: JSON.stringify({ en: 'Almost.', de: 'Fast.' }),
      source: 'lesson',
    });
  });

  it('stores feedback in both languages', async () => {
    const grade = vi.fn<GradeFreeText>().mockResolvedValue({ ok: true, result: 'almost', feedback: { en: 'Good.', de: 'Gut.' } });
    const { db, service } = setup({ grade });
    db.prepare("INSERT INTO lesson_completions (lesson_id, completed_at) VALUES ('a1-greet', '2026-09-20T10:00:00.000Z')").run();
    const outcome = await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(outcome.feedback).toEqual({ en: 'Good.', de: 'Gut.' });
    const row = db.prepare('SELECT ai_feedback FROM lesson_attempts ORDER BY id DESC LIMIT 1').get() as { ai_feedback: string };
    expect(JSON.parse(row.ai_feedback)).toEqual({ en: 'Good.', de: 'Gut.' });
  });

  it('stores nothing when free-text grading fails', async () => {
    const { db, service, count } = setup({ grade: vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up' }) });
    markComplete(db, 'a1-greet');
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

  it('names the locked level and the AI failure in the error code', async () => {
    const { db, service } = setup({ grade: vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }) });
    markComplete(db, 'a1-greet');
    await expect(service.recordAttempt('a2-past__ex1', { type: 'fill_blank', text: 'war' }, 'lesson')).rejects.toMatchObject({
      code: 'level_locked',
      params: { level: 'A2' },
    });
    await expect(
      service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson')
    ).rejects.toMatchObject({ kind: 'grading_failed', code: 'no_provider' });
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

describe('attemptService and the vocabulary deck', () => {
  const deckState = (db: ReturnType<typeof setup>['db']) =>
    db.prepare('SELECT i.lemma, i.plural, s.repetitions, s.next_due_at FROM vocabulary_items i JOIN vocabulary_srs_state s ON s.item_id = i.id ORDER BY i.id').all();

  it('sends a completed vocabulary lesson’s flashcards to the deck, not the Daily Queue', async () => {
    const { db, service } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(db.prepare("SELECT exercise_id FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex2'").get()).toBeUndefined();
    expect(db.prepare('SELECT lemma, meaning_en, source, source_ref, status FROM vocabulary_items').get()).toEqual({
      lemma: 'der Hund',
      meaning_en: 'the dog',
      source: 'lesson',
      source_ref: 'a1-greet__ex2',
      status: 'learning',
    });
    const state = db.prepare('SELECT repetitions, next_due_at FROM vocabulary_srs_state').get();
    expect(state).toEqual({ repetitions: 1, next_due_at: '2026-09-27' }); // right on the first try → in 3 days
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex1'").get()).toBeTruthy();
  });

  // B1: only vocabulary-lesson flashcards move; a flashcard in a grammar lesson stays a Daily Queue review.
  it('keeps a grammar lesson’s flashcard in the exercise reviews and the Daily Queue', async () => {
    const { db, service, srs, setDay } = setup();
    db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-sein__card', 'a1-sein', 'flashcard', '{"front":"ich bin","back":"I am"}')`);
    markComplete(db, 'a1-greet');
    await service.recordAttempt('a1-sein__ex2', { type: 'fill_blank', text: 'bin' }, 'lesson');
    await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson');
    const outcome = await service.recordAttempt('a1-sein__card', knew, 'lesson');
    expect(outcome.justCompleted).toBe(true);
    expect(srs('a1-sein__card')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 0 });
    setDay(27);
    const queue = createProgressService(db).getDailyQueue('2026-09-27');
    expect(queue.items.map((i) => i.exercise.id)).toContain('a1-sein__card');
    await expect(service.recordAttempt('a1-sein__card', knew, 'queue')).resolves.toMatchObject({ result: 'correct' });
  });

  it('keeps a malformed vocabulary flashcard as an exercise review', async () => {
    const { db, service, srs } = setup();
    db.exec(`UPDATE exercises SET content = '{"front":"","back":"the dog"}' WHERE id = 'a1-greet__ex2'`);
    db.prepare(
      "INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, answered_at, answered_on) VALUES ('a1-greet__ex2', 'a1-greet', 'lesson', 'correct', 'x', '2026-09-24T08:00:00.000Z', '2026-09-24')"
    ).run();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(srs('a1-greet__ex2')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 0 });
  });

  // S7: re-answering a flashcard of a completed lesson never pulls the deck's due date earlier.
  it('leaves the deck alone when a completed lesson’s flashcard is answered again', async () => {
    const { db, service, setDay } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    db.prepare("UPDATE vocabulary_srs_state SET repetitions = 4, next_due_at = '2026-12-01'").run();
    setDay(26);
    await service.recordAttempt('a1-greet__ex2', { type: 'flashcard', rating: 'didnt_know' }, 'lesson');
    expect(deckState(db)).toEqual([{ lemma: 'der Hund', plural: null, repetitions: 4, next_due_at: '2026-12-01' }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM exercise_srs_state').get()).toEqual({ n: 1 });
  });

  // S7 and S6: a flashcard added after completion enters the deck once, with its lemma and plural split.
  it('seeds a flashcard added after completion into the deck once', async () => {
    const { db, service, setDay } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex3', 'a1-greet', 'flashcard', '{"front":"die Katze, die Katzen","back":"the cat"}')`);
    await service.recordAttempt('a1-greet__ex3', knew, 'lesson');
    setDay(25);
    await service.recordAttempt('a1-greet__ex3', { type: 'flashcard', rating: 'didnt_know' }, 'lesson');
    expect(deckState(db)).toEqual([
      { lemma: 'der Hund', plural: null, repetitions: 1, next_due_at: '2026-09-27' },
      { lemma: 'die Katze', plural: 'die Katzen', repetitions: 1, next_due_at: '2026-09-27' },
    ]);
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex3'").get()).toBeUndefined();
  });
});

describe('attemptService.markLessonDone', () => {
  it('completes a lesson without exercises, and refuses one with exercises', () => {
    const { db, service, count } = setup();
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-read', 'generic', 'A1', 'reading', 'Just read');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-read', 'g-a1-m1');
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

  // I-1: an admin deleting the only unpassed exercise must not strand the lesson.
  it('completes a lesson after an admin deletes its last unpassed exercise, seeding review for what remains', async () => {
    const { db, service, srs, count, profiles } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(count('lesson_completions')).toBe(0);

    reconcileExercises(db, 'a1-greet', [
      {
        id: 'a1-greet__ex1',
        type: 'multiple_choice',
        content: { question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'], correctIndex: 0 },
      },
    ]);

    expect(service.markLessonDone('a1-greet')).toEqual({ completed: true });
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
    // Completing a1-greet also covers Goethe A1's only lesson via the concept link, finishing Goethe A1.
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2' });
  });

  it('still refuses a lesson that has an unpassed exercise', () => {
    const { service } = setup();
    expect(() => service.markLessonDone('a1-greet')).toThrow(AttemptError);
    expect(() => service.markLessonDone('a1-greet')).toThrow('This lesson has exercises; answer them to complete it');
  });
});

describe('toAttemptErrorResponse', () => {
  it('maps error kinds to HTTP statuses', () => {
    expect(toAttemptErrorResponse(new AttemptError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x', code: 'not_found' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x', code: 'level_locked' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x', code: 'ai_failed', params: { detail: 'x' } } });
    expect(toAttemptErrorResponse(new Error('x'))).toBeNull();
  });
});
