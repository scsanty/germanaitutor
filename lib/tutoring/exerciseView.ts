import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';

// What the student sees of an exercise before answering: never the answer. A flashcard keeps
// its back, since the student reveals it and grades themselves.
export type ExerciseView =
  | { id: string; type: 'multiple_choice'; question: string; options: string[] }
  | { id: string; type: 'fill_blank'; textWithBlank: string }
  | { id: string; type: 'flashcard'; front: string; back: string }
  | { id: string; type: 'free_text'; prompt: string };

export function toExerciseView(exercise: Exercise): ExerciseView {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return { id: exercise.id, type: 'multiple_choice', question: content.question, options: content.options };
    }
    case 'fill_blank': {
      const content = exercise.content as FillBlankContent;
      return { id: exercise.id, type: 'fill_blank', textWithBlank: content.textWithBlank };
    }
    case 'flashcard': {
      const content = exercise.content as FlashcardContent;
      return { id: exercise.id, type: 'flashcard', front: content.front, back: content.back };
    }
    case 'free_text': {
      const content = exercise.content as FreeTextContent;
      return { id: exercise.id, type: 'free_text', prompt: content.prompt };
    }
  }
}
