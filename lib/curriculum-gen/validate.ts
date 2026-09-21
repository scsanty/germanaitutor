import type Database from 'better-sqlite3';

export interface ValidationReport {
  counts: {
    milestones: number;
    sections: number;
    lessons: number;
    exercises: number;
    lessonPlacements: number;
    trackOverrides: number;
  };
  issues: string[];
}

export function validateCurriculum(db: Database.Database): ValidationReport {
  const issues: string[] = [];

  const count = (table: string): number => (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;

  const counts = {
    milestones: count('milestones'),
    sections: count('sections'),
    lessons: count('lessons'),
    exercises: count('exercises'),
    lessonPlacements: count('lesson_placements'),
    trackOverrides: count('lesson_track_overrides'),
  };

  const emptyLessons = db.prepare('SELECT id FROM lessons WHERE explanation IS NULL').all() as { id: string }[];
  for (const row of emptyLessons) issues.push(`Lesson ${row.id} has no content (explanation is NULL)`);

  const orphanPlacements = db
    .prepare(
      `SELECT lesson_placements.id as id FROM lesson_placements
       LEFT JOIN lessons ON lessons.id = lesson_placements.lesson_id
       WHERE lessons.id IS NULL`
    )
    .all() as { id: number }[];
  for (const row of orphanPlacements) issues.push(`lesson_placements row ${row.id} references a missing lesson`);

  const sectionsWithoutLessons = db
    .prepare(
      `SELECT sections.id as id FROM sections
       LEFT JOIN lesson_placements ON lesson_placements.section_id = sections.id
       WHERE lesson_placements.id IS NULL`
    )
    .all() as { id: string }[];
  for (const row of sectionsWithoutLessons) issues.push(`Section ${row.id} has zero lessons`);

  const milestonesWithOneSection = db
    .prepare(
      `SELECT milestones.id as id, COUNT(sections.id) as sectionCount FROM milestones
       LEFT JOIN sections ON sections.milestone_id = milestones.id
       GROUP BY milestones.id HAVING sectionCount <= 1`
    )
    .all() as { id: string; sectionCount: number }[];
  for (const row of milestonesWithOneSection) {
    issues.push(`Milestone ${row.id} has only ${row.sectionCount} section(s) — possibly under-decomposed`);
  }

  return { counts, issues };
}
