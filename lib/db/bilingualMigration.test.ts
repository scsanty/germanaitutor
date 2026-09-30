import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

describe('bilingual columns', () => {
  it('adds German columns with empty defaults', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m', 'generic', 'A1', 'Basics', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l', 'generic', 'A1', 'grammar', 'Hello');`);
    expect(db.prepare('SELECT title_de, description_de FROM milestones').get()).toEqual({ title_de: '', description_de: null });
    expect(db.prepare('SELECT title_de, explanation_de, examples_de FROM lessons').get()).toEqual({
      title_de: '',
      explanation_de: null,
      examples_de: null,
    });
  });

  it('adds the German columns to an existing database, keeps its rows, and is a no-op the second time', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE milestones (id TEXT PRIMARY KEY, track TEXT NOT NULL, level TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, difficulty_rank INTEGER);
      CREATE TABLE lessons (id TEXT PRIMARY KEY, track TEXT NOT NULL, source_level TEXT NOT NULL, skill TEXT NOT NULL,
        title TEXT NOT NULL, explanation TEXT, examples TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES ('m', 'generic', 'A1', 'Basics', 'About basics', 1);
      INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples)
        VALUES ('l', 'generic', 'A1', 'grammar', 'Hello', 'Say hello.', '["Hallo"]');
    `);

    runMigrations(db);

    expect(db.prepare('SELECT * FROM milestones').get()).toEqual({
      id: 'm', track: 'generic', level: 'A1', title: 'Basics', description: 'About basics', difficulty_rank: 1, title_de: '', description_de: null,
    });
    expect(db.prepare('SELECT title, explanation, examples, title_de, explanation_de, examples_de FROM lessons').get()).toEqual({
      title: 'Hello', explanation: 'Say hello.', examples: '["Hallo"]', title_de: '', explanation_de: null, examples_de: null,
    });

    db.prepare("UPDATE lessons SET title_de = 'Hallo'").run();
    runMigrations(db);
    expect(db.prepare('SELECT title_de FROM lessons').get()).toEqual({ title_de: 'Hallo' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lessons').get()).toEqual({ n: 1 });
  });
});
