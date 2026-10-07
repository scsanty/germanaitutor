import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import type { Exercise } from '../curriculum/types';
import { meetsCompletionRule } from '../tutoring/completion';
import { localDate } from '../tutoring/dates';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import type { GradeResult } from '../tutoring/grading';
import {
  answerTextFor,
  correctAnswerFor,
  type AttemptOutcome,
  type AttemptSource,
  type LessonAnswer,
} from '../tutoring/lessonAnswers';
import { computeNextReview, seedReview, type SrsState } from '../tutoring/srs';
import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { findItemByKey, lessonCardKey, lessonCardLemma, vocabularyCardContent } from '../deck/lessonCards';
import { createCurriculumService } from './curriculumService';
import { createDeckService } from './deckService';
import { gradeExerciseAnswer } from './exerciseGrading';
import { lessonLock } from './levelGating';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { storeFeedback, type LocalizedText } from '../i18n/localizedText';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { createUnlockService } from './unlockService';

export type AttemptErrorKind = 'not_found' | 'locked' | 'bad_request' | 'grading_failed';

const DEFAULT_CODE: Record<AttemptErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

export class AttemptError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: AttemptErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

const STATUS_FOR: Record<AttemptErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, grading_failed: 502 };

export function toAttemptErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof AttemptError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBodyFor(err) };
}

export interface AttemptDeps {
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Exercise['track'];
  type: Exercise['type'];
  content: string;
}

interface SrsRow {
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_due_at: string;
}

export function createAttemptService(db: Database.Database, deps: AttemptDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const unlocks = createUnlockService(db);
  const deck = createDeckService(db, { now });

  function getExercise(exerciseId: string): Exercise {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId) as ExerciseRow | undefined;
    if (!row) throw new AttemptError(`Exercise not found: ${exerciseId}`, 'not_found');
    return { id: row.id, lessonId: row.lesson_id, track: row.track, type: row.type, content: JSON.parse(row.content) };
  }

  // Spec: Level Unlocking — the API rejects answers in a locked level.
  function getUnlockedLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new AttemptError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new AttemptError(`Level ${lesson.sourceLevel} is locked`, 'locked', 'level_locked', { level: lesson.sourceLevel });
    }
    return lesson;
  }

  // Phase 2 leftover: a queue answer must be a real, due review of the active track+level that
  // hasn't been answered in the queue today — otherwise it would count against the daily cap.
  function assertDueInQueue(exerciseId: string, today: string): void {
    const { activeTrack, activeLevel } = profiles.getProfile();
    const due = db
      .prepare(
        `SELECT 1
         FROM exercises e
         JOIN exercise_srs_state st ON st.exercise_id = e.id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN lesson_placements p ON p.lesson_id = e.lesson_id
         JOIN milestones m ON m.id = p.milestone_id
         WHERE e.id = ? AND m.track = ? AND m.level = ? AND st.next_due_at <= ?
           AND NOT (e.type = 'flashcard' AND l.skill = 'vocabulary')
           AND NOT EXISTS (
             SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.source = 'queue' AND a.answered_on = ?
           )`
      )
      .get(exerciseId, activeTrack, activeLevel, today, today);
    if (!due) throw new AttemptError('This review is not due', 'bad_request', 'not_due');
  }

  async function grade(
    exercise: Exercise,
    answer: LessonAnswer,
    level: CefrLevel
  ): Promise<{ result: GradeResult; feedback: LocalizedText | null }> {
    const graded = await gradeExerciseAnswer(exercise, answer, level, { gradeFreeText: gradeFree });
    if (graded.ok) return { result: graded.result, feedback: graded.feedback };
    if (graded.reason === 'bad_request') throw new AttemptError(graded.message, 'bad_request');
    throw new AttemptError(graded.message, 'grading_failed', graded.code, graded.params);
  }

  function getSrs(exerciseId: string): SrsState | null {
    const row = db
      .prepare('SELECT repetitions, ease_factor, interval_days, next_due_at FROM exercise_srs_state WHERE exercise_id = ?')
      .get(exerciseId) as SrsRow | undefined;
    if (!row) return null;
    return {
      repetitions: row.repetitions,
      easeFactor: row.ease_factor,
      intervalDays: row.interval_days,
      nextDueAt: row.next_due_at,
    };
  }

  function writeSrs(exerciseId: string, state: SrsState, at: string): void {
    db.prepare(
      `INSERT INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(exercise_id) DO UPDATE SET repetitions = excluded.repetitions, ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days, next_due_at = excluded.next_due_at, updated_at = excluded.updated_at`
    ).run(exerciseId, state.repetitions, state.easeFactor, state.intervalDays, state.nextDueAt, at);
  }

  // Spec: Spaced Repetition, "Entering review" — based on the exercise's first-ever attempt.
  // Freestyle spec (B1): a vocabulary-lesson flashcard enters the deck instead of the Daily Queue.
  function seedFromFirstAttempt(exerciseId: string, today: string, at: string): void {
    const first = db
      .prepare('SELECT result FROM lesson_attempts WHERE exercise_id = ? ORDER BY id LIMIT 1')
      .get(exerciseId) as { result: GradeResult } | undefined;
    if (!first) return;
    const state = seedReview(first.result, today);
    const card = vocabularyCardContent(db, exerciseId);
    if (card) deck.addFromLesson({ front: card.front, meaningEn: card.back, exerciseId, state });
    else writeSrs(exerciseId, state, at);
  }

  // S7: a vocabulary flashcard of a completed lesson enters the deck once (when it was added after
  // completion). Later lesson answers count for the lesson only and never move the deck's due date.
  function inDeck(front: string): boolean {
    return findItemByKey(db, lessonCardKey(lessonCardLemma(front).lemma))?.status === 'learning';
  }

  // Stored once and never revoked. The lesson's exercises enter review at this moment, and the
  // level may now be finished.
  function completeLesson(lessonId: string, level: CefrLevel, exerciseIds: string[], today: string, at: string): void {
    db.prepare('INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, ?) ON CONFLICT(lesson_id) DO NOTHING').run(
      lessonId,
      at
    );
    for (const exerciseId of exerciseIds) seedFromFirstAttempt(exerciseId, today, at);
    unlocks.checkLevelFinishedAfterCompletion(level);
  }

  // Spec: Server Enforcement. Lesson work on a locked lesson is refused; reviews are not affected.
  function assertLessonOpen(lessonId: string): void {
    if (lessonLock(db, lessonId).locked) throw new AttemptError('This lesson is still locked', 'locked', 'lesson_locked');
  }

  async function recordAttempt(exerciseId: string, answer: LessonAnswer, source: AttemptSource): Promise<AttemptOutcome> {
    const exercise = getExercise(exerciseId);
    const lesson = getUnlockedLesson(exercise.lessonId);
    if (source === 'lesson') assertLessonOpen(lesson.id);
    if (source === 'queue') assertDueInQueue(exercise.id, localDate(now()));
    const { result, feedback } = await grade(exercise, answer, lesson.sourceLevel);
    const answeredAt = now();
    const at = answeredAt.toISOString();
    const today = localDate(answeredAt);

    return db.transaction((): AttemptOutcome => {
      // Spec: only the first answer to an exercise on a given day moves its schedule.
      const firstToday = !db
        .prepare('SELECT 1 FROM lesson_attempts WHERE exercise_id = ? AND answered_on = ?')
        .get(exercise.id, today);
      db.prepare(
        `INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, ai_feedback, answered_at, answered_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(exercise.id, lesson.id, source, result, answerTextFor(exercise, answer), feedback ? storeFeedback(feedback) : null, at, today);

      const wasComplete = progress.isCompleted(lesson.id);
      let justCompleted = false;
      if (wasComplete) {
        const card = vocabularyCardContent(db, exercise.id);
        const state = card ? null : getSrs(exercise.id);
        if (card) {
          if (!inDeck(card.front)) seedFromFirstAttempt(exercise.id, today, at); // added after the lesson was completed
        } else if (!state) seedFromFirstAttempt(exercise.id, today, at); // added after the lesson was completed
        else if (firstToday) writeSrs(exercise.id, computeNextReview(state, result, today), at);
      } else {
        const exerciseIds = curriculum.getExercises(lesson.id, lesson.track).map((e) => e.id);
        if (meetsCompletionRule(exerciseIds, new Set(progress.passedExerciseIds(lesson.id)))) {
          completeLesson(lesson.id, lesson.sourceLevel, exerciseIds, today, at);
          justCompleted = true;
        }
      }

      return {
        result,
        correctAnswer: correctAnswerFor(exercise),
        feedback,
        passedExerciseIds: progress.passedExerciseIds(lesson.id),
        lessonCompleted: wasComplete || justCompleted,
        justCompleted,
      };
    })();
  }

  // Spec: Completion — a lesson with no exercises completes when the student taps "Mark as done".
  // I-1: a lesson whose remaining exercises are all passed (an admin deleted the rest) can also
  // complete this way, since `recordAttempt` will never see another answer to trigger it.
  function markLessonDone(lessonId: string): { completed: true } {
    const lesson = getUnlockedLesson(lessonId);
    assertLessonOpen(lesson.id);
    const exerciseIds = curriculum.getExercises(lesson.id, lesson.track).map((e) => e.id);
    if (exerciseIds.length > 0 && !meetsCompletionRule(exerciseIds, new Set(progress.passedExerciseIds(lesson.id)))) {
      throw new AttemptError('This lesson has exercises; answer them to complete it', 'bad_request');
    }
    const doneAt = now();
    const at = doneAt.toISOString();
    db.transaction(() => {
      if (!progress.isCompleted(lesson.id)) {
        completeLesson(lesson.id, lesson.sourceLevel, exerciseIds, localDate(doneAt), at);
      }
    })();
    return { completed: true };
  }

  return { recordAttempt, markLessonDone };
}

export type AttemptService = ReturnType<typeof createAttemptService>;
