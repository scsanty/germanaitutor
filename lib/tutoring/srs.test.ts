import { describe, it, expect } from 'vitest';
import { computeNextReview, seedReview, type SrsState } from './srs';

const fresh: SrsState = { repetitions: 0, easeFactor: 2.5, intervalDays: 0, nextDueAt: '2026-09-24' };

describe('computeNextReview', () => {
  it('grows the interval 1 → 6 → interval × ease on correct answers, nudging ease up', () => {
    const first = computeNextReview(fresh, 'correct', '2026-09-24');
    expect(first).toEqual({ repetitions: 1, easeFactor: 2.6, intervalDays: 1, nextDueAt: '2026-09-25' });
    const second = computeNextReview(first, 'correct', '2026-09-25');
    expect(second).toEqual({ repetitions: 2, easeFactor: 2.7, intervalDays: 6, nextDueAt: '2026-10-01' });
    const third = computeNextReview(second, 'correct', '2026-10-01');
    expect(third).toEqual({ repetitions: 3, easeFactor: 2.8, intervalDays: 17, nextDueAt: '2026-10-18' });
  });

  it('grows the interval on almost, but lowers ease', () => {
    const state: SrsState = { repetitions: 2, easeFactor: 2.5, intervalDays: 6, nextDueAt: '2026-10-01' };
    expect(computeNextReview(state, 'almost', '2026-10-01')).toEqual({
      repetitions: 3,
      easeFactor: 2.35,
      intervalDays: 14,
      nextDueAt: '2026-10-15',
    });
  });

  it('starts over on wrong: due tomorrow, ease lower', () => {
    const state: SrsState = { repetitions: 5, easeFactor: 2.5, intervalDays: 30, nextDueAt: '2026-10-01' };
    expect(computeNextReview(state, 'wrong', '2026-10-01')).toEqual({
      repetitions: 0,
      easeFactor: 2.3,
      intervalDays: 1,
      nextDueAt: '2026-10-02',
    });
  });

  it('never lets ease fall below 1.3', () => {
    const low: SrsState = { repetitions: 3, easeFactor: 1.35, intervalDays: 10, nextDueAt: '2026-10-01' };
    expect(computeNextReview(low, 'wrong', '2026-10-01').easeFactor).toBe(1.3);
    expect(computeNextReview({ ...low, easeFactor: 1.3 }, 'almost', '2026-10-01').easeFactor).toBe(1.3);
  });
});

describe('seedReview', () => {
  it('schedules an exercise answered correctly on the first try in 3 days', () => {
    expect(seedReview('correct', '2026-09-24')).toEqual({
      repetitions: 1,
      easeFactor: 2.5,
      intervalDays: 3,
      nextDueAt: '2026-09-27',
    });
  });

  it.each(['almost', 'wrong'] as const)('schedules anything else (%s) for tomorrow', (result) => {
    expect(seedReview(result, '2026-09-24')).toEqual({
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 1,
      nextDueAt: '2026-09-25',
    });
  });
});
