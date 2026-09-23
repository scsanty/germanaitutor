import type { Track, CefrLevel } from '../types';

export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking';
export type ExerciseType = 'multiple_choice' | 'fill_blank' | 'flashcard' | 'free_text';

export interface Milestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  orderIndex: number;
}

export interface Section {
  id: string;
  milestoneId: string;
  title: string;
  description: string | null;
  orderIndex: number;
}

export interface Lesson {
  id: string;
  track: Track;
  /**
   * Shared across every lesson (in any track) that covers the same underlying
   * concept, per curricula/overlap-review.md MERGE decisions. Null means this
   * lesson has no cross-track equivalent — completing it doesn't mark
   * anything else complete. Lessons with the same non-null conceptId are
   * otherwise fully independent rows (own explanation/examples/exercises);
   * nothing about their content is merged, only completion status.
   */
  conceptId: string | null;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  createdAt: string;
}

export interface LessonPlacement {
  id: number;
  lessonId: string;
  sectionId: string;
  orderIndex: number;
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
}

export interface FillBlankContent {
  textWithBlank: string;
  correctAnswer: string;
  acceptableVariants?: string[];
}

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface FreeTextContent {
  prompt: string;
  modelAnswer: string;
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
