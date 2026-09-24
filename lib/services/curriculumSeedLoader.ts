import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

export interface SeedFile {
  seedVersion: string;
  track: Track;
  level: CefrLevel;
  milestones: {
    milestone: { id: string; track: Track; level: CefrLevel; title: string; description: string | null; orderIndex: number };
    sections: {
      section: { id: string; milestoneId: string; title: string; description: string | null; orderIndex: number };
      lessonRefs: { lessonId: string; orderIndex: number }[];
    }[];
  }[];
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
}

function getCurrentSeedVersion(db: Database.Database): string {
  const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as
    | { seed_version: string }
    | undefined;
  return row?.seed_version ?? '0';
}

function upsertSeedFile(db: Database.Database, seed: SeedFile): void {
  const upsertMilestone = db.prepare(
    `INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, order_index = excluded.order_index`
  );
  const upsertSection = db.prepare(
    `INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, order_index = excluded.order_index`
  );
  // lesson_placements has a UNIQUE(lesson_id) constraint (a lesson belongs to exactly one
  // section, per lib/db/schema.ts's migrateConceptIdAndPlacementUniqueness) rather than
  // UNIQUE(lesson_id, section_id), so a re-seeded lesson that moved sections updates its
  // existing placement row's section_id in place instead of conflicting on a stale pair.
  const upsertPlacement = db.prepare(
    `INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET section_id = excluded.section_id, order_index = excluded.order_index`
  );
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

  // Lessons must be upserted before milestones/sections/placements: lesson_placements has a
  // foreign key on lessons(id), so inserting a placement before its lesson exists would fail.
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

  for (const { milestone, sections } of seed.milestones) {
    upsertMilestone.run(
      milestone.id,
      milestone.track,
      milestone.level,
      milestone.title,
      milestone.description,
      milestone.orderIndex
    );
    for (const { section, lessonRefs } of sections) {
      upsertSection.run(section.id, section.milestoneId, section.title, section.description, section.orderIndex);
      for (const ref of lessonRefs) {
        upsertPlacement.run(ref.lessonId, section.id, ref.orderIndex);
      }
    }
  }

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
}

export function loadSeedIfNeeded(db: Database.Database, seedDir: string): void {
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const firstSeed = JSON.parse(readFileSync(join(seedDir, files[0]), 'utf8')) as SeedFile;
  const bundledVersion = firstSeed.seedVersion;
  const currentVersion = getCurrentSeedVersion(db);
  if (bundledVersion === currentVersion) return;

  const applyAll = db.transaction(() => {
    for (const file of files) {
      const seed = JSON.parse(readFileSync(join(seedDir, file), 'utf8')) as SeedFile;
      upsertSeedFile(db, seed);
    }
    db.prepare(
      `INSERT INTO curriculum_meta (id, seed_version, last_synced_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET seed_version = excluded.seed_version, last_synced_at = excluded.last_synced_at`
    ).run(bundledVersion);
  });
  applyAll();
}
