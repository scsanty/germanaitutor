import { describe, it, expect } from 'vitest';
import { cooldownEndsAt, drawTestOut, isTestOutEligibleType, scoreTestOut, type TestOutCandidate } from './testOut';

function lessons(count: number, perLesson: number): TestOutCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    lessonId: `l${i}`,
    exerciseIds: Array.from({ length: perLesson }, (_, j) => `l${i}__ex${j}`),
  }));
}

function perLessonCounts(ids: string[]): number[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const lesson = id.split('__')[0];
    counts.set(lesson, (counts.get(lesson) ?? 0) + 1);
  }
  return [...counts.values()];
}

// A small deterministic generator so the tests don't depend on Math.random.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('isTestOutEligibleType', () => {
  it('never allows flashcards, and allows free text only with a working AI provider', () => {
    expect(isTestOutEligibleType('flashcard', true)).toBe(false);
    expect(isTestOutEligibleType('multiple_choice', false)).toBe(true);
    expect(isTestOutEligibleType('fill_blank', false)).toBe(true);
    expect(isTestOutEligibleType('free_text', false)).toBe(false);
    expect(isTestOutEligibleType('free_text', true)).toBe(true);
  });
});

describe('drawTestOut', () => {
  it('draws up to 2 per lesson for 10 lessons or fewer', () => {
    const ids = drawTestOut(lessons(4, 3), seeded(1));
    expect(ids).toHaveLength(8);
    expect(perLessonCounts(ids)).toEqual([2, 2, 2, 2]);
  });

  it('takes what a lesson has when it has fewer than 2', () => {
    expect(drawTestOut([{ lessonId: 'a', exerciseIds: ['a__ex0'] }, ...lessons(1, 3)], seeded(2))).toHaveLength(3);
  });

  it('draws 1 per lesson plus seconds up to 20 for 11–20 lessons', () => {
    const ids = drawTestOut(lessons(14, 3), seeded(3));
    expect(ids).toHaveLength(20);
    const counts = perLessonCounts(ids);
    expect(counts).toHaveLength(14);
    expect(counts.every((c) => c === 1 || c === 2)).toBe(true);
  });

  it('draws 20 lessons with 1 each for more than 20 lessons', () => {
    const ids = drawTestOut(lessons(25, 3), seeded(4));
    expect(ids).toHaveLength(20);
    expect(perLessonCounts(ids).every((c) => c === 1)).toBe(true);
  });

  it('never repeats an exercise and skips lessons without exercises', () => {
    const ids = drawTestOut([...lessons(3, 2), { lessonId: 'empty', exerciseIds: [] }], seeded(5));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.startsWith('empty'))).toBe(false);
  });
});

describe('scoreTestOut', () => {
  it('scores correct 1, almost 0.5, wrong 0, and passes at 80%', () => {
    expect(scoreTestOut(['correct', 'correct', 'correct', 'correct', 'wrong'])).toEqual({ score: 4, maxScore: 5, passed: true });
    expect(scoreTestOut(['correct', 'correct', 'correct', 'almost', 'wrong'])).toEqual({ score: 3.5, maxScore: 5, passed: false });
    expect(scoreTestOut(['almost', 'almost'])).toEqual({ score: 1, maxScore: 2, passed: false });
  });
});

describe('cooldownEndsAt', () => {
  it('adds 24 hours', () => {
    expect(cooldownEndsAt('2026-09-29T10:00:00.000Z')).toBe('2026-09-30T10:00:00.000Z');
  });
});
