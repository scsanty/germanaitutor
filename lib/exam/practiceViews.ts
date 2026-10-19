import type { LocalizedText } from '../i18n/localizedText';
import type { TaskView } from '../tasks/taskTypes';
import type { AudioReveal } from '../tasks/audioQuestions';
import type { LetterGrade } from '../writing/letterGrading';
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
  // Listening parts: the transcript and per-item evidence, after submit only.
  reveal?: AudioReveal;
  // Writing (S17): a letter has no item review; it carries its grade, the text and the chosen task,
  // and the set's tips, one per rubric criterion in rubric order (I16).
  letter?: LetterGrade;
  text?: string;
  taskIndex?: number;
  tips?: LocalizedText[];
}

export interface PracticeOverview {
  format: ExamFormat | null;
  // runnable: practisable as a single Teil. mockOnly (S10): has a runner but is practised only in the full mock.
  // Listening (S10): with the speech service down, a listening part is runnable only with a usable set
  // whose audio is cached; `mockRunnable` says whether the full mock can start.
  // audioUnavailable: a listening part that would run but can't be heard right now.
  parts: { part: ExamPart; runnable: boolean; mockOnly: boolean; audioUnavailable: boolean; lastPercent: number | null }[];
  mockRunnable: boolean;
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
