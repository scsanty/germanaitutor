import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createDbClient } from './client';
import { seedTutoringCurriculum, addAttempt, addPracticeExercise, scheduleReview } from '@/test/tutoringFixtures';
import { runMigrations } from './schema';

// The tables as they were before the Reading module (old CHECK), rebuilt by hand so the
// migration's rebuild path actually runs (S3).
const OLD_EXERCISES = `CREATE TABLE exercises_old (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      track TEXT CHECK (track IN ('generic','telc','goethe')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL
    )`;
const OLD_PRACTICE = `CREATE TABLE practice_exercises_old (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','approved','rejected')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    )`;

function oldDatabase(): Database.Database {
  const db = createDbClient(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const [table, ddl] of [
    ['exercises', OLD_EXERCISES],
    ['practice_exercises', OLD_PRACTICE],
  ] as const) {
    db.exec(`${ddl}; DROP TABLE ${table}; ALTER TABLE ${table}_old RENAME TO ${table};`);
  }
  db.pragma('foreign_keys = ON');
  seedTutoringCurriculum(db);
  addAttempt(db, 'a1-greet__ex1', 'correct');
  scheduleReview(db, 'a1-sein__ex2', '2026-10-01');
  addPracticeExercise(db, 'p1', 'a1-sein');
  db.exec(`
    INSERT INTO practice_seen (practice_exercise_id, served_at) VALUES ('p1', '2026-09-29T10:00:00.000Z');
    INSERT INTO lesson_chat_messages (lesson_id, exercise_id, practice_exercise_id, role, content, created_at)
      VALUES ('a1-greet', 'a1-greet__ex1', NULL, 'user', 'Warum?', '2026-09-29T10:00:00.000Z'),
             ('a1-sein', NULL, 'p1', 'user', 'Wieso?', '2026-09-29T10:00:00.000Z');
  `);
  return db;
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('exercise types migration', () => {
  it('rebuilds an old database so the new types insert, and keeps everything linked to existing exercises', () => {
    const db = oldDatabase();
    expect(() =>
      db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex8', 'a1-greet', 'cloze', '{}')").run()
    ).toThrow();

    runMigrations(db);

    expect(() =>
      db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex9', 'a1-greet', 'cloze', '{}')").run()
    ).not.toThrow();
    expect(() => addPracticeExercise(db, 'p2', 'a1-sein', { type: 'matching', content: {} })).not.toThrow();
    expect(count(db, "SELECT COUNT(*) AS n FROM lesson_attempts WHERE exercise_id = 'a1-greet__ex1'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM exercise_srs_state WHERE exercise_id = 'a1-sein__ex2'")).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM lesson_chat_messages')).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM practice_seen WHERE practice_exercise_id = 'p1'")).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM exercises')).toBe(7);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_practice_exercises_lesson'").get()
    ).toEqual({ name: 'idx_practice_exercises_lesson' });

    // Foreign keys still work against the rebuilt tables: deleting an exercise cascades to its attempts.
    db.prepare("DELETE FROM exercises WHERE id = 'a1-greet__ex1'").run();
    expect(count(db, "SELECT COUNT(*) AS n FROM lesson_attempts WHERE exercise_id = 'a1-greet__ex1'")).toBe(0);
    db.prepare("DELETE FROM practice_exercises WHERE id = 'p1'").run();
    expect(count(db, 'SELECT COUNT(*) AS n FROM practice_seen')).toBe(0);
  });

  it('is a no-op on a second run and on a fresh database', () => {
    const db = oldDatabase();
    runMigrations(db);
    const before = db.prepare("SELECT name, sql FROM sqlite_master WHERE tbl_name IN ('exercises','practice_exercises') ORDER BY name").all();
    runMigrations(db);
    expect(db.prepare("SELECT name, sql FROM sqlite_master WHERE tbl_name IN ('exercises','practice_exercises') ORDER BY name").all()).toEqual(before);
    expect(count(db, 'SELECT COUNT(*) AS n FROM lesson_attempts')).toBe(1);

    const fresh = createDbClient(':memory:');
    seedTutoringCurriculum(fresh);
    addAttempt(fresh, 'a1-greet__ex1', 'correct');
    runMigrations(fresh);
    expect(() =>
      fresh.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex9', 'a1-greet', 'cloze', '{}')").run()
    ).not.toThrow();
    expect(count(fresh, "SELECT COUNT(*) AS n FROM lesson_attempts WHERE exercise_id = 'a1-greet__ex1'")).toBe(1);
    expect(fresh.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
