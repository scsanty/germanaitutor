import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

const insert = (db: Database.Database, id: string, role: string) =>
  db.prepare("INSERT INTO speech_clips (id, scope, role, file, transcript, words, created_at) VALUES (?, 'teil:1', ?, NULL, 'Hallo', NULL, 'now')").run(id, role);

// Fix round 1 (I1): an AI line's speaker lives on its clip row, so examiner lines are told apart from the partner's.
describe('speech_clips roles', () => {
  it('accepts student, partner and examiner on a fresh database, and nothing else', () => {
    const db = createDbClient(':memory:');
    for (const role of ['student', 'partner', 'examiner']) insert(db, role, role);
    expect(() => insert(db, 'x', 'narrator')).toThrow();
  });

  it('rebuilds a Speaking-era table that knew only student and partner, keeping its rows, once', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.exec(`DROP TABLE speech_clips;
      CREATE TABLE speech_clips (id TEXT PRIMARY KEY, scope TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('student','partner')), file TEXT, transcript TEXT, words TEXT, created_at TEXT NOT NULL);`);
    insert(db, 'old', 'partner');
    expect(() => insert(db, 'e', 'examiner')).toThrow();
    runMigrations(db);
    insert(db, 'e', 'examiner');
    expect(db.prepare('SELECT id, role FROM speech_clips ORDER BY rowid').all()).toEqual([{ id: 'old', role: 'partner' }, { id: 'e', role: 'examiner' }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_speech_clips_scope'").get()).toBeDefined();
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'speech_clips'").get() as { sql: string }).sql;
    runMigrations(db);
    expect((db.prepare("SELECT sql FROM sqlite_master WHERE name = 'speech_clips'").get() as { sql: string }).sql).toBe(sql);
    expect(db.prepare('SELECT COUNT(*) AS n FROM speech_clips').get()).toEqual({ n: 2 });
  });
});
