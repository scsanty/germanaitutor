import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels';
import { parsePlacementExam, serializePlacementExam, validatePlacementExam, type PlacementQuestion } from './placementExamFormat';

function validExam(): PlacementQuestion[] {
  return LEVELS.map((level, i): PlacementQuestion => ({
    id: `q${i + 1}`,
    level,
    type: 'multiple_choice',
    content: { question: `${level}?`, options: ['a', 'b'], correctIndex: 0 },
  }));
}

describe('placement exam format', () => {
  it('accepts a valid exam', () => {
    expect(validatePlacementExam({ questions: validExam() })).toEqual({ ok: true, questions: validExam() });
  });

  it('round-trips through JSON and YAML', () => {
    for (const format of ['json', 'yaml'] as const) {
      const text = serializePlacementExam(validExam(), format);
      expect(parsePlacementExam(text, format)).toEqual({ ok: true, questions: validExam() });
    }
  });

  it('rejects files that are not valid JSON or YAML', () => {
    const result = parsePlacementExam('{ questions: [', 'json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^The file is not valid JSON/);
  });

  it('requires a non-empty questions list', () => {
    expect(validatePlacementExam({})).toEqual({ ok: false, errors: ['The file must contain a "questions" list'] });
    expect(validatePlacementExam({ questions: [] })).toEqual({ ok: false, errors: ['The "questions" list is empty'] });
  });

  it('collects every problem instead of stopping at the first', () => {
    const questions: unknown[] = [
      ...validExam(),
      { id: 'q1', level: 'A1', type: 'flashcard', content: { front: 'x', back: 'y' } },
      { id: 'q7', level: 'Z9', type: 'free_text', content: { prompt: 'p' } },
    ];
    const result = validatePlacementExam({ questions });
    expect(result).toEqual({
      ok: false,
      errors: [
        'Question 6 (q1): duplicate id',
        'Question 6 (q1): level A1 comes after C1; questions must be ordered from easiest to hardest level',
        'Question 6 (q1): type must be one of multiple_choice, fill_blank, free_text',
        'Question 7 (q7): level must be one of A1, A2, B1, B2, C1',
        'Question 7 (q7): modelAnswer must be a non-empty string',
      ],
    });
  });

  it('requires every level to be present', () => {
    const result = validatePlacementExam({ questions: validExam().filter((q) => q.level !== 'B2') });
    expect(result).toEqual({
      ok: false,
      errors: ['The exam has no B2 questions; every level from A1 to C1 needs at least one'],
    });
  });
});
