import type Database from 'better-sqlite3';
import type { LessonConceptLink } from '../curriculum/types';

interface LessonRow {
  track: string;
  source_level: string;
}

function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function createConceptLinkService(db: Database.Database) {
  function getLinksForLesson(lessonId: string): LessonConceptLink[] {
    const rows = db
      .prepare('SELECT lesson_a_id, lesson_b_id, created_at FROM lesson_concept_links WHERE lesson_a_id = ? OR lesson_b_id = ?')
      .all(lessonId, lessonId) as { lesson_a_id: string; lesson_b_id: string; created_at: string }[];
    return rows.map((r) => ({ lessonAId: r.lesson_a_id, lessonBId: r.lesson_b_id, createdAt: r.created_at }));
  }

  function addLink(lessonId1: string, lessonId2: string): void {
    if (lessonId1 === lessonId2) throw new Error('Cannot link a lesson to itself');

    const l1 = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(lessonId1) as
      | LessonRow
      | undefined;
    const l2 = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(lessonId2) as
      | LessonRow
      | undefined;
    if (!l1) throw new Error(`Lesson not found: ${lessonId1}`);
    if (!l2) throw new Error(`Lesson not found: ${lessonId2}`);
    if (l1.track === l2.track) throw new Error('Concept links must connect different tracks');
    if (l1.source_level !== l2.source_level) throw new Error('Concept links must connect the same level');

    const [a, b] = canonicalPair(lessonId1, lessonId2);
    const existing = db
      .prepare('SELECT 1 FROM lesson_concept_links WHERE lesson_a_id = ? AND lesson_b_id = ?')
      .get(a, b);
    if (existing) throw new Error('This link already exists');

    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(a, b);
  }

  function removeLink(lessonId1: string, lessonId2: string): void {
    const [a, b] = canonicalPair(lessonId1, lessonId2);
    db.prepare('DELETE FROM lesson_concept_links WHERE lesson_a_id = ? AND lesson_b_id = ?').run(a, b);
  }

  return { getLinksForLesson, addLink, removeLink };
}

export type ConceptLinkService = ReturnType<typeof createConceptLinkService>;
