import type { LocalizedText } from '../i18n/localizedText';
import type { TaskView } from '../tasks/taskTypes';
import type { AudioReveal } from '../tasks/audioQuestions';
import type { LetterGrade } from '../writing/letterGrading';
import type { SpokenGrade } from '../speaking/spokenGrading';
import type { SpokenPartContent } from '../tasks/spoken';
import type { ExamFormat, ExamPart } from './formats';

// One line of a spoken Teil conversation. `audio` is false when the voice couldn't be rendered (the text stays).
export interface SpokenTurnView {
  speaker: 'student' | 'partner' | 'examiner';
  text: string;
  clipId: string;
  audio: boolean;
}

// Where a spoken conversation stands: the student's turn, or closed by the examiner (the client then finishes).
export type SpokenState = 'student' | 'closing';

export interface SpokenRunView {
  set: SpokenPartContent;
  turns: SpokenTurnView[];
  state: SpokenState;
}

// One timed Teil attempt as the runner sees it: the set's view never carries the answers.
export interface PracticeRun {
  attemptId: number;
  formatId: string;
  part: ExamPart;
  set: { id: string; view: TaskView };
  minutes: number;
  startedAt: string;
  mockId: string | null;
  // Spoken parts (S18): the task sheet and the conversation so far (the examiner's intro).
  spoken?: SpokenRunView;
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
  // Speaking (B2): the full grade and the conversation come only with the finish response. A stored result
  // replays the grade with no marks and no turns: the conversation has been deleted.
  spoken?: { grade: SpokenGrade; turns: SpokenTurnView[] };
}

export interface PracticeOverview {
  format: ExamFormat | null;
  // runnable: practisable as a single Teil. mockOnly (S10): has a runner but is practised only in the full mock.
  // Listening (S10): with the speech service down, a listening part is runnable only with a usable set
  // whose audio is cached; `mockRunnable` says whether the full mock can start.
  // audioUnavailable: a listening part that would run but can't be heard right now.
  // speechUnavailable (S17): a spoken part that would run but needs the speech service, which is down.
  parts: { part: ExamPart; runnable: boolean; mockOnly: boolean; audioUnavailable: boolean; speechUnavailable: boolean; lastPercent: number | null }[];
  mockRunnable: boolean;
  // NEEDS_USER5: letters and spoken parts are graded by the AI, so the overview warns when none is set up.
  aiReady: boolean;
}

// The written block of a mock. `oral` (B4) is the oral block's parts with a runner, started separately later
// (null when the format has none); `runnable` says whether the speech service is up for it.
export interface MockRun {
  mockId: string;
  runs: PracticeRun[];
  minutes: number;
  oral: { partIds: string[]; runnable: boolean } | null;
}

// The oral block of a mock, started after the written block (B4).
export interface OralMockRun {
  mockId: string;
  runs: PracticeRun[];
}

export interface ReadinessView {
  formatId: string;
  formatName: string;
  parts: { partId: string; title: LocalizedText; averagePercent: number | null; attempts: number; overtime: boolean }[];
}
