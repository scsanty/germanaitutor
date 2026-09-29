import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';
import type { GradeResult } from './grading';

export type FlashcardRating = 'knew' | 'sort_of' | 'didnt_know';
export type AttemptSource = 'lesson' | 'queue';

export type LessonAnswer =
  | { type: 'multiple_choice'; selectedIndex: number }
  | { type: 'fill_blank'; text: string }
  | { type: 'flashcard'; rating: FlashcardRating }
  | { type: 'free_text'; text: string };

// What the student gets back after answering an exercise.
export interface AttemptOutcome {
  result: GradeResult;
  correctAnswer: string | null;
  feedback: string | null;
  passedExerciseIds: string[];
  lessonCompleted: boolean;
  justCompleted: boolean;
}

const FLASHCARD_RATINGS: readonly FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

// Spec: Grades — "Knew it" / "Sort of" / "Didn't know it".
export const FLASHCARD_GRADES: Record<FlashcardRating, GradeResult> = {
  knew: 'correct',
  sort_of: 'almost',
  didnt_know: 'wrong',
};

export function parseLessonAnswer(raw: unknown): LessonAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'multiple_choice' && typeof a.selectedIndex === 'number' && Number.isInteger(a.selectedIndex)) {
    return { type: 'multiple_choice', selectedIndex: a.selectedIndex };
  }
  if (a.type === 'fill_blank' && typeof a.text === 'string') return { type: 'fill_blank', text: a.text };
  if (a.type === 'flashcard' && typeof a.rating === 'string' && (FLASHCARD_RATINGS as readonly string[]).includes(a.rating)) {
    return { type: 'flashcard', rating: a.rating as FlashcardRating };
  }
  if (a.type === 'free_text' && typeof a.text === 'string') return { type: 'free_text', text: a.text };
  return null;
}

export function isAttemptSource(value: unknown): value is AttemptSource {
  return value === 'lesson' || value === 'queue';
}

// Shown after answering: the right option or text, or the model answer for free text.
export function correctAnswerFor(exercise: Exercise): string | null {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return content.options[content.correctIndex] ?? null;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).correctAnswer;
    case 'free_text':
      return (exercise.content as FreeTextContent).modelAnswer;
    case 'flashcard':
      return null;
  }
}

// The student's answer as text, for the attempt log and the lesson chat's context.
export function answerTextFor(exercise: Exercise, answer: LessonAnswer): string {
  switch (answer.type) {
    case 'multiple_choice':
      return (exercise.content as MultipleChoiceContent).options[answer.selectedIndex] ?? '';
    case 'fill_blank':
    case 'free_text':
      return answer.text;
    case 'flashcard':
      return answer.rating;
  }
}

// The task as text, for the lesson chat's context.
export function taskTextFor(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return `${content.question} (options: ${content.options.join(' | ')})`;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).textWithBlank;
    case 'flashcard':
      return (exercise.content as FlashcardContent).front;
    case 'free_text':
      return (exercise.content as FreeTextContent).prompt;
  }
}
