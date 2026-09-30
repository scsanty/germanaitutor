import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './schema';

// The pre-restructure curriculum tables, as an existing app.db has them.
function oldShapeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE milestones (id TEXT PRIMARY KEY, track TEXT NOT NULL, level TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, order_index INTEGER NOT NULL);
    CREATE TABLE sections (id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL);
    CREATE TABLE lessons (id TEXT PRIMARY KEY, track TEXT NOT NULL, source_level TEXT NOT NULL, skill TEXT NOT NULL,
      title TEXT NOT NULL, explanation TEXT, examples TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE lesson_placements (id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(lesson_id));
    CREATE TABLE lesson_completions (lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL);

    INSERT INTO milestones VALUES ('g-a1-grammar', 'generic', 'A1', 'Grammar', NULL, 0),
      ('g-a1-vocab', 'generic', 'A1', 'Vocabulary', NULL, 1),
      ('generic-a1-unsorted', 'generic', 'A1', 'Unsorted', NULL, 0);
    INSERT INTO sections VALUES ('s1', 'g-a1-grammar', 'Lessons', NULL, 0), ('s2', 'g-a1-vocab', 'Lessons', NULL, 0),
      ('s3', 'g-a1-vocab', 'More', NULL, 1), ('generic-a1-unsorted-section', 'generic-a1-unsorted', 'Unsorted', NULL, 0);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1'),
      ('l2', 'generic', 'A1', 'vocabulary', 'L2'), ('l3', 'generic', 'A1', 'vocabulary', 'L3'),
      ('l4', 'generic', 'A1', 'grammar', 'L4');
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0), ('l2', 's2', 0),
      ('l3', 's3', 0), ('l4', 'generic-a1-unsorted-section', 0);
    INSERT INTO lesson_completions VALUES ('l1', '2026-09-28T10:00:00.000Z');
  `);
  return db;
}

describe('migrateToMilestoneOnlyStructure', () => {
  it('ranks milestones by their old order, moves placements onto milestones, and drops sections', () => {
    const db = oldShapeDb();
    runMigrations(db);

    expect(db.prepare('SELECT id, difficulty_rank FROM milestones ORDER BY id').all()).toEqual([
      { id: 'g-a1-grammar', difficulty_rank: 1 },
      { id: 'g-a1-vocab', difficulty_rank: 2 },
      { id: 'generic-a1-unsorted', difficulty_rank: null },
    ]);
    expect(db.prepare('SELECT lesson_id, milestone_id FROM lesson_placements ORDER BY lesson_id').all()).toEqual([
      { lesson_id: 'l1', milestone_id: 'g-a1-grammar' },
      { lesson_id: 'l2', milestone_id: 'g-a1-vocab' },
      { lesson_id: 'l3', milestone_id: 'g-a1-vocab' },
      { lesson_id: 'l4', milestone_id: 'generic-a1-unsorted' },
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sections'").get()).toBeUndefined();
    const milestoneColumns = (db.prepare('PRAGMA table_info(milestones)').all() as { name: string }[]).map((c) => c.name);
    expect(milestoneColumns).not.toContain('order_index');
    expect(db.prepare('SELECT lesson_id, source FROM lesson_completions').all()).toEqual([{ lesson_id: 'l1', source: 'lesson' }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'milestone_testouts'").get()).toBeTruthy();
  });

  it('is a no-op on a second run', () => {
    const db = oldShapeDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_placements').get()).toEqual({ n: 4 });
  });

  it('allows only one in-progress test-out per milestone', () => {
    const db = oldShapeDb();
    runMigrations(db);
    const insert = db.prepare(
      "INSERT INTO milestone_testouts (milestone_id, status, exercise_ids, started_at) VALUES ('g-a1-vocab', ?, '[]', 'x')"
    );
    insert.run('in_progress');
    insert.run('failed');
    expect(() => insert.run('in_progress')).toThrow(/UNIQUE/);
  });
});
