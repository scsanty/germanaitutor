import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { LEVELS, TRACKS } from '../tutoring/levels';
import type { SeedFile } from './curriculumSeedLoader';
import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';

export function seedFileName(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}.json`;
}

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  difficulty_rank: number | null;
  title_de: string;
  description_de: string | null;
}

interface LessonRow {
  id: string;
  track: Track;
  source_level: CefrLevel;
  skill: string;
  title: string;
  explanation: string | null;
  examples: string | null;
  title_de: string;
  explanation_de: string | null;
  examples_de: string | null;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: string;
  content: string;
}

export function createCurriculumExportService(db: Database.Database) {
  function currentSeedVersion(): string {
    const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as
      | { seed_version: string }
      | undefined;
    return row?.seed_version ?? '0';
  }

  // Reads directly rather than through getTrackStructure, which writes (it ensures Unsorted exists).
  function exportTrackLevel(track: Track, level: CefrLevel): SeedFile {
    const unsortedId = unsortedMilestoneId(track, level);
    const milestoneRows = (
      db
        .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY difficulty_rank, id')
        .all(track, level) as MilestoneRow[]
    ).filter((m) => m.id !== unsortedId && m.difficulty_rank !== null);
    const placedIn = db.prepare('SELECT lesson_id FROM lesson_placements WHERE milestone_id = ? ORDER BY lesson_id');

    const milestones = milestoneRows.map((m) => ({
      milestone: { id: m.id, track: m.track, level: m.level, title: m.title, titleDe: m.title_de, description: m.description, descriptionDe: m.description_de, difficultyRank: m.difficulty_rank! },
      lessonIds: (placedIn.all(m.id) as { lesson_id: string }[]).map((r) => r.lesson_id),
    }));
    // Unsorted lessons are exported as lessons in no milestone; the loader shelves them in Unsorted again.
    const lessonIds = [
      ...milestones.flatMap((m) => m.lessonIds),
      ...(placedIn.all(unsortedId) as { lesson_id: string }[]).map((r) => r.lesson_id),
    ];

    const lessonStmt = db.prepare('SELECT * FROM lessons WHERE id = ?');
    const lessons = lessonIds.map((id) => {
      const l = lessonStmt.get(id) as LessonRow;
      return {
        id: l.id,
        track: l.track,
        sourceLevel: l.source_level,
        skill: l.skill,
        title: l.title,
        explanation: l.explanation,
        examples: l.examples ? (JSON.parse(l.examples) as string[]) : null,
        titleDe: l.title_de,
        explanationDe: l.explanation_de,
        examplesDe: l.examples_de ? (JSON.parse(l.examples_de) as string[]) : null,
      };
    });

    const exerciseStmt = db.prepare('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY rowid');
    const exercises = lessonIds.flatMap((id) =>
      (exerciseStmt.all(id) as ExerciseRow[]).map((e) => ({
        id: e.id,
        lessonId: e.lesson_id,
        track: e.track,
        type: e.type,
        content: JSON.parse(e.content) as unknown,
      }))
    );

    const inFile = new Set(lessonIds);
    const prerequisites = (
      db
        .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites ORDER BY lesson_id, prerequisite_lesson_id')
        .all() as { lesson_id: string; prerequisite_lesson_id: string }[]
    )
      .filter((p) => inFile.has(p.lesson_id))
      .map((p) => ({ lessonId: p.lesson_id, prerequisiteLessonId: p.prerequisite_lesson_id }));

    const conceptLinks = (
      db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links ORDER BY lesson_a_id, lesson_b_id').all() as {
        lesson_a_id: string;
        lesson_b_id: string;
      }[]
    )
      .filter((c) => inFile.has(c.lesson_a_id) || inFile.has(c.lesson_b_id))
      .map((c) => ({ lessonAId: c.lesson_a_id, lessonBId: c.lesson_b_id }));

    const practiceStmt = db.prepare(
      "SELECT id, lesson_id, type, content FROM practice_exercises WHERE lesson_id = ? AND review_status = 'approved' ORDER BY created_at, rowid"
    );
    const practice = lessonIds.flatMap((id) =>
      (practiceStmt.all(id) as { id: string; lesson_id: string; type: string; content: string }[]).map((p) => ({
        id: p.id,
        lessonId: p.lesson_id,
        type: p.type,
        content: JSON.parse(p.content) as unknown,
      }))
    );

    return {
      seedVersion: currentSeedVersion(),
      formatVersion: 3 as const,
      track,
      level,
      milestones,
      lessons,
      exercises,
      prerequisites,
      conceptLinks,
      practice,
    };
  }

  function exportAll(): { fileName: string; seed: SeedFile }[] {
    return TRACKS.flatMap((track) =>
      LEVELS.map((level) => ({ fileName: seedFileName(track, level), seed: exportTrackLevel(track, level) }))
    );
  }

  return { exportTrackLevel, exportAll };
}
