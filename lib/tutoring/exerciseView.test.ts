import { describe, it, expect } from 'vitest';
import { toExerciseView } from './exerciseView';

describe('toExerciseView', () => {
  it('never includes the answer', () => {
    expect(
      toExerciseView({
        id: 'mc',
        lessonId: 'l',
        track: null,
        type: 'multiple_choice',
        content: { question: 'Q?', options: ['a', 'b'], correctIndex: 1 },
      })
    ).toEqual({ id: 'mc', type: 'multiple_choice', question: 'Q?', options: ['a', 'b'] });
    expect(
      toExerciseView({
        id: 'fb',
        lessonId: 'l',
        track: null,
        type: 'fill_blank',
        content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', acceptableVariants: ['bin!'] },
      })
    ).toEqual({ id: 'fb', type: 'fill_blank', textWithBlank: 'Ich ___.' });
    expect(
      toExerciseView({
        id: 'ft',
        lessonId: 'l',
        track: null,
        type: 'free_text',
        content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' },
      })
    ).toEqual({ id: 'ft', type: 'free_text', prompt: 'Write.' });
  });

  it('keeps a flashcard back, since the student reveals it and grades themselves', () => {
    expect(
      toExerciseView({ id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } })
    ).toEqual({ id: 'fc', type: 'flashcard', front: 'der Hund', back: 'the dog' });
  });

  it('carries the instruction in both languages', () => {
    const view = toExerciseView({
      id: 'e',
      lessonId: 'l',
      track: null,
      type: 'free_text',
      content: { prompt: '', modelAnswer: 'Hallo!', instruction: { en: 'Say hello.', de: 'Sag hallo.' } },
    });
    expect(view).toEqual({ id: 'e', type: 'free_text', prompt: '', instruction: { en: 'Say hello.', de: 'Sag hallo.' } });
  });
});
