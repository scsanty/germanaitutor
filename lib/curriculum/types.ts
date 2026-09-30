import type { Track, CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';

export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking';
export type ExerciseType = 'multiple_choice' | 'fill_blank' | 'flashcard' | 'free_text';

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

export type ExerciseContent = MultipleChoiceContent | FillBlankContent | FlashcardContent | FreeTextContent;

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
