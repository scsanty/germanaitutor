import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';
import { reconcileExercises } from '../curriculum-admin/exerciseReconciliation';

function seedProgress(db: Database.Database) {
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-l1__ex1', 'a1-l1', 'fill_blank', '{"textWithBlank":"___","correctAnswer":"ja"}');
    INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, answered_at, answered_on)
      VALUES ('a1-l1__ex1', 'a1-l1', 'lesson', 'correct', 'ja', '2026-09-24T10:00:00.000Z', '2026-09-24');
    INSERT INTO lesson_completions (lesson_id, completed_at) VALUES ('a1-l1', '2026-09-24T10:00:00.000Z');
    INSERT INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
      VALUES ('a1-l1__ex1', 1, 2.5, 3, '2026-09-27', '2026-09-24T10:00:00.000Z');
    INSERT INTO lesson_chat_messages (lesson_id, exercise_id, role, content, created_at)
      VALUES ('a1-l1', 'a1-l1__ex1', 'user', 'Why?', '2026-09-24T10:00:00.000Z');
  `);
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('tutoring progress tables', () => {
  it('deleting an exercise removes its attempts and schedule and untags its chat messages', () => {
    const db = createDbClient(':memory:');
    seedProgress(db);
    db.prepare("DELETE FROM exercises WHERE id = 'a1-l1__ex1'").run();
    expect(count(db, 'lesson_attempts')).toBe(0);
    expect(count(db, 'exercise_srs_state')).toBe(0);
    expect(db.prepare('SELECT exercise_id FROM lesson_chat_messages').get()).toEqual({ exercise_id: null });
    expect(count(db, 'lesson_completions')).toBe(1);
  });

  it('deleting a lesson removes all of its progress and its chat', () => {
    const db = createDbClient(':memory:');
    seedProgress(db);
    db.prepare("DELETE FROM lessons WHERE id = 'a1-l1'").run();
    for (const table of ['lesson_attempts', 'lesson_completions', 'exercise_srs_state', 'lesson_chat_messages']) {
      expect({ table, rows: count(db, table) }).toEqual({ table, rows: 0 });
    }
  });

  it('rejects an attempt from an unknown source', () => {
    const db = createDbClient(':memory:');
    seedProgress(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answered_at, answered_on)
           VALUES ('a1-l1__ex1', 'a1-l1', 'freestyle', 'correct', 'x', '2026-09-24')`
        )
        .run()
    ).toThrow();
  });
});

describe('admin exercise edits', () => {
  it('editing an exercise in place keeps its attempts and schedule; removing it drops them without failing', () => {
    const db = createDbClient(':memory:');
    seedProgress(db);
    reconcileExercises(db, 'a1-l1', [
      { id: 'a1-l1__ex1', type: 'fill_blank', content: { textWithBlank: 'Ich ___ hier.', correctAnswer: 'bin' } },
    ]);
    expect(count(db, 'lesson_attempts')).toBe(1);
    expect(count(db, 'exercise_srs_state')).toBe(1);

    reconcileExercises(db, 'a1-l1', []);
    expect(count(db, 'lesson_attempts')).toBe(0);
    expect(count(db, 'exercise_srs_state')).toBe(0);
    expect(count(db, 'lesson_completions')).toBe(1);
  });
});

describe('daily review cap migration', () => {
  it('adds the limit, defaulting to 50, to a profile from before the teaching loop', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT NOT NULL DEFAULT '',
        ui_language TEXT NOT NULL DEFAULT 'en',
        active_track TEXT NOT NULL DEFAULT 'generic',
        active_level TEXT NOT NULL DEFAULT 'A1',
        freestyle_default INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        highest_unlocked_level TEXT NOT NULL DEFAULT 'A1',
        placement_status TEXT NOT NULL DEFAULT 'pending',
        unlock_notice_level TEXT,
        onboarding_choices_saved INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO profile (id, active_level, highest_unlocked_level, placement_status) VALUES (1, 'B1', 'B1', 'taken');
    `);

    runMigrations(db);

    expect(db.prepare('SELECT daily_review_cap, active_level FROM profile WHERE id = 1').get()).toEqual({
      daily_review_cap: 50,
      active_level: 'B1',
    });
  });
});
