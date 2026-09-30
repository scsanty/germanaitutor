import { describe, it, expect, vi } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { gradeExerciseAnswer } from './exerciseGrading';

const mc: Exercise = { id: 'mc', lessonId: 'l', track: null, type: 'multiple_choice', content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } };
const fill: Exercise = { id: 'fb', lessonId: 'l', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin' } };
const card: Exercise = { id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
const free: Exercise = { id: 'ft', lessonId: 'l', track: null, type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };

function deps(outcome: unknown = { ok: true, result: 'almost', feedback: 'Fast.' }) {
  return { gradeFreeText: vi.fn().mockResolvedValue(outcome), uiLanguage: 'de' as const };
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
      feedback: 'Fast.',
    });
    expect(d.gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
      uiLanguage: 'de',
    });
  });

  it('reports a bad request for a mismatched type, a missing option, or blank free text', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(mc, { type: 'fill_blank', text: 'x' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(mc, { type: 'multiple_choice', selectedIndex: 7 }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: '   ' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
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
