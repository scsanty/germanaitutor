import { describe, it, expect } from 'vitest';
import { validateExerciseContent } from './exerciseContentValidation';

describe('validateExerciseContent', () => {
  it('accepts valid content of every type', () => {
    expect(validateExerciseContent('multiple_choice', { question: 'Q?', options: ['a', 'b'], correctIndex: 1 })).toEqual([]);
    expect(validateExerciseContent('fill_blank', { textWithBlank: 'Ich ___ Anna.', correctAnswer: 'heiße' })).toEqual([]);
    expect(
      validateExerciseContent('fill_blank', { textWithBlank: 'a ___', correctAnswer: 'b', acceptableVariants: ['c'] })
    ).toEqual([]);
    expect(validateExerciseContent('flashcard', { front: 'der Hund', back: 'the dog' })).toEqual([]);
    expect(validateExerciseContent('free_text', { prompt: 'Write.', modelAnswer: 'Ich schreibe.' })).toEqual([]);
  });

  it('rejects an unknown type and non-object content', () => {
    expect(validateExerciseContent('essay', {})).toEqual(['unknown exercise type "essay"']);
    expect(validateExerciseContent('flashcard', 'text')).toEqual(['content must be an object']);
  });

  it('reports multiple-choice problems', () => {
    expect(validateExerciseContent('multiple_choice', { question: '', options: ['a'], correctIndex: 0 })).toEqual([
      'question must be a non-empty string',
      'options must be at least 2 non-empty strings',
    ]);
    expect(validateExerciseContent('multiple_choice', { question: 'Q', options: ['a', 'b'], correctIndex: 2 })).toEqual([
      'correctIndex must point at one of the options',
    ]);
  });

  it('reports fill-blank problems', () => {
    expect(validateExerciseContent('fill_blank', { textWithBlank: 'no blank', correctAnswer: '' })).toEqual([
      'textWithBlank must be a non-empty string containing ___',
      'correctAnswer must be a non-empty string',
    ]);
    expect(
      validateExerciseContent('fill_blank', { textWithBlank: 'a ___', correctAnswer: 'b', acceptableVariants: [''] })
    ).toEqual(['acceptableVariants must be a list of non-empty strings']);
  });

  it('reports flashcard and free-text problems', () => {
    expect(validateExerciseContent('flashcard', { front: 'x' })).toEqual(['back must be a non-empty string']);
    expect(validateExerciseContent('free_text', { modelAnswer: 'x' })).toEqual(['prompt must be a non-empty string']);
  });
});
