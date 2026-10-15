import { describe, it, expect } from 'vitest';
import type { ClozeContent } from './cloze';
import { gradeTask, itemCount, parseTaskAnswer, resultFromItems, validateTask, viewTask, correctTexts } from './taskTypes';

const passage = {
  passage: 'Anna wohnt in Köln. Sie arbeitet in einer Bäckerei.',
  questions: [
    { question: 'Anna wohnt in Berlin.', options: ['Richtig', 'Falsch'], correctIndex: 1 },
    { question: 'Wo arbeitet Anna?', options: ['Bäckerei', 'Bank', 'Schule'], correctIndex: 0 },
  ],
};
const matching = { items: ['Text 1', 'Text 2', 'Situation 3'], targets: ['a', 'b', 'c'], answers: [2, 0, null], allowNone: true };
const cloze: ClozeContent = {
  text: 'Ich {{1}} gestern im Kino. Das {{2}} toll. Wir {{3}} Popcorn.',
  gaps: [
    { mode: 'typed', answer: 'war', variants: ['bin gewesen'] },
    { mode: 'select', options: ['war', 'ist', 'hat'], correctIndex: 0 },
    { mode: 'bank', answer: 1 },
  ],
  bank: ['essen', 'aßen', 'trinken'],
};

describe('task types', () => {
  it('validates content', () => {
    expect(validateTask('passage_questions', passage)).toEqual([]);
    expect(validateTask('matching', matching)).toEqual([]);
    expect(validateTask('cloze', cloze)).toEqual([]);
    expect(validateTask('matching', { ...matching, answers: [5, 0, null] })).toEqual(['answer 1 points outside the targets']);
    expect(validateTask('matching', { ...matching, allowNone: false })).toEqual(['answer 3 is "none" but allowNone is false']);
    expect(validateTask('cloze', { ...cloze, text: 'Ich {{1}}.' })).toEqual(['the text has 1 gaps but 3 are defined']);
    expect(validateTask('cloze', { ...cloze, bank: undefined })).toEqual(['gap 3 uses the bank but there is none']);
    expect(validateTask('passage_questions', { ...passage, passage: '' })).toEqual(['passage must be a non-empty string']);
  });

  it('rejects half-filled cloze gaps: blank select options, blank bank words and blank variants', () => {
    const [typed, select, bank] = cloze.gaps;
    expect(validateTask('cloze', { ...cloze, gaps: [typed, { mode: 'select', options: ['', ''], correctIndex: 0 }, bank] })).toEqual([
      'gap 2 needs at least 2 options with text and a correct one',
    ]);
    expect(validateTask('cloze', { ...cloze, gaps: [typed, { mode: 'select', options: ['war', ' '], correctIndex: 0 }, bank] })).toEqual([
      'gap 2 needs at least 2 options with text and a correct one',
    ]);
    expect(validateTask('cloze', { ...cloze, gaps: [typed, select, bank, { mode: 'bank', answer: 0 }], text: `${cloze.text} {{4}}`, bank: ['essen', '', 'trinken'] })).toEqual([
      'every word in the bank needs text',
    ]);
    expect(validateTask('cloze', { ...cloze, gaps: [{ mode: 'typed', answer: 'war', variants: [''] }, select, bank] })).toEqual(['gap 1 has an empty variant']);
    // A bank no gap uses is not checked (the editor drops it anyway).
    expect(validateTask('cloze', { text: 'Ich {{1}}.', gaps: [typed], bank: [''] })).toEqual([]);
  });

  it('rejects a cloze gap that is null, has no mode, or has an unknown mode, without throwing', () => {
    const [typed] = cloze.gaps;
    const two = (gap: unknown) => ({ text: 'Ich {{1}} {{2}}.', gaps: [typed, gap] });
    expect(validateTask('cloze', two(null))).toEqual(['gap 2 needs a mode of typed, select or bank']);
    expect(validateTask('cloze', two({}))).toEqual(['gap 2 needs a mode of typed, select or bank']);
    expect(validateTask('cloze', two({ mode: 'dropdown', options: ['a', 'b'], correctIndex: 0 }))).toEqual(['gap 2 needs a mode of typed, select or bank']);
    expect(validateTask('cloze', two('war'))).toEqual(['gap 2 needs a mode of typed, select or bank']);
  });

  it('strips every answer from the views', () => {
    const json = JSON.stringify([viewTask('passage_questions', passage), viewTask('matching', matching), viewTask('cloze', cloze)]);
    expect(json).not.toMatch(/correctIndex|"answers"|"answer"|variants/);
    expect(viewTask('cloze', cloze)).toMatchObject({ gaps: [{ mode: 'typed' }, { mode: 'select', options: ['war', 'ist', 'hat'] }, { mode: 'bank' }] });
  });

  it('parses answers against the content, rejecting the wrong shape or length', () => {
    expect(parseTaskAnswer('matching', { type: 'matching', selected: [2, null, null] }, matching)).toEqual({ type: 'matching', selected: [2, null, null] });
    expect(parseTaskAnswer('matching', { type: 'matching', selected: [2] }, matching)).toBeNull();
    expect(parseTaskAnswer('cloze', { type: 'cloze', values: ['war', 0, 1] }, cloze)).toEqual({ type: 'cloze', values: ['war', 0, 1] });
    expect(parseTaskAnswer('cloze', { type: 'cloze', values: [3, 0, 1] }, cloze)).toBeNull(); // a typed gap needs text
  });

  // Review Focus 3 and 4
  it('grades item by item: unanswered is wrong, bank words may repeat, typed gaps accept variants', () => {
    expect(gradeTask('passage_questions', passage, { type: 'passage_questions', selected: [1, null] }).itemResults).toEqual([true, false]);
    expect(gradeTask('matching', matching, { type: 'matching', selected: [2, 0, null] }).itemResults).toEqual([true, true, true]);
    expect(gradeTask('cloze', cloze, { type: 'cloze', values: ['  bin   gewesen ', 0, 1] }).itemResults).toEqual([true, true, true]);
    expect(gradeTask('cloze', cloze, { type: 'cloze', values: ['Bin gewesen', 0, 1] }).itemResults).toEqual([false, true, true]);
    expect(gradeTask('cloze', cloze, { type: 'cloze', values: [null, 5, 1] }).itemResults).toEqual([false, false, true]);
    const repeated: ClozeContent = { ...cloze, gaps: [cloze.gaps[0], { mode: 'bank', answer: 1 }, { mode: 'bank', answer: 1 }] };
    expect(gradeTask('cloze', repeated, { type: 'cloze', values: ['war', 1, 1] }).itemResults).toEqual([true, true, true]);
  });

  it('turns item results into a lesson grade: ≥ 80% correct, ≥ 50% almost', () => {
    expect(resultFromItems([true, true, true, true, false])).toBe('correct');
    expect(resultFromItems([true, true, true, false, false])).toBe('almost');
    expect(resultFromItems([true, false, false])).toBe('wrong');
  });

  it('counts items and names the right answers', () => {
    expect(itemCount('cloze', cloze)).toBe(3);
    expect(correctTexts('cloze', cloze)).toEqual(['war', 'war', 'aßen']);
    expect(correctTexts('matching', matching)).toEqual(['c', 'a', 'x']);
    expect(correctTexts('passage_questions', passage)).toEqual(['Falsch', 'Bäckerei']);
  });
});
