export interface DiagramNode {
  id: string;
  column: number;
  row: number;
}

/**
 * Pure topological-layering layout for the read-only dependency diagram (spec
 * "Dependency Diagram"). A lesson's column is 1 + the max column among its
 * prerequisites, or 0 if it has none; lessons sharing a column stack into
 * distinct rows in id order for a stable, deterministic layout.
 */
export function computeDiagramLayout(
  lessonIds: string[],
  prerequisites: { lessonId: string; prerequisiteLessonId: string }[]
): DiagramNode[] {
  const prereqsOf = new Map<string, string[]>();
  for (const id of lessonIds) prereqsOf.set(id, []);
  for (const p of prerequisites) {
    if (prereqsOf.has(p.lessonId)) prereqsOf.get(p.lessonId)!.push(p.prerequisiteLessonId);
  }

  const columnCache = new Map<string, number>();
  const visiting = new Set<string>();

  function columnOf(id: string): number {
    if (columnCache.has(id)) return columnCache.get(id)!;
    if (visiting.has(id)) throw new Error(`Cycle detected involving lesson ${id}`);
    visiting.add(id);
    const prereqs = prereqsOf.get(id) ?? [];
    const column = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(columnOf));
    visiting.delete(id);
    columnCache.set(id, column);
    return column;
  }

  const byColumn = new Map<number, string[]>();
  for (const id of lessonIds) {
    const column = columnOf(id);
    if (!byColumn.has(column)) byColumn.set(column, []);
    byColumn.get(column)!.push(id);
  }

  const result: DiagramNode[] = [];
  for (const [column, ids] of byColumn) {
    const sortedIds = [...ids].sort();
    sortedIds.forEach((id, row) => result.push({ id, column, row }));
  }
  return result;
}
