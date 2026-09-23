import { describe, it, expect } from 'vitest';
import { computeDiagramLayout } from './diagramLayout';

describe('computeDiagramLayout', () => {
  it('places lessons with no prerequisites in column 0', () => {
    const layout = computeDiagramLayout(['a', 'b'], []);
    expect(layout.every((n) => n.column === 0)).toBe(true);
  });

  it('stacks lessons sharing a column into distinct rows, sorted by id', () => {
    const layout = computeDiagramLayout(['b', 'a'], []);
    const sorted = [...layout].sort((x, y) => x.row - y.row);
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b']);
    expect(sorted.map((n) => n.row)).toEqual([0, 1]);
  });

  it('assigns column = 1 + max(prerequisite column) along a simple chain', () => {
    const layout = computeDiagramLayout(
      ['a', 'b', 'c'],
      [
        { lessonId: 'b', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'b' },
      ]
    );
    const byId = Object.fromEntries(layout.map((n) => [n.id, n.column]));
    expect(byId).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('takes the max column across multiple prerequisites (fan-in)', () => {
    const layout = computeDiagramLayout(
      ['a', 'b', 'c'],
      [
        { lessonId: 'b', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'b' },
      ]
    );
    const byId = Object.fromEntries(layout.map((n) => [n.id, n.column]));
    expect(byId).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('throws on a cycle rather than looping forever', () => {
    expect(() =>
      computeDiagramLayout(
        ['a', 'b'],
        [
          { lessonId: 'a', prerequisiteLessonId: 'b' },
          { lessonId: 'b', prerequisiteLessonId: 'a' },
        ]
      )
    ).toThrow();
  });
});
