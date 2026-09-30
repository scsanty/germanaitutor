import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

export function unsortedMilestoneId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}-unsorted`;
}

/**
 * Ensures the reserved, non-deletable "Unsorted" milestone exists for this track+level — the
 * admin-only shelf lessons move to when their milestone is deleted. It has no rank and never
 * gates anything. Idempotent.
 */
export function ensureUnsortedExists(db: Database.Database, track: Track, level: CefrLevel): { milestoneId: string } {
  const milestoneId = unsortedMilestoneId(track, level);
  db.prepare(
    `INSERT OR IGNORE INTO milestones (id, track, level, title, description, difficulty_rank)
     VALUES (?, ?, ?, 'Unsorted', NULL, NULL)`
  ).run(milestoneId, track, level);
  return { milestoneId };
}
