import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS } from './levels';
import { validatePlacementExam } from './placementExamFormat';
import { placementThresholds } from './placementScoring';

function loadDefaultExam() {
  const parsed = validatePlacementExam(JSON.parse(readFileSync(join(process.cwd(), 'data', 'placement-exam.json'), 'utf8')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.questions;
}

describe('the default placement exam', () => {
  it('is a valid exam of 40 questions', () => {
    expect(loadDefaultExam()).toHaveLength(40);
  });

  it('has 8 questions per level: 3 multiple choice, 3 fill-blank and 2 free text', () => {
    const exam = loadDefaultExam();
    for (const level of LEVELS) {
      const types = exam.filter((q) => q.level === level).map((q) => q.type);
      expect({ level, mc: types.filter((t) => t === 'multiple_choice').length }).toEqual({ level, mc: 3 });
      expect({ level, fill: types.filter((t) => t === 'fill_blank').length }).toEqual({ level, fill: 3 });
      expect({ level, free: types.filter((t) => t === 'free_text').length }).toEqual({ level, free: 2 });
    }
  });

  it('does not always put the right answer in the same position', () => {
    const positions = new Set(
      loadDefaultExam().flatMap((q) => (q.type === 'multiple_choice' ? [q.content.correctIndex] : []))
    );
    expect(positions.size).toBeGreaterThan(2);
  });

  it('produces the spec thresholds', () => {
    expect(placementThresholds(loadDefaultExam())).toEqual({ A1: 0, A2: 6, B1: 18, B2: 36, C1: 60 });
  });
});
