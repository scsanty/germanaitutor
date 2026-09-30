import { describe, it, expect } from 'vitest';
import { computeBranchLayout } from './branchLayout';

const byId = (nodes: ReturnType<typeof computeBranchLayout>) => Object.fromEntries(nodes.map((n) => [n.id, n]));

describe('computeBranchLayout', () => {
  it('lays a chain out top to bottom in one branch', () => {
    const nodes = byId(computeBranchLayout(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]));
    expect(nodes).toEqual({
      a: { id: 'a', branch: 0, column: 0, row: 0 },
      b: { id: 'b', branch: 0, column: 0, row: 1 },
      c: { id: 'c', branch: 0, column: 0, row: 2 },
    });
  });

  it('places a diamond with the join on the row below its deepest prerequisite', () => {
    const nodes = byId(
      computeBranchLayout(
        ['a', 'b', 'c', 'd'],
        [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'd' },
          { from: 'c', to: 'd' },
        ]
      )
    );
    expect(nodes.a).toMatchObject({ row: 0, column: 0 });
    expect(nodes.b).toMatchObject({ row: 1, column: 0 });
    expect(nodes.c).toMatchObject({ row: 1, column: 1 });
    expect(nodes.d).toMatchObject({ row: 2, column: 0 });
  });

  it('puts disjoint branches side by side, including lone lessons, ordered by their smallest id', () => {
    const nodes = byId(computeBranchLayout(['z', 'b', 'a', 'y'], [{ from: 'y', to: 'z' }]));
    // Branches: {a}, {b}, {y, z}. Each branch starts after the widest row of the previous ones.
    expect(nodes.a).toEqual({ id: 'a', branch: 0, column: 0, row: 0 });
    expect(nodes.b).toEqual({ id: 'b', branch: 1, column: 1, row: 0 });
    expect(nodes.y).toEqual({ id: 'y', branch: 2, column: 2, row: 0 });
    expect(nodes.z).toEqual({ id: 'z', branch: 2, column: 2, row: 1 });
  });

  it('ignores edges to lessons outside the milestone', () => {
    expect(byId(computeBranchLayout(['b'], [{ from: 'elsewhere', to: 'b' }])).b).toEqual({ id: 'b', branch: 0, column: 0, row: 0 });
  });

  it('throws on a cycle', () => {
    expect(() => computeBranchLayout(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])).toThrow(/Cycle/);
  });

  it('falls back to a flat layout on a cycle when asked to', () => {
    const cyclic = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
    expect(computeBranchLayout(['b', 'a', 'c'], cyclic, { flatOnCycle: true })).toEqual([
      { id: 'b', branch: 0, column: 0, row: 0 },
      { id: 'a', branch: 1, column: 1, row: 0 },
      { id: 'c', branch: 2, column: 2, row: 0 },
    ]);
  });
});
