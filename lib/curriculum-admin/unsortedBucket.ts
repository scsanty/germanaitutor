import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

export function unsortedMilestoneId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}-unsorted`;
}

/**
 * Ensures the reserved, non-deletable "Unsorted" milestone+section exist for this
 * track+level — the safety bucket lessons are relocated to when their milestone/section
 * is deleted. Idempotent; safe to call on every structure load (see getTrackStructure).
 */
export function ensureUnsortedExists(
  db: Database.Database,
  track: Track,
  level: CefrLevel
): { milestoneId: string; sectionId: string } {
  const milestoneId = unsortedMilestoneId(track, level);
  const sectionId = `${milestoneId}-section`;

  const existing = db.prepare('SELECT id FROM milestones WHERE id = ?').get(milestoneId);
  if (!existing) {
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, NULL, 0)'
    ).run(milestoneId, track, level, 'Unsorted');
    db.prepare(
      'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, NULL, 0)'
    ).run(sectionId, milestoneId, 'Unsorted');
  }
  return { milestoneId, sectionId };
}
