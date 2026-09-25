import { describe, it, expect } from 'vitest';
import { remainingReviews, selectDueItems, suggestNextLesson } from './queue';

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

describe('suggestNextLesson', () => {
  it('picks the first incomplete lesson whose prerequisites are all done', () => {
    const lessons = [
      { id: 'done', done: true, prerequisiteIds: [] },
      { id: 'blocked', done: false, prerequisiteIds: ['elsewhere'] },
      { id: 'ready', done: false, prerequisiteIds: ['done'] },
    ];
    expect(suggestNextLesson(lessons, new Set(['done']))).toBe('ready');
  });

  it('falls back to the first incomplete lesson when none is ready', () => {
    const lessons = [
      { id: 'blocked-1', done: false, prerequisiteIds: ['x'] },
      { id: 'blocked-2', done: false, prerequisiteIds: ['y'] },
    ];
    expect(suggestNextLesson(lessons, new Set())).toBe('blocked-1');
  });

  it('suggests nothing when every lesson is done', () => {
    expect(suggestNextLesson([{ id: 'a', done: true, prerequisiteIds: [] }], new Set(['a']))).toBeNull();
    expect(suggestNextLesson([], new Set())).toBeNull();
  });
});
