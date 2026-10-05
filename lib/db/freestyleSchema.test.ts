import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

describe('freestyle and deck schema', () => {
  it('allows one open session per mode and deletes its messages with it', () => {
    const db = createDbClient(':memory:');
    const start = db.prepare("INSERT INTO freestyle_sessions (mode, level, started_at) VALUES ('conversation', 'B1', 'x')");
    const { lastInsertRowid } = start.run();
    expect(() => start.run()).toThrow(/UNIQUE/);
    db.prepare("INSERT INTO freestyle_messages (session_id, role, content, created_at) VALUES (?, 'user', 'Hallo', 'x')").run(lastInsertRowid);
    db.prepare('DELETE FROM freestyle_sessions WHERE id = ?').run(lastInsertRowid);
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_messages').get()).toEqual({ n: 0 });
  });

  it('keeps lemma keys unique and gives the profile deck settings', () => {
    const db = createDbClient(':memory:');
    const add = db.prepare(
      "INSERT INTO vocabulary_items (lemma, lemma_key, meaning_en, source, status, created_at) VALUES ('der Hund', 'der hund', 'dog', 'manual', 'learning', 'x')"
    );
    add.run();
    expect(() => add.run()).toThrow(/UNIQUE/);
    db.prepare('INSERT INTO profile (id) VALUES (1)').run();
    expect(db.prepare('SELECT new_words_per_day, deck_review_cap FROM profile').get()).toEqual({ new_words_per_day: 10, deck_review_cap: 50 });
  });

  it('starts a session with ending 0 and resets a stuck ending flag on every start', () => {
    const db = createDbClient(':memory:');
    db.prepare("INSERT INTO freestyle_sessions (mode, level, started_at) VALUES ('conversation', 'B1', 'x')").run();
    expect(db.prepare('SELECT ending FROM freestyle_sessions').get()).toEqual({ ending: 0 });
    db.prepare('UPDATE freestyle_sessions SET ending = 1').run(); // a crash mid-End
    runMigrations(db);
    expect(db.prepare('SELECT ending FROM freestyle_sessions').get()).toEqual({ ending: 0 });
  });

  it('adds the new columns to a database that predates them', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'gait-schema-')), 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE freestyle_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, level TEXT NOT NULL, setup TEXT NOT NULL DEFAULT '{}', started_at TEXT NOT NULL);
      INSERT INTO freestyle_sessions (mode, level, started_at) VALUES ('conversation', 'B1', 'x');`);
    runMigrations(old);
    expect(old.prepare('SELECT ending FROM freestyle_sessions').get()).toEqual({ ending: 0 });
    old.close();
  });
});
