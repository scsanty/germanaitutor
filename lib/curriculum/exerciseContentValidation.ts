import type { ExerciseType } from './types';

const EXERCISE_TYPES: readonly ExerciseType[] = ['multiple_choice', 'fill_blank', 'flashcard', 'free_text'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasInstruction(c: Record<string, unknown>): boolean {
  return c.instruction !== undefined;
}

// Spec: an instruction has both languages or neither; flashcards never have one.
export function instructionProblems(type: unknown, content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const instruction = (content as Record<string, unknown>).instruction;
  if (instruction === undefined) return [];
  if (type === 'flashcard') return ['flashcards have no instruction'];
  const i = instruction as Record<string, unknown> | null;
  if (!i || typeof i !== 'object' || !isNonEmptyString(i.en) || !isNonEmptyString(i.de)) {
    return ['instruction needs both English and German'];
  }
  return [];
}

export function validateExerciseContent(type: unknown, content: unknown): string[] {
  if (!EXERCISE_TYPES.includes(type as ExerciseType)) return [`unknown exercise type "${String(type)}"`];
  if (!content || typeof content !== 'object' || Array.isArray(content)) return ['content must be an object'];
  const c = content as Record<string, unknown>;
  const errors: string[] = [];

  switch (type as ExerciseType) {
    case 'multiple_choice': {
      if (hasInstruction(c) ? typeof c.question !== 'string' : !isNonEmptyString(c.question)) {
        errors.push('question must be a non-empty string');
      }
      if (!Array.isArray(c.options) || c.options.length < 2 || !c.options.every(isNonEmptyString)) {
        errors.push('options must be at least 2 non-empty strings');
      } else if (
        typeof c.correctIndex !== 'number' ||
        !Number.isInteger(c.correctIndex) ||
        c.correctIndex < 0 ||
        c.correctIndex >= c.options.length
      ) {
        errors.push('correctIndex must point at one of the options');
      }
      break;
    }
    case 'fill_blank': {
      if (!isNonEmptyString(c.textWithBlank) || !c.textWithBlank.includes('___')) {
        errors.push('textWithBlank must be a non-empty string containing ___');
      }
      if (!isNonEmptyString(c.correctAnswer)) errors.push('correctAnswer must be a non-empty string');
      if (
        c.acceptableVariants !== undefined &&
        (!Array.isArray(c.acceptableVariants) || !c.acceptableVariants.every(isNonEmptyString))
      ) {
        errors.push('acceptableVariants must be a list of non-empty strings');
      }
      break;
    }
    case 'flashcard': {
      if (!isNonEmptyString(c.front)) errors.push('front must be a non-empty string');
      if (!isNonEmptyString(c.back)) errors.push('back must be a non-empty string');
      break;
    }
    case 'free_text': {
      if (hasInstruction(c) ? typeof c.prompt !== 'string' : !isNonEmptyString(c.prompt)) {
        errors.push('prompt must be a non-empty string');
      }
      if (!isNonEmptyString(c.modelAnswer)) errors.push('modelAnswer must be a non-empty string');
      break;
    }
  }
  errors.push(...instructionProblems(type, content));
  return errors;
}
