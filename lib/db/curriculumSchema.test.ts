import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

describe('curriculum schema', () => {
  it('creates all nine new tables', () => {
    const db = createDbClient(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'admin_auth',
        'milestones',
        'milestone_testouts',
        'lessons',
        'lesson_placements',
        'lesson_track_overrides',
        'exercises',
        'lesson_prerequisites',
        'curriculum_meta',
      ])
    );
    db.close();
  });

  it('allows a lesson to be inserted without explanation/examples (Phase 1 state)', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      db
        .prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'generic', 'A1', 'grammar', 'Present tense of regular verbs')
    ).not.toThrow();
    db.close();
  });

  it('requires a track on every lesson', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      db
        .prepare(`INSERT INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs')
    ).toThrow();
    db.close();
  });
});

describe('lesson_concept_links', () => {
  it('creates the table with the expected columns', () => {
    const db = createDbClient(':memory:');
    const columns = db.prepare('PRAGMA table_info(lesson_concept_links)').all() as { name: string }[];
    const names = columns.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'lesson_a_id', 'lesson_b_id', 'created_at']));
    db.close();
  });

  it('drops lessons.concept_id entirely', () => {
    const db = createDbClient(':memory:');
    const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'concept_id')).toBe(false);
    db.close();
  });

  it('rejects a link where lesson_a_id is not less than lesson_b_id', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    expect(() =>
      db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-b', 'a1-a')
    ).toThrow();
    db.close();
  });

  it('rejects a duplicate pair', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b');
    expect(() =>
      db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b')
    ).toThrow();
    db.close();
  });

  it('cascade-deletes a link row when either linked lesson is deleted', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b');
    db.prepare('DELETE FROM lessons WHERE id = ?').run('a1-a');
    const remaining = db.prepare('SELECT count(*) as c FROM lesson_concept_links').get() as { c: number };
    expect(remaining.c).toBe(0);
    db.close();
  });
});

describe('lesson_placements uniqueness', () => {
  it('rejects a second placement for the same lesson', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'M1', 1);
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m2', 'generic', 'A1', 'M2', 2);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('l1', 'm1');
    `);
    expect(() =>
      db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run('l1', 'm2')
    ).toThrow();
    db.close();
  });
});

describe('legacy schema migration to this plan\'s shape', () => {
  it('drops concept_id and adds the placements uniqueness constraint without losing existing rows', () => {
    // Simulate a DB frozen at the pre-this-plan shape (concept_id column present, sections,
    // lesson_placements uniqueness only on the (lesson_id, section_id) pair), then run the
    // migrations and confirm both the shape and the data come out right.
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE milestones (id TEXT PRIMARY KEY, track TEXT NOT NULL, level TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, order_index INTEGER NOT NULL);
      CREATE TABLE sections (id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        title TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL);
      CREATE TABLE lessons (id TEXT PRIMARY KEY, track TEXT NOT NULL, source_level TEXT NOT NULL, skill TEXT NOT NULL,
        title TEXT NOT NULL, explanation TEXT, examples TEXT, concept_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE lesson_placements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(lesson_id, section_id)
      );
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
    `);

    runMigrations(db);

    const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'concept_id')).toBe(false);

    expect(db.prepare('SELECT lesson_id, milestone_id FROM lesson_placements').all()).toEqual([
      { lesson_id: 'l1', milestone_id: 'm1' },
    ]);

    expect(() => db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run('l1', 'm1')).toThrow();

    db.close();
  });
});
