export interface BranchNode {
  id: string;
  // index of the connected component, ordered by each component's smallest lesson id
  branch: number;
  // global grid column: branches sit side by side
  column: number;
  // depth: 0 for a lesson with no prerequisite inside the milestone
  row: number;
}

// Spec: Branch layout. Pure and deterministic, so the tree renders the same every time.
export function computeBranchLayout(lessonIds: string[], edges: { from: string; to: string }[]): BranchNode[] {
  const ids = new Set(lessonIds);
  const inside = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const prereqsOf = new Map<string, string[]>(lessonIds.map((id) => [id, []]));
  const neighbours = new Map<string, string[]>(lessonIds.map((id) => [id, []]));
  for (const edge of inside) {
    prereqsOf.get(edge.to)!.push(edge.from);
    neighbours.get(edge.to)!.push(edge.from);
    neighbours.get(edge.from)!.push(edge.to);
  }

  const rowCache = new Map<string, number>();
  const visiting = new Set<string>();
  function rowOf(id: string): number {
    const cached = rowCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) throw new Error(`Cycle detected involving lesson ${id}`);
    visiting.add(id);
    const prereqs = prereqsOf.get(id)!;
    const row = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(rowOf));
    visiting.delete(id);
    rowCache.set(id, row);
    return row;
  }

  // Connected components of the undirected graph.
  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  for (const start of [...lessonIds].sort()) {
    if (componentOf.has(start)) continue;
    const members: string[] = [];
    const stack = [start];
    componentOf.set(start, components.length);
    while (stack.length > 0) {
      const id = stack.pop()!;
      members.push(id);
      for (const next of neighbours.get(id)!) {
        if (!componentOf.has(next)) {
          componentOf.set(next, components.length);
          stack.push(next);
        }
      }
    }
    components.push(members);
  }

  const result: BranchNode[] = [];
  let offset = 0;
  components.forEach((members, branch) => {
    const byRow = new Map<number, string[]>();
    for (const id of members) {
      const row = rowOf(id);
      byRow.set(row, [...(byRow.get(row) ?? []), id]);
    }
    let width = 0;
    for (const [row, rowIds] of byRow) {
      rowIds.sort();
      rowIds.forEach((id, index) => result.push({ id, branch, column: offset + index, row }));
      width = Math.max(width, rowIds.length);
    }
    offset += width;
  });
  return result;
}
