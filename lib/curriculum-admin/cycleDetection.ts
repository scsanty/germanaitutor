import type Database from 'better-sqlite3';

/**
 * True if adding the edge "lessonId requires newPrerequisiteId" to lesson_prerequisites
 * would create a cycle — i.e. newPrerequisiteId can already (directly or transitively)
 * reach lessonId by following existing "requires" edges forward.
 */
export function wouldCreateCycle(db: Database.Database, lessonId: string, newPrerequisiteId: string): boolean {
  if (lessonId === newPrerequisiteId) return true;

  const visited = new Set<string>();
  const stack = [newPrerequisiteId];
  const getPrereqs = db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?');

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === lessonId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = getPrereqs.all(current) as { prerequisite_lesson_id: string }[];
    for (const row of rows) stack.push(row.prerequisite_lesson_id);
  }
  return false;
}
