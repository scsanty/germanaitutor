import { describe, it, expect } from 'vitest';
import { allowedPracticeTypes, PRACTICE_BATCH_SIZE } from './practiceTypes';

describe('allowedPracticeTypes', () => {
  it('mirrors the lesson\'s authored types, in a fixed order', () => {
    expect(allowedPracticeTypes('grammar', ['free_text', 'multiple_choice', 'multiple_choice'])).toEqual(['multiple_choice', 'free_text']);
    expect(allowedPracticeTypes('vocabulary', ['flashcard', 'multiple_choice'])).toEqual(['multiple_choice', 'flashcard']);
  });

  it('never allows flashcards outside a vocabulary lesson', () => {
    expect(allowedPracticeTypes('grammar', ['flashcard', 'fill_blank'])).toEqual(['fill_blank']);
  });

  it('falls back to multiple choice and fill-in-the-blank (plus flashcards for vocabulary) when nothing usable is authored', () => {
    expect(allowedPracticeTypes('reading', [])).toEqual(['multiple_choice', 'fill_blank']);
    expect(allowedPracticeTypes('vocabulary', [])).toEqual(['multiple_choice', 'fill_blank', 'flashcard']);
    // Review Focus 4: a non-vocabulary lesson whose only authored exercises are flashcards.
    expect(allowedPracticeTypes('grammar', ['flashcard', 'flashcard'])).toEqual(['multiple_choice', 'fill_blank']);
  });

  it('serves batches of 5', () => {
    expect(PRACTICE_BATCH_SIZE).toBe(5);
  });
});
