import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { computeBranchLayout } from '../tutoring/branchLayout';
import { isLessonLocked, milestoneStates, nextLockedRank, type MilestoneState } from '../tutoring/gating';

export interface DoneState {
  completed: Set<string>;
  coveredVia: Map<string, Track>;
}

// Own completion is a stored row (any source). Shared completion: a concept-linked lesson
// (always in another track) with its own completion (spec: Completion).
export function loadDoneState(db: Database.Database): DoneState {
  const completed = new Set(
    (db.prepare('SELECT lesson_id FROM lesson_completions').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
  );
  const links = db
    .prepare(
      `SELECT c.lesson_a_id AS a, c.lesson_b_id AS b, la.track AS a_track, lb.track AS b_track
       FROM lesson_concept_links c
       JOIN lessons la ON la.id = c.lesson_a_id
       JOIN lessons lb ON lb.id = c.lesson_b_id
       ORDER BY c.id`
    )
    .all() as { a: string; b: string; a_track: Track; b_track: Track }[];
  const coveredVia = new Map<string, Track>();
  for (const link of links) {
    if (completed.has(link.a) && !completed.has(link.b) && !coveredVia.has(link.b)) coveredVia.set(link.b, link.a_track);
    if (completed.has(link.b) && !completed.has(link.a) && !coveredVia.has(link.a)) coveredVia.set(link.a, link.b_track);
  }
  return { completed, coveredVia };
}

export function loadPrerequisites(db: Database.Database): Map<string, { id: string; title: string }[]> {
  const rows = db
    .prepare(
      `SELECT lp.lesson_id, l.id, l.title FROM lesson_prerequisites lp
       JOIN lessons l ON l.id = lp.prerequisite_lesson_id
       ORDER BY lp.lesson_id, l.title`
    )
    .all() as { lesson_id: string; id: string; title: string }[];
  const map = new Map<string, { id: string; title: string }[]>();
  for (const row of rows) map.set(row.lesson_id, [...(map.get(row.lesson_id) ?? []), { id: row.id, title: row.title }]);
  return map;
}

export interface GatingMilestone {
  id: string;
  title: string;
  description: string | null;
  rank: number;
  lessonIds: string[];
}

export interface LevelGating {
  track: Track;
  level: CefrLevel;
  milestones: GatingMilestone[];
  states: Map<string, MilestoneState>;
  nextLockedRank: number | null;
  done: DoneState;
  isDone(lessonId: string): boolean;
  prerequisitesOf(lessonId: string): { id: string; title: string }[];
  unsortedIds: Set<string>;
  milestoneOf(lessonId: string): GatingMilestone | undefined;
  isLessonLocked(lessonId: string): boolean;
  lessonsInTreeOrder(): string[];
}

// Spec: Rules. One track+level's gating, loaded in a few queries.
export function loadLevelGating(db: Database.Database, track: Track, level: CefrLevel): LevelGating {
  const unsortedId = unsortedMilestoneId(track, level);
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.difficulty_rank AS rank, p.lesson_id
       FROM milestones m LEFT JOIN lesson_placements p ON p.milestone_id = m.id
       WHERE m.track = ? AND m.level = ?
       ORDER BY m.difficulty_rank, m.id, p.lesson_id`
    )
    .all(track, level) as { id: string; title: string; description: string | null; rank: number | null; lesson_id: string | null }[];

  const milestones: GatingMilestone[] = [];
  const unsortedIds = new Set<string>();
  const byId = new Map<string, GatingMilestone>();
  for (const row of rows) {
    if (row.id === unsortedId || row.rank === null) {
      if (row.lesson_id) unsortedIds.add(row.lesson_id);
      continue;
    }
    let milestone = byId.get(row.id);
    if (!milestone) {
      milestone = { id: row.id, title: row.title, description: row.description, rank: row.rank, lessonIds: [] };
      byId.set(row.id, milestone);
      milestones.push(milestone);
    }
    if (row.lesson_id) milestone.lessonIds.push(row.lesson_id);
  }

  const done = loadDoneState(db);
  const isDone = (id: string) => done.completed.has(id) || done.coveredVia.has(id);
  const prerequisites = loadPrerequisites(db);
  const states = milestoneStates(milestones, isDone);
  const milestoneOfLesson = new Map<string, GatingMilestone>();
  for (const m of milestones) for (const id of m.lessonIds) milestoneOfLesson.set(id, m);

  return {
    track,
    level,
    milestones,
    states,
    nextLockedRank: nextLockedRank(milestones, isDone),
    done,
    isDone,
    prerequisitesOf: (id) => prerequisites.get(id) ?? [],
    unsortedIds,
    milestoneOf: (id) => milestoneOfLesson.get(id),
    isLessonLocked(id) {
      const milestone = milestoneOfLesson.get(id);
      if (!milestone) return false;
      return isLessonLocked(
        {
          lessonId: id,
          milestoneState: states.get(milestone.id)!,
          prerequisiteIds: (prerequisites.get(id) ?? []).map((p) => p.id),
          unsortedIds,
        },
        isDone
      );
    },
    lessonsInTreeOrder() {
      return milestones.flatMap((m) => {
        const inside = m.lessonIds.flatMap((id) =>
          (prerequisites.get(id) ?? []).filter((p) => m.lessonIds.includes(p.id)).map((p) => ({ from: p.id, to: id }))
        );
        return computeBranchLayout(m.lessonIds, inside)
          .sort((a, b) => a.row - b.row || a.column - b.column)
          .map((n) => n.id);
      });
    },
  };
}

export type LessonLock =
  | { locked: false }
  | {
      locked: true;
      reason: 'milestone' | 'prerequisites';
      milestone: { id: string; title: string };
      missingPrerequisites: { id: string; title: string }[];
    };

// Spec: Server Enforcement. A lesson in Unsorted, or in no milestone, is never locked.
export function lessonLock(db: Database.Database, lessonId: string): LessonLock {
  const placement = db
    .prepare(
      `SELECT m.track, m.level FROM lesson_placements p JOIN milestones m ON m.id = p.milestone_id
       WHERE p.lesson_id = ? AND m.difficulty_rank IS NOT NULL`
    )
    .get(lessonId) as { track: Track; level: CefrLevel } | undefined;
  if (!placement) return { locked: false };
  const gating = loadLevelGating(db, placement.track, placement.level);
  if (!gating.isLessonLocked(lessonId)) return { locked: false };
  const milestone = gating.milestoneOf(lessonId)!;
  if (gating.states.get(milestone.id) === 'locked') {
    const blocking = gating.milestones.find((m) => m.rank < milestone.rank && gating.states.get(m.id) !== 'complete') ?? milestone;
    return { locked: true, reason: 'milestone', milestone: { id: blocking.id, title: blocking.title }, missingPrerequisites: [] };
  }
  return {
    locked: true,
    reason: 'prerequisites',
    milestone: { id: milestone.id, title: milestone.title },
    missingPrerequisites: gating.prerequisitesOf(lessonId).filter((p) => !gating.unsortedIds.has(p.id) && !gating.isDone(p.id)),
  };
}
