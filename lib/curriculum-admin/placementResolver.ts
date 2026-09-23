import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { randomSuffix } from './randomId';

export type PlacementInput =
  | { sectionId: string }
  | { milestoneId: string; newSectionTitle: string }
  | { newMilestoneTitle: string; newSectionTitle: string };

/**
 * Resolves an Add/Edit form's placement choice into a concrete sectionId, creating a new
 * milestone and/or section inline if requested. Caller is expected to run this inside the
 * same transaction as the lesson write it's for, so a failure elsewhere in that write
 * rolls back any milestone/section this created too (see Task 9).
 */
export function resolvePlacement(db: Database.Database, track: Track, level: CefrLevel, input: PlacementInput): string {
  if ('sectionId' in input) {
    const section = db.prepare('SELECT id FROM sections WHERE id = ?').get(input.sectionId);
    if (!section) throw new Error(`Section not found: ${input.sectionId}`);
    return input.sectionId;
  }

  let milestoneId: string;
  if ('milestoneId' in input) {
    const milestone = db.prepare('SELECT id FROM milestones WHERE id = ?').get(input.milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${input.milestoneId}`);
    milestoneId = input.milestoneId;
  } else {
    milestoneId = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM milestones WHERE track = ? AND level = ?')
      .get(track, level) as { m: number };
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, NULL, ?)'
    ).run(milestoneId, track, level, input.newMilestoneTitle, maxOrder.m + 1);
  }

  const sectionId = `${milestoneId}-${randomSuffix()}`;
  const maxSectionOrder = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM sections WHERE milestone_id = ?')
    .get(milestoneId) as { m: number };
  db.prepare(
    'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, NULL, ?)'
  ).run(sectionId, milestoneId, input.newSectionTitle, maxSectionOrder.m + 1);
  return sectionId;
}
