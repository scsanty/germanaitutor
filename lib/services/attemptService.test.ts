import { afterEach, beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAudio } from '../audio/audioStore';
import { createDbClient } from '../db/client';
import { reconcileExercises } from '../curriculum-admin/exerciseReconciliation';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { AttemptError, createAttemptService, toAttemptErrorResponse, type AttemptDeps } from './attemptService';
import type { LetterGrade } from '../writing/letterGrading';
import { addListeningExercise, listeningHash, markComplete, scheduleReview, seedTutoringCurriculum } from '@/test/tutoringFixtures';

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

  it('grades a cloze item by item, logs a readable answer, and refuses an answer that does not fit', async () => {
    const { db, service } = setup();
    db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex3', 'a1-greet', 'cloze', ?)").run(
      JSON.stringify({ text: 'Ich {{1}} Anna, du {{2}} Ben.', gaps: [{ mode: 'typed', answer: 'bin' }, { mode: 'select', options: ['bist', 'ist'], correctIndex: 0 }] })
    );
    const outcome = await service.recordAttempt('a1-greet__ex3', { type: 'cloze', values: ['Bin', 0] }, 'lesson');
    expect(outcome).toMatchObject({ result: 'almost', correctAnswer: 'bin; bist', feedback: null, itemResults: [false, true] });
    expect(db.prepare("SELECT answer_text FROM lesson_attempts WHERE exercise_id = 'a1-greet__ex3'").get()).toEqual({ answer_text: 'Bin; bist' });
    await expect(service.recordAttempt('a1-greet__ex3', { type: 'cloze', values: ['bin'] }, 'lesson')).rejects.toMatchObject({ code: 'bad_request' });
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

type GradeLetter = NonNullable<AttemptDeps['gradeLetter']>;

const letterContent = {
  instruction: { en: 'Write to your friend.', de: 'Schreib deiner Freundin.' },
  tasks: [
    {
      situation: 'Ihre Freundin hat Sie eingeladen.',
      leitpunkte: ['Dank', 'Absage', 'Vorschlag'],
      register: 'informal',
      wordTarget: { min: 30, max: 50 },
    },
  ],
};

const letterGrade = (percent: number): LetterGrade => ({
  marks: [],
  criteria: [{ id: 'task', grade: 'B', justification: { en: 'Fine.', de: 'Gut.' } }],
  points: Math.round((percent / 100) * 15),
  maxPoints: 15,
  percent,
  corrected: 'Liebe Anna, …',
  summary: { en: `Summary ${percent}.`, de: `Zusammenfassung ${percent}.` },
});

describe('attemptService lesson letters', () => {
  function letterSetup() {
    const gradeLetter = vi
      .fn<GradeLetter>()
      .mockResolvedValueOnce({ ok: true, grade: letterGrade(47) })
      .mockResolvedValueOnce({ ok: true, grade: letterGrade(73) })
      .mockResolvedValue({ ok: true, grade: letterGrade(80) });
    const db = createDbClient(':memory:');
    seedTutoringCurriculum(db);
    markComplete(db, 'a1-greet');
    db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-sein__ex11', 'a1-sein', 'letter', ?)").run(
      JSON.stringify(letterContent)
    );
    const service = createAttemptService(db, {
      gradeFreeText: vi.fn<GradeFreeText>().mockResolvedValue({ ok: true, result: 'correct', feedback: null, mistakes: [] }),
      gradeLetter,
      now: () => new Date(2026, 8, 24, 10, 0),
    });
    return { db, service, gradeLetter };
  }
  const letter = (text: string) => ({ type: 'letter', taskIndex: 0, text }) as const;

  it('grades each submission as a new attempt: 47% is almost, then 73% is correct', async () => {
    const { db, service, gradeLetter } = letterSetup();
    const first = await service.recordAttempt('a1-sein__ex11', letter('Liebe Anna, ich kann nicht.'), 'lesson');
    expect(first).toMatchObject({ result: 'almost', correctAnswer: null, feedback: { en: 'Summary 47.', de: 'Zusammenfassung 47.' }, letter: { percent: 47 } });
    const second = await service.recordAttempt('a1-sein__ex11', letter('Liebe Anna, leider kann ich nicht kommen.'), 'lesson');
    expect(second).toMatchObject({ result: 'correct', letter: { percent: 73 } });

    expect(gradeLetter).toHaveBeenCalledWith({ level: 'A1', track: 'generic', content: letterContent, answer: letter('Liebe Anna, ich kann nicht.') });
    const rows = db.prepare("SELECT result, answer_text, ai_feedback FROM lesson_attempts WHERE exercise_id = 'a1-sein__ex11' ORDER BY id").all() as {
      result: string;
      answer_text: string;
      ai_feedback: string;
    }[];
    expect(rows.map((r) => [r.result, r.answer_text])).toEqual([
      ['almost', 'Liebe Anna, ich kann nicht.'],
      ['correct', 'Liebe Anna, leider kann ich nicht kommen.'],
    ]);
    // S5: the summary stays readable as {en, de} for the lesson chat; the whole grade rides along.
    expect(JSON.parse(rows[1].ai_feedback)).toEqual({ en: 'Summary 73.', de: 'Zusammenfassung 73.', letter: letterGrade(73) });
  });

  it('never gives a letter a review schedule, at completion or after it', async () => {
    const { db, service } = letterSetup();
    await service.recordAttempt('a1-sein__ex2', { type: 'fill_blank', text: 'bin' }, 'lesson');
    await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson');
    // almost passes, so this completes the lesson; later versions take the post-completion path.
    const done = await service.recordAttempt('a1-sein__ex11', letter('Liebe Anna, ich kann nicht.'), 'lesson');
    expect(done).toMatchObject({ result: 'almost', justCompleted: true });
    await service.recordAttempt('a1-sein__ex11', letter('Liebe Anna, leider nicht.'), 'lesson');
    await service.recordAttempt('a1-sein__ex11', letter('Liebe Anna, noch einmal.'), 'lesson');

    const scheduled = db.prepare('SELECT exercise_id FROM exercise_srs_state ORDER BY exercise_id').all();
    expect(scheduled).toEqual([{ exercise_id: 'a1-sein__ex10' }, { exercise_id: 'a1-sein__ex2' }]);
  });

  it('refuses a whitespace-only letter with bad_request before any AI call (Review Focus 4)', async () => {
    const { db, service, gradeLetter } = letterSetup();
    await expect(service.recordAttempt('a1-sein__ex11', letter('  \n\t  '), 'lesson')).rejects.toMatchObject({
      kind: 'bad_request',
      code: 'bad_request',
    });
    expect(gradeLetter).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_attempts').get()).toEqual({ n: 0 });
  });

  it('refuses a queue answer to a letter even if a review row exists for it', async () => {
    const { db, service, gradeLetter } = letterSetup();
    scheduleReview(db, 'a1-sein__ex11', '2026-09-20');
    await expect(service.recordAttempt('a1-sein__ex11', letter('Liebe Anna.'), 'queue')).rejects.toMatchObject({ code: 'not_due' });
    expect(gradeLetter).not.toHaveBeenCalled();
  });

  it('maps a letter grading failure to grading_failed and stores nothing', async () => {
    const { db, service, gradeLetter } = letterSetup();
    gradeLetter.mockReset().mockResolvedValue({ ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' });
    await expect(service.recordAttempt('a1-sein__ex11', letter('Liebe Anna.'), 'lesson')).rejects.toMatchObject({
      kind: 'grading_failed',
      code: 'ai_bad_reply',
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_attempts').get()).toEqual({ n: 0 });
  });
});

describe('attemptService free-text mistakes', () => {
  it('records the grader’s mistakes in the error log with source lesson (S7)', async () => {
    const grade = vi.fn<GradeFreeText>().mockResolvedValue({
      ok: true,
      result: 'almost',
      feedback: null,
      mistakes: [{ category: 'spelling', wrong: 'mude', right: 'müde' }],
    });
    const { db, service } = setup({ grade });
    markComplete(db, 'a1-greet');
    await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(db.prepare('SELECT source, category, wrong, "right" AS fix FROM error_log').all()).toEqual([
      { source: 'lesson', category: 'spelling', wrong: 'mude', fix: 'müde' },
    ]);
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
    const queue = await createProgressService(db).getDailyQueue('2026-09-27');
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
  it('completes a lesson without exercises, and refuses one with exercises', async () => {
    const { db, service, count } = setup();
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-read', 'generic', 'A1', 'reading', 'Just read');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-read', 'g-a1-m1');
    `);
    expect(await service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(await service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(count('lesson_completions')).toBe(1);
    await expect(service.markLessonDone('a1-greet')).rejects.toThrow(AttemptError);
  });

  it('refuses a locked lesson', async () => {
    const { service } = setup();
    await expect(service.markLessonDone('a2-past')).rejects.toThrow('Level A2 is locked');
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

    expect(await service.markLessonDone('a1-greet')).toEqual({ completed: true });
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
    // Completing a1-greet also covers Goethe A1's only lesson via the concept link, finishing Goethe A1.
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2' });
  });

  it('still refuses a lesson that has an unpassed exercise', async () => {
    const { service } = setup();
    await expect(service.markLessonDone('a1-greet')).rejects.toThrow(AttemptError);
    await expect(service.markLessonDone('a1-greet')).rejects.toThrow('This lesson has exercises; answer them to complete it');
  });
});

describe('toAttemptErrorResponse', () => {
  it('maps error kinds to HTTP statuses', async () => {
    expect(toAttemptErrorResponse(new AttemptError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x', code: 'not_found' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x', code: 'level_locked' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x', code: 'ai_failed', params: { detail: 'x' } } });
    expect(toAttemptErrorResponse(new Error('x'))).toBeNull();
  });
});

// Spec: completion counts only the exercises available at that moment.
describe('attemptService listening availability', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'gait-attempt-audio-'));
    process.env.GAIT_DATA_DIR = dataDir;
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.GAIT_DATA_DIR;
  });

  function listeningSetup(speechUp: () => Promise<boolean>) {
    const db = createDbClient(':memory:');
    seedTutoringCurriculum(db);
    addListeningExercise(db, 'a1-greet__ex3', 'a1-greet');
    const service = createAttemptService(db, { now: () => new Date(2026, 8, 24, 10, 0), audio: { speechUp } });
    return { db, service };
  }

  it('completes a lesson once every available exercise is passed while its audio-only exercise is unavailable', async () => {
    const { db, service } = listeningSetup(async () => false);
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    const outcome = await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(outcome).toMatchObject({ lessonCompleted: true, justCompleted: true });
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex3'").get()).toBeUndefined();
  });

  it('waits for the listening exercise when it is available, and returns the reveal with its outcome', async () => {
    writeAudio(await listeningHash(), Buffer.from('ogg'));
    const { service } = listeningSetup(async () => false);
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(await service.recordAttempt('a1-greet__ex2', knew, 'lesson')).toMatchObject({ lessonCompleted: false });
    const outcome = await service.recordAttempt('a1-greet__ex3', { type: 'audio_questions', selected: [1] }, 'lesson');
    expect(outcome).toMatchObject({ result: 'correct', correctAnswer: 'Mit dem Bus', itemResults: [true], lessonCompleted: true });
    expect(outcome.reveal?.evidence).toEqual(['Nein, mit dem Bus.']);
    expect(outcome.reveal?.transcript.lines.map((l) => l.label)).toEqual(['Anna', 'Ben', 'Anna']);
  });

  it('refuses "mark as done" when every exercise of a lesson is unavailable', async () => {
    const { db, service } = listeningSetup(async () => false);
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hear', 'generic', 'A1', 'listening', 'Hear');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-hear', 'g-a1-m1');
    `);
    addListeningExercise(db, 'a1-hear__ex1', 'a1-hear', 'Hamburg');
    await expect(service.markLessonDone('a1-hear')).rejects.toThrow(AttemptError);
  });
});
