import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';

export const SEED_FORMAT_VERSION = 2;

export interface SeedMilestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  difficultyRank: number;
}

export interface SeedFile {
  seedVersion: string;
  formatVersion: 2;
  track: Track;
  level: CefrLevel;
  milestones: { milestone: SeedMilestone; lessonIds: string[] }[];
  lessons: {
    id: string;
    track: Track;
    sourceLevel: CefrLevel;
    skill: string;
    title: string;
    explanation: string | null;
    examples: string[] | null;
  }[];
  exercises: { id: string; lessonId: string; track: Track | null; type: string; content: unknown }[];
  prerequisites: { lessonId: string; prerequisiteLessonId: string }[];
  conceptLinks?: { lessonAId: string; lessonBId: string }[];
  practice?: { id: string; lessonId: string; type: string; content: unknown }[];
}

function readSeedFile(path: string, name: string): SeedFile {
  const seed = JSON.parse(readFileSync(path, 'utf8')) as SeedFile & { formatVersion?: unknown };
  if (seed.formatVersion !== SEED_FORMAT_VERSION) {
    throw new Error(`Seed file ${name} uses format ${String(seed.formatVersion ?? 'none')}; this app needs format ${SEED_FORMAT_VERSION} (milestones without sections)`);
  }
  return seed;
}

function getCurrentSeedVersion(db: Database.Database): string {
  const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as { seed_version: string } | undefined;
  return row?.seed_version ?? '0';
}

// Spec: Seed Format v2, Loader. The file is the authority for its track+level's structure:
// its milestones are upserted, its lessons placed, and every other milestone of that
// track+level is removed after its lessons move to Unsorted. Unsorted is never removed.
function replaceStructure(db: Database.Database, seed: SeedFile): void {
  const { milestoneId: unsortedId } = ensureUnsortedExists(db, seed.track, seed.level);
  const upsertMilestone = db.prepare(
    `INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description,
       difficulty_rank = excluded.difficulty_rank`
  );
  const place = db.prepare(
    `INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET milestone_id = excluded.milestone_id`
  );

  for (const { milestone, lessonIds } of seed.milestones) {
    upsertMilestone.run(milestone.id, milestone.track, milestone.level, milestone.title, milestone.description, milestone.difficultyRank);
    for (const lessonId of lessonIds) place.run(lessonId, milestone.id);
  }

  const keep = new Set([unsortedId, ...seed.milestones.map((m) => m.milestone.id)]);
  const stale = (
    db.prepare('SELECT id FROM milestones WHERE track = ? AND level = ?').all(seed.track, seed.level) as { id: string }[]
  )
    .map((r) => r.id)
    .filter((id) => !keep.has(id));
  for (const id of stale) {
    db.prepare('UPDATE lesson_placements SET milestone_id = ? WHERE milestone_id = ?').run(unsortedId, id);
    db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
  }

  // A lesson in the file but in no milestone (an exported Unsorted lesson) lands in Unsorted.
  const placed = db.prepare('SELECT 1 FROM lesson_placements WHERE lesson_id = ?');
  for (const lesson of seed.lessons) {
    if (!placed.get(lesson.id)) place.run(lesson.id, unsortedId);
  }
}

function upsertSeedFile(db: Database.Database, seed: SeedFile): void {
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, explanation = excluded.explanation, examples = excluded.examples`
  );
  const upsertExercise = db.prepare(
    `INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content`
  );
  const upsertPrerequisite = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );

  // Lessons first: placements reference lessons(id).
  for (const lesson of seed.lessons) {
    upsertLesson.run(
      lesson.id,
      lesson.track,
      lesson.sourceLevel,
      lesson.skill,
      lesson.title,
      lesson.explanation,
      lesson.examples ? JSON.stringify(lesson.examples) : null
    );
  }
  replaceStructure(db, seed);
  for (const exercise of seed.exercises) {
    upsertExercise.run(exercise.id, exercise.lessonId, exercise.track, exercise.type, JSON.stringify(exercise.content));
  }
  for (const prereq of seed.prerequisites) {
    upsertPrerequisite.run(prereq.lessonId, prereq.prerequisiteLessonId);
  }

  // Each link is listed in both files it touches; a pair whose other lesson hasn't
  // loaded yet is skipped here and inserted when that lesson's file loads.
  const lessonExists = db.prepare('SELECT 1 FROM lessons WHERE id = ?');
  const insertLink = db.prepare('INSERT OR IGNORE INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)');
  for (const link of seed.conceptLinks ?? []) {
    const [a, b] = link.lessonAId < link.lessonBId ? [link.lessonAId, link.lessonBId] : [link.lessonBId, link.lessonAId];
    if (a === b || !lessonExists.get(a) || !lessonExists.get(b)) continue;
    insertLink.run(a, b);
  }

  // Tutoring Phase 2: approved practice exercises travel with the curriculum. An existing pool
  // row (any status) is never overwritten, so an install's own review decisions stand.
  const insertPractice = db.prepare(
    `INSERT OR IGNORE INTO practice_exercises (id, lesson_id, type, content, review_status, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, 'approved', ?, ?)`
  );
  const practiceAt = new Date().toISOString();
  for (const item of seed.practice ?? []) {
    if (!lessonExists.get(item.lessonId)) continue;
    insertPractice.run(item.id, item.lessonId, item.type, JSON.stringify(item.content), practiceAt, practiceAt);
  }
}

export function loadSeedIfNeeded(db: Database.Database, seedDir: string): void {
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  // Read and validate every file before touching the database.
  const seeds = files.map((file) => readSeedFile(join(seedDir, file), file));
  const bundledVersion = seeds[0].seedVersion;
  if (bundledVersion === getCurrentSeedVersion(db)) return;

  db.transaction(() => {
    for (const seed of seeds) upsertSeedFile(db, seed);
    db.prepare(
      `INSERT INTO curriculum_meta (id, seed_version, last_synced_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET seed_version = excluded.seed_version, last_synced_at = excluded.last_synced_at`
    ).run(bundledVersion);
  })();
}
