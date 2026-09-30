import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';
import type { LocalizedText } from '../i18n/localizedText';

// What the student sees of an exercise before answering: never the answer. A flashcard keeps
// its back, since the student reveals it and grades themselves.
export type ExerciseView =
  | { id: string; type: 'multiple_choice'; question: string; options: string[]; instruction?: LocalizedText }
  | { id: string; type: 'fill_blank'; textWithBlank: string; instruction?: LocalizedText }
  | { id: string; type: 'flashcard'; front: string; back: string }
  | { id: string; type: 'free_text'; prompt: string; instruction?: LocalizedText };

function instructionOf(content: { instruction?: LocalizedText }): { instruction?: LocalizedText } {
  return content.instruction ? { instruction: content.instruction } : {};
}

export function toExerciseView(exercise: Exercise): ExerciseView {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return {
        id: exercise.id,
        type: 'multiple_choice',
        question: content.question,
        options: content.options,
        ...instructionOf(content),
      };
    }
    case 'fill_blank': {
      const content = exercise.content as FillBlankContent;
      return { id: exercise.id, type: 'fill_blank', textWithBlank: content.textWithBlank, ...instructionOf(content) };
    }
    case 'flashcard': {
      const content = exercise.content as FlashcardContent;
      return { id: exercise.id, type: 'flashcard', front: content.front, back: content.back };
    }
    case 'free_text': {
      const content = exercise.content as FreeTextContent;
      return { id: exercise.id, type: 'free_text', prompt: content.prompt, ...instructionOf(content) };
    }
  }
}
