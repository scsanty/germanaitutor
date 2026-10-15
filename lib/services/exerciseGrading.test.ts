import { describe, it, expect, vi } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { gradeExerciseAnswer } from './exerciseGrading';

const mc: Exercise = { id: 'mc', lessonId: 'l', track: null, type: 'multiple_choice', content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } };
const fill: Exercise = { id: 'fb', lessonId: 'l', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin' } };
const card: Exercise = { id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
const free: Exercise = { id: 'ft', lessonId: 'l', track: null, type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };

function deps(outcome: unknown = { ok: true, result: 'almost', feedback: { en: 'Almost.', de: 'Fast.' } }) {
  return { gradeFreeText: vi.fn().mockResolvedValue(outcome) };
}

describe('gradeExerciseAnswer', () => {
  it('grades deterministic types and flashcard ratings without the AI', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(mc, { type: 'multiple_choice', selectedIndex: 1 }, 'A1', d)).toEqual({ ok: true, result: 'wrong', feedback: null });
    expect(await gradeExerciseAnswer(fill, { type: 'fill_blank', text: ' bin ' }, 'A1', d)).toEqual({ ok: true, result: 'correct', feedback: null });
    expect(await gradeExerciseAnswer(card, { type: 'flashcard', rating: 'sort_of' }, 'A1', d)).toEqual({ ok: true, result: 'almost', feedback: null });
    expect(d.gradeFreeText).not.toHaveBeenCalled();
  });

  it('grades free text with the AI in the UI language', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: 'Ich schreib.' }, 'A2', d)).toEqual({
      ok: true,
      result: 'almost',
      feedback: { en: 'Almost.', de: 'Fast.' },
    });
    expect(d.gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
    });
  });

  it('reports a bad request for a mismatched type, a missing option, or blank free text', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(mc, { type: 'fill_blank', text: 'x' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(mc, { type: 'multiple_choice', selectedIndex: 7 }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: '   ' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  it('grades the set types item by item with the lesson pass rule', async () => {
    const ex = {
      id: 'p', lessonId: 'l', track: null, type: 'passage_questions' as const,
      content: { passage: 'Text.', questions: [0, 1, 2, 3, 4].map((n) => ({ question: `F${n}`, options: ['a', 'b'], correctIndex: 0 })) },
    };
    const d = { gradeFreeText: vi.fn() };
    // S17: the per-item results travel with the grade.
    expect(await gradeExerciseAnswer(ex, { type: 'passage_questions', selected: [0, 0, 0, 0, 1] }, 'B1', d)).toEqual({ ok: true, result: 'correct', feedback: null, itemResults: [true, true, true, true, false] });
    expect(await gradeExerciseAnswer(ex, { type: 'passage_questions', selected: [0, 0, 1, 1, 1] }, 'B1', d)).toEqual({ ok: true, result: 'wrong', feedback: null, itemResults: [true, true, false, false, false] });
    expect(await gradeExerciseAnswer(ex, { type: 'passage_questions', selected: [0] }, 'B1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(d.gradeFreeText).not.toHaveBeenCalled();
  });

  it('grades cloze case-sensitively and matching with -1 as unanswered', async () => {
    const d = { gradeFreeText: vi.fn() };
    const cloze: Exercise = { id: 'c', lessonId: 'l', track: null, type: 'cloze', content: { text: 'Ich {{1}} hier, du {{2}} da.', gaps: [{ mode: 'typed', answer: 'bin' }, { mode: 'select', options: ['bist', 'ist'], correctIndex: 0 }] } };
    expect(await gradeExerciseAnswer(cloze, { type: 'cloze', values: [' bin ', 0] }, 'A1', d)).toMatchObject({ ok: true, result: 'correct', itemResults: [true, true] });
    expect(await gradeExerciseAnswer(cloze, { type: 'cloze', values: ['Bin', 0] }, 'A1', d)).toMatchObject({ ok: true, result: 'almost', itemResults: [false, true] });
    const matching: Exercise = { id: 'm', lessonId: 'l', track: null, type: 'matching', content: { items: ['A', 'B'], targets: ['x', 'y', 'z'], answers: [0, 1], allowNone: false } };
    expect(await gradeExerciseAnswer(matching, { type: 'matching', selected: [0, -1] }, 'A1', d)).toMatchObject({ ok: true, result: 'almost', itemResults: [true, false] });
    expect(await gradeExerciseAnswer(matching, { type: 'cloze', values: [null, null] }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  it('passes an AI failure on with its code', async () => {
    const d = deps({ ok: false, error: 'No AI provider is set up', code: 'no_provider' });
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: 'x' }, 'A1', d)).toEqual({
      ok: false,
      reason: 'grading_failed',
      message: 'No AI provider is set up',
      code: 'no_provider',
      params: undefined,
    });
  });
});
