import { describe, it, expect, vi } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createDeckService, DeckError, toDeckErrorResponse, type NormalizeOutcome } from './deckService';

// Fixed copies of the sample lists (3 words per level), so the counts here never move when the
// real lists in data/wortlisten grow.
const FIXTURES = join('test', 'fixtures', 'wortlisten');

function setup(opts: { day?: number; normalize?: (word: string, sentence: string | null) => Promise<NormalizeOutcome>; listDir?: string } = {}) {
  const db = createDbClient(':memory:');
  let day = opts.day ?? 29;
  const profiles = createProfileService(db);
  profiles.updateProfile({ onboardingComplete: true });
  const normalize =
    opts.normalize ??
    vi.fn(async (word: string) => ({ ok: true as const, lemma: word === 'hund' ? 'der Hund' : word, partOfSpeech: 'noun', plural: null, meaningEn: 'x', meaningDe: 'y' }));
  const service = createDeckService(db, { now: () => new Date(2026, 8, day, 10), normalize, listDir: opts.listDir ?? FIXTURES });
  return { db, service, profiles, normalize, setDay: (d: number) => (day = d) };
}

const count = (db: ReturnType<typeof createDbClient>, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('deckService starter words', () => {
  it('imports the lists up to the active level and introduces N per day, lowest level first', () => {
    const { db, service, profiles } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'A2', activeLevel: 'A2' });
    profiles.updateProfile({ newWordsPerDay: 4 });
    const deck = service.getDeck();
    expect(deck.cards).toHaveLength(4);
    expect(deck.dueCount).toBe(4);
    const levels = db.prepare("SELECT level FROM vocabulary_items WHERE status = 'learning' ORDER BY id").all() as { level: string }[];
    expect(levels.map((r) => r.level)).toEqual(['A1', 'A1', 'A1', 'A2']);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'B1'")).toBe(0);
  });

  // Review Focus 3
  it('introduces only once per day however often the deck opens', () => {
    const { db, service, profiles, setDay } = setup();
    profiles.updateProfile({ newWordsPerDay: 2 });
    service.getDeck();
    service.getDeck();
    service.dueCount();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning'")).toBe(2);
    setDay(30);
    service.getDeck();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning'")).toBe(3);
  });

  // Review Focus 5
  it('imports the next level after a level change without re-introducing earlier words', () => {
    const { db, service, profiles, setDay } = setup();
    profiles.updateProfile({ newWordsPerDay: 3 });
    service.getDeck();
    profiles.writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
    setDay(30);
    service.getDeck();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'B1'")).toBe(3);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning'")).toBe(6);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning' AND level = 'A2'")).toBe(3);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE introduced_on = '2026-09-29'")).toBe(3);
  });

  // S1
  it('imports a word added to a list later, exactly once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-lists-'));
    cpSync(FIXTURES, dir, { recursive: true });
    const { db, service, profiles } = setup({ listDir: dir });
    profiles.updateProfile({ newWordsPerDay: 0 });
    service.getDeck();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'A1'")).toBe(3);
    const file = JSON.parse(readFileSync(join(dir, 'a1.json'), 'utf8'));
    file.entries.push({ lemma: 'die Katze', partOfSpeech: 'noun', plural: 'die Katzen', example: 'Die Katze schläft.', meaningEn: 'cat', meaningDe: 'ein Haustier' });
    writeFileSync(join(dir, 'a1.json'), JSON.stringify(file));
    service.getDeck();
    service.getDeck();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'A1'")).toBe(4);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'die katze'")).toBe(1);
  });
});

describe('deckService answers', () => {
  it('moves the schedule on the first answer of the day only, and respects the daily cap', () => {
    const { service, profiles } = setup();
    profiles.updateProfile({ newWordsPerDay: 3, deckReviewCap: 2 });
    const deck = service.getDeck();
    expect(deck.cards).toHaveLength(2);
    const first = service.answer(deck.cards[0].itemId, 'knew');
    expect(first.nextDueAt > '2026-09-29').toBe(true);
    expect(service.answer(deck.cards[0].itemId, 'didnt_know')).toEqual(first);
    service.answer(deck.cards[1].itemId, 'sort_of');
    expect(service.getDeck().answeredToday).toBe(2);
    expect(service.getDeck().cards).toHaveLength(0);
  });

  it('rejects an unknown item', () => {
    const { service } = setup();
    expect(() => service.answer(999, 'knew')).toThrow(expect.objectContaining({ kind: 'not_found', code: 'not_found' }));
  });

  // S3
  it('rejects a card that is not started, not due yet, or over the daily cap', () => {
    const { db, service, profiles, setDay } = setup();
    profiles.updateProfile({ newWordsPerDay: 2, deckReviewCap: 1 });
    expect(service.getDeck().cards).toHaveLength(1);
    const learning = (db.prepare("SELECT id FROM vocabulary_items WHERE status = 'learning' ORDER BY id").all() as { id: number }[]).map((r) => r.id);
    expect(learning).toHaveLength(2);
    const notStarted = (db.prepare("SELECT id FROM vocabulary_items WHERE status = 'not_started' LIMIT 1").get() as { id: number }).id;
    expect(() => service.answer(notStarted, 'knew')).toThrow(expect.objectContaining({ kind: 'not_due', code: 'not_due' }));
    service.answer(learning[0], 'knew');
    // The cap (1) is used up: the second due card can't be answered today.
    expect(() => service.answer(learning[1], 'knew')).toThrow(expect.objectContaining({ code: 'not_due' }));
    // The next day, a card scheduled further ahead is not due yet.
    setDay(30);
    db.prepare("UPDATE vocabulary_srs_state SET next_due_at = '2026-10-05' WHERE item_id = ?").run(learning[1]);
    expect(() => service.answer(learning[1], 'knew')).toThrow(expect.objectContaining({ code: 'not_due' }));
  });
});

describe('deckService adding words', () => {
  // Review Focus 4 and 2
  it('normalizes, adds as learning, activates a not-started starter word, and refuses a word already learning', async () => {
    const { db, service, profiles } = setup();
    profiles.updateProfile({ newWordsPerDay: 0 });
    service.getDeck(); // imports the A1 starter words (including "der Hund") without introducing any
    expect(await service.addWord('hund', 'Der Hund bellt.')).toMatchObject({ lemma: 'der Hund', status: 'activated' });
    await expect(service.addWord('hund')).rejects.toMatchObject({ kind: 'already_in_deck' });
    expect(await service.addWord('Fernweh')).toMatchObject({ lemma: 'Fernweh', status: 'added' });
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'der hund'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'fernweh' AND source = 'freestyle'")).toBe(1);
    expect(service.getDeck().cards.map((c) => c.lemma)).toEqual(['der Hund', 'Fernweh']);
  });

  // Review Focus 2
  it('keeps an added word as one item when the starter import runs later', async () => {
    const { db, service } = setup();
    await service.addWord('hund');
    service.getDeck();
    expect(count(db, "SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'der hund'")).toBe(1);
    expect(db.prepare("SELECT source, status FROM vocabulary_items WHERE lemma_key = 'der hund'").get()).toEqual({ source: 'freestyle', status: 'learning' });
  });

  // S4
  it('records the source of an added word', async () => {
    const { db, service } = setup();
    await service.addWord('Fernweh', null, 'manual');
    expect(db.prepare("SELECT source FROM vocabulary_items WHERE lemma_key = 'fernweh'").get()).toEqual({ source: 'manual' });
  });

  it('reports an AI failure', async () => {
    const normalize = vi.fn(async () => ({ ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const }));
    const { service } = setup({ normalize });
    await expect(service.addWord('Katze')).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });
  });

  it('finds learning words by lemma or meaning', async () => {
    const { service } = setup();
    await service.addWord('Fernweh');
    expect(service.listWords('fern')).toEqual([{ itemId: expect.any(Number), lemma: 'Fernweh', meaning: { en: 'x', de: 'y' } }]);
    expect(service.listWords('nothing')).toEqual([]);
  });
});

// M2
describe('toDeckErrorResponse', () => {
  it('maps a deck error to its status and code, and fills the detail of an AI failure', () => {
    expect(toDeckErrorResponse(new DeckError('This word is already in your deck', 'already_in_deck'))).toEqual({
      status: 409,
      body: expect.objectContaining({ code: 'already_in_deck' }),
    });
    expect(toDeckErrorResponse(new DeckError('The provider timed out', 'ai_failed'))).toEqual({
      status: 502,
      body: expect.objectContaining({ code: 'ai_failed', params: { detail: 'The provider timed out' } }),
    });
    expect(toDeckErrorResponse(new Error('other'))).toBeNull();
  });
});
