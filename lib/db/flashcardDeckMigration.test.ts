import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';
import { runMigrations } from './schema';
import { seedTutoringCurriculum, scheduleReview } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES
    ('a1-sein__card', 'a1-sein', 'flashcard', '{"front":"ich bin","back":"I am"}'),
    ('a1-greet__ex3', 'a1-greet', 'flashcard', '{"front":"die Lebensmittel (pl.)","back":"groceries"}')`);
  return db;
}

const deck = (db: ReturnType<typeof setup>) =>
  db
    .prepare(
      `SELECT i.lemma, i.lemma_key, i.source_ref, i.status, s.repetitions, s.ease_factor, s.interval_days, s.next_due_at
       FROM vocabulary_items i JOIN vocabulary_srs_state s ON s.item_id = i.id ORDER BY i.id`
    )
    .all();

describe('migrateFlashcardReviewsToDeck', () => {
  it('moves existing flashcard reviews into the deck with their state and removes them from the exercise reviews', () => {
    const db = setup();
    scheduleReview(db, 'a1-greet__ex2', '2026-10-03');
    scheduleReview(db, 'a1-greet__ex1', '2026-10-03');
    db.prepare("UPDATE exercise_srs_state SET repetitions = 4, ease_factor = 2.2, interval_days = 17 WHERE exercise_id = 'a1-greet__ex2'").run();
    runMigrations(db);
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex2'").get()).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex1'").get()).toBeTruthy();
    expect(deck(db)).toEqual([
      {
        lemma: 'der Hund',
        lemma_key: 'der hund',
        source_ref: 'a1-greet__ex2',
        status: 'learning',
        repetitions: 4,
        ease_factor: 2.2,
        interval_days: 17,
        next_due_at: '2026-10-03',
      },
    ]);
    runMigrations(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 1 });
    expect(deck(db)).toHaveLength(1);
  });

  // B1: only vocabulary-lesson flashcards move.
  it('leaves a grammar lesson’s flashcard review where it is', () => {
    const db = setup();
    scheduleReview(db, 'a1-sein__card', '2026-10-03');
    runMigrations(db);
    expect(db.prepare('SELECT exercise_id, next_due_at FROM exercise_srs_state').all()).toEqual([
      { exercise_id: 'a1-sein__card', next_due_at: '2026-10-03' },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 0 });
  });

  // S6 and S8: the key drops the "(pl.)" note, so a not-started starter word is reused, activated, and takes the card's review state.
  it('merges a card into an existing deck item with the same key', () => {
    const db = setup();
    db.exec(`INSERT INTO vocabulary_items (lemma, lemma_key, meaning_en, level, source, source_ref, status, created_at)
      VALUES ('die Lebensmittel', 'die lebensmittel', 'groceries', 'A1', 'starter', 'A1:3', 'not_started', '2026-09-01T10:00:00.000Z')`);
    scheduleReview(db, 'a1-greet__ex3', '2026-10-05');
    runMigrations(db);
    expect(deck(db)).toEqual([
      expect.objectContaining({ lemma: 'die Lebensmittel', source_ref: 'A1:3', status: 'learning', repetitions: 1, next_due_at: '2026-10-05' }),
    ]);
  });

  it('changes nothing when the move fails part-way', () => {
    const db = setup();
    scheduleReview(db, 'a1-greet__ex2', '2026-10-03');
    db.exec("CREATE TEMP TRIGGER no_delete BEFORE DELETE ON exercise_srs_state BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    expect(() => runMigrations(db)).toThrow('blocked');
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM exercise_srs_state').get()).toEqual({ n: 1 });
  });
});
