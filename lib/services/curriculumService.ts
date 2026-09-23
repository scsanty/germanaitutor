import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone, Section, Lesson, Exercise, ExerciseContent, LessonPrerequisite } from '../curriculum/types';
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  order_index: number;
}

interface SectionRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  order_index: number;
}

interface LessonRow {
  id: string;
  track: Track;
  source_level: CefrLevel;
  skill: Lesson['skill'];
  title: string;
  explanation: string | null;
  examples: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: Exercise['type'];
  content: string;
}

function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToSection(row: SectionRow): Section {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    track: row.track,
    sourceLevel: row.source_level,
    skill: row.skill,
    title: row.title,
    explanation: row.explanation,
    examples: row.examples ? JSON.parse(row.examples) : null,
    createdAt: row.created_at,
  };
}

function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    track: row.track,
    type: row.type,
    content: JSON.parse(row.content) as ExerciseContent,
  };
}

export function createCurriculumService(db: Database.Database) {
  function listTracks(): { track: Track; levels: CefrLevel[] }[] {
    const rows = db
      .prepare('SELECT DISTINCT track, level FROM milestones ORDER BY track, level')
      .all() as { track: Track; level: CefrLevel }[];
    const byTrack = new Map<Track, CefrLevel[]>();
    for (const row of rows) {
      const levels = byTrack.get(row.track) ?? [];
      levels.push(row.level);
      byTrack.set(row.track, levels);
    }
    return Array.from(byTrack.entries()).map(([track, levels]) => ({ track, levels }));
  }

  function getTrackStructure(
    track: Track,
    level: CefrLevel
  ): { milestone: Milestone; sections: { section: Section; lessons: Lesson[] }[] }[] {
    ensureUnsortedExists(db, track, level);
    const unsortedId = unsortedMilestoneId(track, level);
    const milestoneRows = db
      .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY (id = ?) ASC, order_index ASC')
      .all(track, level, unsortedId) as MilestoneRow[];

    return milestoneRows.map((milestoneRow) => {
      const sectionRows = db
        .prepare('SELECT * FROM sections WHERE milestone_id = ? ORDER BY order_index')
        .all(milestoneRow.id) as SectionRow[];

      const sections = sectionRows.map((sectionRow) => {
        const lessonRows = db
          .prepare(
            `SELECT lessons.* FROM lessons
             JOIN lesson_placements ON lesson_placements.lesson_id = lessons.id
             WHERE lesson_placements.section_id = ?
             ORDER BY lesson_placements.order_index`
          )
          .all(sectionRow.id) as LessonRow[];
        return { section: rowToSection(sectionRow), lessons: lessonRows.map(rowToLesson) };
      });

      return { milestone: rowToMilestone(milestoneRow), sections };
    });
  }

  // `track` is accepted for API-shape compatibility (callers already pass the track they're
  // browsing) but no longer changes what's returned: since the curriculum import moved from
  // one shared lesson per concept to independent lessons per track (see
  // docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md), a lesson's id already
  // determines its track, and there is no override/fallback content to resolve.
  function getLesson(lessonId: string, _track: Track): Lesson | null {
    const lessonRow = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as LessonRow | undefined;
    return lessonRow ? rowToLesson(lessonRow) : null;
  }

  function getExercises(lessonId: string, _track: Track): Exercise[] {
    const rows = db.prepare('SELECT * FROM exercises WHERE lesson_id = ?').all(lessonId) as ExerciseRow[];
    return rows.map(rowToExercise);
  }

  function getPrerequisites(lessonId: string): LessonPrerequisite[] {
    const rows = db
      .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?')
      .all(lessonId) as { lesson_id: string; prerequisite_lesson_id: string }[];
    return rows.map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
  }

  return { listTracks, getTrackStructure, getLesson, getExercises, getPrerequisites };
}

export type CurriculumService = ReturnType<typeof createCurriculumService>;
