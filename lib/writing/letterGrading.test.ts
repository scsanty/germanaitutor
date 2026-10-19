import { describe, it, expect } from 'vitest';
import { LESSON_LETTER_RUBRIC } from './rubric';
import { buildLetterGradingPrompt, parseLetterGrade, resultFromPercent } from './letterGrading';
import { locateMarks } from './marks';

const task = { situation: 'Sie waren im Urlaub.', leitpunkte: ['Wohin?', 'Mit wem?', 'Was war toll?', 'Einladung'], register: 'informal' as const, wordTarget: { min: 80, max: 100 } };
const text = 'Liebe Anna, ich habe nach Rom gefahren. Ich habe nach Hause gefahren mit dem Zug.';
const reply = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    marks: [
      { original: 'habe nach Rom gefahren', correction: 'bin nach Rom gefahren', type: 'grammar', category: 'perfect_auxiliary', reason_en: 'fahren takes sein', reason_de: 'fahren mit sein' },
      { original: 'habe nach Hause gefahren', correction: 'bin nach Hause gefahren', type: 'grammar', category: 'bogus', reason_en: 'again sein', reason_de: 'wieder sein' },
      { original: 'not in the text', correction: 'x', type: 'grammar', category: 'other', reason_en: 'x', reason_de: 'x' },
    ],
    criteria: [
      { id: 'task', grade: 'B', justification_en: 'Most points covered', justification_de: 'Die meisten Punkte' },
      { id: 'communication', grade: 'B', justification_en: 'ok', justification_de: 'ok' },
      { id: 'accuracy', grade: 'C', justification_en: 'errors', justification_de: 'Fehler' },
    ],
    corrected: 'Liebe Anna, ich bin nach Rom gefahren.',
    summary_en: 'Good start.',
    summary_de: 'Guter Anfang.',
    ...overrides,
  });

const promptInput = (germanOnlyTask: boolean) => ({
  level: 'B1' as const,
  formatName: 'telc Deutsch B1',
  rubric: LESSON_LETTER_RUBRIC,
  task,
  anchors: [{ task, letter: 'Liebe Anna …', grades: { task: 'A' as const, communication: 'A' as const, accuracy: 'B' as const }, justification: 'Alle Punkte.' }],
  text,
  germanOnlyTask,
  instruction: { en: 'Write to your friend.', de: 'Schreiben Sie.' },
});

describe('letter grading', () => {
  it('builds a prompt with the rubric, the anchors, the word target, and the register', () => {
    const { systemPrompt, messages } = buildLetterGradingPrompt(promptInput(true));
    expect(systemPrompt).toContain('CEFR level B1');
    expect(systemPrompt).toContain('Task completion');
    expect(systemPrompt).toContain('80–100 words');
    expect(systemPrompt).toContain('informal');
    expect(systemPrompt).toContain('Reference letters');
    expect(systemPrompt).toContain('perfect_auxiliary');
    expect(messages[0].content).toContain(text);
  });

  it('germanOnlyTask leaves the English instruction out; a lesson includes it', () => {
    expect(buildLetterGradingPrompt(promptInput(true)).systemPrompt).not.toContain('Write to your friend.');
    expect(buildLetterGradingPrompt(promptInput(false)).systemPrompt).toContain('Instructions the learner saw: Write to your friend.');
    expect(buildLetterGradingPrompt(promptInput(true)).systemPrompt).toContain('Sie waren im Urlaub.');
  });

  // Review Focus 1
  it('locates marks in order, drops marks it cannot find, normalizes categories, and scores', () => {
    const grade = parseLetterGrade(reply(), text, LESSON_LETTER_RUBRIC)!;
    expect(grade.marks.map((m) => [m.start, m.original, m.category])).toEqual([
      [text.indexOf('habe nach Rom'), 'habe nach Rom gefahren', 'perfect_auxiliary'],
      [text.indexOf('habe nach Hause'), 'habe nach Hause gefahren', 'other'],
    ]);
    expect(grade).toMatchObject({ points: 7, maxPoints: 15, percent: 47, summary: { en: 'Good start.', de: 'Guter Anfang.' } });
    expect(resultFromPercent(grade.percent)).toBe('almost');
    expect(resultFromPercent(60)).toBe('correct');
    expect(resultFromPercent(39)).toBe('wrong');
  });

  // Review Focus 1: the same wrong text twice puts the marks on the two occurrences, in order.
  it('puts two marks with the same original on its two occurrences', () => {
    const twice = 'Ich habe gegangen. Danach habe gegangen ich wieder.';
    const mark = { original: 'habe gegangen', correction: 'bin gegangen', type: 'grammar', category: 'perfect_auxiliary', reason_en: 'x', reason_de: 'x' };
    const grade = parseLetterGrade(reply({ marks: [mark, mark] }), twice, LESSON_LETTER_RUBRIC)!;
    expect(grade.marks.map((m) => m.start)).toEqual([twice.indexOf('habe gegangen'), twice.lastIndexOf('habe gegangen')]);
    expect(grade.marks[0].start).not.toBe(grade.marks[1].start);
    expect(locateMarks(twice, [{ original: 'habe gegangen' }]).map((m) => m.start)).toEqual([4]);
  });

  it('is case-sensitive when locating', () => {
    expect(locateMarks('Ich gehe', [{ original: 'ich gehe' }])).toEqual([]);
  });

  it('rejects a reply missing a criterion or with an invalid grade', () => {
    expect(parseLetterGrade(reply({ criteria: [] }), text, LESSON_LETTER_RUBRIC)).toBeNull();
    const bad = JSON.parse(reply());
    bad.criteria[0].grade = 'F';
    expect(parseLetterGrade(JSON.stringify(bad), text, LESSON_LETTER_RUBRIC)).toBeNull();
    expect(parseLetterGrade(reply({ corrected: '' }), text, LESSON_LETTER_RUBRIC)).toBeNull();
    expect(parseLetterGrade('not json', text, LESSON_LETTER_RUBRIC)).toBeNull();
  });

  it('rejects a reply that drops one of three criteria', () => {
    const bad = JSON.parse(reply());
    bad.criteria = bad.criteria.slice(0, 2);
    expect(parseLetterGrade(JSON.stringify(bad), text, LESSON_LETTER_RUBRIC)).toBeNull();
  });

  it('rejects a grade the rubric has no points for (E on the lesson rubric)', () => {
    const bad = JSON.parse(reply());
    bad.criteria[1].grade = 'E';
    expect(parseLetterGrade(JSON.stringify(bad), text, LESSON_LETTER_RUBRIC)).toBeNull();
  });

  it('drops a mark with an empty original', () => {
    const mark = { original: '', correction: 'x', type: 'grammar', category: 'other', reason_en: 'x', reason_de: 'x' };
    expect(parseLetterGrade(reply({ marks: [mark] }), text, LESSON_LETTER_RUBRIC)!.marks).toEqual([]);
  });

  it('lets the first of a repeated criterion win', () => {
    const base = JSON.parse(reply());
    base.criteria.unshift({ id: 'accuracy', grade: 'A', justification_en: 'first', justification_de: 'erste' });
    const grade = parseLetterGrade(JSON.stringify(base), text, LESSON_LETTER_RUBRIC)!;
    expect(grade.criteria.find((c) => c.id === 'accuracy')).toMatchObject({ grade: 'A', justification: { en: 'first' } });
    expect(grade.points).toBe(11);
  });
});
