import type Database from 'better-sqlite3';
import type { SrsState } from '../tutoring/srs';
import { lemmaKey } from './lemmaKey';

// This module uses only `db` and pure helpers, so `lib/db/schema.ts` can import it for the
// flashcard migration without pulling in the service graph (S8).

const NOUN_WITH_PLURAL = /^((?:der|die|das)(?:\/(?:der|die|das))?\s+[^,]+?),\s*(die\s+\S.*)$/;
const TRAILING_NOTE = /\s*\([^()]*\)\s*$/;

// S6: flashcard fronts aren't lemmas. "das Zeugnis, die Zeugnisse" is the lemma "das Zeugnis" with
// the plural "die Zeugnisse"; any other front is used verbatim.
export function lessonCardLemma(front: string): { lemma: string; plural: string | null } {
  const text = front.trim().replace(/\s+/g, ' ');
  const match = NOUN_WITH_PLURAL.exec(text);
  if (match) return { lemma: match[1], plural: match[2] };
  return { lemma: text, plural: null };
}

// S6: a trailing note such as "(pl.)" or "(steigt um, ist umgestiegen)" is dropped from the key
// only, so "die Lebensmittel (pl.)" dedupes against a starter "die Lebensmittel". The displayed
// lemma keeps it.
export function lessonCardKey(lemma: string): string {
  const stripped = lemma.replace(TRAILING_NOTE, '');
  return lemmaKey(stripped || lemma);
}

export interface DeckItemRef {
  id: number;
  lemma: string;
  status: 'not_started' | 'learning';
}

export function findItemByKey(db: Database.Database, key: string): DeckItemRef | undefined {
  return db.prepare('SELECT id, lemma, status FROM vocabulary_items WHERE lemma_key = ?').get(key) as DeckItemRef | undefined;
}

// The one place a deck review state is created. INSERT OR IGNORE: an item keeps the state it has.
export function insertDeckSrs(db: Database.Database, itemId: number, state: SrsState, at: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO vocabulary_srs_state (item_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(itemId, state.repetitions, state.easeFactor, state.intervalDays, state.nextDueAt, at);
}

// Puts an existing item into learning; a state it already has is kept.
export function activateItem(db: Database.Database, itemId: number, state: SrsState, at: string): void {
  db.prepare("UPDATE vocabulary_items SET status = 'learning' WHERE id = ?").run(itemId);
  insertDeckSrs(db, itemId, state, at);
}

export interface LessonCardInput {
  lemma: string;
  plural: string | null;
  meaningEn: string;
  exerciseId: string;
  state: SrsState;
  at: string;
}

// Task 4: a vocabulary-lesson flashcard enters the deck with its review state. An existing item with
// the same key is kept and activated; when it already has a state, only an earlier due date wins.
export function upsertLessonCard(db: Database.Database, input: LessonCardInput): number {
  const key = lessonCardKey(input.lemma);
  const existing = findItemByKey(db, key);
  const itemId = existing
    ? existing.id
    : Number(
        db
          .prepare(
            `INSERT INTO vocabulary_items (lemma, lemma_key, plural, meaning_en, meaning_de, source, source_ref, status, created_at)
             VALUES (?, ?, ?, ?, '', 'lesson', ?, 'learning', ?)`
          )
          .run(input.lemma, key, input.plural, input.meaningEn, input.exerciseId, input.at).lastInsertRowid
      );
  const current = db.prepare('SELECT next_due_at FROM vocabulary_srs_state WHERE item_id = ?').get(itemId) as
    | { next_due_at: string }
    | undefined;
  activateItem(db, itemId, input.state, input.at);
  if (current && input.state.nextDueAt < current.next_due_at) {
    db.prepare('UPDATE vocabulary_srs_state SET next_due_at = ?, updated_at = ? WHERE item_id = ?').run(input.state.nextDueAt, input.at, itemId);
  }
  return itemId;
}

// B1: only flashcards of `skill = 'vocabulary'` lessons belong in the deck.
export function vocabularyCardContent(db: Database.Database, exerciseId: string): { front: string; back: string } | null {
  const row = db
    .prepare(
      `SELECT e.content FROM exercises e JOIN lessons l ON l.id = e.lesson_id
       WHERE e.id = ? AND e.type = 'flashcard' AND l.skill = 'vocabulary'`
    )
    .get(exerciseId) as { content: string } | undefined;
  return row ? (JSON.parse(row.content) as { front: string; back: string }) : null;
}
