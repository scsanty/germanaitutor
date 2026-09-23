import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { computeRepairPreview, applyRepairAndDelete } from './dependencyRepair';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
}

function addPrereq(db: ReturnType<typeof createDbClient>, lessonId: string, prerequisiteId: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
    lessonId,
    prerequisiteId
  );
}

function edges(db: ReturnType<typeof createDbClient>) {
  return (
    db.prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites ORDER BY lesson_id, prerequisite_lesson_id').all() as {
      lesson_id: string;
      prerequisite_lesson_id: string;
    }[]
  ).map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
}

describe('computeRepairPreview', () => {
  it('is read-only — does not mutate the graph', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    const before = edges(db);
    computeRepairPreview(db, 'b');
    expect(edges(db)).toEqual(before);
  });

  it('with no dependents, only removes B\'s own prerequisite edges', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]);
    expect(preview.edgesToRemove).toEqual([{ lessonId: 'b', prerequisiteLessonId: 'a' }]);
  });

  it('with no prerequisites, dependents just lose the edge to B, nothing to reconnect', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'c', 'b');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]);
    expect(preview.edgesToRemove).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'b' }]);
  });

  it('fans out every prerequisite to every dependent', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a1');
    insertLesson(db, 'a2');
    insertLesson(db, 'b');
    insertLesson(db, 'c1');
    insertLesson(db, 'c2');
    addPrereq(db, 'b', 'a1');
    addPrereq(db, 'b', 'a2');
    addPrereq(db, 'c1', 'b');
    addPrereq(db, 'c2', 'b');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd.sort((x, y) => (x.lessonId + x.prerequisiteLessonId).localeCompare(y.lessonId + y.prerequisiteLessonId))).toEqual(
      [
        { lessonId: 'c1', prerequisiteLessonId: 'a1' },
        { lessonId: 'c1', prerequisiteLessonId: 'a2' },
        { lessonId: 'c2', prerequisiteLessonId: 'a1' },
        { lessonId: 'c2', prerequisiteLessonId: 'a2' },
      ].sort((x, y) => (x.lessonId + x.prerequisiteLessonId).localeCompare(y.lessonId + y.prerequisiteLessonId))
    );
    expect(preview.edgesToRemove.sort((x, y) => x.lessonId.localeCompare(y.lessonId))).toEqual(
      [
        { lessonId: 'b', prerequisiteLessonId: 'a1' },
        { lessonId: 'b', prerequisiteLessonId: 'a2' },
        { lessonId: 'c1', prerequisiteLessonId: 'b' },
        { lessonId: 'c2', prerequisiteLessonId: 'b' },
      ].sort((x, y) => x.lessonId.localeCompare(y.lessonId))
    );
  });

  it('dedupes an edge that already exists directly, independent of B', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    addPrereq(db, 'c', 'a'); // c already requires a directly, regardless of b
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]); // c-requires-a already exists, not re-added
  });

  it('is a no-op for an isolated lesson with neither prerequisites nor dependents', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    const preview = computeRepairPreview(db, 'a');
    expect(preview).toEqual({ edgesToAdd: [], edgesToRemove: [] });
  });
});

describe('applyRepairAndDelete', () => {
  it('reconnects fan-out/fan-in edges and removes the lesson row', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');

    applyRepairAndDelete(db, 'b');

    expect(edges(db)).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'a' }]);
    const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get('b');
    expect(lesson).toBeUndefined();
  });

  it('cascades placement, exercises, and concept-links via existing ON DELETE CASCADE', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
    `);
    db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, 0)').run('b', 's1');
    db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('ex1', 'b', 'flashcard', '{}')").run();
    insertLesson(db, 'linked');
    db.prepare("INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('linked-telc', 'telc', 'A1', 'grammar', 'x')").run();
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(
      ...['b', 'linked-telc'].sort()
    );

    applyRepairAndDelete(db, 'b');

    expect(db.prepare('SELECT * FROM lesson_placements WHERE lesson_id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT * FROM exercises WHERE lesson_id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT * FROM lesson_concept_links').all()).toEqual([]);
  });
});
