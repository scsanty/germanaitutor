import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createLessonDeleteService } from './lessonDeleteService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, track = 'generic', level = 'A1') {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, 'grammar', ?)`).run(
    id,
    track,
    level,
    id
  );
}

function addPrereq(db: ReturnType<typeof createDbClient>, lessonId: string, prerequisiteId: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
    lessonId,
    prerequisiteId
  );
}

function addLink(db: ReturnType<typeof createDbClient>, x: string, y: string) {
  db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(...[x, y].sort());
}

describe('lessonDeleteService.getDeletePreview', () => {
  it('returns the repair effects for this lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    const service = createLessonDeleteService(db);

    const preview = service.getDeletePreview('b');

    expect(preview.repair.edgesToAdd).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'a' }]);
    expect(preview.repair.edgesToRemove).toHaveLength(2);
  });

  it('returns only the lessons directly concept-linked to this one, not their own links', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'b', 'generic');
    insertLesson(db, 'd', 'telc');
    insertLesson(db, 'f', 'goethe');
    addLink(db, 'b', 'd');
    addLink(db, 'd', 'f'); // linked to d, not directly to b — must not appear in b's preview
    const service = createLessonDeleteService(db);

    const preview = service.getDeletePreview('b');

    expect(preview.linkedLessons).toEqual([{ id: 'd', title: 'd', track: 'telc' }]);
  });

  it('is read-only — a preview call does not mutate anything', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a');
    const service = createLessonDeleteService(db);

    service.getDeletePreview('b');

    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('b');
    expect(lesson).toBeDefined();
  });

  it('throws for a lesson that does not exist', () => {
    const db = createDbClient(':memory:');
    const service = createLessonDeleteService(db);
    expect(() => service.getDeletePreview('nope')).toThrow();
  });
});

describe('lessonDeleteService.batchDelete', () => {
  it('deletes every lesson in the set and repairs each one against live state', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    insertLesson(db, 'd');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    addPrereq(db, 'd', 'c');
    const service = createLessonDeleteService(db);

    // Deleting b and c together should leave d requiring a directly, as if both
    // intermediate lessons were never there — each repair recomputed against the
    // other's already-applied repair within the same transaction.
    service.batchDelete(['b', 'c']);

    const edges = db
      .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites')
      .all() as { lesson_id: string; prerequisite_lesson_id: string }[];
    expect(edges).toEqual([{ lesson_id: 'd', prerequisite_lesson_id: 'a' }]);
    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('c')).toBeUndefined();
  });

  it('rejects the whole batch, unchanged, if any id does not exist', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    const service = createLessonDeleteService(db);

    expect(() => service.batchDelete(['a', 'nope'])).toThrow();

    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a')).toBeDefined();
  });
});
