import { describe, it, expect } from 'vitest';
import {
  isLessonLocked,
  milestoneStates,
  nextLockedRank,
  openRank,
  prerequisiteScopeViolations,
  type PlacementInfo,
  type RankedMilestone,
} from './gating';

const doneOf = (...ids: string[]) => {
  const set = new Set(ids);
  return (id: string) => set.has(id);
};

const M: RankedMilestone[] = [
  { id: 'm1', rank: 1, lessonIds: ['a', 'b'] },
  { id: 'm2a', rank: 2, lessonIds: ['c'] },
  { id: 'm2b', rank: 2, lessonIds: ['d'] },
  { id: 'm3', rank: 3, lessonIds: ['e'] },
];

describe('milestoneStates', () => {
  it('opens only the lowest incomplete rank at the start', () => {
    const states = milestoneStates(M, doneOf());
    expect(Object.fromEntries(states)).toEqual({ m1: 'open', m2a: 'locked', m2b: 'locked', m3: 'locked' });
    expect(openRank(M, doneOf())).toBe(1);
    expect(nextLockedRank(M, doneOf())).toBe(2);
  });

  it('opens parallel milestones of equal rank together, and the next rank only when all are complete', () => {
    expect(Object.fromEntries(milestoneStates(M, doneOf('a', 'b')))).toEqual({
      m1: 'complete',
      m2a: 'open',
      m2b: 'open',
      m3: 'locked',
    });
    expect(Object.fromEntries(milestoneStates(M, doneOf('a', 'b', 'c')))).toEqual({
      m1: 'complete',
      m2a: 'complete',
      m2b: 'open',
      m3: 'locked',
    });
    expect(nextLockedRank(M, doneOf('a', 'b', 'c'))).toBe(3);
  });

  it('treats an empty milestone as complete', () => {
    const withEmpty: RankedMilestone[] = [{ id: 'e', rank: 1, lessonIds: [] }, ...M.map((m) => ({ ...m, rank: m.rank + 1 }))];
    expect(milestoneStates(withEmpty, doneOf()).get('e')).toBe('complete');
    expect(openRank(withEmpty, doneOf())).toBe(2);
  });

  it('reports a complete later milestone as complete even while an earlier rank is open', () => {
    expect(milestoneStates(M, doneOf('e')).get('m3')).toBe('complete');
  });

  it('has no open or next rank when everything is complete', () => {
    const all = doneOf('a', 'b', 'c', 'd', 'e');
    expect(openRank(M, all)).toBeNull();
    expect(nextLockedRank(M, all)).toBeNull();
  });

  it('has no next locked rank when the open rank is the last one', () => {
    expect(nextLockedRank(M, doneOf('a', 'b', 'c', 'd'))).toBeNull();
  });
});

describe('isLessonLocked', () => {
  const none = new Set<string>();
  it('never locks a done lesson, even in a locked milestone', () => {
    expect(isLessonLocked({ lessonId: 'x', milestoneState: 'locked', prerequisiteIds: ['p'], unsortedIds: none }, doneOf('x'))).toBe(false);
  });

  it('locks every lesson of a locked milestone', () => {
    expect(isLessonLocked({ lessonId: 'x', milestoneState: 'locked', prerequisiteIds: [], unsortedIds: none }, doneOf())).toBe(true);
  });

  it('locks a lesson in an open milestone until its prerequisites are done', () => {
    const input = { lessonId: 'x', milestoneState: 'open' as const, prerequisiteIds: ['p', 'q'], unsortedIds: none };
    expect(isLessonLocked(input, doneOf('p'))).toBe(true);
    expect(isLessonLocked(input, doneOf('p', 'q'))).toBe(false);
  });

  it('ignores prerequisites that sit in Unsorted', () => {
    expect(
      isLessonLocked({ lessonId: 'x', milestoneState: 'open', prerequisiteIds: ['hidden'], unsortedIds: new Set(['hidden']) }, doneOf())
    ).toBe(false);
  });
});

describe('prerequisiteScopeViolations', () => {
  const placements: Record<string, PlacementInfo> = {
    a: { milestoneId: 'm1', rank: 1 },
    b: { milestoneId: 'm1', rank: 1 },
    c: { milestoneId: 'm2a', rank: 2 },
    d: { milestoneId: 'm2b', rank: 2 },
    u: { milestoneId: 'unsorted', rank: null },
  };
  const placementOf = (id: string) => placements[id];

  it('allows the same milestone and a strictly lower rank', () => {
    expect(
      prerequisiteScopeViolations(
        [
          { lessonId: 'b', prerequisiteId: 'a' },
          { lessonId: 'c', prerequisiteId: 'a' },
        ],
        placementOf
      )
    ).toEqual([]);
  });

  it('rejects a parallel milestone of equal rank and a later rank', () => {
    const edges = [
      { lessonId: 'c', prerequisiteId: 'd' },
      { lessonId: 'a', prerequisiteId: 'c' },
    ];
    expect(prerequisiteScopeViolations(edges, placementOf)).toEqual(edges);
  });

  it('exempts edges touching Unsorted or an unplaced lesson', () => {
    expect(
      prerequisiteScopeViolations(
        [
          { lessonId: 'a', prerequisiteId: 'u' },
          { lessonId: 'u', prerequisiteId: 'c' },
          { lessonId: 'a', prerequisiteId: 'nowhere' },
        ],
        placementOf
      )
    ).toEqual([]);
  });
});
