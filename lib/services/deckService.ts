import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import { lemmaKey } from '../deck/lemmaKey';
import { activateItem, findItemByKey, insertDeckSrs, lessonCardLemma, upsertLessonCard } from '../deck/lessonCards';
import { selectIntroductions } from '../deck/introduction';
import { deckRemaining, selectDeckDue } from '../deck/deckQueue';
import { readWordList, WORD_LIST_DIR, type WordListFile } from '../deck/wordLists';
import type { DeckView } from '../deck/deckViews';
import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { localDate } from '../tutoring/dates';
import { FLASHCARD_GRADES, type FlashcardRating } from '../tutoring/lessonAnswers';
import { levelsUpTo } from '../tutoring/levels';
import { computeNextReview, INITIAL_EASE, type SrsState } from '../tutoring/srs';
import { isAiAvailable } from './aiService';
import { createProfileService } from './profileService';

export type NormalizeOutcome =
  | { ok: true; lemma: string; partOfSpeech: string; plural: string | null; meaningEn: string; meaningDe: string }
  | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };

export type DeckErrorKind = 'not_found' | 'bad_request' | 'not_due' | 'already_in_deck' | 'ai_failed';
const STATUS: Record<DeckErrorKind, number> = { not_found: 404, bad_request: 400, not_due: 400, already_in_deck: 409, ai_failed: 502 };
const CODE: Record<DeckErrorKind, ErrorCode> = {
  not_found: 'not_found',
  bad_request: 'bad_request',
  not_due: 'not_due',
  already_in_deck: 'already_in_deck',
  ai_failed: 'ai_failed',
};

export class DeckError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: DeckErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toDeckErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof DeckError)) return null;
  return { status: STATUS[err.kind], body: errorBodyFor(err) };
}

export type AddedWordSource = 'freestyle' | 'manual';

interface ItemRow {
  id: number;
  lemma: string;
  plural: string | null;
  meaning_en: string;
  meaning_de: string;
  example: string | null;
  next_due_at: string;
}

// The count badge opens the deck on every navigation, so a parsed list (and its keys) is kept
// until the file changes on disk.
const listCache = new Map<string, { stamp: string; file: WordListFile; keys: string }>();

function loadList(level: CefrLevel, dir: string): { file: WordListFile; keys: string } {
  const path = resolve(process.cwd(), dir, `${level.toLowerCase()}.json`);
  const stat = statSync(path);
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  const cached = listCache.get(path);
  if (cached && cached.stamp === stamp) return cached;
  const file = readWordList(level, dir);
  const entry = { stamp, file, keys: JSON.stringify(file.entries.map((e) => lemmaKey(e.lemma))) };
  listCache.set(path, entry);
  return entry;
}

export function createDeckService(
  db: Database.Database,
  deps: {
    now?: () => Date;
    normalize?: (word: string, sentence: string | null) => Promise<NormalizeOutcome>;
    listDir?: string;
  } = {}
) {
  const now = deps.now ?? (() => new Date());
  const listDir = deps.listDir ?? WORD_LIST_DIR;
  const profiles = createProfileService(db);

  function today(): string {
    return localDate(now());
  }

  function freshState(day: string): SrsState {
    return { repetitions: 0, easeFactor: INITIAL_EASE, intervalDays: 0, nextDueAt: day };
  }

  // Spec: every level up to the active one is imported as not_started, idempotent by lemma_key:
  // a word the student already added keeps its item and state (Review Focus 2). A level is
  // skipped only when every word of its list is already an item, so words added to a list later
  // still arrive (S1).
  function importStarterLists(activeLevel: CefrLevel): void {
    const present = db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key IN (SELECT value FROM json_each(?))');
    const insert = db.prepare(
      `INSERT OR IGNORE INTO vocabulary_items
         (lemma, lemma_key, part_of_speech, plural, meaning_en, meaning_de, example, level, source, source_ref, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'starter', ?, 'not_started', ?)`
    );
    const at = now().toISOString();
    for (const level of levelsUpTo(activeLevel)) {
      const { file, keys } = loadList(level, listDir);
      if ((present.get(keys) as { n: number }).n >= file.entries.length) continue;
      file.entries.forEach((e, index) =>
        insert.run(e.lemma, lemmaKey(e.lemma), e.partOfSpeech, e.plural, e.meaningEn, e.meaningDe, e.example, level, `${level}:${index}`, at)
      );
    }
  }

  // Spec Review Focus 3: words introduced today count, so a second open introduces nothing. Returns
  // before loading candidates when today's quota is used up (S2).
  function introduceToday(perDay: number, activeLevel: CefrLevel): void {
    const day = today();
    const alreadyToday = (db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items WHERE introduced_on = ?').get(day) as { n: number }).n;
    if (perDay - alreadyToday <= 0) return;
    const candidates = (
      db
        .prepare(
          "SELECT id, level, source_ref FROM vocabulary_items WHERE status = 'not_started' AND source = 'starter' AND level IN (SELECT value FROM json_each(?))"
        )
        .all(JSON.stringify(levelsUpTo(activeLevel))) as { id: number; level: CefrLevel | null; source_ref: string }[]
    ).map((r) => ({ id: r.id, level: r.level, order: Number(r.source_ref.split(':')[1] ?? 0) }));
    const ids = selectIntroductions(candidates, alreadyToday, perDay);
    const introduce = db.prepare('UPDATE vocabulary_items SET introduced_on = ? WHERE id = ?');
    const at = now().toISOString();
    for (const id of ids) {
      introduce.run(day, id);
      activateItem(db, id, freshState(day), at);
    }
  }

  function answeredToday(): number {
    return (db.prepare('SELECT COUNT(DISTINCT item_id) AS n FROM vocabulary_answers WHERE answered_on = ?').get(today()) as { n: number }).n;
  }

  function dueRows(): ItemRow[] {
    const day = today();
    return db
      .prepare(
        `SELECT i.id, i.lemma, i.plural, i.meaning_en, i.meaning_de, i.example, s.next_due_at
         FROM vocabulary_items i JOIN vocabulary_srs_state s ON s.item_id = i.id
         WHERE i.status = 'learning' AND s.next_due_at <= ?
           AND NOT EXISTS (SELECT 1 FROM vocabulary_answers a WHERE a.item_id = i.id AND a.answered_on = ?)
         ORDER BY i.id`
      )
      .all(day, day) as ItemRow[];
  }

  function getDeck(): DeckView {
    const profile = profiles.getProfile();
    db.transaction(() => {
      importStarterLists(profile.activeLevel);
      introduceToday(profile.newWordsPerDay, profile.activeLevel);
    })();
    const answered = answeredToday();
    const due = selectDeckDue(
      dueRows().map((r) => ({ ...r, itemId: r.id, nextDueAt: r.next_due_at })),
      today(),
      deckRemaining(profile.deckReviewCap, answered)
    );
    const cards = due.map((r) => ({
      itemId: r.id,
      lemma: r.lemma,
      plural: r.plural,
      meaning: { en: r.meaning_en, de: r.meaning_de },
      example: r.example,
    }));
    return {
      cards,
      dueCount: cards.length,
      answeredToday: answered,
      newWordsPerDay: profile.newWordsPerDay,
      deckReviewCap: profile.deckReviewCap,
      aiAvailable: isAiAvailable(db),
    };
  }

  function dueCount(): number {
    return getDeck().dueCount;
  }

  // S3: only a learning card that is due today can move, and only while the daily cap has room.
  // A repeat answer on the same day returns the stored schedule without moving it again.
  function answer(itemId: number, rating: FlashcardRating): { nextDueAt: string } {
    const day = today();
    const at = now().toISOString();
    // M4: the item and its state are read inside the transaction, so a concurrent answer can't slip in between.
    return db.transaction(() => {
      const item = db
        .prepare(
          `SELECT i.status, s.repetitions, s.ease_factor, s.interval_days, s.next_due_at
           FROM vocabulary_items i LEFT JOIN vocabulary_srs_state s ON s.item_id = i.id WHERE i.id = ?`
        )
        .get(itemId) as
        | { status: string; repetitions: number | null; ease_factor: number | null; interval_days: number | null; next_due_at: string | null }
        | undefined;
      if (!item) throw new DeckError(`Card not found: ${itemId}`, 'not_found');
      const repeat = db.prepare('SELECT 1 FROM vocabulary_answers WHERE item_id = ? AND answered_on = ?').get(itemId, day);
      if (repeat && item.next_due_at) return { nextDueAt: item.next_due_at };
      if (item.status !== 'learning' || item.next_due_at === null || item.next_due_at > day) {
        throw new DeckError('This card is not due today', 'not_due');
      }
      const profile = profiles.getProfile();
      if (deckRemaining(profile.deckReviewCap, answeredToday()) <= 0) {
        throw new DeckError("Today's flashcard limit is reached", 'not_due');
      }
      db.prepare('INSERT INTO vocabulary_answers (item_id, rating, answered_on, answered_at) VALUES (?, ?, ?, ?)').run(itemId, rating, day, at);
      const next = computeNextReview(
        { repetitions: item.repetitions ?? 0, easeFactor: item.ease_factor ?? INITIAL_EASE, intervalDays: item.interval_days ?? 0, nextDueAt: item.next_due_at },
        FLASHCARD_GRADES[rating],
        day
      );
      db.prepare(
        'UPDATE vocabulary_srs_state SET repetitions = ?, ease_factor = ?, interval_days = ?, next_due_at = ?, updated_at = ? WHERE item_id = ?'
      ).run(next.repetitions, next.easeFactor, next.intervalDays, next.nextDueAt, at, itemId);
      return { nextDueAt: next.nextDueAt };
    })();
  }

  async function addWord(
    word: string,
    sentence: string | null = null,
    source: AddedWordSource = 'freestyle'
  ): Promise<{ itemId: number; lemma: string; status: 'added' | 'activated' }> {
    if (!word?.trim()) throw new DeckError('Type a word first', 'bad_request');
    if (!deps.normalize) throw new DeckError('Adding words needs the AI', 'ai_failed', 'no_provider');
    const normalized = await deps.normalize(word.trim(), sentence);
    if (!normalized.ok) throw new DeckError(normalized.error, 'ai_failed', normalized.code ?? 'ai_failed', normalized.params);
    const key = lemmaKey(normalized.lemma);
    const at = now().toISOString();
    const day = today();
    return db.transaction(() => {
      const existing = findItemByKey(db, key);
      if (existing?.status === 'learning') throw new DeckError('This word is already in your deck', 'already_in_deck');
      if (existing) {
        activateItem(db, existing.id, freshState(day), at);
        return { itemId: existing.id, lemma: existing.lemma, status: 'activated' as const };
      }
      const itemId = Number(
        db
          .prepare(
            `INSERT INTO vocabulary_items (lemma, lemma_key, part_of_speech, plural, meaning_en, meaning_de, example, level, source, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'learning', ?)`
          )
          .run(normalized.lemma, key, normalized.partOfSpeech, normalized.plural, normalized.meaningEn, normalized.meaningDe, sentence, source, at)
          .lastInsertRowid
      );
      insertDeckSrs(db, itemId, freshState(day), at);
      return { itemId, lemma: normalized.lemma, status: 'added' as const };
    })();
  }

  function listWords(query: string): { itemId: number; lemma: string; meaning: { en: string; de: string } }[] {
    const like = `%${query.trim().toLowerCase()}%`;
    return (
      db
        .prepare(
          "SELECT id, lemma, meaning_en, meaning_de FROM vocabulary_items WHERE status = 'learning' AND (lemma_key LIKE ? OR lower(meaning_en) LIKE ?) ORDER BY lemma_key LIMIT 200"
        )
        .all(like, like) as { id: number; lemma: string; meaning_en: string; meaning_de: string }[]
    ).map((r) => ({ itemId: r.id, lemma: r.lemma, meaning: { en: r.meaning_en, de: r.meaning_de } }));
  }

  // Task 4: a vocabulary-lesson flashcard enters the deck with its review state (S6, S8).
  function addFromLesson(input: { front: string; meaningEn: string; exerciseId: string; state: SrsState }): number {
    const { lemma, plural } = lessonCardLemma(input.front);
    return upsertLessonCard(db, { lemma, plural, meaningEn: input.meaningEn, exerciseId: input.exerciseId, state: input.state, at: now().toISOString() });
  }

  return { getDeck, dueCount, answer, addWord, listWords, addFromLesson };
}

export type DeckService = ReturnType<typeof createDeckService>;
