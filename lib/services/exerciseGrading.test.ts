import { describe, it, expect, vi } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { gradeExerciseAnswer, type GradableSpeechClip } from './exerciseGrading';
import type { LetterGrade } from '../writing/letterGrading';

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
      mistakes: [],
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

describe('gradeExerciseAnswer for letters (S6)', () => {
  const task = { situation: 'S', leitpunkte: ['a', 'b', 'c'], register: 'informal' as const, wordTarget: { min: 20, max: 40 } };
  const letterExercise: Exercise = { id: 'lt', lessonId: 'l', track: null, type: 'letter', content: { tasks: [task] } };
  const grade = (percent: number) => ({ percent, summary: { en: 'Sum.', de: 'Zus.' } }) as LetterGrade;
  const answer = (text: string, taskIndex = 0) => ({ type: 'letter' as const, taskIndex, text });

  it('applies the lesson pass rule: >= 60% correct, >= 40% almost, else wrong; the summary is the feedback', async () => {
    for (const [percent, result] of [[60, 'correct'], [59, 'almost'], [40, 'almost'], [39, 'wrong']] as const) {
      const gradeLetter = vi.fn().mockResolvedValue({ ok: true, grade: grade(percent) });
      expect(await gradeExerciseAnswer(letterExercise, answer('Liebe Anna'), 'B1', { ...deps(), gradeLetter })).toEqual({
        ok: true,
        result,
        feedback: { en: 'Sum.', de: 'Zus.' },
        letter: grade(percent),
      });
      expect(gradeLetter).toHaveBeenCalledWith({ level: 'B1', content: letterExercise.content, answer: answer('Liebe Anna') });
    }
  });

  it('refuses an empty letter, a task that does not exist, or no letter grader, before any AI call', async () => {
    const gradeLetter = vi.fn();
    expect(await gradeExerciseAnswer(letterExercise, answer(' \n '), 'B1', { ...deps(), gradeLetter })).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(letterExercise, answer('Hallo', 1), 'B1', { ...deps(), gradeLetter })).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(letterExercise, answer('Hallo'), 'B1', deps())).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(gradeLetter).not.toHaveBeenCalled();
  });

  it('maps a grading failure to grading_failed with its code', async () => {
    const gradeLetter = vi.fn().mockResolvedValue({ ok: false, error: 'bad', code: 'ai_bad_reply' });
    expect(await gradeExerciseAnswer(letterExercise, answer('Hallo'), 'B1', { ...deps(), gradeLetter })).toMatchObject({
      ok: false,
      reason: 'grading_failed',
      code: 'ai_bad_reply',
    });
  });
});


describe('gradeExerciseAnswer for spoken responses (Speaking)', () => {
  const spoken: Exercise = {
    id: 'sr',
    lessonId: 'a1-greet',
    track: null,
    type: 'spoken_response',
    content: { instruction: { en: 'Answer aloud.', de: 'Antworte laut.' }, prompt: 'Wie heißen Sie?', modelAnswer: 'Ich heiße Anna.' },
  };
  const words = [
    { word: 'Ich', start: 0, end: 0.3, probability: 0.9 },
    { word: 'heiße', start: 0.3, end: 0.7, probability: 0.5 },
    { word: 'Tom.', start: 0.7, end: 1, probability: 0.8 },
  ];
  const clip = (overrides: Partial<GradableSpeechClip> = {}): GradableSpeechClip => ({ scope: 'lesson:a1-greet', role: 'student', transcript: 'Ich heiße Tom.', words, ...overrides });
  const graded = { ok: true, result: 'almost', feedback: { en: 'Almost.', de: 'Fast.' }, mistakes: [], pronunciation: { en: 'Check heiße.', de: 'Prüfe heiße.' } };

  it('grades the transcript like free text, with the unclear words, and adds the estimate', async () => {
    const d = deps(graded);
    const getSpeechClip = vi.fn().mockReturnValue(clip());
    expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', clipId: 'c1' }, 'A1', { ...d, getSpeechClip })).toEqual({
      ok: true,
      result: 'almost',
      feedback: { en: 'Almost.', de: 'Fast.' },
      mistakes: [],
      spoken: { transcript: 'Ich heiße Tom.', estimate: { score: 73, unclear: ['heiße'] }, pronunciation: { en: 'Check heiße.', de: 'Prüfe heiße.' } },
    });
    expect(getSpeechClip).toHaveBeenCalledWith('c1');
    expect(d.gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Answer aloud. — Wie heißen Sie?',
      modelAnswer: 'Ich heiße Anna.',
      studentAnswer: 'Ich heiße Tom.',
      level: 'A1',
      unclearWords: ['heiße'],
    });
  });

  it('refuses a clip from another scope, a partner clip, a missing or empty clip, or no clip loader, before any AI call', async () => {
    const d = deps(graded);
    for (const found of [clip({ scope: 'lesson:a1-sein' }), clip({ scope: 'freestyle:spoken' }), clip({ role: 'partner' }), clip({ transcript: '  ' }), null]) {
      expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', clipId: 'c1' }, 'A1', { ...d, getSpeechClip: () => found })).toMatchObject({
        ok: false,
        reason: 'bad_request',
      });
    }
    expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', clipId: 'c1' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(d.gradeFreeText).not.toHaveBeenCalled();
  });

  it('grades a typed answer as plain free text, without an estimate', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', typed: 'Ich heiße Tom.' }, 'A1', d)).toEqual({
      ok: true,
      result: 'almost',
      feedback: { en: 'Almost.', de: 'Fast.' },
      mistakes: [],
    });
    expect(d.gradeFreeText).toHaveBeenCalledWith({ prompt: 'Answer aloud. — Wie heißen Sie?', modelAnswer: 'Ich heiße Anna.', studentAnswer: 'Ich heiße Tom.', level: 'A1' });
    expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', typed: '  ' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  it('maps a grading failure to grading_failed', async () => {
    const d = deps({ ok: false, error: 'bad', code: 'ai_bad_reply' });
    expect(await gradeExerciseAnswer(spoken, { type: 'spoken_response', clipId: 'c1' }, 'A1', { ...d, getSpeechClip: () => clip() })).toMatchObject({
      ok: false,
      reason: 'grading_failed',
      code: 'ai_bad_reply',
    });
  });
});
