import type { Track, CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';
import type { PassageQuestionsContent } from '../tasks/passageQuestions';
import type { MatchingContent } from '../tasks/matching';
import type { ClozeContent } from '../tasks/cloze';
import type { AudioQuestionsContent } from '../tasks/audioQuestions';
import type { LetterContent } from '../tasks/letter';

export type { PassageQuestionsContent, MatchingContent, ClozeContent, AudioQuestionsContent, LetterContent };

export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking';
export type ExerciseType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'flashcard'
  | 'free_text'
  // Reading module: the set task types (lib/tasks)
  | 'passage_questions'
  | 'matching'
  | 'cloze'
  // Listening module: questions about a spoken transcript (lib/tasks/audioQuestions)
  | 'audio_questions'
  // Writing module: a letter graded by the AI against a rubric (lib/tasks/letter)
  | 'letter'
  // Speaking module: an answer spoken aloud (or typed), graded from its transcript like free text
  | 'spoken_response';

// S13: these never enter review (the Daily Queue, a test-out's schedule) and are never test-out questions.
export const NEVER_REVIEWED_TYPES = ['letter', 'spoken_response'] as const satisfies readonly ExerciseType[];
// The same list as an SQL value list, for `e.type NOT IN ${NEVER_REVIEWED_SQL}`.
export const NEVER_REVIEWED_SQL = `(${NEVER_REVIEWED_TYPES.map((t) => `'${t}'`).join(', ')})`;

export function isNeverReviewedType(type: string): boolean {
  return (NEVER_REVIEWED_TYPES as readonly string[]).includes(type);
}

export interface Milestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  titleDe: string;
  description: string | null;
  descriptionDe: string | null;
  // 1, 2, 3 … inside its track+level; null only for the admin-only Unsorted bucket
  difficultyRank: number | null;
}

export interface Lesson {
  id: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
  createdAt: string;
}

export interface LessonPlacement {
  id: number;
  lessonId: string;
  milestoneId: string;
  createdAt: string;
}

export interface LessonTrackOverride {
  id: number;
  lessonId: string;
  track: Track;
  explanation: string | null;
  examples: string[] | null;
}

export interface MultipleChoiceContent {
  question: string;
  options: string[];
  correctIndex: number;
  instruction?: LocalizedText;
}

export interface FillBlankContent {
  textWithBlank: string;
  correctAnswer: string;
  acceptableVariants?: string[];
  instruction?: LocalizedText;
}

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface FreeTextContent {
  prompt: string;
  modelAnswer: string;
  instruction?: LocalizedText;
}

// Speaking: a German prompt, a model answer and an optional minimum speaking time.
export interface SpokenResponseContent {
  instruction?: LocalizedText;
  prompt: string;
  modelAnswer: string;
  minSeconds?: number;
}

export type ExerciseContent =
  | MultipleChoiceContent
  | FillBlankContent
  | FlashcardContent
  | FreeTextContent
  | PassageQuestionsContent
  | MatchingContent
  | ClozeContent
  | AudioQuestionsContent
  | LetterContent
  | SpokenResponseContent;

export interface Exercise {
  id: string;
  lessonId: string;
  track: Track | null;
  type: ExerciseType;
  content: ExerciseContent;
}

export interface LessonPrerequisite {
  lessonId: string;
  prerequisiteLessonId: string;
}

export interface LessonConceptLink {
  lessonAId: string;
  lessonBId: string;
  createdAt: string;
}
