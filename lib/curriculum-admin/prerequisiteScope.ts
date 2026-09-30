import type Database from 'better-sqlite3';
import { prerequisiteScopeViolations, type PlacementInfo } from '../tutoring/gating';

interface PlacedLesson extends PlacementInfo {
  title: string;
  scope: string;
}

// Spec: Prerequisite scope. Checks every edge that touches the given lessons, as the dependent
// or as the prerequisite, and returns one readable message per violation.
export function scopeViolationMessages(db: Database.Database, lessonIds: string[]): string[] {
  if (lessonIds.length === 0) return [];
  const marks = lessonIds.map(() => '?').join(', ');
  const edges = db
    .prepare(
      `SELECT lesson_id AS lessonId, prerequisite_lesson_id AS prerequisiteId FROM lesson_prerequisites
       WHERE lesson_id IN (${marks}) OR prerequisite_lesson_id IN (${marks})
       ORDER BY lesson_id, prerequisite_lesson_id`
    )
    .all(...lessonIds, ...lessonIds) as { lessonId: string; prerequisiteId: string }[];

  const placementStmt = db.prepare(
    `SELECT l.title, p.milestone_id AS milestoneId, m.difficulty_rank AS rank, l.track || '/' || l.source_level AS scope
     FROM lessons l
     LEFT JOIN lesson_placements p ON p.lesson_id = l.id
     LEFT JOIN milestones m ON m.id = p.milestone_id
     WHERE l.id = ?`
  );
  const cache = new Map<string, PlacedLesson | undefined>();
  function placed(id: string): PlacedLesson | undefined {
    if (!cache.has(id)) {
      const row = placementStmt.get(id) as PlacedLesson | undefined;
      cache.set(id, row && row.milestoneId ? row : undefined);
    }
    return cache.get(id);
  }
  const title = (id: string) =>
    placed(id)?.title ?? (db.prepare('SELECT title FROM lessons WHERE id = ?').get(id) as { title: string } | undefined)?.title ?? id;

  const messages: string[] = [];
  const sameScope = edges.filter((e) => {
    const a = placed(e.lessonId);
    const b = placed(e.prerequisiteId);
    if (a && b && a.scope !== b.scope) {
      messages.push(`${title(e.lessonId)} builds on ${title(e.prerequisiteId)}, which is in another track or level`);
      return false;
    }
    return true;
  });
  for (const e of prerequisiteScopeViolations(sameScope, placed)) {
    messages.push(`${title(e.lessonId)} builds on ${title(e.prerequisiteId)}, which is in a later or parallel milestone`);
  }
  return messages.sort();
}

export function assertPrerequisiteScope(db: Database.Database, lessonIds: string[]): void {
  const messages = scopeViolationMessages(db, lessonIds);
  if (messages.length > 0) throw new Error(messages.join('; '));
}
