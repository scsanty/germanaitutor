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

export interface UpdateLessonInput {
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

  function updateLesson(id: string, input: UpdateLessonInput): Lesson {
    const run = db.transaction(() => {
      const current = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(id) as
        | { track: Track; source_level: CefrLevel }
        | undefined;
      if (!current) throw new Error(`Lesson not found: ${id}`);

      const trackOrLevelChanged = current.track !== input.track || current.source_level !== input.sourceLevel;
      if (trackOrLevelChanged) {
        const hasPrereqEdge = db
          .prepare('SELECT 1 FROM lesson_prerequisites WHERE lesson_id = ? OR prerequisite_lesson_id = ?')
          .get(id, id);
        if (hasPrereqEdge) {
          throw new Error('Cannot change track/level while this lesson has prerequisite relationships');
        }
        const hasConceptLink = db
          .prepare('SELECT 1 FROM lesson_concept_links WHERE lesson_a_id = ? OR lesson_b_id = ?')
          .get(id, id);
        if (hasConceptLink) {
          throw new Error('Cannot change track/level while this lesson has concept links');
        }
      }

      db.prepare(
        'UPDATE lessons SET track = ?, source_level = ?, skill = ?, title = ?, explanation = ?, examples = ? WHERE id = ?'
      ).run(
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.explanation,
        input.examples ? JSON.stringify(input.examples) : null,
        id
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone/section resolvePlacement just created too — the whole
      // update is one atomic unit, and no inline-created structure is ever left orphaned.
      const sectionId = resolvePlacement(db, input.track, input.sourceLevel, input.placement);
      db.prepare('DELETE FROM lesson_placements WHERE lesson_id = ?').run(id);
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
        .get(sectionId) as { m: number };
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run(
        id,
        sectionId,
        maxOrder.m + 1
      );

      const currentPrereqs = new Set(
        (
          db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(id) as {
            prerequisite_lesson_id: string;
          }[]
        ).map((r) => r.prerequisite_lesson_id)
      );
      const desiredPrereqs = new Set(input.prerequisiteIds);

      for (const prerequisiteId of currentPrereqs) {
        if (!desiredPrereqs.has(prerequisiteId)) {
          db.prepare('DELETE FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?').run(
            id,
            prerequisiteId
          );
        }
      }
      for (const prerequisiteId of desiredPrereqs) {
        if (!currentPrereqs.has(prerequisiteId)) {
          if (wouldCreateCycle(db, id, prerequisiteId)) {
            throw new Error(`Adding prerequisite ${prerequisiteId} would create a cycle`);
          }
          db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
            id,
            prerequisiteId
          );
        }
      }
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  return { createLesson, updateLesson };
}

export type LessonAdminService = ReturnType<typeof createLessonAdminService>;
