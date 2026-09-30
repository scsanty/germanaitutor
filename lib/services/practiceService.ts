import type Database from 'better-sqlite3';
import type { Exercise, ExerciseContent, ExerciseType } from '../curriculum/types';
import { randomSuffix } from '../curriculum-admin/randomId';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { toExerciseView } from '../tutoring/exerciseView';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { correctAnswerFor, type LessonAnswer } from '../tutoring/lessonAnswers';
import { buildPracticeGenerationPrompt, contentKey, parseGeneratedExercises, type GeneratedExercise } from '../tutoring/practiceGeneration';
import { allowedPracticeTypes, PRACTICE_BATCH_SIZE } from '../tutoring/practiceTypes';
import type { PracticeBatch, PracticeGradeOutcome } from '../tutoring/practiceViews';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { createCurriculumService } from './curriculumService';
import { gradeExerciseAnswer } from './exerciseGrading';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { createUnlockService } from './unlockService';

export type PracticeErrorKind = 'not_found' | 'locked' | 'not_completed' | 'bad_request' | 'ai_failed';

const DEFAULT_CODE: Record<PracticeErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  not_completed: 'lesson_not_completed',
  bad_request: 'bad_request',
  ai_failed: 'ai_failed',
};

const STATUS_FOR: Record<PracticeErrorKind, number> = {
  not_found: 404,
  locked: 403,
  not_completed: 409,
  bad_request: 400,
  ai_failed: 502,
};

export class PracticeError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: PracticeErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toPracticeErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PracticeError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}

export interface PracticeDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
}

interface PoolRow {
  id: string;
  lesson_id: string;
  type: ExerciseType;
  content: string;
}

interface GenerationFailure {
  message: string;
  code?: ErrorCode;
  params?: ErrorParams;
}

export function createPracticeService(db: Database.Database, deps: PracticeDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const now = deps.now ?? (() => new Date());
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const unlocks = createUnlockService(db);

  // Spec: practice is only for a lesson in an unlocked level with the student's own completion.
  function getPracticeLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new PracticeError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new PracticeError(`Level ${lesson.sourceLevel} is locked`, 'locked', 'level_locked', { level: lesson.sourceLevel });
    }
    if (!progress.isCompleted(lesson.id)) throw new PracticeError('Finish the lesson first', 'not_completed');
    return lesson;
  }

  function rowToExercise(row: PoolRow): Exercise {
    return { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content: JSON.parse(row.content) as ExerciseContent };
  }

  async function generateMissing(
    lesson: NonNullable<ReturnType<typeof curriculum.getLesson>>,
    need: number
  ): Promise<{ exercises: GeneratedExercise[]; failure: GenerationFailure | null }> {
    const authored = curriculum.getExercises(lesson.id, lesson.track);
    const allowed = allowedPracticeTypes(
      lesson.skill,
      authored.map((e) => e.type)
    );
    const reply = await generate(
      buildPracticeGenerationPrompt(
        {
          title: lesson.title,
          level: lesson.sourceLevel,
          skill: lesson.skill,
          explanation: lesson.explanation,
          examples: lesson.examples,
          authoredExercises: authored.map((e) => ({ type: e.type, content: e.content })),
        },
        allowed,
        need
      )
    );
    if (!reply.ok) return { exercises: [], failure: { message: reply.error, code: reply.code, params: reply.params } };
    const parsed = parseGeneratedExercises(reply.text, allowed, lesson.skill);
    if (!parsed) return { exercises: [], failure: { message: 'The AI replied in an unexpected format', code: 'ai_bad_reply' } };

    const pool = db.prepare('SELECT type, content FROM practice_exercises WHERE lesson_id = ?').all(lesson.id) as {
      type: ExerciseType;
      content: string;
    }[];
    const known = new Set([
      ...authored.map((e) => contentKey(e.type, e.content)),
      ...pool.map((row) => contentKey(row.type, JSON.parse(row.content))),
    ]);
    const fresh: GeneratedExercise[] = [];
    for (const exercise of parsed) {
      const key = contentKey(exercise.type, exercise.content);
      if (known.has(key)) continue;
      known.add(key);
      fresh.push(exercise);
      if (fresh.length === need) break;
    }
    return {
      exercises: fresh,
      failure: fresh.length === 0 ? { message: 'The AI replied with no usable exercises', code: 'ai_bad_reply' } : null,
    };
  }

  // Spec: Student Flow, "Starting a batch". Unseen pool exercises first; the AI fills the rest.
  async function serveBatch(lessonId: string): Promise<PracticeBatch> {
    const lesson = getPracticeLesson(lessonId);
    const unseen = db
      .prepare(
        `SELECT p.id, p.lesson_id, p.type, p.content FROM practice_exercises p
         WHERE p.lesson_id = ? AND p.review_status != 'rejected'
           AND NOT EXISTS (SELECT 1 FROM practice_seen s WHERE s.practice_exercise_id = p.id)
         ORDER BY p.created_at, p.rowid
         LIMIT ?`
      )
      .all(lesson.id, PRACTICE_BATCH_SIZE) as PoolRow[];

    const need = PRACTICE_BATCH_SIZE - unseen.length;
    const generated = need > 0 ? await generateMissing(lesson, need) : { exercises: [], failure: null };
    if (unseen.length === 0 && generated.exercises.length === 0) {
      const failure = generated.failure ?? { message: 'No practice exercises could be prepared', code: 'ai_failed' as const };
      throw new PracticeError(failure.message, 'ai_failed', failure.code, failure.params);
    }

    const at = now().toISOString();
    const insert = db.prepare(
      `INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at) VALUES (?, ?, ?, ?, 'unreviewed', ?)`
    );
    const markSeen = db.prepare('INSERT OR IGNORE INTO practice_seen (practice_exercise_id, served_at) VALUES (?, ?)');
    const served = db.transaction((): PoolRow[] => {
      const rows = [...unseen];
      for (const exercise of generated.exercises) {
        const id = `${lesson.id}__px-${randomSuffix()}`;
        const content = JSON.stringify(exercise.content);
        insert.run(id, lesson.id, exercise.type, content, at);
        rows.push({ id, lesson_id: lesson.id, type: exercise.type, content });
      }
      for (const row of rows) markSeen.run(row.id, at);
      return rows;
    })();
    return { exercises: served.map((row) => toExerciseView(rowToExercise(row))) };
  }

  // Spec: Student Flow, "Answering". Graded like a lesson answer; nothing is written.
  async function gradeAnswer(practiceExerciseId: string, answer: LessonAnswer): Promise<PracticeGradeOutcome> {
    const row = db
      .prepare('SELECT id, lesson_id, type, content FROM practice_exercises WHERE id = ?')
      .get(practiceExerciseId) as PoolRow | undefined;
    if (!row) throw new PracticeError(`Practice exercise not found: ${practiceExerciseId}`, 'not_found');
    const lesson = getPracticeLesson(row.lesson_id);
    const exercise = rowToExercise(row);
    const graded = await gradeExerciseAnswer(exercise, answer, lesson.sourceLevel, {
      gradeFreeText: gradeFree,
      uiLanguage: profiles.getProfile().uiLanguage,
    });
    if (!graded.ok) {
      if (graded.reason === 'bad_request') throw new PracticeError(graded.message, 'bad_request');
      throw new PracticeError(graded.message, 'ai_failed', graded.code, graded.params);
    }
    return { result: graded.result, correctAnswer: correctAnswerFor(exercise) };
  }

  return { serveBatch, gradeAnswer };
}

export type PracticeService = ReturnType<typeof createPracticeService>;
