import { describe, it, expect } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { answerTextFor, correctAnswerFor, isAttemptSource, parseLessonAnswer, taskTextFor } from './lessonAnswers';

const mc: Exercise = { id: 'mc', lessonId: 'l', track: null, type: 'multiple_choice', content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } };
const fill: Exercise = { id: 'fb', lessonId: 'l', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin' } };
const card: Exercise = { id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
const free: Exercise = { id: 'ft', lessonId: 'l', track: null, type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };

describe('parseLessonAnswer', () => {
  it.each([
    [{ type: 'multiple_choice', selectedIndex: 1 }, { type: 'multiple_choice', selectedIndex: 1 }],
    [{ type: 'fill_blank', text: 'bin' }, { type: 'fill_blank', text: 'bin' }],
    [{ type: 'flashcard', rating: 'sort_of' }, { type: 'flashcard', rating: 'sort_of' }],
    [{ type: 'free_text', text: 'Ich schreibe.' }, { type: 'free_text', text: 'Ich schreibe.' }],
    [{ type: 'multiple_choice', selectedIndex: 1.5 }, null],
    [{ type: 'flashcard', rating: 'maybe' }, null],
    [{ type: 'fill_blank' }, null],
    ['bin', null],
    [null, null],
  ])('%j → %j', (raw, expected) => {
    expect(parseLessonAnswer(raw)).toEqual(expected);
  });
});

describe('isAttemptSource', () => {
  it('accepts lesson and queue only', () => {
    expect([isAttemptSource('lesson'), isAttemptSource('queue'), isAttemptSource('freestyle')]).toEqual([true, true, false]);
  });
});

describe('answer helpers', () => {
  it('names the correct answer, or the model answer for free text', () => {
    expect([correctAnswerFor(mc), correctAnswerFor(fill), correctAnswerFor(card), correctAnswerFor(free)]).toEqual([
      'Hallo',
      'bin',
      null,
      'Ich schreibe.',
    ]);
  });

  it('turns an answer into text for the log and the chat', () => {
    expect(answerTextFor(mc, { type: 'multiple_choice', selectedIndex: 1 })).toBe('Nein');
    expect(answerTextFor(fill, { type: 'fill_blank', text: 'bin' })).toBe('bin');
    expect(answerTextFor(card, { type: 'flashcard', rating: 'knew' })).toBe('knew');
    expect(answerTextFor(free, { type: 'free_text', text: 'Ich schreib.' })).toBe('Ich schreib.');
  });

  it('describes the task', () => {
    expect([taskTextFor(mc), taskTextFor(fill), taskTextFor(card), taskTextFor(free)]).toEqual([
      'Hi? (options: Hallo | Nein)',
      'Ich ___.',
      'der Hund',
      'Write.',
    ]);
  });
});
