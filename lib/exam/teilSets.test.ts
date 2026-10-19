import { describe, it, expect } from 'vitest';
import { teilSetProblems, parseTeilSetReply, buildTeilSetPrompt } from './teilSets';
import type { ExamPart } from './formats';

const part: ExamPart = { id: 'lesen-2', skill: 'reading', title: { en: 'R2', de: 'L2' }, taskType: 'passage_questions', items: 2, points: 10, minutes: 10, instructions: 'Lesen Sie …' };
const set = {
  taskType: 'passage_questions' as const,
  content: { passage: 'Text.', questions: [0, 1].map((n) => ({ question: `F${n}`, options: ['a', 'b', 'c'], correctIndex: 0 })) },
  explanations: [{ en: 'Because.', de: 'Weil.' }, { en: 'Because.', de: 'Weil.' }],
};

describe('teil sets', () => {
  it('checks type, item count, content, and explanations against the part', () => {
    expect(teilSetProblems(set, part)).toEqual([]);
    expect(teilSetProblems({ ...set, taskType: 'matching' }, part)).toContain('the part needs passage_questions, not matching');
    expect(teilSetProblems({ ...set, explanations: [set.explanations[0]] }, part)).toContain('2 items need 2 explanations, found 1');
    expect(teilSetProblems({ ...set, content: { ...set.content, questions: [set.content.questions[0]] } }, part)).toContain('the part has 2 items, the set has 1');
  });

  it('asks for a German-only set of the part’s shape at the level, and parses the reply strictly', () => {
    const { systemPrompt } = buildTeilSetPrompt(part, 'B1');
    expect(systemPrompt).toContain('CEFR level B1');
    expect(systemPrompt).toContain('entirely in German');
    expect(systemPrompt).toContain('exactly 2');
    expect(parseTeilSetReply(JSON.stringify({ content: set.content, explanations: set.explanations }), part)).toEqual(set);
    expect(parseTeilSetReply('{"content":{}}', part)).toBeNull();
  });

  // Preflight S6: Teil sets are German-only, so content never carries an instruction.
  it('rejects an instruction in the content, also in a parsed reply', () => {
    const withInstruction = { ...set, content: { ...set.content, instruction: { en: 'Read.', de: 'Lies.' } } };
    expect(teilSetProblems(withInstruction, part)).toContain('Teil sets are German-only and cannot have an instruction');
    expect(parseTeilSetReply(JSON.stringify({ content: withInstruction.content, explanations: set.explanations }), part)).toBeNull();
  });

  it('parses a cloze reply with a null or unknown-mode gap to null instead of throwing', () => {
    const clozePart: ExamPart = { ...part, id: 'sb-1', taskType: 'cloze', items: 2 };
    const explanations = set.explanations;
    const reply = (gap: unknown) => JSON.stringify({ content: { text: 'Ich {{1}} {{2}}.', gaps: [{ mode: 'select', options: ['a', 'b'], correctIndex: 0 }, gap] }, explanations });
    expect(parseTeilSetReply(reply({ mode: 'select', options: ['a', 'b'], correctIndex: 1 }), clozePart)).not.toBeNull();
    expect(parseTeilSetReply(reply(null), clozePart)).toBeNull();
    expect(parseTeilSetReply(reply({ mode: 'dropdown' }), clozePart)).toBeNull();
    expect(parseTeilSetReply(JSON.stringify({ content: null, explanations }), clozePart)).toBeNull();
  });

  it('needs English and German in every explanation', () => {
    expect(teilSetProblems({ ...set, explanations: [set.explanations[0], { en: 'Because.', de: ' ' }] }, part)).toContain('every explanation needs English and German');
  });
});

describe('letter sets', () => {
  const crit = (id: string) => ({ id, name: { en: id, de: id }, descriptors: { A: 'a', D: 'd' }, points: { A: 5, D: 0 } });
  const letterPart: ExamPart = {
    id: 'schreiben', skill: 'writing', title: { en: 'W', de: 'S' }, taskType: 'letter', items: 3, points: 15, minutes: 30, instructions: 'Schreiben Sie …',
    rubric: { criteria: [crit('a'), crit('b'), crit('c')] }, wordTarget: { min: 80, max: 100 }, choices: 2,
  };
  const task = { situation: 'Sie waren im Urlaub.', leitpunkte: ['Wohin?', 'Mit wem?'], register: 'informal' as const, wordTarget: { min: 80, max: 100 } };
  const tip = { en: 'Tip.', de: 'Tipp.' };
  const letterSet = { taskType: 'letter' as const, content: { tasks: [task, task] }, explanations: [tip, tip, tip] };

  it('uses the part for the item count: one explanation per criterion', () => {
    expect(teilSetProblems(letterSet, letterPart)).toEqual([]);
    expect(teilSetProblems({ ...letterSet, explanations: [tip, tip] }, letterPart)).toContain('3 items need 3 explanations, found 2');
  });

  it('requires the part\'s number of tasks and its word target', () => {
    expect(teilSetProblems({ ...letterSet, content: { tasks: [task] } }, letterPart)).toContain('the part offers 2 task(s), the set has 1');
    const off = { ...task, wordTarget: { min: 50, max: 100 } };
    expect(teilSetProblems({ ...letterSet, content: { tasks: [task, off] } }, letterPart)).toContain('task 2: wordTarget must be 80-100 like the part');
  });

  it('is German-only: no instruction', () => {
    const withInstruction = { ...letterSet, content: { instruction: { en: 'x', de: 'y' }, tasks: [task, task] } };
    expect(teilSetProblems(withInstruction, letterPart)).toContain('Teil sets are German-only and cannot have an instruction');
  });

  it('builds a generation prompt with the letter shape', () => {
    expect(buildTeilSetPrompt(letterPart, 'B1').systemPrompt).toContain('"leitpunkte"');
  });
});
