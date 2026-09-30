import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone } from '../curriculum/types';
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { randomSuffix } from '../curriculum-admin/randomId';

export interface DisplacedLesson {
  id: string;
  title: string;
}

export interface MilestoneDeletePreview {
  lessons: DisplacedLesson[];
}

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  difficulty_rank: number | null;
}

export function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    difficultyRank: row.difficulty_rank,
  };
}

// Spec: a difficulty rank is a whole number of 1 or more.
export function assertValidRank(rank: unknown): number {
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) {
    throw new Error('Difficulty rank must be a whole number of 1 or more');
  }
  return rank;
}

export function createCurriculumStructureService(db: Database.Database) {
  function getMilestone(id: string): Milestone {
    const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow | undefined;
    if (!row) throw new Error(`Milestone not found: ${id}`);
    return rowToMilestone(row);
  }

  function assertNotUnsorted(milestone: Milestone): void {
    if (milestone.id === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('The Unsorted milestone cannot be changed');
    }
  }

  function createMilestone(
    track: Track,
    level: CefrLevel,
    title: string,
    description: string | null,
    difficultyRank: unknown
  ): Milestone {
    const rank = assertValidRank(difficultyRank);
    if (!title?.trim()) throw new Error('A milestone needs a title');
    const id = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, track, level, title.trim(), description, rank);
    return getMilestone(id);
  }

  function updateMilestone(
    id: string,
    input: { title: string; description: string | null; difficultyRank: unknown }
  ): Milestone {
    const milestone = getMilestone(id);
    assertNotUnsorted(milestone);
    const rank = assertValidRank(input.difficultyRank);
    if (!input.title?.trim()) throw new Error('A milestone needs a title');
    db.prepare('UPDATE milestones SET title = ?, description = ?, difficulty_rank = ? WHERE id = ?').run(
      input.title.trim(),
      input.description,
      rank,
      id
    );
    return getMilestone(id);
  }

  function previewMilestoneDelete(id: string): MilestoneDeletePreview {
    return {
      lessons: db
        .prepare(
          'SELECT l.id, l.title FROM lesson_placements p JOIN lessons l ON l.id = p.lesson_id WHERE p.milestone_id = ? ORDER BY l.title'
        )
        .all(id) as DisplacedLesson[],
    };
  }

  // Its lessons move to Unsorted first: the placement foreign key would otherwise cascade them away.
  function deleteMilestone(id: string): void {
    const milestone = getMilestone(id);
    if (id === unsortedMilestoneId(milestone.track, milestone.level)) throw new Error('Cannot delete the Unsorted milestone');
    db.transaction(() => {
      const { milestoneId: unsortedId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      db.prepare('UPDATE lesson_placements SET milestone_id = ? WHERE milestone_id = ?').run(unsortedId, id);
      db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    })();
  }

  return { getMilestone, createMilestone, updateMilestone, previewMilestoneDelete, deleteMilestone };
}

export type CurriculumStructureService = ReturnType<typeof createCurriculumStructureService>;
