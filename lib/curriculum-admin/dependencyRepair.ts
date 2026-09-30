import type Database from 'better-sqlite3';
import { prerequisiteScopeViolations, type PlacementInfo } from '../tutoring/gating';

export interface RepairEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

export interface RepairPreview {
  edgesToAdd: RepairEdge[];
  edgesToRemove: RepairEdge[];
  // Bridges the repair refuses to add: the deleted lesson sat in Unsorted, or the bridge would
  // break the prerequisite scope rule and could deadlock a level.
  skippedBridges: RepairEdge[];
}

interface Placement extends PlacementInfo {
  scope: string;
}

function placementLookup(db: Database.Database) {
  const stmt = db.prepare(
    `SELECT p.milestone_id AS milestoneId, m.difficulty_rank AS rank, m.track || '/' || m.level AS scope
     FROM lesson_placements p JOIN milestones m ON m.id = p.milestone_id WHERE p.lesson_id = ?`
  );
  return (id: string) => stmt.get(id) as Placement | undefined;
}

/**
 * Read-only. Computes the fan-out/fan-in reconnection for deleting `lessonId`: every
 * dependent of it gets a direct edge to every one of its own prerequisites (deduped
 * against edges that already exist independently), and all edges touching it are queued
 * for removal. See spec "Dependency Repair Algorithm".
 */
export function computeRepairPreview(db: Database.Database, lessonId: string): RepairPreview {
  const pre = (
    db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(lessonId) as {
      prerequisite_lesson_id: string;
    }[]
  ).map((r) => r.prerequisite_lesson_id);

  const dep = (
    db.prepare('SELECT lesson_id FROM lesson_prerequisites WHERE prerequisite_lesson_id = ?').all(lessonId) as {
      lesson_id: string;
    }[]
  ).map((r) => r.lesson_id);

  const edgeExists = db.prepare(
    'SELECT 1 FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?'
  );

  const placementOf = placementLookup(db);
  const deletedInUnsorted = placementOf(lessonId)?.rank === null;

  const edgesToAdd: RepairEdge[] = [];
  const edgesToRemove: RepairEdge[] = [];
  const skippedBridges: RepairEdge[] = [];

  for (const c of dep) {
    edgesToRemove.push({ lessonId: c, prerequisiteLessonId: lessonId });
    for (const a of pre) {
      if (c === a) continue;
      if (edgeExists.get(c, a)) continue;
      const bridge = { lessonId: c, prerequisiteLessonId: a };
      const from = placementOf(c);
      const to = placementOf(a);
      const crossScope = !!from && !!to && from.scope !== to.scope;
      const outOfScope =
        prerequisiteScopeViolations([{ lessonId: c, prerequisiteId: a }], placementOf).length > 0;
      if (deletedInUnsorted || crossScope || outOfScope) skippedBridges.push(bridge);
      else edgesToAdd.push(bridge);
    }
  }

  for (const a of pre) {
    edgesToRemove.push({ lessonId, prerequisiteLessonId: a });
  }

  return { edgesToAdd, edgesToRemove, skippedBridges };
}

/**
 * Recomputes the repair preview against live state (so a caller applying this across
 * several lessons in one transaction sees each prior lesson's repair reflected), applies
 * the edge changes, then deletes the lesson row itself. Placement, exercises, and
 * concept-links follow via their existing ON DELETE CASCADE.
 */
export function applyRepairAndDelete(db: Database.Database, lessonId: string): void {
  const { edgesToAdd, edgesToRemove } = computeRepairPreview(db, lessonId);

  const removeEdge = db.prepare(
    'DELETE FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?'
  );
  const addEdge = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );

  for (const e of edgesToRemove) removeEdge.run(e.lessonId, e.prerequisiteLessonId);
  for (const e of edgesToAdd) addEdge.run(e.lessonId, e.prerequisiteLessonId);

  db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
}
