import { describe, it, expect } from 'vitest';
import { remainingReviews, selectDueItems } from './queue';

describe('selectDueItems', () => {
  const candidates = [
    { exerciseId: 'later', nextDueAt: '2026-09-30' },
    { exerciseId: 'today-1', nextDueAt: '2026-09-24' },
    { exerciseId: 'overdue', nextDueAt: '2026-09-20' },
    { exerciseId: 'today-2', nextDueAt: '2026-09-24' },
  ];

  it('returns only due items, most overdue first, keeping the given order for ties', () => {
    expect(selectDueItems(candidates, '2026-09-24', 10).map((c) => c.exerciseId)).toEqual([
      'overdue',
      'today-1',
      'today-2',
    ]);
  });

  it('stops at the number of reviews left today', () => {
    expect(selectDueItems(candidates, '2026-09-24', 2).map((c) => c.exerciseId)).toEqual(['overdue', 'today-1']);
    expect(selectDueItems(candidates, '2026-09-24', 0)).toEqual([]);
  });
});

describe('remainingReviews', () => {
  it.each([
    [50, 0, 50],
    [50, 49, 1],
    [50, 50, 0],
    [10, 12, 0],
  ])('cap %i with %i answered → %i left', (cap, answered, expected) => {
    expect(remainingReviews(cap, answered)).toBe(expected);
  });
});
