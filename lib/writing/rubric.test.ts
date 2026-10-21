import { describe, it, expect } from 'vitest';
import { LESSON_LETTER_RUBRIC, isZeroed, pointsFor, rubricMaxPoints, rubricProblems, type WritingRubric } from './rubric';

describe('rubrics', () => {
  it('scores the lesson rubric out of 15', () => {
    expect(rubricMaxPoints(LESSON_LETTER_RUBRIC)).toBe(15);
    expect(pointsFor(LESSON_LETTER_RUBRIC, { task: 'A', communication: 'B', accuracy: 'D' })).toBe(8);
    expect(rubricProblems(LESSON_LETTER_RUBRIC)).toEqual([]);
  });

  it('names criteria without points or descriptors, and duplicate ids', () => {
    expect(
      rubricProblems({
        criteria: [
          { id: 'a', name: { en: 'A', de: 'A' }, descriptors: {}, points: {} },
          { id: 'a', name: { en: 'B', de: 'B' }, descriptors: { A: 'x' }, points: { A: 1 } },
        ],
      })
    ).toEqual(['criterion a has no grades', 'criterion a: duplicate id']);
  });

  it('names a grade that has points but no descriptor, or the other way round', () => {
    expect(
      rubricProblems({
        criteria: [
          { id: 'a', name: { en: 'A', de: 'A' }, descriptors: { A: 'x', B: 'y' }, points: { A: 5, C: 1 } },
        ],
      })
    ).toEqual(['criterion a: grade B needs both points and a descriptor', 'criterion a: grade C needs both points and a descriptor']);
  });

  // Goethe's bands use halves and quarters (10 / 7.5 / 5 / 2.5 / 0), so points are numbers, not only whole numbers.
  it('names points that are negative or not finite numbers', () => {
    expect(
      rubricProblems({
        criteria: [
          { id: 'a', name: { en: 'A', de: 'A' }, descriptors: { A: 'x', B: 'y', C: 'z', D: 'w' }, points: { A: 7.5, B: -1, C: '2' as never, D: Number.NaN } },
        ],
      })
    ).toEqual([
      'criterion a: grade B points must be a non-negative number',
      'criterion a: grade C points must be a non-negative number',
      'criterion a: grade D points must be a non-negative number',
    ]);
  });

  it('counts a missing grade as 0 points', () => {
    expect(pointsFor(LESSON_LETTER_RUBRIC, { task: 'A' })).toBe(5);
  });

  // telc B1-C1 and Goethe B1-C1: the lowest grade on task completion makes the whole text worth 0 points.
  describe('zero rule', () => {
    const ZEROED: WritingRubric = { ...LESSON_LETTER_RUBRIC, zeroesTextOn: { criterion: 'task', grade: 'D' } };

    it('scores the whole text 0 when the criterion has the grade, and normally otherwise', () => {
      expect(pointsFor(ZEROED, { task: 'D', communication: 'A', accuracy: 'A' })).toBe(0);
      expect(isZeroed(ZEROED, { task: 'D', communication: 'A', accuracy: 'A' })).toBe(true);
      expect(pointsFor(ZEROED, { task: 'C', communication: 'A', accuracy: 'A' })).toBe(11);
      expect(isZeroed(ZEROED, { task: 'C', communication: 'A', accuracy: 'A' })).toBe(false);
      // Without the rule, the same grades keep their points.
      expect(pointsFor(LESSON_LETTER_RUBRIC, { task: 'D', communication: 'A', accuracy: 'A' })).toBe(10);
      expect(isZeroed(LESSON_LETTER_RUBRIC, { task: 'D', communication: 'A', accuracy: 'A' })).toBe(false);
      expect(rubricProblems(ZEROED)).toEqual([]);
    });

    it('names a zero rule on a criterion or grade the rubric does not have', () => {
      expect(rubricProblems({ ...LESSON_LETTER_RUBRIC, zeroesTextOn: { criterion: 'nope', grade: 'D' } })).toEqual([
        'zero rule: unknown criterion nope',
      ]);
      expect(rubricProblems({ ...LESSON_LETTER_RUBRIC, zeroesTextOn: { criterion: 'task', grade: 'E' } })).toEqual([
        'zero rule: criterion task has no grade E',
      ]);
    });
  });
});
