import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

// The placement tables as they were before Speaking: the old type CHECK and no served_ids.
function oldDatabase(): Database.Database {
  const db = createDbClient(':memory:');
  db.exec(`
    DROP TABLE placement_questions;
    DROP TABLE placement_session;
    CREATE TABLE placement_questions (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','free_text')),
      content TEXT NOT NULL
    );
    CREATE TABLE placement_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      started_at TEXT NOT NULL,
      next_position INTEGER NOT NULL,
      score REAL NOT NULL,
      mistakes INTEGER NOT NULL,
      answers TEXT NOT NULL
    );
    INSERT INTO placement_questions (id, position, level, type, content) VALUES ('q1', 1, 'A1', 'multiple_choice', '{"x":1}'), ('q2', 2, 'A2', 'free_text', '{"y":2}');
    INSERT INTO placement_session (id, started_at, next_position, score, mistakes, answers) VALUES (1, 'now', 2, 1, 0, '[]');
  `);
  return db;
}

const insertSpoken = (db: Database.Database) =>
  db.prepare("INSERT INTO placement_questions (id, position, level, type, content) VALUES ('s', 3, 'A1', 'spoken', '{}')").run();

describe('placement spoken migration', () => {
  it('rebuilds the question table so spoken inserts, keeps the rows, and adds served_ids to the session', () => {
    const db = oldDatabase();
    expect(() => insertSpoken(db)).toThrow();
    runMigrations(db);
    expect(() => insertSpoken(db)).not.toThrow();
    expect(db.prepare('SELECT id, position, level, type, content FROM placement_questions ORDER BY position').all()).toEqual([
      { id: 'q1', position: 1, level: 'A1', type: 'multiple_choice', content: '{"x":1}' },
      { id: 'q2', position: 2, level: 'A2', type: 'free_text', content: '{"y":2}' },
      { id: 's', position: 3, level: 'A1', type: 'spoken', content: '{}' },
    ]);
    expect(db.prepare('SELECT next_position, served_ids FROM placement_session').get()).toEqual({ next_position: 2, served_ids: '[]' });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('does nothing on a second run', () => {
    const db = oldDatabase();
    runMigrations(db);
    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'placement_questions'").get();
    runMigrations(db);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'placement_questions'").get()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM placement_questions').get()).toEqual({ n: 2 });
  });
});
