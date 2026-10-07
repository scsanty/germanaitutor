import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { Exercise } from '../curriculum/types';
import { addDays, localDate } from '../tutoring/dates';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { toExerciseView } from '../tutoring/exerciseView';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import type { GradeResult } from '../tutoring/grading';
import { answerTextFor, correctAnswerFor, type LessonAnswer } from '../tutoring/lessonAnswers';
import { INITIAL_EASE } from '../tutoring/srs';
import { drawTestOut, scoreTestOut, TESTOUT_MIN_QUESTIONS } from '../tutoring/testOut';
import type { TestOutAnswerOutcome, TestOutResult, TestOutRun, TestOutState } from '../tutoring/testOutViews';
import { lessonCardLemma, upsertLessonCard } from '../deck/lessonCards';
import { isAiAvailable } from './aiService';
import { gradeExerciseAnswer } from './exerciseGrading';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { loadLevelGating } from './levelGating';
import { createContentText } from './contentText';
import { createProfileService } from './profileService';
import { eligibleCandidates, testOutStatusFor } from './testOutStatus';
import { createUnlockService } from './unlockService';

export type TestOutErrorKind = 'not_found' | 'unavailable' | 'cooldown' | 'bad_request' | 'grading_failed';

const DEFAULT_CODE: Record<TestOutErrorKind, ErrorCode> = {
  not_found: 'not_found',
  unavailable: 'testout_unavailable',
  cooldown: 'testout_cooldown',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

const STATUS_FOR: Record<TestOutErrorKind, number> = {
  not_found: 404,
  unavailable: 409,
  cooldown: 409,
  bad_request: 400,
  grading_failed: 502,
};

export class TestOutError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: TestOutErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toTestOutErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof TestOutError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}

export interface TestOutDeps {
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
  random?: () => number;
  aiAvailable?: () => boolean;
}

interface StoredAnswer {
  exerciseId: string;
  answerText: string;
  result: GradeResult;
  correctAnswer: string | null;
}

interface AttemptRow {
  id: number;
  exercise_ids: string;
  answers: string;
  score: number | null;
  max_score: number | null;
  status: 'in_progress' | 'passed' | 'failed';
}

export function createTestOutService(db: Database.Database, deps: TestOutDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  const aiAvailable = deps.aiAvailable ?? (() => isAiAvailable(db));
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const profiles = createProfileService(db);
  const text = createContentText(db);
  const unlocks = createUnlockService(db);

  function context(milestoneId: string) {
    const milestone = db
      .prepare('SELECT id, title, track, level, difficulty_rank AS rank FROM milestones WHERE id = ?')
      .get(milestoneId) as { id: string; title: string; track: Track; level: CefrLevel; rank: number | null } | undefined;
    if (!milestone || milestone.rank === null) throw new TestOutError(`Milestone not found: ${milestoneId}`, 'not_found');
    return { milestone, gating: loadLevelGating(db, milestone.track, milestone.level) };
  }

  function getExercise(id: string): Exercise | null {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as
      | { id: string; lesson_id: string; track: Exercise['track']; type: Exercise['type']; content: string }
      | undefined;
    return row ? { id: row.id, lessonId: row.lesson_id, track: row.track, type: row.type, content: JSON.parse(row.content) } : null;
  }

  function openAttempt(milestoneId: string): AttemptRow | undefined {
    return db
      .prepare("SELECT * FROM milestone_testouts WHERE milestone_id = ? AND status = 'in_progress'")
      .get(milestoneId) as AttemptRow | undefined;
  }

  // Review Focus 3: questions whose exercise was deleted are dropped from the attempt, answered or
  // not, so `ids` and `answers` stay aligned (answers are always a prefix of ids).
  function pruned(row: AttemptRow): { ids: string[]; answers: StoredAnswer[] } {
    const ids = JSON.parse(row.exercise_ids) as string[];
    const answers = JSON.parse(row.answers) as StoredAnswer[];
    const exists = db.prepare('SELECT 1 FROM exercises WHERE id = ?');
    const keptAnswers = answers.filter((a) => exists.get(a.exerciseId));
    const keptIds = [...keptAnswers.map((a) => a.exerciseId), ...ids.slice(answers.length).filter((id) => exists.get(id))];
    if (keptIds.length !== ids.length) {
      db.prepare('UPDATE milestone_testouts SET exercise_ids = ?, answers = ? WHERE id = ?').run(
        JSON.stringify(keptIds),
        JSON.stringify(keptAnswers),
        row.id
      );
    }
    return { ids: keptIds, answers: keptAnswers };
  }

  function toResult(answers: StoredAnswer[], score: number, maxScore: number, passed: boolean): TestOutResult {
    return {
      passed,
      score,
      maxScore,
      review: answers.flatMap((a) => {
        const exercise = getExercise(a.exerciseId);
        return exercise ? [{ exercise: toExerciseView(exercise), answerText: a.answerText, result: a.result, correctAnswer: a.correctAnswer }] : [];
      }),
    };
  }

  // Prunes the open attempt. One left below the minimum size is discarded (no cooldown); one with
  // every remaining question answered is finished like a normal last answer. Returns whether it ended.
  function settle(milestoneId: string): boolean {
    return db.transaction(() => {
      const row = openAttempt(milestoneId);
      if (!row) return false;
      const { ids, answers } = pruned(row);
      // Below the minimum draw size the attempt is void, however much was answered.
      if (ids.length < TESTOUT_MIN_QUESTIONS) {
        db.prepare('DELETE FROM milestone_testouts WHERE id = ?').run(row.id);
        return true;
      }
      if (answers.length >= ids.length) {
        finish(row, milestoneId, answers);
        return true;
      }
      return false;
    })();
  }

  function currentStatus(milestoneId: string) {
    const { gating } = context(milestoneId);
    let status = testOutStatusFor(db, gating, milestoneId, { now: now(), aiAvailable: aiAvailable() });
    if (status.status === 'in_progress') {
      settle(milestoneId); // prunes deleted questions; may end the attempt
      status = testOutStatusFor(db, loadLevelGating(db, gating.track, gating.level), milestoneId, {
        now: now(),
        aiAvailable: aiAvailable(),
      });
    }
    return status;
  }

  function state(milestoneId: string): TestOutState {
    const { milestone } = context(milestoneId);
    const status = currentStatus(milestoneId);
    const last = db
      .prepare(
        "SELECT * FROM milestone_testouts WHERE milestone_id = ? AND status != 'in_progress' ORDER BY finished_at DESC, id DESC LIMIT 1"
      )
      .get(milestoneId) as AttemptRow | undefined;
    return {
      milestone: { id: milestone.id, title: text.milestoneTitle(milestone.id, profiles.getProfile().uiLanguage) },
      status,
      lastResult: last ? toResult(JSON.parse(last.answers), last.score ?? 0, last.max_score ?? 0, last.status === 'passed') : null,
    };
  }

  function start(milestoneId: string): TestOutRun {
    const { gating } = context(milestoneId);
    const status = currentStatus(milestoneId);
    if (status.status === 'cooldown') {
      throw new TestOutError('You can try this test-out again later', 'cooldown', undefined, { retryAt: status.retryAt });
    }
    if (status.status === 'available') {
      const ids = drawTestOut(eligibleCandidates(db, gating, milestoneId, aiAvailable()), random);
      db.prepare(
        "INSERT INTO milestone_testouts (milestone_id, status, exercise_ids, started_at) VALUES (?, 'in_progress', ?, ?)"
      ).run(milestoneId, JSON.stringify(ids), now().toISOString());
    } else if (status.status !== 'in_progress') {
      throw new TestOutError("This test-out isn't available", 'unavailable');
    }
    const row = openAttempt(milestoneId)!;
    const { ids, answers } = pruned(row);
    return {
      attemptId: row.id,
      questions: ids.map((id) => getExercise(id)).filter((e): e is Exercise => e !== null).map(toExerciseView),
      answered: answers.length,
    };
  }

  function finish(row: AttemptRow, milestoneId: string, answers: StoredAnswer[]): TestOutResult {
    const { milestone, gating } = context(milestoneId);
    const { score, maxScore, passed } = scoreTestOut(answers.map((a) => a.result));
    const at = now().toISOString();
    db.prepare('UPDATE milestone_testouts SET status = ?, score = ?, max_score = ?, finished_at = ? WHERE id = ?').run(
      passed ? 'passed' : 'failed',
      score,
      maxScore,
      at,
      row.id
    );
    if (passed) {
      const tomorrow = addDays(localDate(now()), 1);
      const proven = new Set(answers.filter((a) => a.result === 'correct').map((a) => a.exerciseId));
      const lessonIds = gating.milestones.find((m) => m.id === milestoneId)!.lessonIds.filter((id) => !gating.isDone(id));
      const complete = db.prepare(
        "INSERT INTO lesson_completions (lesson_id, completed_at, source) VALUES (?, ?, 'testout') ON CONFLICT(lesson_id) DO NOTHING"
      );
      const schedule = db.prepare(
        `INSERT INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
         VALUES (?, 0, ?, 1, ?, ?) ON CONFLICT(exercise_id) DO NOTHING`
      );
      // B1: a vocabulary-lesson flashcard enters the deck instead of the Daily Queue.
      const exercisesOf = db.prepare(
        `SELECT e.id, e.content, (e.type = 'flashcard' AND l.skill = 'vocabulary') AS deck
         FROM exercises e JOIN lessons l ON l.id = e.lesson_id WHERE e.lesson_id = ? ORDER BY e.rowid`
      );
      for (const lessonId of lessonIds) {
        complete.run(lessonId, at);
        for (const { id, content, deck } of exercisesOf.all(lessonId) as { id: string; content: string; deck: number }[]) {
          if (proven.has(id)) continue;
          if (deck) {
            const card = JSON.parse(content) as { front: string; back: string };
            const state = { repetitions: 0, easeFactor: INITIAL_EASE, intervalDays: 1, nextDueAt: tomorrow };
            upsertLessonCard(db, { ...lessonCardLemma(card.front), meaningEn: card.back, exerciseId: id, state, at });
          } else {
            schedule.run(id, INITIAL_EASE, tomorrow, at);
          }
        }
      }
      unlocks.checkLevelFinishedAfterCompletion(milestone.level);
    }
    return toResult(answers, score, maxScore, passed);
  }

  async function answer(milestoneId: string, exerciseId: string, given: LessonAnswer): Promise<TestOutAnswerOutcome> {
    const { milestone } = context(milestoneId);
    const status = currentStatus(milestoneId);
    const row = openAttempt(milestoneId);
    if (status.status !== 'in_progress' || !row) throw new TestOutError("This test-out isn't available", 'unavailable');
    const { ids, answers } = pruned(row);
    const exercise = getExercise(exerciseId);
    if (!exercise) throw new TestOutError(`Exercise not found: ${exerciseId}`, 'not_found');
    if (ids[answers.length] !== exerciseId) throw new TestOutError('That is not the next question', 'bad_request');

    const graded = await gradeExerciseAnswer(exercise, given, milestone.level, { gradeFreeText: gradeFree });
    if (!graded.ok) {
      if (graded.reason === 'bad_request') throw new TestOutError(graded.message, 'bad_request');
      throw new TestOutError(graded.message, 'grading_failed', graded.code, graded.params);
    }

    return db.transaction((): TestOutAnswerOutcome => {
      // Re-read inside the transaction: a concurrent submit may have answered this question already.
      const current = openAttempt(milestoneId);
      if (!current || current.id !== row.id) throw new TestOutError("This test-out isn't available", 'unavailable');
      const fresh = pruned(current);
      if (fresh.ids[fresh.answers.length] !== exerciseId) throw new TestOutError('That is not the next question', 'bad_request');
      const stored = [
        ...fresh.answers,
        { exerciseId, answerText: answerTextFor(exercise, given), result: graded.result, correctAnswer: correctAnswerFor(exercise) },
      ];
      db.prepare('UPDATE milestone_testouts SET answers = ? WHERE id = ?').run(JSON.stringify(stored), current.id);
      if (stored.length < fresh.ids.length) return { finished: false, answered: stored.length, total: fresh.ids.length };
      return { finished: true, result: finish(current, milestoneId, stored) };
    })();
  }

  return { state, start, answer };
}

export type TestOutService = ReturnType<typeof createTestOutService>;
