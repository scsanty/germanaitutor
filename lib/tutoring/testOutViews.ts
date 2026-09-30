import type { ExerciseView } from './exerciseView';
import type { GradeResult } from './grading';

export type TestOutStatus =
  | { status: 'none' }
  | { status: 'available' }
  | { status: 'in_progress'; answered: number; total: number }
  | { status: 'cooldown'; retryAt: string }
  | { status: 'too_few_questions' };

export interface TestOutReviewItem {
  exercise: ExerciseView;
  answerText: string;
  result: GradeResult;
  correctAnswer: string | null;
}

export interface TestOutResult {
  passed: boolean;
  score: number;
  maxScore: number;
  review: TestOutReviewItem[];
}

export interface TestOutState {
  milestone: { id: string; title: string };
  status: TestOutStatus;
  lastResult: TestOutResult | null;
}

export interface TestOutRun {
  attemptId: number;
  questions: ExerciseView[];
  answered: number;
}

export type TestOutAnswerOutcome =
  | { finished: false; answered: number; total: number }
  | { finished: true; result: TestOutResult };
