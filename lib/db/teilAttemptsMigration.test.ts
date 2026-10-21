import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

const columnsOf = (db: Database.Database) => (db.prepare('PRAGMA table_info(teil_attempts)').all() as { name: string }[]).map((c) => c.name);

// B4: the letter grading lock and the stored grade.
describe('teil_attempts columns', () => {
  it('has the answers, grading lock and result columns on a fresh database', () => {
    const db = createDbClient(':memory:');
    expect(columnsOf(db)).toEqual(expect.arrayContaining(['answers', 'grading_started_at', 'result']));
  });

  it('adds them to an old table without touching its rows', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.exec('ALTER TABLE teil_attempts DROP COLUMN result; ALTER TABLE teil_attempts DROP COLUMN grading_started_at; ALTER TABLE teil_attempts DROP COLUMN answers;');
    db.prepare("INSERT INTO teil_attempts (format_id, part_id, kind, score, max_score, started_at, finished_at) VALUES ('telc-b1', 'lesen-1', 'practice', 20, 25, 'a', 'b')").run();
    runMigrations(db);
    expect(columnsOf(db)).toEqual(expect.arrayContaining(['answers', 'grading_started_at', 'result']));
    expect(db.prepare('SELECT part_id, score, answers, grading_started_at, result FROM teil_attempts').get()).toEqual({
      part_id: 'lesen-1',
      score: 20,
      answers: null,
      grading_started_at: null,
      result: null,
    });
  });
});
