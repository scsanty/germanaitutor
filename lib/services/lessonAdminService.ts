import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Skill, Lesson } from '../curriculum/types';
import { createCurriculumService } from './curriculumService';
import { wouldCreateCycle } from '../curriculum-admin/cycleDetection';
import { resolvePlacement, type PlacementInput } from '../curriculum-admin/placementResolver';
import { reconcileExercises, type ExerciseInput } from '../curriculum-admin/exerciseReconciliation';

export interface CreateLessonInput {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  exercises: ExerciseInput[];
  prerequisiteIds: string[];
  placement: PlacementInput;
}

export function createLessonAdminService(db: Database.Database) {
  const reads = createCurriculumService(db);

  function createLesson(input: CreateLessonInput): Lesson {
    const id = `${input.sourceLevel.toLowerCase()}-${input.slug}`;

    const run = db.transaction(() => {
      const existing = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(id);
      if (existing) throw new Error(`Lesson id already exists: ${id}`);

      db.prepare(
        'INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.explanation,
        input.examples ? JSON.stringify(input.examples) : null
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone/section resolvePlacement just created too — the whole
      // create is one atomic unit, and no inline-created structure is ever left orphaned.
      const sectionId = resolvePlacement(db, input.track, input.sourceLevel, input.placement);
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
        .get(sectionId) as { m: number };
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run(
        id,
        sectionId,
        maxOrder.m + 1
      );

      for (const prerequisiteId of input.prerequisiteIds) {
        if (wouldCreateCycle(db, id, prerequisiteId)) {
          throw new Error(`Adding prerequisite ${prerequisiteId} would create a cycle`);
        }
        db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
          id,
          prerequisiteId
        );
      }
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  return { createLesson };
}

export type LessonAdminService = ReturnType<typeof createLessonAdminService>;
