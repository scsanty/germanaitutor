import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

function seed(db: Database.Database) {
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
    INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at)
      VALUES ('a1-l1__px-1', 'a1-l1', 'fill_blank', '{"textWithBlank":"___","correctAnswer":"ja"}', 'unreviewed', '2026-09-29T10:00:00.000Z');
    INSERT INTO practice_seen (practice_exercise_id, served_at) VALUES ('a1-l1__px-1', '2026-09-29T10:00:00.000Z');
    INSERT INTO lesson_chat_messages (lesson_id, practice_exercise_id, role, content, created_at)
      VALUES ('a1-l1', 'a1-l1__px-1', 'user', 'Why?', '2026-09-29T10:00:00.000Z');
  `);
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('practice pool tables', () => {
  it('deleting a lesson removes its pool, what was seen, and its chat', () => {
    const db = createDbClient(':memory:');
    seed(db);
    db.prepare("DELETE FROM lessons WHERE id = 'a1-l1'").run();
    for (const table of ['practice_exercises', 'practice_seen', 'lesson_chat_messages']) {
      expect({ table, rows: count(db, table) }).toEqual({ table, rows: 0 });
    }
  });

  it('deleting a pool exercise forgets it was seen and untags its chat messages', () => {
    const db = createDbClient(':memory:');
    seed(db);
    db.prepare("DELETE FROM practice_exercises WHERE id = 'a1-l1__px-1'").run();
    expect(count(db, 'practice_seen')).toBe(0);
    expect(db.prepare('SELECT practice_exercise_id FROM lesson_chat_messages').get()).toEqual({ practice_exercise_id: null });
  });

  it('rejects an unknown review status or type', () => {
    const db = createDbClient(':memory:');
    seed(db);
    expect(() =>
      db.prepare("UPDATE practice_exercises SET review_status = 'maybe' WHERE id = 'a1-l1__px-1'").run()
    ).toThrow();
    expect(() => db.prepare("UPDATE practice_exercises SET type = 'essay' WHERE id = 'a1-l1__px-1'").run()).toThrow();
  });

  it('adds the practice column to a chat table from before Phase 2', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE lesson_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        exercise_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    runMigrations(db);
    const columns = (db.prepare('PRAGMA table_info(lesson_chat_messages)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('practice_exercise_id');
    runMigrations(db);
  });
});
