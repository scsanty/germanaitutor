import { describe, it, expect } from 'vitest';
import { isPassing, lessonStatus, meetsCompletionRule } from './completion';

describe('isPassing', () => {
  it('counts correct and almost as passed', () => {
    expect([isPassing('correct'), isPassing('almost'), isPassing('wrong')]).toEqual([true, true, false]);
  });
});

describe('meetsCompletionRule', () => {
  it.each([
    [['a', 'b'], ['a', 'b'], true],
    [['a', 'b'], ['a'], false],
    [['a'], ['a', 'removed-exercise'], true],
    [[], [], false],
  ])('exercises %j with passed %j → %s', (exerciseIds, passed, expected) => {
    expect(meetsCompletionRule(exerciseIds, new Set(passed))).toBe(expected);
  });
});

describe('lessonStatus', () => {
  it.each([
    [{ completed: true, covered: false, attempted: true }, 'complete'],
    [{ completed: false, covered: true, attempted: true }, 'covered'],
    [{ completed: false, covered: false, attempted: true }, 'in_progress'],
    [{ completed: false, covered: false, attempted: false }, 'not_started'],
  ] as const)('%j → %s', (input, expected) => {
    expect(lessonStatus(input)).toBe(expected);
  });
});
