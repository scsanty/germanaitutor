import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { CefrLevel, Profile } from '../types';
import { gradeFillBlank, gradeMultipleChoice } from '../tutoring/grading';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { higherLevel } from '../tutoring/levels';
import { validatePlacementExam, type PlacementQuestion } from '../tutoring/placementExamFormat';
import { maxScore, placedLevel, pointsFor, stopReasonAfterAnswer, type PlacementStopReason } from '../tutoring/placementScoring';
import type {
  PlacementAnswer,
  PlacementAnswerRecord,
  PlacementBestResult,
  PlacementOutcome,
  PlacementQuestionView,
  PlacementState,
} from '../tutoring/placementTypes';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

export type PlacementErrorKind = 'no_exam' | 'no_session' | 'bad_request' | 'grading_failed';

const DEFAULT_CODE: Record<PlacementErrorKind, ErrorCode> = {
  no_exam: 'no_exam',
  no_session: 'no_session',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

export class PlacementError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: PlacementErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toPlacementErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PlacementError)) return null;
  const status = err.kind === 'bad_request' ? 400 : err.kind === 'grading_failed' ? 502 : 409;
  return { status, body: errorBody(err.message, err.code, err.params) };
}

export interface PlacementDeps {
  gradeFreeText: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
}

interface QuestionRow {
  id: string;
  position: number;
  level: CefrLevel;
  type: PlacementQuestion['type'];
  content: string;
}

interface SessionRow {
  next_position: number;
  score: number;
  mistakes: number;
  answers: string;
}

interface BestRow {
  score: number;
  max_score: number;
  placed_level: CefrLevel;
  stop_reason: PlacementStopReason;
  taken_at: string;
}

function toView(question: PlacementQuestion, position: number, total: number): PlacementQuestionView {
  const base = { id: question.id, position, total, level: question.level };
  switch (question.type) {
    case 'multiple_choice':
      return { ...base, type: 'multiple_choice', question: question.content.question, options: question.content.options };
    case 'fill_blank':
      return { ...base, type: 'fill_blank', textWithBlank: question.content.textWithBlank };
    case 'free_text':
      return { ...base, type: 'free_text', prompt: question.content.prompt };
  }
}

export function createPlacementService(db: Database.Database, deps?: PlacementDeps) {
  const gradeFree = deps?.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const profiles = createProfileService(db);
  const unlocks = createUnlockService(db);

  function getExam(): PlacementQuestion[] {
    const rows = db.prepare('SELECT * FROM placement_questions ORDER BY position').all() as QuestionRow[];
    return rows.map((r) => ({ id: r.id, level: r.level, type: r.type, content: JSON.parse(r.content) }) as PlacementQuestion);
  }

  function questionCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM placement_questions').get() as { n: number }).n;
  }

  // An attempt in progress refers to the old questions, so it goes too.
  function replaceExam(questions: PlacementQuestion[]): void {
    db.transaction(() => {
      db.prepare('DELETE FROM placement_session').run();
      db.prepare('DELETE FROM placement_questions').run();
      const insert = db.prepare('INSERT INTO placement_questions (id, position, level, type, content) VALUES (?, ?, ?, ?, ?)');
      questions.forEach((q, i) => insert.run(q.id, i + 1, q.level, q.type, JSON.stringify(q.content)));
    })();
  }

  function loadSeedExamIfEmpty(filePath: string): void {
    if (questionCount() > 0 || !existsSync(filePath)) return;
    const parsed = validatePlacementExam(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!parsed.ok) throw new Error(`Bundled placement exam is invalid: ${parsed.errors.join('; ')}`);
    replaceExam(parsed.questions);
  }

  function getSession(): SessionRow {
    const row = db.prepare('SELECT * FROM placement_session WHERE id = 1').get() as SessionRow | undefined;
    if (!row) throw new PlacementError('No placement test is in progress', 'no_session');
    return row;
  }

  function start(): PlacementState {
    const exam = getExam();
    if (exam.length === 0) throw new PlacementError('No placement exam is loaded', 'no_exam');
    db.prepare(
      `INSERT INTO placement_session (id, started_at, next_position, score, mistakes, answers)
       VALUES (1, datetime('now'), 1, 0, 0, '[]')
       ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at, next_position = 1, score = 0, mistakes = 0, answers = '[]'`
    ).run();
    return { status: 'in_progress', question: toView(exam[0], 1, exam.length) };
  }

  async function gradeAnswer(question: PlacementQuestion, answer: PlacementAnswer): Promise<PlacementAnswerRecord> {
    const base = { questionId: question.id, level: question.level, type: question.type };
    if (question.type === 'multiple_choice' && answer.type === 'multiple_choice') {
      const { content } = question;
      return {
        ...base,
        question: content.question,
        given: content.options[answer.selectedIndex] ?? '',
        correctAnswer: content.options[content.correctIndex],
        result: gradeMultipleChoice(content, answer.selectedIndex),
        feedback: null,
      };
    }
    if (question.type === 'fill_blank' && answer.type === 'fill_blank') {
      const { content } = question;
      return {
        ...base,
        question: content.textWithBlank,
        given: answer.text,
        correctAnswer: content.correctAnswer,
        result: gradeFillBlank(content, answer.text),
        feedback: null,
      };
    }
    if (question.type === 'free_text' && answer.type === 'free_text') {
      const { content } = question;
      const graded = await gradeFree({
        prompt: content.prompt,
        modelAnswer: content.modelAnswer,
        studentAnswer: answer.text,
        level: question.level,
        uiLanguage: profiles.getProfile().uiLanguage,
      });
      if (!graded.ok) throw new PlacementError(graded.error, 'grading_failed', graded.code, graded.params);
      return {
        ...base,
        question: content.prompt,
        given: answer.text,
        correctAnswer: content.modelAnswer,
        result: graded.result,
        feedback: graded.feedback,
      };
    }
    throw new PlacementError('The answer does not match the question type', 'bad_request');
  }

  async function answer(questionId: string, given: PlacementAnswer): Promise<PlacementState> {
    const exam = getExam();
    const session = getSession();
    const question = exam[session.next_position - 1];
    if (!question || question.id !== questionId) {
      throw new PlacementError('That question is not the current one', 'bad_request');
    }
    const record = await gradeAnswer(question, given);

    // Re-read after the await: a double submit may already have moved the test on.
    const current = getSession();
    if (current.next_position !== session.next_position) {
      throw new PlacementError('That question is not the current one', 'bad_request');
    }
    const answered = current.next_position;
    const score = current.score + pointsFor(question.level, record.result);
    const mistakes = current.mistakes + (record.result === 'wrong' ? 1 : 0);
    const records = [...(JSON.parse(current.answers) as PlacementAnswerRecord[]), record];
    db.prepare('UPDATE placement_session SET next_position = ?, score = ?, mistakes = ?, answers = ? WHERE id = 1').run(
      answered + 1,
      score,
      mistakes,
      JSON.stringify(records)
    );

    const stopReason = stopReasonAfterAnswer(mistakes, answered, exam.length);
    if (stopReason) return { status: 'finished', outcome: finish(stopReason) };
    return { status: 'in_progress', question: toView(exam[answered], answered + 1, exam.length) };
  }

  function stop(): PlacementState {
    getSession();
    return { status: 'finished', outcome: finish('beyond_my_knowledge') };
  }

  function finish(stopReason: PlacementStopReason): PlacementOutcome {
    return db.transaction((): PlacementOutcome => {
      const exam = getExam();
      const session = getSession();
      const placed = placedLevel(session.score, exam);
      const max = maxScore(exam);
      const best = getBestResult();
      const isNewBest = best === null || session.score > best.score;
      if (isNewBest) {
        db.prepare(
          `INSERT INTO placement_best_result (id, score, max_score, placed_level, stop_reason, taken_at)
           VALUES (1, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET score = excluded.score, max_score = excluded.max_score,
             placed_level = excluded.placed_level, stop_reason = excluded.stop_reason, taken_at = excluded.taken_at`
        ).run(session.score, max, placed, stopReason);
      }

      const profile = profiles.getProfile();
      let unlockOffer: CefrLevel | null = null;
      if (profile.placementStatus !== 'taken') {
        // First placement: the active level is the placed level (Ruling M-4), but the
        // highest unlocked level never lowers one already open (e.g. from finished lessons).
        // Any notice left over from before is for a level at or below this new highest level,
        // so it is always obsolete here.
        const highest = higherLevel(profile.highestUnlockedLevel, placed);
        profiles.writeLevelState({
          highestUnlockedLevel: highest,
          activeLevel: placed,
          placementStatus: 'taken',
          unlockNoticeLevel: null,
        });
      } else {
        // Retake: unlocks only go up. A higher placement is offered on the end screen too.
        const raised = unlocks.raiseUnlockedLevel(placed, { notify: true });
        if (raised.highestUnlockedLevel !== profile.highestUnlockedLevel) unlockOffer = placed;
      }

      db.prepare('DELETE FROM placement_session').run();
      return {
        score: session.score,
        maxScore: max,
        placedLevel: placed,
        stopReason,
        answers: JSON.parse(session.answers) as PlacementAnswerRecord[],
        isNewBest,
        unlockOffer,
      };
    })();
  }

  function skip(): Profile {
    const profile = profiles.getProfile();
    if (profile.placementStatus !== 'pending') return profile;
    return profiles.writeLevelState({ placementStatus: 'skipped' });
  }

  function getBestResult(): PlacementBestResult | null {
    const row = db.prepare('SELECT * FROM placement_best_result WHERE id = 1').get() as BestRow | undefined;
    if (!row) return null;
    return {
      score: row.score,
      maxScore: row.max_score,
      placedLevel: row.placed_level,
      stopReason: row.stop_reason,
      takenAt: row.taken_at,
    };
  }

  return { getExam, replaceExam, loadSeedExamIfEmpty, questionCount, start, answer, stop, skip, getBestResult };
}

export type PlacementService = ReturnType<typeof createPlacementService>;
