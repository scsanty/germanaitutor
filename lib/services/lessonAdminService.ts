import type Database from 'better-sqlite3';
import { assertPrerequisiteScope } from '../curriculum-admin/prerequisiteScope';
import type { Track, CefrLevel } from '../types';
import type { Skill, Lesson, ExerciseType } from '../curriculum/types';
import { createCurriculumService } from './curriculumService';
import { wouldCreateCycle } from '../curriculum-admin/cycleDetection';
import { resolvePlacement, type PlacementInput } from '../curriculum-admin/placementResolver';
import { reconcileExercises, type ExerciseInput } from '../curriculum-admin/exerciseReconciliation';
import { lessonTextProblems } from '../curriculum/bilingualValidation';
import { instructionProblems } from '../curriculum/exerciseContentValidation';

export interface CreateLessonInput {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
  exercises: ExerciseInput[];
  prerequisiteIds: string[];
  placement: PlacementInput;
}

export interface UpdateLessonInput {
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
  exercises: ExerciseInput[];
  prerequisiteIds: string[];
  placement: PlacementInput;
}

export function flashcardRuleViolation(skill: Skill, exercises: { type: ExerciseType }[]): string | null {
  if (skill === 'vocabulary') return null;
  const count = exercises.filter((e) => e.type === 'flashcard').length;
  if (count === 0) return null;
  return count === 1
    ? 'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    : `This lesson has ${count} flashcards, which are only allowed in vocabulary lessons. Remove or change them first.`;
}

function assertFlashcardRule(skill: Skill, exercises: { type: ExerciseType }[]): void {
  const violation = flashcardRuleViolation(skill, exercises);
  if (violation) throw new Error(violation);
}

// Spec: German title, both-or-neither texts and instructions are checked before any write.
function assertLessonTexts(input: {
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
  exercises: { type: ExerciseType; content: unknown }[];
}): void {
  const problems = [
    ...lessonTextProblems(input),
    ...input.exercises.flatMap((e, i) => instructionProblems(e.type, e.content).map((p) => `Exercise ${i + 1}: ${p}`)),
  ];
  if (problems.length > 0) throw new Error(problems.join('; '));
}

export function createLessonAdminService(db: Database.Database) {
  const reads = createCurriculumService(db);

  function createLesson(input: CreateLessonInput): Lesson {
    const id = `${input.sourceLevel.toLowerCase()}-${input.slug}`;

    const run = db.transaction(() => {
      assertLessonTexts(input);
      assertFlashcardRule(input.skill, input.exercises);

      const existing = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(id);
      if (existing) throw new Error(`Lesson id already exists: ${id}`);

      db.prepare(
        'INSERT INTO lessons (id, track, source_level, skill, title, title_de, explanation, explanation_de, examples, examples_de) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.titleDe,
        input.explanation,
        input.explanationDe,
        input.examples ? JSON.stringify(input.examples) : null,
        input.examplesDe ? JSON.stringify(input.examplesDe) : null
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone resolvePlacement just created too — the whole
      // create is one atomic unit, and no inline-created structure is ever left orphaned.
      const milestoneId = resolvePlacement(db, input.track, input.sourceLevel, input.placement, 'create');
      db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run(id, milestoneId);

      for (const prerequisiteId of input.prerequisiteIds) {
        if (wouldCreateCycle(db, id, prerequisiteId)) {
          throw new Error(`Adding prerequisite ${prerequisiteId} would create a cycle`);
        }
        db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
          id,
          prerequisiteId
        );
      }

      assertPrerequisiteScope(db, [id]);
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  function updateLesson(id: string, input: UpdateLessonInput): Lesson {
    const run = db.transaction(() => {
      assertLessonTexts(input);
      assertFlashcardRule(input.skill, input.exercises);

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
        'UPDATE lessons SET track = ?, source_level = ?, skill = ?, title = ?, title_de = ?, explanation = ?, explanation_de = ?, examples = ?, examples_de = ? WHERE id = ?'
      ).run(
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.titleDe,
        input.explanation,
        input.explanationDe,
        input.examples ? JSON.stringify(input.examples) : null,
        input.examplesDe ? JSON.stringify(input.examplesDe) : null,
        id
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone resolvePlacement just created too — the whole
      // update is one atomic unit, and no inline-created structure is ever left orphaned.
      const milestoneId = resolvePlacement(db, input.track, input.sourceLevel, input.placement, 'update');
      db.prepare('DELETE FROM lesson_placements WHERE lesson_id = ?').run(id);
      db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run(id, milestoneId);

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

      assertPrerequisiteScope(db, [id]);
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  return { createLesson, updateLesson };
}

export type LessonAdminService = ReturnType<typeof createLessonAdminService>;
