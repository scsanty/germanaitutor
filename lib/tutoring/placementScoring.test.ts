import { describe, it, expect } from 'vitest';
import type { CefrLevel } from '../types';
import { LEVELS } from './levels';
import {
  pointsFor,
  maxScore,
  placementThresholds,
  placedLevel,
  stopReasonAfterAnswer,
  MAX_MISTAKES,
} from './placementScoring';

function examWith(perLevel: number): { level: CefrLevel }[] {
  return LEVELS.flatMap((level) => Array.from({ length: perLevel }, () => ({ level })));
}

describe('placement scoring', () => {
  it('weights points by level and halves them for almost', () => {
    expect(pointsFor('A1', 'correct')).toBe(1);
    expect(pointsFor('B2', 'correct')).toBe(4);
    expect(pointsFor('C1', 'almost')).toBe(2.5);
    expect(pointsFor('C1', 'wrong')).toBe(0);
  });

  it('sums the maximum score', () => {
    expect(maxScore(examWith(8))).toBe(120);
  });

  it('computes the default-exam thresholds as 75% of every lower level', () => {
    expect(placementThresholds(examWith(8))).toEqual({ A1: 0, A2: 6, B1: 18, B2: 36, C1: 60 });
  });

  it('places the default exam exactly as the spec table says', () => {
    const exam = examWith(8);
    const cases: [number, CefrLevel][] = [
      [0, 'A1'],
      [5.5, 'A1'],
      [6, 'A2'],
      [17.5, 'A2'],
      [18, 'B1'],
      [35.5, 'B1'],
      [36, 'B2'],
      [59.5, 'B2'],
      [60, 'C1'],
      [120, 'C1'],
    ];
    for (const [score, level] of cases) {
      expect({ score, level: placedLevel(score, exam) }).toEqual({ score, level });
    }
  });

  it('recomputes thresholds for a differently sized exam', () => {
    expect(placementThresholds(examWith(2))).toEqual({ A1: 0, A2: 1.5, B1: 4.5, B2: 9, C1: 15 });
  });

  it('stops at the fifth mistake, then when every question is answered', () => {
    expect(MAX_MISTAKES).toBe(5);
    expect(stopReasonAfterAnswer(4, 10, 40)).toBeNull();
    expect(stopReasonAfterAnswer(5, 10, 40)).toBe('five_mistakes');
    expect(stopReasonAfterAnswer(2, 40, 40)).toBe('finished');
    expect(stopReasonAfterAnswer(5, 40, 40)).toBe('five_mistakes');
  });
});
