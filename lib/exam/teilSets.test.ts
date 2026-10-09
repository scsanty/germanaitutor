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

  it('needs English and German in every explanation', () => {
    expect(teilSetProblems({ ...set, explanations: [set.explanations[0], { en: 'Because.', de: ' ' }] }, part)).toContain('every explanation needs English and German');
  });
});
