import type { LocalizedText } from '../i18n/localizedText';
import type { TaskView } from '../tasks/taskTypes';
import type { ExamFormat, ExamPart } from './formats';

// One timed Teil attempt as the runner sees it: the set's view never carries the answers.
export interface PracticeRun {
  attemptId: number;
  formatId: string;
  part: ExamPart;
  set: { id: string; view: TaskView };
  minutes: number;
  startedAt: string;
  mockId: string | null;
}

export interface ItemReview {
  index: number;
  answerText: string;
  right: boolean;
  correct: string;
  explanation: LocalizedText;
}

export interface PracticeResult {
  attemptId: number;
  score: number;
  maxScore: number;
  overtimeSeconds: number;
  review: ItemReview[];
}

export interface PracticeOverview {
  format: ExamFormat | null;
  // runnable: practisable as a single Teil. mockOnly (S10): has a runner but is practised only in the full mock.
  parts: { part: ExamPart; runnable: boolean; mockOnly: boolean; lastPercent: number | null }[];
}

export interface MockRun {
  mockId: string;
  runs: PracticeRun[];
  minutes: number;
}

export interface ReadinessView {
  formatId: string;
  formatName: string;
  parts: { partId: string; title: LocalizedText; averagePercent: number | null; attempts: number; overtime: boolean }[];
}
