import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { wouldCreateCycle } from './cycleDetection';

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

describe('wouldCreateCycle', () => {
  it('detects a direct 2-cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a'); // b requires a
    expect(wouldCreateCycle(db, 'a', 'b')).toBe(true); // adding "a requires b" would close the loop
  });

  it('detects a transitive 3-cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a'); // b requires a
    addPrereq(db, 'c', 'b'); // c requires b
    expect(wouldCreateCycle(db, 'a', 'c')).toBe(true); // "a requires c" would close a-c-b-a
  });

  it('allows a lesson to require two unrelated lessons', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'd');
    addPrereq(db, 'b', 'a'); // b requires a
    expect(wouldCreateCycle(db, 'b', 'd')).toBe(false); // b also requiring d is unrelated to a
  });

  it('treats a lesson requiring itself as a cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    expect(wouldCreateCycle(db, 'a', 'a')).toBe(true);
  });
});
