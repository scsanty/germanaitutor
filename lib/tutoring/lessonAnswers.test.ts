import { describe, it, expect } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { answerTextFor, correctAnswerFor, isAttemptSource, parseLessonAnswer, taskTextFor, taskTextOf } from './lessonAnswers';

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

describe('the reading task types', () => {
  const instruction = { en: 'Read and answer.', de: 'Lesen und antworten.' };
  const pq: Exercise = {
    id: 'pq', lessonId: 'l', track: null, type: 'passage_questions',
    content: { instruction, passage: 'Anna wohnt in Wien.', questions: [{ question: 'Wo wohnt Anna?', options: ['Wien', 'Bern'], correctIndex: 0 }, { question: 'Wer?', options: ['Anna', 'Ben'], correctIndex: 0 }] },
  };
  const mt: Exercise = {
    id: 'mt', lessonId: 'l', track: null, type: 'matching',
    content: { items: ['Ich suche eine Wohnung.', 'Ich will kochen.', 'Ich will tanzen.'], targets: ['Wohnungen', 'Kochkurs'], answers: [0, 1, null], allowNone: true },
  };
  const cz: Exercise = {
    id: 'cz', lessonId: 'l', track: null, type: 'cloze',
    content: { text: 'Ich {{1}} hier, du {{2}} da, er {{3}} weg.', gaps: [{ mode: 'typed', answer: 'bin' }, { mode: 'select', options: ['bist', 'ist'], correctIndex: 0 }, { mode: 'bank', answer: 1 }], bank: ['sind', 'ist'] },
  };

  it.each([
    [{ type: 'passage_questions', selected: [0, null] }, { type: 'passage_questions', selected: [0, null] }],
    [{ type: 'matching', selected: [0, -1, null] }, { type: 'matching', selected: [0, -1, null] }],
    [{ type: 'cloze', values: ['bin', 0, null] }, { type: 'cloze', values: ['bin', 0, null] }],
    [{ type: 'passage_questions', selected: 'a' }, null],
    [{ type: 'matching' }, null],
    [{ type: 'cloze', values: 3 }, null],
  ])('parses %j structurally → %j', (raw, expected) => {
    expect(parseLessonAnswer(raw)).toEqual(expected);
  });

  it('names every correct answer joined with "; "', () => {
    expect(correctAnswerFor(pq)).toBe('Wien; Anna');
    expect(correctAnswerFor(mt)).toBe('Wohnungen; Kochkurs; x');
    expect(correctAnswerFor(cz)).toBe('bin; bist; ist');
  });

  it('summarises the chosen answers, with — for unanswered', () => {
    expect(answerTextFor(pq, { type: 'passage_questions', selected: [1, null] })).toBe('Bern; —');
    expect(answerTextFor(mt, { type: 'matching', selected: [1, -1, null] })).toBe('Kochkurs; —; x');
    expect(answerTextFor(cz, { type: 'cloze', values: [' bin ', null, 0] })).toBe('bin; —; sind');
    expect(answerTextFor(cz, { type: 'cloze', values: ['', 1, 1] })).toBe('—; ist; ist');
  });

  it('gives the chat the whole stimulus, with the instruction prefixed only once', () => {
    expect(taskTextFor(pq)).toBe('Anna wohnt in Wien.\n\n1. Wo wohnt Anna? (options: Wien | Bern)\n2. Wer? (options: Anna | Ben)');
    expect(taskTextOf(pq)).toBe(`Read and answer. — ${taskTextFor(pq)}`);
    expect(taskTextFor(mt)).toBe(
      'Texts:\n1. Ich suche eine Wohnung.\n2. Ich will kochen.\n3. Ich will tanzen.\n\nOptions:\na) Wohnungen\nb) Kochkurs\nx) none fits'
    );
    expect(taskTextFor(cz)).toBe('Ich {{1}} hier, du {{2}} da, er {{3}} weg.\n\nGap 2 options: bist | ist\nWord bank: sind | ist');
  });

  it('caps a long stimulus at about 4,000 characters', () => {
    const long: Exercise = { ...pq, content: { ...(pq.content as object), passage: 'Wort '.repeat(2000) } as Exercise['content'] };
    const text = taskTextFor(long);
    expect(text.length).toBeLessThanOrEqual(4001);
    expect(text.endsWith('…')).toBe(true);
  });
});
