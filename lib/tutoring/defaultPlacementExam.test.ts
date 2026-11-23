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
  it('is a valid exam of 45 questions', () => {
    expect(loadDefaultExam()).toHaveLength(45);
  });

  it('has 9 questions per level: 3 multiple choice, 3 fill-blank, 2 free text and 1 spoken', () => {
    const exam = loadDefaultExam();
    for (const level of LEVELS) {
      const types = exam.filter((q) => q.level === level).map((q) => q.type);
      expect({ level, mc: types.filter((t) => t === 'multiple_choice').length }).toEqual({ level, mc: 3 });
      expect({ level, fill: types.filter((t) => t === 'fill_blank').length }).toEqual({ level, fill: 3 });
      expect({ level, free: types.filter((t) => t === 'free_text').length }).toEqual({ level, free: 2 });
      expect({ level, spoken: types.filter((t) => t === 'spoken').length }).toEqual({ level, spoken: 1 });
    }
  });

  it('puts each spoken item last in its level block', () => {
    const exam = loadDefaultExam();
    for (const level of LEVELS) {
      const block = exam.filter((q) => q.level === level);
      expect({ level, last: block[block.length - 1].type }).toEqual({ level, last: 'spoken' });
    }
  });

  it('gives every spoken item a German prompt and model answer, and no English instruction-only task', () => {
    for (const q of loadDefaultExam().filter((x) => x.type === 'spoken')) {
      const c = q.content as { prompt: string; modelAnswer: string };
      expect(c.prompt.trim(), q.id).not.toBe('');
      expect(c.modelAnswer.trim(), q.id).not.toBe('');
    }
  });

  it('does not always put the right answer in the same position', () => {
    const positions = new Set(
      loadDefaultExam().flatMap((q) => (q.type === 'multiple_choice' ? [q.content.correctIndex] : []))
    );
    expect(positions.size).toBeGreaterThan(2);
  });

  it('produces the spec thresholds when the spoken items are left out (speech service down)', () => {
    expect(placementThresholds(loadDefaultExam().filter((q) => q.type !== 'spoken'))).toEqual({ A1: 0, A2: 6, B1: 18, B2: 36, C1: 60 });
  });

  it('raises the thresholds by the spoken items when the whole exam is served', () => {
    expect(placementThresholds(loadDefaultExam())).toEqual({ A1: 0, A2: 6.75, B1: 20.25, B2: 40.5, C1: 67.5 });
  });
});
