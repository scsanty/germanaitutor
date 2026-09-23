import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { randomSuffix } from './randomId';
import { ensureUnsortedExists, unsortedMilestoneId } from './unsortedBucket';

export type PlacementInput =
  | { sectionId: string }
  | { milestoneId: string; newSectionTitle: string }
  | { newMilestoneTitle: string; newSectionTitle: string };

export type PlacementMode = 'create' | 'update';

/**
 * Resolves an Add/Edit form's placement choice into a concrete sectionId, creating a new
 * milestone and/or section inline if requested. Caller is expected to run this inside the
 * same transaction as the lesson write it's for, so a failure elsewhere in that write
 * rolls back any milestone/section this created too (see Task 9).
 *
 * `mode` distinguishes a brand-new lesson from an edit of an existing one: creating a lesson
 * directly into the Unsorted bucket is rejected (a new lesson must be filed under a real
 * section), but an existing lesson may still be shelved into Unsorted via update — that's the
 * intentional escape hatch used when its milestone/section has been deleted out from under it.
 * Inline-creating a *new* section under Unsorted is never allowed, on create or update.
 */
export function resolvePlacement(
  db: Database.Database,
  track: Track,
  level: CefrLevel,
  input: PlacementInput,
  mode: PlacementMode
): string {
  if ('sectionId' in input) {
    const section = db
      .prepare(
        `SELECT sections.id as id, milestones.track as track, milestones.level as level
         FROM sections JOIN milestones ON milestones.id = sections.milestone_id
         WHERE sections.id = ?`
      )
      .get(input.sectionId) as { id: string; track: Track; level: CefrLevel } | undefined;
    if (!section) throw new Error(`Section not found: ${input.sectionId}`);
    if (section.track !== track || section.level !== level) {
      throw new Error(
        `Section ${input.sectionId} belongs to ${section.track}/${section.level}, not ${track}/${level}`
      );
    }
    if (mode === 'create') {
      const { sectionId: unsortedSectionId } = ensureUnsortedExists(db, track, level);
      if (input.sectionId === unsortedSectionId) {
        throw new Error('Cannot create a lesson directly in the Unsorted section');
      }
    }
    return input.sectionId;
  }

  let milestoneId: string;
  if ('milestoneId' in input) {
    const milestone = db.prepare('SELECT id, track, level FROM milestones WHERE id = ?').get(input.milestoneId) as
      | { id: string; track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${input.milestoneId}`);
    if (milestone.track !== track || milestone.level !== level) {
      throw new Error(
        `Milestone ${input.milestoneId} belongs to ${milestone.track}/${milestone.level}, not ${track}/${level}`
      );
    }
    if (input.milestoneId === unsortedMilestoneId(track, level)) {
      throw new Error('Cannot create a section under the Unsorted milestone');
    }
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
