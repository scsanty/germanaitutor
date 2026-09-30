import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { randomSuffix } from './randomId';
import { unsortedMilestoneId } from './unsortedBucket';
import { assertValidRank } from '../services/curriculumStructureService';

export type PlacementInput = { milestoneId: string } | { newMilestoneTitle: string; newMilestoneRank: number };

export type PlacementMode = 'create' | 'update';

/**
 * Resolves an Add/Edit form's placement choice into a milestone id, creating a new milestone
 * inline if asked. Callers run it inside the lesson write's transaction, so a later failure rolls
 * the new milestone back too. Creating a lesson directly into Unsorted is rejected; moving an
 * existing lesson there on update is the intended escape hatch.
 */
export function resolvePlacement(
  db: Database.Database,
  track: Track,
  level: CefrLevel,
  input: PlacementInput,
  mode: PlacementMode
): string {
  if ('milestoneId' in input) {
    const milestone = db.prepare('SELECT id, track, level FROM milestones WHERE id = ?').get(input.milestoneId) as
      | { id: string; track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${input.milestoneId}`);
    if (milestone.track !== track || milestone.level !== level) {
      throw new Error(`Milestone ${input.milestoneId} belongs to ${milestone.track}/${milestone.level}, not ${track}/${level}`);
    }
    if (mode === 'create' && input.milestoneId === unsortedMilestoneId(track, level)) {
      throw new Error('Cannot create a lesson directly in the Unsorted milestone');
    }
    return input.milestoneId;
  }

  const rank = assertValidRank(input.newMilestoneRank);
  if (!input.newMilestoneTitle.trim()) throw new Error('A new milestone needs a title');
  const milestoneId = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
  db.prepare(
    'INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, NULL, ?)'
  ).run(milestoneId, track, level, input.newMilestoneTitle.trim(), rank);
  return milestoneId;
}
