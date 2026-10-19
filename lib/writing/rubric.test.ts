import { describe, it, expect } from 'vitest';
import { LESSON_LETTER_RUBRIC, pointsFor, rubricMaxPoints, rubricProblems } from './rubric';

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

  it('counts a missing grade as 0 points', () => {
    expect(pointsFor(LESSON_LETTER_RUBRIC, { task: 'A' })).toBe(5);
  });
});
