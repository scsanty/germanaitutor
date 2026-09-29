# Tutoring Phase 3: Freestyle and the Vocabulary Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 11–12 are content tasks.

**Goal:** Build the 🏂 Freestyle hub (conversation, grammar drill, free reading, free writing; spoken and exam practice registered but hidden) and the 🗂️ vocabulary deck (starter lists, meanings, its own SRS queue, adding words, lesson flashcards moved in).

**Architecture:**
- **Pure logic** lives in `lib/deck/` and `lib/freestyle/`: lemma keys, the introduction choice, deck queue selection, the prompts and reply parsers for each AI call, and the mode and scenario registries.
- **Services:**
  - `deckService` handles import, introduction, queue, answers, adding words and counts.
  - `freestyleService` handles sessions, turns, articles, summaries and End.
  - The lesson-flashcard move is a small change in `attemptService` and `testOutService`, plus a migration.
- **Routes** are thin. The UI is built with the design pass's components.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 and shadcn/ui, better-sqlite3, next-intl 4, vitest 5; `pdftotext` (poppler) for the one-off list extraction.

**Spec:** `docs/superpowers/specs/2026-09-29-freestyle-design.md`

**Precondition:** Phase 2, the Curriculum Restructure, Bilingual Content, the Design pass and the telc B1 expansion are merged.

## Global Constraints

- **Freestyle and progress:** Freestyle never writes to lesson attempts, completions, exercise reviews, or anything the tree reads.
- **Sessions:**
  - one open session per mode (a unique index on `mode`);
  - **End deletes the session and its messages**, and the summary is shown once and never stored;
  - the level is the active one by default, and can be any unlocked level.
- **AI replies:** every reply is JSON, parsed strictly. A malformed reply is `ai_bad_reply`. Conversation replies are German at the session level. Correction reasons and explanations come as `{ en, de }`, shown in the UI language with the toggle.
- **Deck queue:** separate from the Daily Queue. Grading is Knew / Sort of / Didn't know through `FLASHCARD_GRADES` and `computeNextReview`. Only the first answer per item per day moves its schedule. The daily cap is `deck_review_cap` (default 50, 1–500).
- **Starter words:** all tracks use the same lists. Lists up to the active level are imported as `not_started`. `new_words_per_day` (default 10, 0–50) is introduced each day, lowest level first, then list order.
- **Duplicates:** `lemma_key` is the lowercased, trimmed, single-spaced lemma, including a noun's article. It is unique.
- **Lesson flashcards:** they go to the deck (`source: 'lesson'`) with Phase 1's seeding rule. The Daily Queue never shows flashcard exercises.
- **New codes:** `session_exists` and `already_in_deck` (409), with catalog text in en and de.
- **Nav:** the `freestyle` and `flashcards` items are enabled, and Flashcards shows a deck-due badge.
- **Existing rules:** `res.ok` checks and `role="alert"`; `delayedResponse` in client tests; all new student text in en and de.

## Review Focus

1. **Double tap on End:** it produces one summary call and one delete, not two (Task 6).
2. **Added words before starter introduction:** a word added through Freestyle that later appears in a starter list stays one item. The import doesn't create a second item or reset its state (Task 3).
3. **Introduction and the calendar:** introduction runs once per local day. Opening the deck three times on one day introduces 10 words, not 30 (Task 3).
4. **Uncapitalized nouns:** "hund" typed by the student is normalized by the AI to "der Hund". The key compares after normalization, so it dedupes against a starter "der Hund" (Task 3).
5. **Deck after a level change:** raising the active level from A2 to B1 imports B1 words on the next deck open, without re-introducing A1/A2 words (Task 3).

## File Structure

| File | Responsibility |
|---|---|
| `lib/deck/lemmaKey.ts`, `introduction.ts`, `deckQueue.ts` (new) | Pure deck logic |
| `lib/deck/wordLists.ts` (new) | Word-list types, reading and validation |
| `lib/ai/json.ts` (new) | Extracts one JSON object from an AI reply |
| `lib/freestyle/modes.ts`, `scenarios.ts`, `prompts.ts`, `replies.ts` (new) | Registries, prompts, and strict reply parsers |
| `lib/services/deckService.ts`, `freestyleService.ts` (new) | Services |
| `lib/services/attemptService.ts`, `testOutService.ts`, `progressService.ts`, `lib/db/schema.ts` | The lesson-flashcard move and schema |
| `app/api/flashcards/*`, `app/api/freestyle/*` (new) | Routes |
| `app/freestyle/*`, `app/flashcards/page.tsx`, `components/freestyle/*`, `components/deck/*` (new) | UI |
| `data/wortlisten/{a1,a2,b1,b2,c1}.json` (new) | Word lists with meanings |
| `scripts/extract-wortlisten.ts` (new, one-off) | PDF → JSON extraction |

## Task Order

1. Schema and pure deck logic
2. Word-list format, validation, and sample data
3. Deck service and routes
4. Lesson flashcards move into the deck
5. AI JSON helper, Freestyle prompts and reply parsers, registries
6. Freestyle service and routes
7. Hub and navigation
8. Conversation and grammar-drill screens
9. Free-reading and free-writing screens
10. The End flow and the deck page
11. Content: the official A1–B1 lists with meanings
12. Content: the B2/C1 lists with meanings, and all scenarios

---

### Task 1: Schema and pure deck logic

**Files:**
- Create:
  - `lib/deck/lemmaKey.ts`, `lib/deck/introduction.ts`, `lib/deck/deckQueue.ts`
  - `lib/deck/deck.test.ts`
  - `lib/db/freestyleSchema.test.ts`
- Modify: `lib/db/schema.ts`, `lib/types.ts`, `lib/services/profileService.ts`, `lib/services/profileService.test.ts`

**Interfaces:**
- Produces:
  - `lemmaKey(lemma: string): string`
  - `selectIntroductions(candidates: { id: number; level: CefrLevel | null; order: number }[], alreadyToday: number, perDay: number): number[]`
  - `selectDeckDue<T extends { nextDueAt: string; itemId: number }>(items: T[], today: string, remaining: number): T[]`
  - `deckRemaining(cap: number, answeredToday: number): number`
  - `Profile` gains `newWordsPerDay: number; deckReviewCap: number`, and `ProfileUpdate` accepts both, validated as 0–50 and 1–500.

- [ ] **Step 1: Write the failing tests**

Create `lib/deck/deck.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lemmaKey } from './lemmaKey';
import { selectIntroductions } from './introduction';
import { deckRemaining, selectDeckDue } from './deckQueue';

describe('lemmaKey', () => {
  it('lowercases, trims, and collapses spaces, keeping the article', () => {
    expect(lemmaKey('  Der   Hund ')).toBe('der hund');
    expect(lemmaKey('die See')).not.toBe(lemmaKey('der See'));
  });
});

describe('selectIntroductions', () => {
  const words = [
    { id: 1, level: 'B1' as const, order: 0 },
    { id: 2, level: 'A1' as const, order: 5 },
    { id: 3, level: 'A1' as const, order: 1 },
    { id: 4, level: 'A2' as const, order: 0 },
  ];

  it('takes the lowest level first, then list order, up to the daily number', () => {
    expect(selectIntroductions(words, 0, 3)).toEqual([3, 2, 4]);
  });

  // Review Focus 3: words already introduced today count against the daily number.
  it('introduces only what is left for today', () => {
    expect(selectIntroductions(words, 2, 3)).toEqual([3]);
    expect(selectIntroductions(words, 3, 3)).toEqual([]);
    expect(selectIntroductions(words, 0, 0)).toEqual([]);
  });
});

describe('deck queue', () => {
  it('takes due items, most overdue first, up to what is left today', () => {
    const items = [
      { itemId: 1, nextDueAt: '2026-09-29' },
      { itemId: 2, nextDueAt: '2026-09-20' },
      { itemId: 3, nextDueAt: '2026-10-02' },
    ];
    expect(selectDeckDue(items, '2026-09-29', 5).map((i) => i.itemId)).toEqual([2, 1]);
    expect(selectDeckDue(items, '2026-09-29', 1).map((i) => i.itemId)).toEqual([2]);
    expect(deckRemaining(50, 48)).toBe(2);
    expect(deckRemaining(50, 60)).toBe(0);
  });
});
```

Create `lib/db/freestyleSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

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
});
```

In `lib/services/profileService.test.ts`, add:

```ts
  it('updates the deck settings within their ranges', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(service.updateProfile({ newWordsPerDay: 20, deckReviewCap: 100 })).toMatchObject({ newWordsPerDay: 20, deckReviewCap: 100 });
    expect(() => service.updateProfile({ newWordsPerDay: 51 })).toThrow('New words per day must be a whole number from 0 to 50');
    expect(() => service.updateProfile({ deckReviewCap: 0 })).toThrow('The flashcard review limit must be a whole number from 1 to 500');
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/deck lib/db/freestyleSchema.test.ts lib/services/profileService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/deck/lemmaKey.ts`:

```ts
// Spec: duplicate detection by the normalized lemma, article included ("der See" ≠ "die See").
export function lemmaKey(lemma: string): string {
  return lemma.trim().replace(/\s+/g, ' ').toLowerCase();
}
```

Create `lib/deck/introduction.ts`:

```ts
import { levelIndex } from '../tutoring/levels';
import type { CefrLevel } from '../types';

// Spec: new starter words per day, lowest level first, then list order. Words already
// introduced today count, so opening the deck again never introduces more.
export function selectIntroductions(
  candidates: { id: number; level: CefrLevel | null; order: number }[],
  alreadyToday: number,
  perDay: number
): number[] {
  const left = Math.max(0, perDay - alreadyToday);
  if (left === 0) return [];
  return [...candidates]
    .sort((a, b) => levelIndex(a.level ?? 'C1') - levelIndex(b.level ?? 'C1') || a.order - b.order)
    .slice(0, left)
    .map((c) => c.id);
}
```

Create `lib/deck/deckQueue.ts`:

```ts
export function deckRemaining(cap: number, answeredToday: number): number {
  return Math.max(0, cap - answeredToday);
}

// Most overdue first; stable for equal dates.
export function selectDeckDue<T extends { nextDueAt: string; itemId: number }>(items: T[], today: string, remaining: number): T[] {
  if (remaining <= 0) return [];
  return items
    .filter((i) => i.nextDueAt <= today)
    .sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : a.nextDueAt > b.nextDueAt ? 1 : 0))
    .slice(0, remaining);
}
```

In `lib/db/schema.ts`, add to `createTablesIfMissing` the tables from the spec: `freestyle_sessions`, its unique index, `freestyle_messages`, `vocabulary_items`, `vocabulary_srs_state` and `vocabulary_answers`. Use `CREATE TABLE IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS`, with the columns exactly as in the spec's SQL. Also add `CREATE INDEX IF NOT EXISTS idx_vocab_answers_day ON vocabulary_answers(answered_on);`.

Then:
- add `new_words_per_day INTEGER NOT NULL DEFAULT 10 CHECK (new_words_per_day BETWEEN 0 AND 50)` and `deck_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (deck_review_cap BETWEEN 1 AND 500)` to the `profile` definition;
- add `migrateDeckSettings(db)`, which adds each column if it's missing (the same pattern as `migrateDailyReviewCap`). Call it last in `runMigrations`.

`lib/types.ts`: add `newWordsPerDay: number; deckReviewCap: number;` to `Profile`.

`lib/services/profileService.ts`:
- map the two columns;
- accept `newWordsPerDay?` and `deckReviewCap?` in `ProfileUpdate`;
- validate them with `ProfileUpdateError('New words per day must be a whole number from 0 to 50')` and `ProfileUpdateError('The flashcard review limit must be a whole number from 1 to 500')`;
- include them in the UPDATE.

Profile fixtures in tests gain `newWordsPerDay: 10, deckReviewCap: 50`. tsc lists them.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/deck lib/db lib/services/profileService.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib/deck lib/db lib/types.ts lib/services/profileService.ts lib/services/profileService.test.ts components test
git commit -m "feat: add freestyle and deck tables, deck settings, and the pure deck rules"
```

---

### Task 2: Word-list format, validation, and sample data

**Files:**
- Create:
  - `lib/deck/wordLists.ts`, `lib/deck/wordLists.test.ts`
  - `data/wortlisten/a1.json`, `a2.json`, `b1.json`, `b2.json`, `c1.json` (each with 3 real sample entries; Tasks 11–12 fill them)
  - `data/wortlisten/wortlisten.test.ts`

**Interfaces:**
- Produces:
  - `WordListEntry { lemma: string; partOfSpeech: string; plural: string | null; example: string; meaningEn: string; meaningDe: string }`
  - `WordListFile { level: CefrLevel; source: 'official' | 'nadoch'; entries: WordListEntry[] }`
  - `readWordList(level): WordListFile`
  - `wordListProblems(file: WordListFile, lowerKeys: Set<string>): string[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/deck/wordLists.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wordListProblems, type WordListFile } from './wordLists';

const file = (entries: WordListFile['entries']): WordListFile => ({ level: 'A1', source: 'official', entries });
const ok = { lemma: 'der Hund', partOfSpeech: 'noun', plural: 'die Hunde', example: 'Der Hund bellt.', meaningEn: 'dog', meaningDe: 'ein Haustier, das bellt' };

describe('wordListProblems', () => {
  it('accepts a well-formed list', () => {
    expect(wordListProblems(file([ok]), new Set())).toEqual([]);
  });

  it('names empty fields, nouns without an article, duplicates, and words from a lower level', () => {
    expect(
      wordListProblems(
        file([
          { ...ok, meaningDe: '' },
          { ...ok, lemma: 'Katze', partOfSpeech: 'noun' },
          { ...ok, lemma: 'der hund' },
          { ...ok, lemma: 'das Haus' },
        ]),
        new Set(['das haus'])
      )
    ).toEqual([
      'der Hund: meaningDe is empty',
      'Katze: a noun needs its article',
      'der hund: duplicate of an earlier entry',
      'das Haus: already in a lower level',
    ]);
  });
});
```

Create `data/wortlisten/wortlisten.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LEVELS } from '@/lib/tutoring/levels';
import { lemmaKey } from '@/lib/deck/lemmaKey';
import { readWordList, wordListProblems } from '@/lib/deck/wordLists';

describe('bundled word lists', () => {
  it('are valid, level by level, with no word repeated from a lower level', () => {
    const lower = new Set<string>();
    for (const level of LEVELS) {
      const file = readWordList(level);
      expect(file.level).toBe(level);
      expect(file.source).toBe(['B2', 'C1'].includes(level) ? 'nadoch' : 'official');
      expect(wordListProblems(file, lower)).toEqual([]);
      for (const e of file.entries) lower.add(lemmaKey(e.lemma));
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/deck/wordLists.test.ts data/wortlisten`
Expected: FAIL.

- [ ] **Step 3: Implement and add samples**

Create `lib/deck/wordLists.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CefrLevel } from '../types';
import { lemmaKey } from './lemmaKey';

export interface WordListEntry {
  lemma: string;
  partOfSpeech: string;
  plural: string | null;
  example: string;
  meaningEn: string;
  meaningDe: string;
}

export interface WordListFile {
  level: CefrLevel;
  source: 'official' | 'nadoch';
  entries: WordListEntry[];
}

export function readWordList(level: CefrLevel): WordListFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', 'wortlisten', `${level.toLowerCase()}.json`), 'utf8')) as WordListFile;
}

const ARTICLE = /^(der|die|das) \S/;

// Spec: Content validation. Messages name the lemma so a content fix is easy to find.
export function wordListProblems(file: WordListFile, lowerKeys: Set<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of file.entries) {
    for (const field of ['lemma', 'partOfSpeech', 'example', 'meaningEn', 'meaningDe'] as const) {
      if (!e[field] || !e[field].trim()) problems.push(`${e.lemma}: ${field} is empty`);
    }
    if (e.partOfSpeech === 'noun' && !ARTICLE.test(e.lemma)) problems.push(`${e.lemma}: a noun needs its article`);
    const key = lemmaKey(e.lemma);
    if (seen.has(key)) problems.push(`${e.lemma}: duplicate of an earlier entry`);
    else if (lowerKeys.has(key)) problems.push(`${e.lemma}: already in a lower level`);
    seen.add(key);
  }
  return problems;
}
```

Create the five files, each with 3 real sample entries, for example `data/wortlisten/a1.json`:

```json
{
  "level": "A1",
  "source": "official",
  "entries": [
    { "lemma": "der Hund", "partOfSpeech": "noun", "plural": "die Hunde", "example": "Der Hund spielt im Garten.", "meaningEn": "dog", "meaningDe": "ein Tier, das bellt" },
    { "lemma": "wohnen", "partOfSpeech": "verb", "plural": null, "example": "Ich wohne in Berlin.", "meaningEn": "to live (somewhere)", "meaningDe": "an einem Ort zu Hause sein" },
    { "lemma": "gestern", "partOfSpeech": "adverb", "plural": null, "example": "Gestern war ich im Kino.", "meaningEn": "yesterday", "meaningDe": "der Tag vor heute" }
  ]
}
```

A2, B1, B2 and C1 each get 3 different real words at their level. B2 and C1 use `"source": "nadoch"`. No word may repeat a lower level's.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/deck data/wortlisten`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deck/wordLists.ts lib/deck/wordLists.test.ts data/wortlisten
git commit -m "feat: add the word-list format, validation, and sample lists"
```

---

### Task 3: Deck service and routes

**Files:**
- Create:
  - `lib/deck/deckViews.ts`
  - `lib/services/deckService.ts`, `lib/services/deckService.test.ts`
  - `app/api/flashcards/route.ts`, `app/api/flashcards/count/route.ts`, `app/api/flashcards/answer/route.ts`, `app/api/flashcards/words/route.ts`
  - `app/api/flashcards/routes.test.ts`
- Modify: `lib/tutoring/errorCodes.ts` (`already_in_deck`, `session_exists`), `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: Tasks 1–2; `computeNextReview`, `FLASHCARD_GRADES`, `INITIAL_EASE`, `localDate`, `addDays`, `generateWithActiveProvider`, `isAiAvailable`.
- Produces:
  - `DeckCard { itemId: number; lemma: string; plural: string | null; meaning: LocalizedText; example: string | null }`
  - `DeckView { cards: DeckCard[]; dueCount: number; answeredToday: number; newWordsPerDay: number; deckReviewCap: number; aiAvailable: boolean }`
  - `createDeckService(db, deps?: { now?: () => Date; normalize?: (word, sentence) => Promise<NormalizeOutcome> })` → `{ getDeck(): DeckView; dueCount(): number; answer(itemId, rating): { nextDueAt: string }; addWord(word, sentence?): Promise<{ itemId: number; lemma: string; status: 'added' | 'activated' }>; listWords(query): { itemId; lemma; meaning: LocalizedText }[]; addFromLesson(input: { lemma; meaningEn; exerciseId; state: SrsState }): void }`
  - `DeckError(message, kind)`, where kind is `'not_found' | 'bad_request' | 'already_in_deck' | 'ai_failed'`, and `toDeckErrorResponse`.
  - `NormalizeOutcome = { ok: true; lemma; partOfSpeech; plural: string | null; meaningEn; meaningDe } | { ok: false; error; code? }` (the parser comes in Task 5; this task injects it).

- [ ] **Step 1: Write the failing tests**

Create `lib/services/deckService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createDeckService, DeckError } from './deckService';

function setup(opts: { day?: number; normalize?: ReturnType<typeof vi.fn> } = {}) {
  const db = createDbClient(':memory:');
  let day = opts.day ?? 29;
  const profiles = createProfileService(db);
  profiles.updateProfile({ onboardingComplete: true });
  const normalize =
    opts.normalize ??
    vi.fn(async (word: string) => ({ ok: true as const, lemma: word === 'hund' ? 'der Hund' : word, partOfSpeech: 'noun', plural: null, meaningEn: 'x', meaningDe: 'y' }));
  const service = createDeckService(db, { now: () => new Date(2026, 8, day, 10), normalize });
  return { db, service, profiles, normalize, setDay: (d: number) => (day = d) };
}

describe('deckService starter words', () => {
  it('imports the lists up to the active level and introduces N per day, lowest level first', () => {
    const { db, service, profiles } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'A2', activeLevel: 'A2' });
    profiles.updateProfile({ newWordsPerDay: 4 });
    const deck = service.getDeck();
    expect(deck.cards).toHaveLength(4);
    const levels = db.prepare("SELECT level FROM vocabulary_items WHERE status = 'learning' ORDER BY id").all() as { level: string }[];
    expect(levels.map((r) => r.level)).toEqual(['A1', 'A1', 'A1', 'A2']);
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'B1'").get()).toEqual({ n: 0 });
  });

  // Review Focus 3
  it('introduces only once per day however often the deck opens', () => {
    const { db, service, profiles } = setup();
    profiles.updateProfile({ newWordsPerDay: 2 });
    service.getDeck();
    service.getDeck();
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning'").get()).toEqual({ n: 2 });
  });

  // Review Focus 5
  it('imports the next level after a level change without re-introducing earlier words', () => {
    const { db, service, profiles, setDay } = setup();
    profiles.updateProfile({ newWordsPerDay: 3 });
    service.getDeck();
    profiles.writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
    setDay(30);
    service.getDeck();
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE level = 'B1'").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE status = 'learning'").get()).toEqual({ n: 6 });
  });
});

describe('deckService answers', () => {
  it('moves the schedule on the first answer of the day only, and respects the daily cap', () => {
    const { service, profiles } = setup();
    profiles.updateProfile({ newWordsPerDay: 3, deckReviewCap: 2 });
    const deck = service.getDeck();
    expect(deck.cards).toHaveLength(2);
    const first = service.answer(deck.cards[0].itemId, 'knew');
    expect(service.answer(deck.cards[0].itemId, 'didnt_know')).toEqual(first);
    service.answer(deck.cards[1].itemId, 'sort_of');
    expect(service.getDeck().answeredToday).toBe(2);
    expect(service.getDeck().cards).toHaveLength(0);
  });

  it('rejects an unknown item', () => {
    const { service } = setup();
    expect(() => service.answer(999, 'knew')).toThrow(DeckError);
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
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'der hund'").get()).toEqual({ n: 1 });
  });

  it('keeps an added word as one item when the starter import runs later', async () => {
    const { db, service } = setup();
    await service.addWord('hund');
    service.getDeck();
    expect(db.prepare("SELECT COUNT(*) AS n FROM vocabulary_items WHERE lemma_key = 'der hund'").get()).toEqual({ n: 1 });
  });

  it('reports an AI failure', async () => {
    const normalize = vi.fn(async () => ({ ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const }));
    const { service } = setup({ normalize });
    await expect(service.addWord('Katze')).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });
  });
});
```

These tests read the real `data/wortlisten/*.json` files. With Task 2's samples (3 per level), the counts above hold, and `der Hund` is an A1 sample.

Create `app/api/flashcards/routes.test.ts`. Use the `GAIT_DATA_DIR` pattern of the other route tests, with an onboarded profile. Cover:
- `GET /api/flashcards` returns `cards`;
- `GET /api/flashcards/count` returns `{ due }`;
- `POST /api/flashcards/answer` with a bad body returns 400;
- `POST /api/flashcards/answer` with an unknown `itemId` returns 404;
- `POST /api/flashcards/words` with no AI provider returns 502 with `code: 'no_provider'`.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { GET as getDeck } from './route';
import { GET as getCount } from './count/route';
import { POST as answer } from './answer/route';
import { POST as addWord } from './words/route';

const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));

describe('/api/flashcards', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-deck-'));
    createProfileService(getDb()).updateProfile({ onboardingComplete: true });
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('serves the deck and its count, and validates answers', async () => {
    const deck = await (await getDeck()).json();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(await (await getCount()).json()).toEqual({ due: deck.cards.length });
    expect((await post(answer, { itemId: 'x', rating: 'knew' })).status).toBe(400);
    expect((await post(answer, { itemId: 9999, rating: 'knew' })).status).toBe(404);
  });

  it('needs an AI provider to add a word', async () => {
    const res = await post(addWord, { word: 'Katze' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'no_provider' });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/deckService.test.ts app/api/flashcards`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/tutoring/errorCodes.ts`: add `| 'already_in_deck' | 'session_exists'`.

Catalogs, `errors` namespace:
- en `"already_in_deck": "This word is already in your deck", "session_exists": "A session is already open for this mode"`;
- de `"already_in_deck": "Dieses Wort ist schon in deinem Kartenstapel", "session_exists": "Für diesen Modus ist schon eine Sitzung offen"`.

Create `lib/deck/deckViews.ts`:

```ts
import type { LocalizedText } from '../i18n/localizedText';

export interface DeckCard {
  itemId: number;
  lemma: string;
  plural: string | null;
  meaning: LocalizedText;
  example: string | null;
}

export interface DeckView {
  cards: DeckCard[];
  dueCount: number;
  answeredToday: number;
  newWordsPerDay: number;
  deckReviewCap: number;
  aiAvailable: boolean;
}
```

Create `lib/services/deckService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import { lemmaKey } from '../deck/lemmaKey';
import { selectIntroductions } from '../deck/introduction';
import { deckRemaining, selectDeckDue } from '../deck/deckQueue';
import { readWordList } from '../deck/wordLists';
import type { DeckView } from '../deck/deckViews';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { localDate } from '../tutoring/dates';
import { FLASHCARD_GRADES, type FlashcardRating } from '../tutoring/lessonAnswers';
import { LEVELS, isAtOrBelow } from '../tutoring/levels';
import { computeNextReview, INITIAL_EASE, type SrsState } from '../tutoring/srs';
import { isAiAvailable } from './aiService';
import { createProfileService } from './profileService';

export type NormalizeOutcome =
  | { ok: true; lemma: string; partOfSpeech: string; plural: string | null; meaningEn: string; meaningDe: string }
  | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };

export type DeckErrorKind = 'not_found' | 'bad_request' | 'already_in_deck' | 'ai_failed';
const STATUS: Record<DeckErrorKind, number> = { not_found: 404, bad_request: 400, already_in_deck: 409, ai_failed: 502 };
const CODE: Record<DeckErrorKind, ErrorCode> = { not_found: 'not_found', bad_request: 'bad_request', already_in_deck: 'already_in_deck', ai_failed: 'ai_failed' };

export class DeckError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: DeckErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toDeckErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof DeckError)) return null;
  return { status: STATUS[err.kind], body: errorBody(err.message, err.code, err.params) };
}

interface ItemRow {
  id: number;
  lemma: string;
  plural: string | null;
  meaning_en: string;
  meaning_de: string;
  example: string | null;
  next_due_at: string;
}

export function createDeckService(
  db: Database.Database,
  deps: { now?: () => Date; normalize?: (word: string, sentence: string | null) => Promise<NormalizeOutcome> } = {}
) {
  const now = deps.now ?? (() => new Date());
  const profiles = createProfileService(db);

  function today(): string {
    return localDate(now());
  }

  // Spec: every level up to the active one is imported as not_started. Idempotent by lemma_key:
  // a word the student already added keeps its item and state (Review Focus 2).
  function importStarterLists(activeLevel: CefrLevel): void {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO vocabulary_items
         (lemma, lemma_key, part_of_speech, plural, meaning_en, meaning_de, example, level, source, source_ref, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'starter', ?, 'not_started', ?)`
    );
    const at = now().toISOString();
    for (const level of LEVELS.filter((l) => isAtOrBelow(l, activeLevel))) {
      const imported = db.prepare("SELECT 1 FROM vocabulary_items WHERE source = 'starter' AND level = ? LIMIT 1").get(level);
      if (imported) continue;
      readWordList(level).entries.forEach((e, index) =>
        insert.run(e.lemma, lemmaKey(e.lemma), e.partOfSpeech, e.plural, e.meaningEn, e.meaningDe, e.example, level, `${level}:${index}`, at)
      );
    }
  }

  function introduceToday(perDay: number): void {
    const day = today();
    const alreadyToday = (db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items WHERE introduced_on = ?').get(day) as { n: number }).n;
    const candidates = (
      db.prepare("SELECT id, level, source_ref FROM vocabulary_items WHERE status = 'not_started' AND source = 'starter'").all() as {
        id: number;
        level: CefrLevel | null;
        source_ref: string;
      }[]
    ).map((r) => ({ id: r.id, level: r.level, order: Number(r.source_ref.split(':')[1] ?? 0) }));
    const ids = selectIntroductions(candidates, alreadyToday, perDay);
    const activate = db.prepare("UPDATE vocabulary_items SET status = 'learning', introduced_on = ? WHERE id = ?");
    const schedule = db.prepare(
      `INSERT OR IGNORE INTO vocabulary_srs_state (item_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
       VALUES (?, 0, ?, 0, ?, ?)`
    );
    for (const id of ids) {
      activate.run(day, id);
      schedule.run(id, INITIAL_EASE, day, now().toISOString());
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
      introduceToday(profile.newWordsPerDay);
    })();
    const answered = answeredToday();
    const due = selectDeckDue(
      dueRows().map((r) => ({ ...r, itemId: r.id, nextDueAt: r.next_due_at })),
      today(),
      deckRemaining(profile.deckReviewCap, answered)
    );
    return {
      cards: due.map((r) => ({
        itemId: r.id,
        lemma: r.lemma,
        plural: r.plural,
        meaning: { en: r.meaning_en, de: r.meaning_de },
        example: r.example,
      })),
      dueCount: due.length,
      answeredToday: answered,
      newWordsPerDay: profile.newWordsPerDay,
      deckReviewCap: profile.deckReviewCap,
      aiAvailable: isAiAvailable(db),
    };
  }

  function dueCount(): number {
    return getDeck().dueCount;
  }

  function answer(itemId: number, rating: FlashcardRating): { nextDueAt: string } {
    const state = db
      .prepare('SELECT repetitions, ease_factor, interval_days, next_due_at FROM vocabulary_srs_state WHERE item_id = ?')
      .get(itemId) as { repetitions: number; ease_factor: number; interval_days: number; next_due_at: string } | undefined;
    if (!state) throw new DeckError(`Card not found: ${itemId}`, 'not_found');
    const day = today();
    const at = now().toISOString();
    return db.transaction(() => {
      const firstToday = !db.prepare('SELECT 1 FROM vocabulary_answers WHERE item_id = ? AND answered_on = ?').get(itemId, day);
      db.prepare('INSERT INTO vocabulary_answers (item_id, rating, answered_on, answered_at) VALUES (?, ?, ?, ?)').run(itemId, rating, day, at);
      if (!firstToday) return { nextDueAt: state.next_due_at };
      const next = computeNextReview(
        { repetitions: state.repetitions, easeFactor: state.ease_factor, intervalDays: state.interval_days, nextDueAt: state.next_due_at },
        FLASHCARD_GRADES[rating],
        day
      );
      db.prepare(
        'UPDATE vocabulary_srs_state SET repetitions = ?, ease_factor = ?, interval_days = ?, next_due_at = ?, updated_at = ? WHERE item_id = ?'
      ).run(next.repetitions, next.easeFactor, next.intervalDays, next.nextDueAt, at, itemId);
      return { nextDueAt: next.nextDueAt };
    })();
  }

  async function addWord(word: string, sentence: string | null = null): Promise<{ itemId: number; lemma: string; status: 'added' | 'activated' }> {
    if (!word?.trim()) throw new DeckError('Type a word first', 'bad_request');
    if (!deps.normalize) throw new DeckError('Adding words needs the AI', 'ai_failed', 'no_provider');
    const normalized = await deps.normalize(word.trim(), sentence);
    if (!normalized.ok) throw new DeckError(normalized.error, 'ai_failed', normalized.code, normalized.params);
    const key = lemmaKey(normalized.lemma);
    const at = now().toISOString();
    const day = today();
    return db.transaction(() => {
      const existing = db.prepare('SELECT id, lemma, status FROM vocabulary_items WHERE lemma_key = ?').get(key) as
        | { id: number; lemma: string; status: 'not_started' | 'learning' }
        | undefined;
      if (existing?.status === 'learning') throw new DeckError('This word is already in your deck', 'already_in_deck');
      const schedule = db.prepare(
        `INSERT OR IGNORE INTO vocabulary_srs_state (item_id, repetitions, ease_factor, interval_days, next_due_at, updated_at) VALUES (?, 0, ?, 0, ?, ?)`
      );
      if (existing) {
        db.prepare("UPDATE vocabulary_items SET status = 'learning' WHERE id = ?").run(existing.id);
        schedule.run(existing.id, INITIAL_EASE, day, at);
        return { itemId: existing.id, lemma: existing.lemma, status: 'activated' as const };
      }
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO vocabulary_items (lemma, lemma_key, part_of_speech, plural, meaning_en, meaning_de, example, level, source, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'freestyle', 'learning', ?)`
        )
        .run(normalized.lemma, key, normalized.partOfSpeech, normalized.plural, normalized.meaningEn, normalized.meaningDe, sentence, at);
      schedule.run(Number(lastInsertRowid), INITIAL_EASE, day, at);
      return { itemId: Number(lastInsertRowid), lemma: normalized.lemma, status: 'added' as const };
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

  // Task 4: a vocabulary-lesson flashcard enters the deck with its review state; an existing item
  // with the same lemma is kept, activated, and gets the earlier due date.
  function addFromLesson(input: { lemma: string; meaningEn: string; exerciseId: string; state: SrsState }): void {
    const key = lemmaKey(input.lemma);
    const at = now().toISOString();
    const existing = db.prepare('SELECT id FROM vocabulary_items WHERE lemma_key = ?').get(key) as { id: number } | undefined;
    let itemId: number;
    if (existing) {
      itemId = existing.id;
      db.prepare("UPDATE vocabulary_items SET status = 'learning' WHERE id = ?").run(itemId);
    } else {
      itemId = Number(
        db
          .prepare(
            `INSERT INTO vocabulary_items (lemma, lemma_key, meaning_en, meaning_de, source, source_ref, status, created_at)
             VALUES (?, ?, ?, '', 'lesson', ?, 'learning', ?)`
          )
          .run(input.lemma, key, input.meaningEn, input.exerciseId, at).lastInsertRowid
      );
    }
    const current = db.prepare('SELECT next_due_at FROM vocabulary_srs_state WHERE item_id = ?').get(itemId) as { next_due_at: string } | undefined;
    if (!current) {
      db.prepare(
        'INSERT INTO vocabulary_srs_state (item_id, repetitions, ease_factor, interval_days, next_due_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(itemId, input.state.repetitions, input.state.easeFactor, input.state.intervalDays, input.state.nextDueAt, at);
    } else if (input.state.nextDueAt < current.next_due_at) {
      db.prepare('UPDATE vocabulary_srs_state SET next_due_at = ?, updated_at = ? WHERE item_id = ?').run(input.state.nextDueAt, at, itemId);
    }
  }

  return { getDeck, dueCount, answer, addWord, listWords, addFromLesson };
}

export type DeckService = ReturnType<typeof createDeckService>;
```

Routes:
- **`app/api/flashcards/route.ts`:** `GET` → `createDeckService(getDb()).getDeck()`.
- **`count/route.ts`:** `GET` → `{ due: createDeckService(getDb()).dueCount() }`.
- **`answer/route.ts`:** `POST`
  - validates `itemId` (integer) and `rating` (one of `'knew' | 'sort_of' | 'didnt_know'`), otherwise 400 with `errorBody(..., 'bad_request')`;
  - calls `answer`;
  - maps `DeckError` through `toDeckErrorResponse`.
- **`words/route.ts`:**
  - `GET` → `listWords(new URL(request.url).searchParams.get('query') ?? '')`.
  - `POST` validates `word` (non-empty string) and `sentence` (optional string), then calls:

```ts
    const service = createDeckService(getDb(), { normalize: (word, sentence) => normalizeWord(getDb(), word, sentence) });
```

where `normalizeWord` comes from `lib/services/freestyleAi.ts` (Task 5). In this task, add `lib/services/freestyleAi.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { NormalizeOutcome } from './deckService';
import { generateWithActiveProvider } from './aiService';
import { buildNormalizePrompt } from '../freestyle/prompts';
import { parseNormalizeReply } from '../freestyle/replies';

export async function normalizeWord(db: Database.Database, word: string, sentence: string | null): Promise<NormalizeOutcome> {
  const reply = await generateWithActiveProvider(db, buildNormalizePrompt(word, sentence));
  if (!reply.ok) return reply;
  const parsed = parseNormalizeReply(reply.text);
  return parsed ? { ok: true, ...parsed } : { ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' };
}
```

Because Task 5 writes `buildNormalizePrompt` and `parseNormalizeReply`, **do Task 5 Step 3's `prompts.ts` and `replies.ts` normalize parts here**. They're shown in Task 5, and Task 5 adds the rest.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/deckService.test.ts app/api/flashcards && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib/deck/deckViews.ts lib/services/deckService.ts lib/services/deckService.test.ts lib/services/freestyleAi.ts lib/freestyle app/api/flashcards lib/tutoring/errorCodes.ts messages
git commit -m "feat: add the vocabulary deck service and routes"
```

---

### Task 4: Lesson flashcards move into the deck

**Files:**
- Modify:
  - `lib/services/attemptService.ts`, `lib/services/attemptService.test.ts`
  - `lib/services/testOutService.ts`, `lib/services/testOutService.test.ts`
  - `lib/services/progressService.ts`, `lib/services/progressService.test.ts`
  - `lib/db/schema.ts`
- Create: `lib/db/flashcardDeckMigration.test.ts`

**Interfaces:**
- Consumes: `createDeckService(db).addFromLesson` (Task 3), `seedReview`, `INITIAL_EASE`, `addDays`, `lemmaKey`.
- Produces: `migrateFlashcardReviewsToDeck(db)` in `schema.ts`, run last in `runMigrations`.

- [ ] **Step 1: Write the failing tests**

In `lib/services/attemptService.test.ts`, add (the fixture's `a1-greet` has the flashcard `a1-greet__ex2`: front "der Hund", back "the dog"):

```ts
  it('sends a completed vocabulary lesson’s flashcards to the deck, not the Daily Queue', async () => {
    const { db, service } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(db.prepare("SELECT exercise_id FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex2'").get()).toBeUndefined();
    expect(db.prepare("SELECT lemma, meaning_en, source, source_ref, status FROM vocabulary_items").get()).toEqual({
      lemma: 'der Hund',
      meaning_en: 'the dog',
      source: 'lesson',
      source_ref: 'a1-greet__ex2',
      status: 'learning',
    });
    const state = db.prepare('SELECT repetitions, next_due_at FROM vocabulary_srs_state').get();
    expect(state).toEqual({ repetitions: 1, next_due_at: '2026-09-27' }); // right on the first try → in 3 days
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex1'").get()).toBeTruthy();
  });
```

In `lib/services/progressService.test.ts`, add:

```ts
  it('never puts flashcard exercises in the Daily Queue', () => {
    const { db, progress } = setup();
    scheduleReview(db, 'a1-greet__ex2', '2026-09-20');
    scheduleReview(db, 'a1-greet__ex1', '2026-09-20');
    expect(progress.getDailyQueue('2026-09-29').items.map((i) => i.exercise.id)).toEqual(['a1-greet__ex1']);
  });
```

In `lib/services/testOutService.test.ts`, extend the pass test: after passing, the flashcard `a1-late3__card` is **not** in `exercise_srs_state`, and a `vocabulary_items` row with `source_ref: 'a1-late3__card'` exists. Its `next_due_at` is `2026-09-30`, or stays `2026-12-01` if the test pre-scheduled it: remove that `scheduleReview` line and its expectation, since flashcards no longer have exercise reviews.

Create `lib/db/flashcardDeckMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';
import { runMigrations } from './schema';
import { seedTutoringCurriculum, scheduleReview } from '@/test/tutoringFixtures';

describe('migrateFlashcardReviewsToDeck', () => {
  it('moves existing flashcard reviews into the deck with their state and removes them from the exercise reviews', () => {
    const db = createDbClient(':memory:');
    seedTutoringCurriculum(db);
    scheduleReview(db, 'a1-greet__ex2', '2026-10-03');
    scheduleReview(db, 'a1-greet__ex1', '2026-10-03');
    runMigrations(db);
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex2'").get()).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM exercise_srs_state WHERE exercise_id = 'a1-greet__ex1'").get()).toBeTruthy();
    expect(
      db.prepare("SELECT i.lemma, s.next_due_at, s.repetitions FROM vocabulary_items i JOIN vocabulary_srs_state s ON s.item_id = i.id").get()
    ).toEqual({ lemma: 'der Hund', next_due_at: '2026-10-03', repetitions: 1 });
    runMigrations(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM vocabulary_items').get()).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/attemptService.test.ts lib/services/progressService.test.ts lib/services/testOutService.test.ts lib/db/flashcardDeckMigration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/services/attemptService.ts`:
- import `createDeckService` and `FlashcardContent`;
- in `seedFromFirstAttempt`, send flashcards to the deck:

```ts
  function seedFromFirstAttempt(exerciseId: string, today: string, at: string): void {
    const first = db
      .prepare('SELECT result FROM lesson_attempts WHERE exercise_id = ? ORDER BY id LIMIT 1')
      .get(exerciseId) as { result: GradeResult } | undefined;
    if (!first) return;
    const exercise = getExercise(exerciseId);
    const state = seedReview(first.result, today);
    // Freestyle spec: vocabulary flashcards live in the deck, not the Daily Queue.
    if (exercise.type === 'flashcard') {
      const card = exercise.content as FlashcardContent;
      createDeckService(db, { now }).addFromLesson({ lemma: card.front, meaningEn: card.back, exerciseId, state });
      return;
    }
    writeSrs(exerciseId, state, at);
  }
```

- in `recordAttempt`'s completed-lesson branch, skip the schedule update for flashcards. Change `else if (firstToday) writeSrs(...)` to `else if (firstToday && exercise.type !== 'flashcard') writeSrs(...)`, and change `if (!state) seedFromFirstAttempt(...)` so it runs for flashcards too (it already routes them to the deck).

`lib/services/progressService.ts`: in `getDailyQueue`'s SQL, add `AND e.type != 'flashcard'` to the `WHERE`.

`lib/services/testOutService.ts`: in `finish`, for each exercise of a completed lesson that isn't proven, check its type:
- a flashcard calls `createDeckService(db, { now }).addFromLesson({ lemma: content.front, meaningEn: content.back, exerciseId: id, state: { repetitions: 0, easeFactor: INITIAL_EASE, intervalDays: 1, nextDueAt: tomorrow } })`;
- anything else calls `schedule.run(...)` as before.

Change the `exercisesOf` query to `SELECT id, type, content FROM exercises …`.

`lib/db/schema.ts`: add `import { lemmaKey } from '../deck/lemmaKey';` and:

```ts
// Freestyle spec: existing flashcard reviews move into the vocabulary deck with their state.
function migrateFlashcardReviewsToDeck(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT s.exercise_id, s.repetitions, s.ease_factor, s.interval_days, s.next_due_at, s.updated_at, e.content
       FROM exercise_srs_state s JOIN exercises e ON e.id = s.exercise_id WHERE e.type = 'flashcard'`
    )
    .all() as { exercise_id: string; repetitions: number; ease_factor: number; interval_days: number; next_due_at: string; updated_at: string; content: string }[];
  for (const row of rows) {
    const { front, back } = JSON.parse(row.content) as { front: string; back: string };
    const key = lemmaKey(front);
    db.prepare(
      `INSERT OR IGNORE INTO vocabulary_items (lemma, lemma_key, meaning_en, meaning_de, source, source_ref, status, created_at)
       VALUES (?, ?, ?, '', 'lesson', ?, 'learning', ?)`
    ).run(front, key, back, row.exercise_id, row.updated_at);
    const { id } = db.prepare('SELECT id FROM vocabulary_items WHERE lemma_key = ?').get(key) as { id: number };
    db.prepare("UPDATE vocabulary_items SET status = 'learning' WHERE id = ?").run(id);
    db.prepare(
      `INSERT INTO vocabulary_srs_state (item_id, repetitions, ease_factor, interval_days, next_due_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET next_due_at = MIN(next_due_at, excluded.next_due_at)`
    ).run(id, row.repetitions, row.ease_factor, row.interval_days, row.next_due_at, row.updated_at);
    db.prepare('DELETE FROM exercise_srs_state WHERE exercise_id = ?').run(row.exercise_id);
  }
}
```

Call it last in `runMigrations`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Existing queue tests that expected a flashcard in the Daily Queue now expect it absent. Update only those expectations, and list them in your report.

- [ ] **Step 5: Commit**

```bash
git add -A lib
git commit -m "feat: move vocabulary-lesson flashcards into the deck"
```

---

### Task 5: AI JSON helper, Freestyle prompts and reply parsers, registries

**Files:**
- Create:
  - `lib/ai/json.ts`
  - `lib/freestyle/modes.ts`, `lib/freestyle/scenarios.ts`, `lib/freestyle/prompts.ts`, `lib/freestyle/replies.ts`
  - `lib/freestyle/freestyle.test.ts`

**Interfaces:**
- Produces:
  - `extractJsonObject(text: string): Record<string, unknown> | null`
  - `FreestyleMode = 'conversation' | 'grammar_drill' | 'free_reading' | 'free_writing' | 'spoken' | 'exam_practice'`
  - `FREESTYLE_MODES: { mode: FreestyleMode; labelKey: string; enabled: boolean }[]` (spoken and exam_practice disabled), and `isFreestyleMode(v)`
  - `Scenario { id: string; level: CefrLevel; title: LocalizedText; opener: string }`, `SCENARIOS: Scenario[]`, and `scenariosFor(level)`
  - `Correction { wrong: string; right: string; reason: LocalizedText }`
  - Prompt builders, each returning `{ systemPrompt: string; messages: ChatMessage[] }`:
    - `buildNormalizePrompt(word, sentence)`
    - `buildConversationPrompt({ level, scenario: string | null, history, message })`
    - `buildDrillPrompt({ level, topic, history, answer: string | null })`
    - `buildArticlePrompt({ level, topic })`
    - `buildWritingPrompt({ level, prompt, text })`
    - `buildSummaryPrompt({ mode, level, transcript })`
  - Parsers, each returning `null` for a malformed reply:
    - `parseNormalizeReply` → `{ lemma, partOfSpeech, plural: string | null, meaningEn, meaningDe }`
    - `parseConversationReply` → `{ corrections: Correction[]; reply: string }`
    - `parseDrillReply` → `{ verdict: GradeResult | null; explanation: LocalizedText | null; next: string }`
    - `parseArticleReply` → `{ title; text; questions: { question; options: string[]; correctIndex: number }[] }` (3–5 questions)
    - `parseWritingReply` → `{ corrections: Correction[]; corrected: string; comment: LocalizedText }`
    - `parseSummaryReply` → `{ wentWell: LocalizedText[]; mistakes: LocalizedText[]; words: { lemma: string; meaningEn: string }[] }`
  - `ARTICLE_WORDS: Record<CefrLevel, number> = { A1: 120, A2: 180, B1: 250, B2: 350, C1: 450 }`

- [ ] **Step 1: Write the failing tests**

Create `lib/freestyle/freestyle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractJsonObject } from '../ai/json';
import { FREESTYLE_MODES } from './modes';
import { SCENARIOS, scenariosFor } from './scenarios';
import {
  buildArticlePrompt,
  buildConversationPrompt,
  buildDrillPrompt,
  buildNormalizePrompt,
  buildSummaryPrompt,
  buildWritingPrompt,
} from './prompts';
import {
  parseArticleReply,
  parseConversationReply,
  parseDrillReply,
  parseNormalizeReply,
  parseSummaryReply,
  parseWritingReply,
} from './replies';

const correction = { wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason_en: 'gehen uses sein', reason_de: 'gehen mit sein' };

describe('extractJsonObject', () => {
  it('finds the object inside surrounding text and rejects non-objects', () => {
    expect(extractJsonObject('Sure! {"a": 1} Done.')).toEqual({ a: 1 });
    expect(extractJsonObject('[1,2]')).toBeNull();
    expect(extractJsonObject('no json')).toBeNull();
  });
});

describe('registries', () => {
  it('enables the four built modes only', () => {
    expect(FREESTYLE_MODES.filter((m) => m.enabled).map((m) => m.mode)).toEqual(['conversation', 'grammar_drill', 'free_reading', 'free_writing']);
  });

  it('has scenarios for every level with both title languages and a German opener', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1'] as const) expect(scenariosFor(level).length).toBeGreaterThanOrEqual(2);
    for (const s of SCENARIOS) {
      expect(s.title.en.trim() && s.title.de.trim() && s.opener.trim()).toBeTruthy();
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });
});

describe('prompts', () => {
  it('pins the level, the German-only rule, and the reply shape', () => {
    const conversation = buildConversationPrompt({ level: 'B1', scenario: 'Arzttermin', history: [], message: 'Hallo' });
    expect(conversation.systemPrompt).toContain('CEFR level B1');
    expect(conversation.systemPrompt).toContain('"corrections"');
    expect(conversation.systemPrompt).toContain('Arzttermin');
    expect(buildDrillPrompt({ level: 'A2', topic: 'Perfekt', history: [], answer: null }).systemPrompt).toContain('Perfekt');
    expect(buildArticlePrompt({ level: 'A1', topic: 'Sport' }).systemPrompt).toContain('about 120 words');
    expect(buildWritingPrompt({ level: 'B1', prompt: 'Urlaub', text: 'Ich war…' }).systemPrompt).toContain('"corrected"');
    expect(buildSummaryPrompt({ mode: 'conversation', level: 'B1', transcript: 'user: Hallo' }).systemPrompt).toContain('"wentWell"');
    expect(buildNormalizePrompt('hund', 'Der hund bellt.').messages[0].content).toContain('hund');
  });
});

describe('reply parsers', () => {
  it('parse well-formed replies', () => {
    expect(parseNormalizeReply('{"lemma":"der Hund","partOfSpeech":"noun","plural":"die Hunde","meaningEn":"dog","meaningDe":"ein Haustier"}')).toEqual({
      lemma: 'der Hund',
      partOfSpeech: 'noun',
      plural: 'die Hunde',
      meaningEn: 'dog',
      meaningDe: 'ein Haustier',
    });
    expect(parseConversationReply(JSON.stringify({ corrections: [correction], reply: 'Wann?' }))).toEqual({
      corrections: [{ wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason: { en: 'gehen uses sein', de: 'gehen mit sein' } }],
      reply: 'Wann?',
    });
    expect(parseDrillReply('{"verdict":null,"explanation_en":null,"explanation_de":null,"next":"Frage 1?"}')).toEqual({
      verdict: null,
      explanation: null,
      next: 'Frage 1?',
    });
    expect(
      parseArticleReply(
        JSON.stringify({
          title: 'Sport',
          text: 'Text.',
          questions: [1, 2, 3].map((n) => ({ question: `F${n}?`, options: ['a', 'b', 'c'], correctIndex: 1 })),
        })
      )?.questions
    ).toHaveLength(3);
    expect(parseWritingReply(JSON.stringify({ corrections: [], corrected: 'X.', comment_en: 'Good.', comment_de: 'Gut.' }))).toEqual({
      corrections: [],
      corrected: 'X.',
      comment: { en: 'Good.', de: 'Gut.' },
    });
    expect(
      parseSummaryReply(
        JSON.stringify({ wentWell: [{ en: 'a', de: 'b' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] })
      )
    ).toEqual({ wentWell: [{ en: 'a', de: 'b' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] });
  });

  it('reject malformed replies', () => {
    expect(parseNormalizeReply('{"lemma":"der Hund"}')).toBeNull();
    expect(parseConversationReply('{"reply":"x","corrections":[{"wrong":"a"}]}')).toBeNull();
    expect(parseDrillReply('{"verdict":"maybe","next":"x"}')).toBeNull();
    expect(parseArticleReply('{"title":"t","text":"x","questions":[{"question":"q","options":["a"],"correctIndex":3}]}')).toBeNull();
    expect(parseArticleReply(JSON.stringify({ title: 't', text: 'x', questions: [{ question: 'q', options: ['a', 'b'], correctIndex: 0 }] }))).toBeNull();
    expect(parseWritingReply('{"corrected":"x"}')).toBeNull();
    expect(parseSummaryReply('{"wentWell":"good"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/freestyle`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/ai/json.ts`:

```ts
// The one JSON object in an AI reply, even with prose around it; null if there is none.
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
```

Create `lib/freestyle/modes.ts`:

```ts
export type FreestyleMode = 'conversation' | 'grammar_drill' | 'free_reading' | 'free_writing' | 'spoken' | 'exam_practice';

// Spec: modes whose module isn't built yet stay registered but hidden. Speaking and Reading flip them.
export const FREESTYLE_MODES: { mode: FreestyleMode; labelKey: string; enabled: boolean }[] = [
  { mode: 'conversation', labelKey: 'conversation', enabled: true },
  { mode: 'grammar_drill', labelKey: 'grammarDrill', enabled: true },
  { mode: 'free_reading', labelKey: 'freeReading', enabled: true },
  { mode: 'free_writing', labelKey: 'freeWriting', enabled: true },
  { mode: 'spoken', labelKey: 'spoken', enabled: false },
  { mode: 'exam_practice', labelKey: 'examPractice', enabled: false },
];

export function isFreestyleMode(value: unknown): value is FreestyleMode {
  return FREESTYLE_MODES.some((m) => m.mode === value);
}

export function isModeEnabled(mode: FreestyleMode): boolean {
  return FREESTYLE_MODES.some((m) => m.mode === mode && m.enabled);
}
```

Create `lib/freestyle/scenarios.ts`, with 2 scenarios per level now (Task 12 brings each level to 6–10):

```ts
import type { CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';

export interface Scenario {
  id: string;
  level: CefrLevel;
  title: LocalizedText;
  // the partner's first line, in German at the level
  opener: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'a1-cafe', level: 'A1', title: { en: 'Ordering at a café', de: 'Im Café bestellen' }, opener: 'Hallo! Was möchtest du trinken?' },
  { id: 'a1-introduce', level: 'A1', title: { en: 'Introducing yourself', de: 'Sich vorstellen' }, opener: 'Hallo, ich bin Lena. Wie heißt du?' },
  { id: 'a2-weekend', level: 'A2', title: { en: 'Talking about the weekend', de: 'Über das Wochenende sprechen' }, opener: 'Na, was hast du am Wochenende gemacht?' },
  { id: 'a2-shop', level: 'A2', title: { en: 'Buying clothes', de: 'Kleidung kaufen' }, opener: 'Guten Tag! Kann ich Ihnen helfen?' },
  { id: 'b1-doctor', level: 'B1', title: { en: 'Making a doctor’s appointment', de: 'Einen Arzttermin vereinbaren' }, opener: 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?' },
  { id: 'b1-flat', level: 'B1', title: { en: 'Viewing a flat', de: 'Eine Wohnung besichtigen' }, opener: 'Willkommen! Das ist die Wohnung. Haben Sie schon Fragen?' },
  { id: 'b2-job', level: 'B2', title: { en: 'A job interview', de: 'Ein Vorstellungsgespräch' }, opener: 'Schön, dass Sie da sind. Erzählen Sie doch kurz von sich.' },
  { id: 'b2-complaint', level: 'B2', title: { en: 'A complaint at customer service', de: 'Eine Reklamation beim Kundenservice' }, opener: 'Kundenservice, mein Name ist Hoffmann. Worum geht es?' },
  { id: 'c1-debate', level: 'C1', title: { en: 'Debating remote work', de: 'Über Homeoffice diskutieren' }, opener: 'Ich finde, Homeoffice sollte die Regel sein. Wie sehen Sie das?' },
  { id: 'c1-negotiation', level: 'C1', title: { en: 'Negotiating a salary', de: 'Ein Gehalt verhandeln' }, opener: 'Wir haben Ihr Angebot geprüft. Welche Vorstellungen haben Sie?' },
];

export function scenariosFor(level: CefrLevel): Scenario[] {
  return SCENARIOS.filter((s) => s.level === level);
}
```

Create `lib/freestyle/prompts.ts`:

```ts
import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { FreestyleMode } from './modes';

export const ARTICLE_WORDS: Record<CefrLevel, number> = { A1: 120, A2: 180, B1: 250, B2: 350, C1: 450 };
const CORRECTIONS =
  '"corrections": a list (possibly empty) of the learner\'s mistakes in their last message, each {"wrong": the exact wrong words, "right": the corrected words, "reason_en": one short English sentence, "reason_de": the same reason in simple German}';

type Built = { systemPrompt: string; messages: ChatMessage[] };
type History = { role: 'user' | 'assistant'; content: string }[];

export function buildNormalizePrompt(word: string, sentence: string | null): Built {
  return {
    systemPrompt: [
      'You normalize a German word a learner wants to save as a flashcard.',
      'Give its dictionary form (nouns with der/die/das, verbs in the infinitive, adjectives uninflected), its part of speech, its plural for nouns (with "die") or null, a short English meaning, and a one-line simple German meaning.',
      'Reply with only a JSON object: {"lemma": "...", "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "other", "plural": "..." | null, "meaningEn": "...", "meaningDe": "..."}',
    ].join('\n'),
    messages: [{ role: 'user', content: sentence ? `Word: ${word}\nSentence: ${sentence}` : `Word: ${word}` }],
  };
}

export function buildConversationPrompt(input: { level: CefrLevel; scenario: string | null; history: History; message: string }): Built {
  return {
    systemPrompt: [
      `You are a friendly German conversation partner. The learner is at CEFR level ${input.level}.`,
      input.scenario ? `Stay in this scenario: ${input.scenario}.` : 'Talk about whatever the learner brings up.',
      `Reply only in German, using words and grammar appropriate for CEFR level ${input.level}, in one to three sentences, and keep the conversation going with a question when it fits.`,
      `Reply with only a JSON object: {${CORRECTIONS}, "reply": "your German reply"}`,
    ].join('\n'),
    messages: [...input.history.slice(-20), { role: 'user', content: input.message }],
  };
}

export function buildDrillPrompt(input: { level: CefrLevel; topic: string; history: History; answer: string | null }): Built {
  return {
    systemPrompt: [
      `You run a short grammar drill on "${input.topic}" for a German learner at CEFR level ${input.level}.`,
      'Ask one short practice question at a time, in German.',
      input.answer === null
        ? 'This is the start: ask the first question. Set "verdict", "explanation_en" and "explanation_de" to null.'
        : 'Judge the learner\'s answer to your last question as "correct", "almost" or "wrong", explain in one or two sentences (English and simple German), then ask the next question.',
      'Reply with only a JSON object: {"verdict": "correct" | "almost" | "wrong" | null, "explanation_en": "..." | null, "explanation_de": "..." | null, "next": "the next question"}',
    ].join('\n'),
    messages: [...input.history.slice(-20), { role: 'user', content: input.answer ?? 'Start.' }],
  };
}

export function buildArticlePrompt(input: { level: CefrLevel; topic: string }): Built {
  return {
    systemPrompt: [
      `Write a short German article for a learner at CEFR level ${input.level}, about ${ARTICLE_WORDS[input.level]} words, on the topic given.`,
      `Use only vocabulary and grammar appropriate for CEFR level ${input.level}. Then write 3 to 5 multiple-choice comprehension questions in German, each with 3 options.`,
      'Reply with only a JSON object: {"title": "...", "text": "...", "questions": [{"question": "...", "options": ["...", "...", "..."], "correctIndex": 0}]}',
    ].join('\n'),
    messages: [{ role: 'user', content: `Topic: ${input.topic}` }],
  };
}

export function buildWritingPrompt(input: { level: CefrLevel; prompt: string; text: string }): Built {
  return {
    systemPrompt: [
      `You correct a German text written by a learner at CEFR level ${input.level}. The learner chose this topic: ${input.prompt || '(free)'}.`,
      `List the mistakes, write a fully corrected version that keeps the learner's meaning and style, and add a short, encouraging comment in English and in simple German.`,
      `Reply with only a JSON object: {${CORRECTIONS.replace("in their last message", "in the text")}, "corrected": "...", "comment_en": "...", "comment_de": "..."}`,
    ].join('\n'),
    messages: [{ role: 'user', content: input.text }],
  };
}

export function buildSummaryPrompt(input: { mode: FreestyleMode; level: CefrLevel; transcript: string }): Built {
  return {
    systemPrompt: [
      `Summarize a German practice session (mode: ${input.mode}) of a learner at CEFR level ${input.level}.`,
      'Give up to 3 things that went well and up to 3 recurring mistakes, each as {"en": "...", "de": "..."} (German simple enough for the level),',
      'and up to 8 useful words from the session the learner should save, each {"lemma": dictionary form with article for nouns, "meaningEn": "..."}.',
      'Reply with only a JSON object: {"wentWell": [...], "mistakes": [...], "words": [...]}',
    ].join('\n'),
    messages: [{ role: 'user', content: input.transcript }],
  };
}
```

Create `lib/freestyle/replies.ts`:

```ts
import { extractJsonObject } from '../ai/json';
import type { LocalizedText } from '../i18n/localizedText';
import type { GradeResult } from '../tutoring/grading';

export interface Correction {
  wrong: string;
  right: string;
  reason: LocalizedText;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const localizedPair = (v: unknown): LocalizedText | null => {
  const o = v as { en?: unknown; de?: unknown } | null;
  return o && str(o.en) && str(o.de) ? { en: o.en.trim(), de: o.de.trim() } : null;
};

function corrections(value: unknown): Correction[] | null {
  if (!Array.isArray(value)) return null;
  const out: Correction[] = [];
  for (const c of value as Record<string, unknown>[]) {
    if (!c || !str(c.wrong) || !str(c.right) || !str(c.reason_en) || !str(c.reason_de)) return null;
    out.push({ wrong: c.wrong, right: c.right, reason: { en: c.reason_en, de: c.reason_de } });
  }
  return out;
}

export function parseNormalizeReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !str(o.lemma) || !str(o.partOfSpeech) || !str(o.meaningEn) || !str(o.meaningDe)) return null;
  if (o.plural !== null && o.plural !== undefined && typeof o.plural !== 'string') return null;
  return { lemma: o.lemma.trim(), partOfSpeech: o.partOfSpeech, plural: (o.plural as string | null | undefined) ?? null, meaningEn: o.meaningEn, meaningDe: o.meaningDe };
}

export function parseConversationReply(text: string): { corrections: Correction[]; reply: string } | null {
  const o = extractJsonObject(text);
  const list = o ? corrections(o.corrections) : null;
  if (!o || !list || !str(o.reply)) return null;
  return { corrections: list, reply: o.reply.trim() };
}

export function parseDrillReply(text: string): { verdict: GradeResult | null; explanation: LocalizedText | null; next: string } | null {
  const o = extractJsonObject(text);
  if (!o || !str(o.next)) return null;
  if (o.verdict !== null && o.verdict !== 'correct' && o.verdict !== 'almost' && o.verdict !== 'wrong') return null;
  const explanation = o.verdict === null ? null : localizedPair({ en: o.explanation_en, de: o.explanation_de });
  if (o.verdict !== null && !explanation) return null;
  return { verdict: o.verdict as GradeResult | null, explanation, next: o.next.trim() };
}

export function parseArticleReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !str(o.title) || !str(o.text) || !Array.isArray(o.questions)) return null;
  if (o.questions.length < 3 || o.questions.length > 5) return null;
  const questions = [];
  for (const q of o.questions as Record<string, unknown>[]) {
    if (!q || !str(q.question) || !Array.isArray(q.options) || q.options.length < 2 || !q.options.every(str)) return null;
    if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return null;
    questions.push({ question: q.question, options: q.options as string[], correctIndex: q.correctIndex });
  }
  return { title: o.title, text: o.text, questions };
}

export function parseWritingReply(text: string): { corrections: Correction[]; corrected: string; comment: LocalizedText } | null {
  const o = extractJsonObject(text);
  const list = o ? corrections(o.corrections) : null;
  const comment = o ? localizedPair({ en: o.comment_en, de: o.comment_de }) : null;
  if (!o || !list || !str(o.corrected) || !comment) return null;
  return { corrections: list, corrected: o.corrected, comment };
}

export function parseSummaryReply(text: string) {
  const o = extractJsonObject(text);
  if (!o || !Array.isArray(o.wentWell) || !Array.isArray(o.mistakes) || !Array.isArray(o.words)) return null;
  const wentWell = o.wentWell.map(localizedPair);
  const mistakes = o.mistakes.map(localizedPair);
  if (wentWell.includes(null) || mistakes.includes(null)) return null;
  const words = [];
  for (const w of o.words as Record<string, unknown>[]) {
    if (!w || !str(w.lemma) || !str(w.meaningEn)) return null;
    words.push({ lemma: w.lemma, meaningEn: w.meaningEn });
  }
  return { wentWell: wentWell as LocalizedText[], mistakes: mistakes as LocalizedText[], words };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/freestyle lib/services/deckService.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai lib/freestyle
git commit -m "feat: add Freestyle modes, scenarios, prompts, and strict reply parsers"
```

---

### Task 6: Freestyle service and routes

**Files:**
- Create:
  - `lib/freestyle/sessionViews.ts`
  - `lib/services/freestyleService.ts`, `lib/services/freestyleService.test.ts`
  - `app/api/freestyle/route.ts`
  - `app/api/freestyle/[mode]/session/route.ts`, `app/api/freestyle/[mode]/message/route.ts`, `app/api/freestyle/[mode]/end/route.ts`
  - `app/api/freestyle/free_reading/article/route.ts`
  - `app/api/freestyle/routes.test.ts`
- Modify: `lib/db/schema.ts` (the `ending` flag)

**Interfaces:**
- Consumes: Task 5, `generateWithActiveProvider`, `isAiAvailable`, `isAtOrBelow`.
- Produces:
  - `SessionMessage { id: number; role: 'user' | 'assistant'; content: string; extra: Record<string, unknown> | null }`
  - `SessionView { mode; level: CefrLevel; setup: Record<string, unknown>; messages: SessionMessage[] }`
  - `SessionSummary { wentWell: LocalizedText[]; mistakes: LocalizedText[]; words: { lemma: string; meaningEn: string }[] }`
  - `createFreestyleService(db, deps?: { generate?: (req) => Promise<AiResult>; now?: () => Date })` →
    - `overview(): { modes: { mode; enabled; open: boolean }[]; aiAvailable: boolean; levels: CefrLevel[] }`
    - `start(mode, input: { level; setup }): Promise<SessionView>`
    - `session(mode): SessionView | null`
    - `turn(mode, text): Promise<SessionMessage[]>` (the new messages)
    - `newArticle(): Promise<SessionView>`
    - `end(mode, opts: { skipSummary?: boolean }): Promise<SessionSummary | null>`
  - `FreestyleError(message, kind, code?, params?)`, where kind is `'not_found' | 'bad_request' | 'locked' | 'busy' | 'ai_failed'` (404/400/403/409/502), and `toFreestyleErrorResponse`.

Setup per mode:
- **conversation:** `{ scenarioId?: string; topic?: string }`. Starting adds the scenario's opener as the first assistant message.
- **grammar_drill:** `{ topic: string }`. Starting generates the first question.
- **free_reading:** `{ topic: string }`. Starting generates the article into `setup.article`.
- **free_writing:** `{ prompt?: string }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/freestyleService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createFreestyleService, FreestyleError } from './freestyleService';

function setup(replies: string[]) {
  const db = createDbClient(':memory:');
  createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });
  const generate = vi.fn(async () => {
    const text = replies.shift();
    return text === undefined ? { ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const } : { ok: true as const, text };
  });
  return { db, generate, service: createFreestyleService(db, { generate, now: () => new Date('2026-09-29T10:00:00Z') }) };
}

const conversationReply = JSON.stringify({
  corrections: [{ wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason_en: 'gehen takes sein', reason_de: 'gehen mit sein' }],
  reply: 'Wohin bist du gegangen?',
});
const summaryReply = JSON.stringify({ wentWell: [{ en: 'Clear questions', de: 'Klare Fragen' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] });

describe('freestyleService', () => {
  it('starts a conversation with the scenario opener, resumes it, and stores corrections with the turn', async () => {
    const { service } = setup([conversationReply]);
    const started = await service.start('conversation', { level: 'B1', setup: { scenarioId: 'b1-doctor' } });
    expect(started.messages.map((m) => [m.role, m.content])).toEqual([['assistant', 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?']]);
    expect((await service.start('conversation', { level: 'A1', setup: {} })).level).toBe('B1'); // resumed, not restarted
    const added = await service.turn('conversation', 'Ich habe gegangen zum Arzt.');
    expect(added.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(added[0].extra).toMatchObject({ corrections: [{ right: 'Ich bin gegangen' }] });
    expect(added[1].content).toBe('Wohin bist du gegangen?');
  });

  it('refuses a locked level and an unknown or disabled mode', async () => {
    const { service } = setup([]);
    await expect(service.start('conversation', { level: 'C1', setup: {} })).rejects.toMatchObject({ kind: 'locked' });
    await expect(service.start('spoken', { level: 'B1', setup: {} })).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('starts a grammar drill with a first question and judges answers', async () => {
    const { service } = setup([
      '{"verdict":null,"explanation_en":null,"explanation_de":null,"next":"Bilde das Perfekt: ich gehe."}',
      '{"verdict":"correct","explanation_en":"Right: gehen uses sein.","explanation_de":"Richtig: gehen mit sein.","next":"Und: ich esse?"}',
    ]);
    const started = await service.start('grammar_drill', { level: 'B1', setup: { topic: 'Perfekt' } });
    expect(started.messages[0].content).toBe('Bilde das Perfekt: ich gehe.');
    const [, answer] = await service.turn('grammar_drill', 'ich bin gegangen');
    expect(answer.extra).toMatchObject({ verdict: 'correct', explanation: { en: 'Right: gehen uses sein.' } });
    expect(answer.content).toBe('Und: ich esse?');
  });

  it('generates a reading article at start and on request', async () => {
    const article = (t: string) =>
      JSON.stringify({ title: t, text: 'Text.', questions: [1, 2, 3].map((n) => ({ question: `F${n}?`, options: ['a', 'b', 'c'], correctIndex: 0 })) });
    const { service } = setup([article('Eins'), article('Zwei')]);
    expect((await service.start('free_reading', { level: 'B1', setup: { topic: 'Sport' } })).setup).toMatchObject({ article: { title: 'Eins' } });
    expect((await service.newArticle()).setup).toMatchObject({ article: { title: 'Zwei' } });
  });

  it('ends with a summary and deletes everything, or ends without one', async () => {
    const { db, service } = setup([conversationReply, summaryReply]);
    await service.start('conversation', { level: 'B1', setup: {} });
    await service.turn('conversation', 'Hallo');
    expect(await service.end('conversation', {})).toEqual({
      wentWell: [{ en: 'Clear questions', de: 'Klare Fragen' }],
      mistakes: [],
      words: [{ lemma: 'der Termin', meaningEn: 'appointment' }],
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_sessions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_messages').get()).toEqual({ n: 0 });

    await service.start('conversation', { level: 'B1', setup: {} });
    expect(await service.end('conversation', { skipSummary: true })).toBeNull();
    expect(service.session('conversation')).toBeNull();
  });

  it('keeps the session when the summary fails, so the student can retry', async () => {
    const { service } = setup([]);
    await service.start('free_writing', { level: 'B1', setup: {} });
    await expect(service.end('free_writing', {})).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });
    expect(service.session('free_writing')).not.toBeNull();
  });

  // Review Focus 1: a second End while one is running is refused, not doubled.
  it('refuses a second End while one is in progress', async () => {
    const { service, generate } = setup([summaryReply]);
    await service.start('free_writing', { level: 'B1', setup: {} });
    const first = service.end('free_writing', {});
    await expect(service.end('free_writing', {})).rejects.toMatchObject({ kind: 'busy' });
    await first;
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('reports a malformed reply as ai_bad_reply and keeps the student’s text out of the thread', async () => {
    const { service } = setup(['not json']);
    await service.start('conversation', { level: 'B1', setup: {} });
    await expect(service.turn('conversation', 'Hallo')).rejects.toMatchObject({ code: 'ai_bad_reply' });
    expect(service.session('conversation')!.messages).toHaveLength(0);
  });
});

void FreestyleError;
```

Create `app/api/freestyle/routes.test.ts` with the `GAIT_DATA_DIR` pattern and `vi.mock('@/lib/services/aiService', …)` that sets `generateWithActiveProvider` to a mock, as the chat route test does. Cover:
- `GET /api/freestyle` lists the four enabled modes with `open: false`;
- `POST /api/freestyle/conversation/session` with `{ level: 'A1', setup: {} }` returns the session;
- `POST …/message` with an empty text returns 400;
- `POST …/end` with `{ skipSummary: true }` returns `{ summary: null }`;
- `POST /api/freestyle/spoken/session` returns 404.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/freestyleService.test.ts app/api/freestyle`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/db/schema.ts`: add `ending INTEGER NOT NULL DEFAULT 0` to `freestyle_sessions` in `createTablesIfMissing`, and an `ALTER TABLE` guard in `migrateDeckSettings` (rename it to `migrateFreestyle`) that adds `ending` if it's missing.

Create `lib/freestyle/sessionViews.ts`:

```ts
import type { CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';
import type { FreestyleMode } from './modes';

export interface SessionMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  extra: Record<string, unknown> | null;
}

export interface SessionView {
  mode: FreestyleMode;
  level: CefrLevel;
  setup: Record<string, unknown>;
  messages: SessionMessage[];
}

export interface SessionSummary {
  wentWell: LocalizedText[];
  mistakes: LocalizedText[];
  words: { lemma: string; meaningEn: string }[];
}
```

Create `lib/services/freestyleService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import { FREESTYLE_MODES, isModeEnabled, type FreestyleMode } from '../freestyle/modes';
import { SCENARIOS } from '../freestyle/scenarios';
import { buildArticlePrompt, buildConversationPrompt, buildDrillPrompt, buildSummaryPrompt, buildWritingPrompt } from '../freestyle/prompts';
import { parseArticleReply, parseConversationReply, parseDrillReply, parseSummaryReply, parseWritingReply } from '../freestyle/replies';
import type { SessionMessage, SessionSummary, SessionView } from '../freestyle/sessionViews';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { isAtOrBelow, LEVELS } from '../tutoring/levels';
import { generateWithActiveProvider, isAiAvailable, type AiRequest, type AiResult } from './aiService';
import { createProfileService } from './profileService';

export type FreestyleErrorKind = 'not_found' | 'bad_request' | 'locked' | 'busy' | 'ai_failed';
const STATUS: Record<FreestyleErrorKind, number> = { not_found: 404, bad_request: 400, locked: 403, busy: 409, ai_failed: 502 };
const CODE: Record<FreestyleErrorKind, ErrorCode> = { not_found: 'not_found', bad_request: 'bad_request', locked: 'level_locked', busy: 'session_exists', ai_failed: 'ai_failed' };

export class FreestyleError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: FreestyleErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toFreestyleErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof FreestyleError)) return null;
  return { status: STATUS[err.kind], body: errorBody(err.message, err.code, err.params) };
}

interface SessionRow {
  id: number;
  mode: FreestyleMode;
  level: CefrLevel;
  setup: string;
  ending: number;
}

export function createFreestyleService(
  db: Database.Database,
  deps: { generate?: (request: AiRequest) => Promise<AiResult>; now?: () => Date } = {}
) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const now = deps.now ?? (() => new Date());
  const profiles = createProfileService(db);

  function row(mode: FreestyleMode): SessionRow | undefined {
    return db.prepare('SELECT * FROM freestyle_sessions WHERE mode = ?').get(mode) as SessionRow | undefined;
  }

  function messagesOf(sessionId: number): SessionMessage[] {
    return (
      db.prepare('SELECT id, role, content, extra FROM freestyle_messages WHERE session_id = ? ORDER BY id').all(sessionId) as {
        id: number;
        role: 'user' | 'assistant';
        content: string;
        extra: string | null;
      }[]
    ).map((m) => ({ ...m, extra: m.extra ? JSON.parse(m.extra) : null }));
  }

  function view(r: SessionRow): SessionView {
    return { mode: r.mode, level: r.level, setup: JSON.parse(r.setup), messages: messagesOf(r.id) };
  }

  function addMessage(sessionId: number, role: 'user' | 'assistant', content: string, extra: unknown = null): SessionMessage {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO freestyle_messages (session_id, role, content, extra, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, role, content, extra === null ? null : JSON.stringify(extra), now().toISOString());
    return { id: Number(lastInsertRowid), role, content, extra: extra as Record<string, unknown> | null };
  }

  async function ask<T>(request: AiRequest, parse: (text: string) => T | null): Promise<T> {
    const reply = await generate(request);
    if (!reply.ok) throw new FreestyleError(reply.error, 'ai_failed', reply.code, reply.params);
    const parsed = parse(reply.text);
    if (!parsed) throw new FreestyleError('The AI replied in an unexpected format', 'ai_failed', 'ai_bad_reply');
    return parsed;
  }

  function requireMode(mode: FreestyleMode): void {
    if (!isModeEnabled(mode)) throw new FreestyleError(`Unknown mode: ${mode}`, 'not_found');
  }

  function requireSession(mode: FreestyleMode): SessionRow {
    requireMode(mode);
    const r = row(mode);
    if (!r) throw new FreestyleError('No open session for this mode', 'not_found');
    return r;
  }

  function history(sessionId: number) {
    return messagesOf(sessionId).map((m) => ({ role: m.role, content: m.content }));
  }

  function overview() {
    const highest = profiles.getProfile().highestUnlockedLevel;
    return {
      modes: FREESTYLE_MODES.filter((m) => m.enabled).map((m) => ({ mode: m.mode, enabled: true, open: !!row(m.mode) })),
      aiAvailable: isAiAvailable(db),
      levels: LEVELS.filter((l) => isAtOrBelow(l, highest)),
    };
  }

  function session(mode: FreestyleMode): SessionView | null {
    requireMode(mode);
    const r = row(mode);
    return r ? view(r) : null;
  }

  async function start(mode: FreestyleMode, input: { level: CefrLevel; setup: Record<string, unknown> }): Promise<SessionView> {
    requireMode(mode);
    const open = row(mode);
    if (open) return view(open);
    if (!LEVELS.includes(input.level) || !isAtOrBelow(input.level, profiles.getProfile().highestUnlockedLevel)) {
      throw new FreestyleError(`Level ${input.level} is locked`, 'locked', 'level_locked', { level: String(input.level) });
    }
    const setup = { ...input.setup };
    let first: { content: string; extra: unknown } | null = null;
    if (mode === 'conversation' && typeof setup.scenarioId === 'string') {
      const scenario = SCENARIOS.find((s) => s.id === setup.scenarioId);
      if (!scenario) throw new FreestyleError('Unknown scenario', 'bad_request');
      first = { content: scenario.opener, extra: null };
    }
    if (mode === 'grammar_drill') {
      if (typeof setup.topic !== 'string' || !setup.topic.trim()) throw new FreestyleError('Choose a topic', 'bad_request');
      const drill = await ask(buildDrillPrompt({ level: input.level, topic: setup.topic, history: [], answer: null }), parseDrillReply);
      first = { content: drill.next, extra: null };
    }
    if (mode === 'free_reading') {
      if (typeof setup.topic !== 'string' || !setup.topic.trim()) throw new FreestyleError('Choose a topic', 'bad_request');
      setup.article = await ask(buildArticlePrompt({ level: input.level, topic: setup.topic }), parseArticleReply);
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO freestyle_sessions (mode, level, setup, started_at) VALUES (?, ?, ?, ?)')
      .run(mode, input.level, JSON.stringify(setup), now().toISOString());
    if (first) addMessage(Number(lastInsertRowid), 'assistant', first.content, first.extra);
    return view(row(mode)!);
  }

  // The student's message is stored only after the AI answered, so a failure leaves the thread clean.
  async function turn(mode: FreestyleMode, text: string): Promise<SessionMessage[]> {
    const r = requireSession(mode);
    if (!text?.trim()) throw new FreestyleError('Write something first', 'bad_request');
    const setup = JSON.parse(r.setup) as Record<string, unknown>;
    if (mode === 'conversation') {
      const scenario = SCENARIOS.find((s) => s.id === setup.scenarioId);
      const reply = await ask(
        buildConversationPrompt({ level: r.level, scenario: scenario?.title.de ?? (setup.topic as string) ?? null, history: history(r.id), message: text }),
        parseConversationReply
      );
      return [addMessage(r.id, 'user', text, { corrections: reply.corrections }), addMessage(r.id, 'assistant', reply.reply)];
    }
    if (mode === 'grammar_drill') {
      const reply = await ask(buildDrillPrompt({ level: r.level, topic: String(setup.topic), history: history(r.id), answer: text }), parseDrillReply);
      return [addMessage(r.id, 'user', text), addMessage(r.id, 'assistant', reply.next, { verdict: reply.verdict, explanation: reply.explanation })];
    }
    if (mode === 'free_writing') {
      const reply = await ask(buildWritingPrompt({ level: r.level, prompt: String(setup.prompt ?? ''), text }), parseWritingReply);
      return [addMessage(r.id, 'user', text), addMessage(r.id, 'assistant', reply.corrected, { corrections: reply.corrections, comment: reply.comment })];
    }
    throw new FreestyleError('This mode has no turns', 'bad_request');
  }

  async function newArticle(): Promise<SessionView> {
    const r = requireSession('free_reading');
    const setup = JSON.parse(r.setup) as Record<string, unknown>;
    setup.article = await ask(buildArticlePrompt({ level: r.level, topic: String(setup.topic) }), parseArticleReply);
    db.prepare('UPDATE freestyle_sessions SET setup = ? WHERE id = ?').run(JSON.stringify(setup), r.id);
    return view(row('free_reading')!);
  }

  async function end(mode: FreestyleMode, opts: { skipSummary?: boolean }): Promise<SessionSummary | null> {
    const r = requireSession(mode);
    const remove = () => db.prepare('DELETE FROM freestyle_sessions WHERE id = ?').run(r.id);
    if (opts.skipSummary) {
      remove();
      return null;
    }
    // Review Focus 1: claim the End atomically; a second End while this one runs is refused.
    const claimed = db.prepare('UPDATE freestyle_sessions SET ending = 1 WHERE id = ? AND ending = 0').run(r.id).changes === 1;
    if (!claimed) throw new FreestyleError('This session is already ending', 'busy');
    const transcript = messagesOf(r.id).map((m) => `${m.role}: ${m.content}`).join('\n') || '(no messages)';
    try {
      const summary = await ask(buildSummaryPrompt({ mode, level: r.level, transcript }), parseSummaryReply);
      remove();
      return summary;
    } catch (err) {
      db.prepare('UPDATE freestyle_sessions SET ending = 0 WHERE id = ?').run(r.id);
      throw err;
    }
  }

  return { overview, session, start, turn, newArticle, end };
}
```

Routes (all `dynamic = 'force-dynamic'`, errors through `toFreestyleErrorResponse`, and `isFreestyleMode(params.mode)` or 404):
- `app/api/freestyle/route.ts`: `GET` → `overview()`.
- `[mode]/session/route.ts`:
  - `GET` → `{ session: session(mode) }`;
  - `POST` with body `{ level, setup }` → `start(...)`. A non-object `setup` returns 400.
- `[mode]/message/route.ts`: `POST` with body `{ text }` → `{ messages: await turn(mode, text) }`.
- `[mode]/end/route.ts`: `POST` with body `{ skipSummary? }` → `{ summary: await end(mode, { skipSummary: body?.skipSummary === true }) }`.
- `free_reading/article/route.ts`: `POST` → `newArticle()`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/freestyleService.test.ts app/api/freestyle && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib/freestyle/sessionViews.ts lib/services/freestyleService.ts lib/services/freestyleService.test.ts lib/db/schema.ts app/api/freestyle
git commit -m "feat: add Freestyle sessions, turns, articles, and summaries"
```

---

### Task 7: Hub and navigation

**Files:**
- Create:
  - `app/freestyle/page.tsx`, `app/freestyle/[mode]/page.tsx`
  - `components/freestyle/FreestyleHub.tsx`, `components/freestyle/FreestyleHub.test.tsx`
  - `components/freestyle/SessionSetup.tsx`, `components/freestyle/SessionSetup.test.tsx`
- Modify:
  - `lib/nav/navItems.ts`, `lib/nav/navItems.test.ts`
  - `components/shell/AppShell.tsx`, `components/shell/AppShell.test.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/freestyle`, `POST /api/freestyle/[mode]/session`, `scenariosFor`, the grammar lesson titles (below), `GET /api/flashcards/count`.
- Produces:
  - `FreestyleHub()`
  - `SessionSetup({ mode, levels, activeLevel, grammarTopics, onStarted(view) })`
  - `GET /api/freestyle/topics?level=` → `{ grammarTopics: string[] }`: the active track's grammar lesson titles at that level, in the UI language. Add it to Task 6's routes here, using `createContentText` and `loadLevelGating`.

- [ ] **Step 1: Write the failing tests**

In `lib/nav/navItems.test.ts`, change the expectations:
- the floating buttons become `['freestyle', 'flashcards', 'review']`;
- the sidebar becomes `['learn', 'dashboard', 'freestyle', 'flashcards', 'review', 'profile', 'settings']`.

In `components/shell/AppShell.test.tsx`:
- the fetch stub answers `/api/tutoring/queue/count` → `{ due: 7 }` and `/api/flashcards/count` → `{ due: 4 }`;
- add expectations for the links `Flashcards (4 due)` (`/flashcards`) and `Freestyle` (`/freestyle`);
- the old "no Freestyle link" assertion is removed.

Create `components/freestyle/FreestyleHub.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { FreestyleHub } from './FreestyleHub';

describe('FreestyleHub', () => {
  it('lists the enabled modes, marking an open session', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      delayedResponse({
        modes: [
          { mode: 'conversation', enabled: true, open: true },
          { mode: 'grammar_drill', enabled: true, open: false },
          { mode: 'free_reading', enabled: true, open: false },
          { mode: 'free_writing', enabled: true, open: false },
        ],
        aiAvailable: true,
        levels: ['A1', 'A2', 'B1'],
      })
    ));
    renderWithIntl(<FreestyleHub />);
    expect(await screen.findByRole('link', { name: /Conversation.*Continue your session/ })).toHaveAttribute('href', '/freestyle/conversation');
    expect(screen.getByRole('link', { name: /Grammar drill/ })).toHaveAttribute('href', '/freestyle/grammar_drill');
    expect(screen.queryByText(/Spoken/)).not.toBeInTheDocument();
  });

  it('explains that Freestyle needs an AI provider, with a Settings link', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ modes: [], aiAvailable: false, levels: ['A1'] })));
    renderWithIntl(<FreestyleHub />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Freestyle needs a working AI provider.');
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
  });
});
```

Create `components/freestyle/SessionSetup.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { SessionSetup } from './SessionSetup';

describe('SessionSetup', () => {
  it('starts a conversation at the chosen level with a scenario', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ mode: 'conversation', level: 'A2', setup: { scenarioId: 'a2-weekend' }, messages: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const onStarted = vi.fn();
    renderWithIntl(<SessionSetup mode="conversation" levels={['A1', 'A2']} activeLevel="A1" grammarTopics={[]} onStarted={onStarted} />);
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'A2' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Talking about the weekend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/freestyle/conversation/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'A2', setup: { scenarioId: 'a2-weekend' } }),
    });
  });

  it('needs a topic for a grammar drill, offering the level’s grammar lessons', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithIntl(<SessionSetup mode="grammar_drill" levels={['B1']} activeLevel="B1" grammarTopics={['Relativsätze', 'Passiv']} onStarted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Passiv' }));
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/nav components/shell components/freestyle`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/nav/navItems.ts`:
- set `enabled: true` on `freestyle` and `flashcards`;
- give `flashcards` the field `badge: 'deckDue'`;
- extend the `badge` type to `'reviewsDue' | 'deckDue'`.

`components/shell/AppShell.tsx`: generalize `useReviewsDue` into `useBadgeCounts()`. It fetches both `/api/tutoring/queue/count` and `/api/flashcards/count` and returns `{ reviewsDue, deckDue }`, each `number | null`, so a failed fetch just means no badge. `NavLink` reads `counts[item.badge]`.

Create `components/freestyle/FreestyleHub.tsx`:
- a client component that loads `/api/freestyle`;
- renders one `Card` link per enabled mode (`href="/freestyle/<mode>"`) with a Lucide icon (MessageCircle, Puzzle, BookOpen, PenLine), the mode label and description, and, when `open`, a "Continue your session" `Badge` that is part of the link's accessible name;
- when `aiAvailable` is false, an `Alert` (`role="alert"`) with `freestyle.noAi` and a link `freestyle.openSettings` → `/settings`;
- load errors show `freestyle.loadFailed` in an `Alert`.

Create `components/freestyle/SessionSetup.tsx`, a client form:
- a `Select` labelled `freestyle.level` over `levels`, defaulting to `activeLevel`;
- **conversation:** a `RadioGroup` of `scenariosFor(level)`, labelled by each scenario's title in the UI language, plus a "Free topic" option with an `Input`;
- **grammar_drill:** a `RadioGroup` of `grammarTopics`, plus a free-topic `Input`;
- **free_reading:** a topic `Input`, with 4 suggestion chips (`freestyle.readingSuggestions.*`);
- **free_writing:** an optional prompt `Input`, with 4 suggestion chips (`freestyle.writingSuggestions.*`).

Start is disabled until the mode's required setup is present (a topic for the drill and reading). Start POSTs `{ level, setup }`, is disabled while in flight, shows errors via `useApiErrorText` in an `Alert`, and calls `onStarted(view)`.

Create `app/freestyle/page.tsx` (onboarding gate) rendering `<FreestyleHub />`, and `app/freestyle/[mode]/page.tsx`, which validates `isModeEnabled(mode)` (else `notFound()`) and renders `<FreestyleSession mode={mode} />` (Tasks 8–9).

Catalogs, a `freestyle` namespace (en / de):
- `title` "Freestyle" / "Freestyle"
- `modes`: `{ conversation: "Conversation" / "Gespräch", grammarDrill: "Grammar drill" / "Grammatiktraining", freeReading: "Free reading" / "Freies Lesen", freeWriting: "Free writing" / "Freies Schreiben" }`
- `descriptions`: one line each, e.g. "Chat in German at your level, with corrections" / "Sprich auf Deutsch auf deinem Niveau, mit Korrekturen"
- `continue` "Continue your session" / "Sitzung fortsetzen"
- `noAi` "Freestyle needs a working AI provider." / "Freestyle braucht einen funktionierenden KI-Anbieter."
- `openSettings` "Open Settings" / "Einstellungen öffnen"
- `loadFailed` "Could not load Freestyle. Please reload the page." / "Freestyle konnte nicht geladen werden. Bitte lade die Seite neu."
- `level` "Level" / "Niveau", `start` "Start" / "Starten", `freeTopic` "Free topic" / "Freies Thema", `topic` "Topic" / "Thema", `prompt` "Writing prompt (optional)" / "Schreibaufgabe (optional)"
- `readingSuggestions` and `writingSuggestions`: 4 short topics each, in both languages

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/nav components/shell components/freestyle messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A app/freestyle components/freestyle lib/nav components/shell messages app/api/freestyle
git commit -m "feat: add the Freestyle hub, session setup, and the Freestyle and Flashcards nav items"
```

---

### Task 8: Conversation and grammar-drill screens

**Files:**
- Create:
  - `components/freestyle/FreestyleSession.tsx`
  - `components/freestyle/ChatThread.tsx`, `components/freestyle/ChatThread.test.tsx`
  - `components/freestyle/TappableGerman.tsx`, `components/freestyle/TappableGerman.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: the session and message routes, `POST /api/flashcards/words`, and `LanguageToggle`.
- Produces:
  - `FreestyleSession({ mode })`: loads `GET /api/freestyle/[mode]/session`, shows `SessionSetup` when there's no session, and otherwise the mode screen, with a header (level `Badge`, and an End button that opens the End flow from Task 10).
  - `ChatThread({ mode, messages, onSend(text): Promise<void> })`
  - `TappableGerman({ text, sentence? })`: splits German text into word buttons, and a tap opens a popover with "Save to deck".

- [ ] **Step 1: Write the failing tests**

Create `components/freestyle/TappableGerman.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TappableGerman } from './TappableGerman';

describe('TappableGerman', () => {
  it('saves a tapped word with its sentence', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ itemId: 1, lemma: 'der Termin', status: 'added' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<TappableGerman text="Ich brauche einen Termin." />);
    fireEvent.click(screen.getByRole('button', { name: 'Termin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    expect(await screen.findByText('Saved: der Termin')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'Termin', sentence: 'Ich brauche einen Termin.' }),
    });
  });

  it('tells the student when the word is already in the deck', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 })));
    renderWithIntl(<TappableGerman text="Hallo Welt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Welt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to deck' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This word is already in your deck'));
  });
});
```

Create `components/freestyle/ChatThread.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ChatThread } from './ChatThread';

const MESSAGES = [
  { id: 1, role: 'assistant' as const, content: 'Was hast du gemacht?', extra: null },
  {
    id: 2,
    role: 'user' as const,
    content: 'Ich habe gegangen.',
    extra: { corrections: [{ wrong: 'habe gegangen', right: 'bin gegangen', reason: { en: 'gehen takes sein', de: 'gehen mit sein' } }] },
  },
  { id: 3, role: 'assistant' as const, content: 'Und dann?', extra: { verdict: 'almost', explanation: { en: 'Nearly.', de: 'Fast.' } } },
];

describe('ChatThread', () => {
  it('shows inline corrections under the student’s message with a language toggle, and drill verdicts', () => {
    renderWithIntl(<ChatThread mode="conversation" messages={MESSAGES} onSend={vi.fn()} />);
    expect(screen.getByText('habe gegangen')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText('bin gegangen')).toBeInTheDocument();
    expect(screen.getByText('gehen takes sein')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'DE' })[0]);
    expect(screen.getByText('gehen mit sein')).toBeInTheDocument();
    expect(screen.getByText('Almost')).toBeInTheDocument();
    expect(screen.getByText('Nearly.')).toBeInTheDocument();
  });

  it('sends a message, disables sending meanwhile, and keeps the text when sending fails', async () => {
    let fail = true;
    const onSend = vi.fn(async () => {
      if (fail) throw new Error('The AI replied in an unexpected format');
    });
    renderWithIntl(<ChatThread mode="conversation" messages={[]} onSend={onSend} />);
    const box = screen.getByLabelText('Your message');
    fireEvent.change(box, { target: { value: 'Hallo!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI replied in an unexpected format');
    expect(box).toHaveValue('Hallo!');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(box).toHaveValue(''));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/freestyle`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `components/freestyle/TappableGerman.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiErrorText } from '@/components/useApiErrorText';

// Spec: tap any German word in an AI message to save it. Punctuation stays plain text.
export function TappableGerman({ text, sentence }: { text: string; sentence?: string }) {
  const parts = text.split(/(\p{L}[\p{L}'-]*)/u);
  return (
    <span>
      {parts.map((part, i) => (/^\p{L}/u.test(part) ? <Word key={i} word={part} sentence={sentence ?? text} /> : <span key={i}>{part}</span>))}
    </span>
  );
}

function Word({ word, sentence }: { word: string; sentence: string }) {
  const t = useTranslations('deck');
  const errorText = useApiErrorText();
  const [state, setState] = useState<{ saving: boolean; saved?: string; error?: string }>({ saving: false });

  async function save() {
    setState({ saving: true });
    try {
      const res = await fetch('/api/flashcards/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, sentence }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setState({ saving: false, saved: data.lemma });
      else setState({ saving: false, error: errorText(data, String(res.status)) });
    } catch (err) {
      setState({ saving: false, error: (err as Error).message });
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rounded underline decoration-dotted underline-offset-4 hover:text-primary">
          {word}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56">
        {state.saved ? (
          <p>{t('saved', { lemma: state.saved })}</p>
        ) : (
          <Button size="sm" disabled={state.saving} onClick={save}>
            {t('saveToDeck')}
          </Button>
        )}
        {state.error && <p role="alert">{state.error}</p>}
      </PopoverContent>
    </Popover>
  );
}
```

Add the shadcn Popover: `npx shadcn@latest add popover --yes`.

Create `components/freestyle/ChatThread.tsx`:
- messages as bubbles: assistant left on `surface-raised`; user right on `primary/15`.
- Assistant content renders through `TappableGerman`.
- A user message with `extra.corrections` shows below it, per correction, `<s>{wrong}</s> → <strong>{right}</strong>` plus the reason in the language picked by one `LanguageToggle` for that message.
- An assistant message with `extra.verdict` shows a `Badge`, using the `exercise.result.*` labels in `success`/`warning`/`danger`, and the explanation with its own toggle.
- A `Textarea` labelled `freestyle.yourMessage` and a Send button, disabled while `onSend` runs; Enter sends, Shift+Enter adds a new line. The text box is cleared only after `onSend` resolves, and a thrown error shows in an `Alert` with its message, keeping the text.
- It scrolls to the newest message after each change, and there's an `ä ö ü ß` helper row. The Writing module later replaces it with its shared German keyboard helper; until then, a simple row of 7 buttons inserts at the cursor.

Create `components/freestyle/FreestyleSession.tsx`:
- **Loading:** load the session; show a Skeleton while loading, and an Alert on failure.
- **No session:** fetch `/api/freestyle` (levels) and `/api/freestyle/topics?level=<active>` for drill topics, then render `SessionSetup`.
- **conversation / grammar_drill:** render `ChatThread`, with `onSend` = POST `/api/freestyle/<mode>/message` → append the returned messages. On `!res.ok`, throw `new Error(errorText(data, …))`.
- **free_reading / free_writing:** Task 9's components.
- **Header:** the mode title, a level `Badge`, and End (Task 10).

Catalogs:
- `freestyle.yourMessage` "Your message" / "Deine Nachricht", `freestyle.send` "Send" / "Senden";
- a `deck` namespace (Task 10 adds more): `saveToDeck` "Save to deck" / "In den Kartenstapel", `saved` "Saved: {lemma}" / "Gespeichert: {lemma}".

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/freestyle messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A components/freestyle components/ui/popover.tsx messages package.json package-lock.json
git commit -m "feat: add the conversation and grammar-drill screens with inline corrections and word saving"
```

---

### Task 9: Free-reading and free-writing screens

**Files:**
- Create:
  - `components/freestyle/ReadingSession.tsx`, `components/freestyle/ReadingSession.test.tsx`
  - `components/freestyle/WritingSession.tsx`, `components/freestyle/WritingSession.test.tsx`
- Modify: `components/freestyle/FreestyleSession.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- `ReadingSession({ session, onSession(view) })`:
  - shows `setup.article` (title, text through `TappableGerman`, questions as `RadioGroup`s);
  - "Check answers" marks each question right or wrong **locally**, with the correct option;
  - "Another article" POSTs `/api/freestyle/free_reading/article` and replaces the session.
- `WritingSession({ session, onMessages(msgs) })`:
  - a `Textarea` with a live word count;
  - Submit → the message route;
  - each assistant reply (a version) shows the corrections list (the same markup as `ChatThread`), the corrected text, and the comment with its toggle;
  - "Revise" pre-fills the box with the student's last text;
  - earlier versions stay listed above, newest last.

- [ ] **Step 1: Write the failing tests**

Create `components/freestyle/ReadingSession.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ReadingSession } from './ReadingSession';

const article = (title: string) => ({
  title,
  text: 'Anna spielt Fußball.',
  questions: [
    { question: 'Was spielt Anna?', options: ['Tennis', 'Fußball', 'Golf'], correctIndex: 1 },
    { question: 'Wer spielt?', options: ['Anna', 'Ben', 'Carl'], correctIndex: 0 },
    { question: 'Wo?', options: ['Im Park', 'Im Haus', 'Keine Angabe'], correctIndex: 2 },
  ],
});
const SESSION = { mode: 'free_reading' as const, level: 'A1' as const, setup: { topic: 'Sport', article: article('Sport') }, messages: [] };

describe('ReadingSession', () => {
  it('checks answers locally and shows the right option', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithIntl(<ReadingSession session={SESSION} onSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Tennis' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Anna' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(screen.getByText('2 of 3 unanswered or wrong')).toBeInTheDocument();
    expect(screen.getAllByText(/Right answer:/)).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads another article', async () => {
    const onSession = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ ...SESSION, setup: { topic: 'Sport', article: article('Neu') } })));
    renderWithIntl(<ReadingSession session={SESSION} onSession={onSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'Another article' }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(expect.objectContaining({ setup: expect.objectContaining({ article: expect.objectContaining({ title: 'Neu' }) }) })));
  });
});
```

Create `components/freestyle/WritingSession.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { WritingSession } from './WritingSession';

const SESSION = { mode: 'free_writing' as const, level: 'B1' as const, setup: { prompt: 'Urlaub' }, messages: [] };
const REPLY = {
  messages: [
    { id: 1, role: 'user', content: 'Ich habe nach Rom gefahren.', extra: null },
    {
      id: 2,
      role: 'assistant',
      content: 'Ich bin nach Rom gefahren.',
      extra: { corrections: [{ wrong: 'habe', right: 'bin', reason: { en: 'fahren takes sein', de: 'fahren mit sein' } }], comment: { en: 'Nice!', de: 'Schön!' } },
    },
  ],
};

describe('WritingSession', () => {
  it('counts words, submits, shows the corrected version, and pre-fills a revision', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse(REPLY)));
    const onMessages = vi.fn();
    const { rerender } = renderWithIntl(<WritingSession session={SESSION} onMessages={onMessages} />);
    fireEvent.change(screen.getByLabelText('Your text'), { target: { value: 'Ich habe nach Rom gefahren.' } });
    expect(screen.getByText('5 words')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onMessages).toHaveBeenCalledWith(REPLY.messages));
    rerender(<WritingSession session={{ ...SESSION, messages: REPLY.messages as never }} onMessages={onMessages} />);
    expect(screen.getByText('Ich bin nach Rom gefahren.')).toBeInTheDocument();
    expect(screen.getByText('Nice!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(screen.getByLabelText('Your text')).toHaveValue('Ich habe nach Rom gefahren.');
  });
});
```

`WritingSession`'s rerender happens outside the intl wrapper in this test. Instead, wrap it the same way as `LessonChat.test.tsx`'s reopen test: `rerender(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">…</NextIntlClientProvider>)`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/freestyle`
Expected: FAIL.

- [ ] **Step 3: Implement**

Build both components to the interface above, with the design pass's components:
- **Word count:** `text.trim() ? text.trim().split(/\s+/).length : 0`, using the plural catalog message `freestyle.words`.
- **Reading result line:** `freestyle.wrongCount` ("{wrong} of {total} unanswered or wrong"); each wrong question shows `freestyle.rightAnswer` ("Right answer: {option}").
- In `FreestyleSession`, render `ReadingSession` for `free_reading` and `WritingSession` for `free_writing`.

Catalogs (en / de):
- `checkAnswers` "Check answers" / "Antworten prüfen"
- `wrongCount` "{wrong} of {total} unanswered or wrong" / "{wrong} von {total} unbeantwortet oder falsch"
- `rightAnswer` "Right answer: {option}" / "Richtige Antwort: {option}"
- `anotherArticle` "Another article" / "Neuer Artikel"
- `yourText` "Your text" / "Dein Text"
- `words` "{count, plural, one {# word} other {# words}}" / "{count, plural, one {# Wort} other {# Wörter}}"
- `submit` "Submit" / "Abschicken", `revise` "Revise" / "Überarbeiten"
- `version` "Version {n}" / "Version {n}", `corrected` "Corrected version" / "Korrigierte Fassung"

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/freestyle messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A components/freestyle messages
git commit -m "feat: add the free-reading and free-writing screens"
```

---

### Task 10: The End flow and the deck page

**Files:**
- Create:
  - `components/freestyle/EndSession.tsx`, `components/freestyle/EndSession.test.tsx`
  - `app/flashcards/page.tsx`
  - `components/deck/DeckPage.tsx`, `components/deck/DeckPage.test.tsx`
- Modify: `components/freestyle/FreestyleSession.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- `EndSession({ mode, onEnded() })`:
  1. End opens an `AlertDialog` ("End this session? You'll see a short summary, then the session is gone.").
  2. Confirming POSTs `/end` and disables both buttons while it runs.
  3. On success it shows the summary: went well, mistakes (each with the toggle), and the words, each a checkbox (checked by default) and "Save selected".
  4. **Save selected** POSTs each checked word to `/api/flashcards/words` in sequence. A 409 is shown as "already in your deck" and isn't an error.
  5. "Done" calls `onEnded()`.
  6. When the summary fails, it shows the error with "Try again" and "End without summary" (POST `{ skipSummary: true }`).
- `DeckPage()`:
  - loads `/api/flashcards`;
  - shows the counts and **Start review**, which runs the cards in `FocusLayout`:
    - the front is the lemma, and **Show answer** (or Space/Enter) flips the card;
    - the back shows the plural, the meaning with the toggle, and the example;
    - the three rating buttons (`1`/`2`/`3` shortcuts) POST `/api/flashcards/answer` and advance;
    - at the end, the summary shows the count;
  - an add-word `Input` with **Add** (the words route; the result or error inline);
  - a search `Input` over `GET /api/flashcards/words?query=`;
  - settings: words per day (0–50) and the review limit (1–500), saved on blur through `PATCH /api/profile`, with errors inline.

- [ ] **Step 1: Write the failing tests**

Create `components/freestyle/EndSession.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { EndSession } from './EndSession';

const SUMMARY = { wentWell: [{ en: 'Good questions', de: 'Gute Fragen' }], mistakes: [{ en: 'Perfekt with sein', de: 'Perfekt mit sein' }], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }, { lemma: 'die Praxis', meaningEn: 'practice' }] };

function stub(routes: Record<string, (() => Promise<unknown>)[]>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const queue = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!queue?.length) throw new Error(`Unexpected ${url}`);
    return (queue.length > 1 ? queue.shift()! : queue[0])();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('EndSession', () => {
  it('confirms, shows the summary, and saves the chosen words', async () => {
    const fetchMock = stub({
      'POST /api/freestyle/conversation/end': [() => delayedResponse({ summary: SUMMARY })],
      'POST /api/flashcards/words': [
        () => delayedResponse({ itemId: 1, lemma: 'der Termin', status: 'added' }),
        () => delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 }),
      ],
    });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByText('Good questions')).toBeInTheDocument();
    expect(screen.getByText('Perfekt with sein')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save selected' }));
    expect(await screen.findByText('Saved: der Termin')).toBeInTheDocument();
    expect(await screen.findByText('die Praxis is already in your deck')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/flashcards/words')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onEnded).toHaveBeenCalled();
  });

  it('offers retry or ending without a summary when the summary fails', async () => {
    const fetchMock = stub({
      'POST /api/freestyle/conversation/end': [
        () => delayedResponse({ error: 'No AI provider is set up', code: 'no_provider' }, { ok: false, status: 502 }),
        () => delayedResponse({ summary: null }),
      ],
    });
    const onEnded = vi.fn();
    renderWithIntl(<EndSession mode="conversation" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No AI provider is set up');
    fireEvent.click(screen.getByRole('button', { name: 'End without summary' }));
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/freestyle/conversation/end', expect.objectContaining({ body: JSON.stringify({ skipSummary: true }) }));
  });
});
```

Create `components/deck/DeckPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { ShellProvider } from '@/components/shell/ShellContext';
import { DeckPage } from './DeckPage';

const DECK = {
  cards: [
    { itemId: 1, lemma: 'der Hund', plural: 'die Hunde', meaning: { en: 'dog', de: 'ein Tier, das bellt' }, example: 'Der Hund bellt.' },
    { itemId: 2, lemma: 'wohnen', plural: null, meaning: { en: 'to live', de: 'zu Hause sein' }, example: null },
  ],
  dueCount: 2,
  answeredToday: 0,
  newWordsPerDay: 10,
  deckReviewCap: 50,
  aiAvailable: true,
};

describe('DeckPage', () => {
  it('reviews cards: flip, rate with keys or buttons, then shows the end', async () => {
    const fetchMock = vi.fn((url: string) => (url === '/api/flashcards' ? delayedResponse(DECK) : delayedResponse({ nextDueAt: '2026-10-01' })));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <ShellProvider>
        <DeckPage />
      </ShellProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start review (2)' }));
    expect(screen.getByText('der Hund')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('dog')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '1' });
    expect(await screen.findByText('wohnen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: "Didn't know" }));
    expect(await screen.findByText('Done for today: 2 cards reviewed.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/answer', expect.objectContaining({ body: JSON.stringify({ itemId: 1, rating: 'knew' }) }));
    expect(fetchMock).toHaveBeenCalledWith('/api/flashcards/answer', expect.objectContaining({ body: JSON.stringify({ itemId: 2, rating: 'didnt_know' }) }));
  });

  it('adds a word and shows duplicates inline', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      url === '/api/flashcards' ? delayedResponse({ ...DECK, cards: [], dueCount: 0 }) : delayedResponse({ error: 'x', code: 'already_in_deck' }, { ok: false, status: 409 })
    ));
    renderWithIntl(
      <ShellProvider>
        <DeckPage />
      </ShellProvider>
    );
    fireEvent.change(await screen.findByLabelText('Add a word'), { target: { value: 'Hund' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This word is already in your deck'));
    expect(screen.getByText('Nothing to review right now.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/freestyle/EndSession.test.tsx components/deck`
Expected: FAIL.

- [ ] **Step 3: Implement**

Build `EndSession` and `DeckPage` to the interfaces above:
- `EndSession` goes into `FreestyleSession`'s header, and `onEnded` navigates to `/freestyle`.
- `DeckPage`'s review uses `FocusLayout` (`confirmExit` when at least one card was answered and cards remain) and `useExerciseShortcuts`: `1`/`2`/`3` rate after flipping, and Enter flips.
- Ratings use `useSound()`: `correct` for knew and sort of, `wrong` for didn't know.
- Create `app/flashcards/page.tsx` (onboarding gate) rendering `<DeckPage />`.

Catalogs:
- `freestyle` additions (en / de):
  - `end` "End" / "Beenden", `endTitle` "End this session?" / "Diese Sitzung beenden?"
  - `endBody` "You'll see a short summary, then the session is gone." / "Du siehst eine kurze Zusammenfassung, danach ist die Sitzung weg."
  - `endConfirm` "End session" / "Sitzung beenden", `endWithoutSummary` "End without summary" / "Ohne Zusammenfassung beenden"
  - `tryAgain` "Try again" / "Erneut versuchen"
  - `wentWell` "What went well" / "Was gut lief", `mistakes` "Recurring mistakes" / "Wiederkehrende Fehler"
  - `wordsToSave` "Words to save" / "Wörter zum Speichern", `saveSelected` "Save selected" / "Auswahl speichern"
  - `alreadyIn` "{lemma} is already in your deck" / "{lemma} ist schon in deinem Kartenstapel", `done` "Done" / "Fertig"
- `deck` additions:
  - `title` "Flashcards" / "Karteikarten"
  - `startReview` "Start review ({count})" / "Wiederholung starten ({count})"
  - `showAnswer` "Show answer" / "Antwort zeigen"
  - `knew` "Knew it" / "Gewusst", `sortOf` "Sort of" / "Halbwegs", `didntKnow` "Didn't know" / "Nicht gewusst"
  - `doneToday` "Done for today: {count} cards reviewed." / "Für heute fertig: {count} Karten wiederholt."
  - `nothingDue` "Nothing to review right now." / "Gerade gibt es nichts zu wiederholen."
  - `addWord` "Add a word" / "Wort hinzufügen", `add` "Add" / "Hinzufügen"
  - `search` "Search your words" / "Deine Wörter durchsuchen"
  - `newPerDay` "New words per day" / "Neue Wörter pro Tag", `reviewLimit` "Daily review limit" / "Tägliches Wiederholungslimit"
  - `plural` "Plural: {plural}" / "Plural: {plural}"

The rating buttons keep the lesson's flashcard labels for consistency: reuse `exercise.flashcard.*` if Phase 1 named them so, and otherwise use these.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components messages/catalogs.test.ts && npx tsc --noEmit && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A components/freestyle components/deck app/flashcards messages
git commit -m "feat: add the Freestyle End flow with its summary and the vocabulary deck page"
```

---

### Task 11: Content — the official A1–B1 lists with meanings

A content task in two parts: a one-off extraction, then drafting. Commit per level.

**Files:**
- Create: `scripts/extract-wortlisten.ts` (one-off)
- Modify: `data/wortlisten/a1.json`, `a2.json`, `b1.json`

- [ ] **Step 1: Extract**

Install poppler (`brew install poppler` on macOS) so `pdftotext` is available.

Download the published Goethe-Zertifikat Wortliste PDFs (A1, A2, B1) from goethe.de into `/tmp/wortlisten/` (the A2 list is the "Goethe-Zertifikat A2" Wortliste; B1 is the "Goethe-Zertifikat B1" Wortliste, shared with ÖSD).

Write `scripts/extract-wortlisten.ts`. It runs `pdftotext -layout` on each PDF and parses the alphabetical list: each entry starts with a headword, often with an article and plural (`der Abend, -e`), followed by one or more example sentences. It writes candidate entries `{ lemma, partOfSpeech, plural, example }` to `/tmp/wortlisten/<level>.candidates.json`:
- **Lemma:** nouns get the article prefixed; a plural shorthand like `-e` expands to the full plural (`die Abende`);
- **Part of speech:** inferred as noun (article), verb (infinitive ending in -en/-n with no article), and otherwise adjective, adverb or other by a small word list;
- **Example:** the first example sentence.

The layout differs by year of publication. Print 20 random parsed entries per level, check them against the PDF, and adjust the parser until they match.

- [ ] **Step 2: Clean and add meanings, level by level**

For each level, take the candidates:
- fix garbled entries;
- drop section headings and non-words;
- merge duplicates;
- remove words that already appear in a lower level's file.

Then write `meaningEn` (short, dictionary-style: "dog", "to live (somewhere)") and `meaningDe` (one simple German line, at or below the word's level) for **every** entry. Keep the list's alphabetical order. Write the result to `data/wortlisten/<level>.json` with `"source": "official"`, replacing the samples.

After each level, run `npx vitest run data/wortlisten` and fix what it reports.

- [ ] **Step 3: Commit per level**

```bash
git add data/wortlisten/a1.json && git commit -m "content: official A1 word list with meanings"
git add data/wortlisten/a2.json && git commit -m "content: official A2 word list with meanings"
git add data/wortlisten/b1.json scripts/extract-wortlisten.ts && git commit -m "content: official B1 word list with meanings, and the extraction script"
```

Report the entry count per level.

Some deck tests count sample words. If they depended on exactly 3 A1 words, change those tests to use a temporary word-list directory: add an optional `listDir` dependency to `createDeckService` (default `data/wortlisten`), and point the tests at a fixture directory `test/fixtures/wortlisten/` holding the 3-word samples from Task 2. Commit that with the A1 list.

---

### Task 12: Content — the B2/C1 NaDoch lists with meanings, and all scenarios

**Files:**
- Modify: `data/wortlisten/b2.json`, `data/wortlisten/c1.json`, `lib/freestyle/scenarios.ts`

- [ ] **Step 1: Draft the B2 and C1 lists**

Each list has about 1,500 entries, marked `"source": "nadoch"`:
- **Sources:** the B2 and C1 curriculum vocabulary lessons across all three tracks (`data/curriculum-seed/*-b2.json`, `*-c1.json`) and common frequency knowledge for the level: abstract nouns, Nomen-Verb-Verbindungen, connectors, academic and work vocabulary.
- **Entries:** every entry has an example sentence at its level, plus `meaningEn` and `meaningDe`. No word may repeat A1–B1 or B2 (for C1).
- **Order:** sort alphabetically.
- **Check:** after each file, run `npx vitest run data/wortlisten`.

- [ ] **Step 2: Scenarios**

Bring `SCENARIOS` to 6–10 per level (5 levels). Each scenario has a unique id `<level>-<slug>`, English and German titles, and a German opener at its level. Cover everyday, work, official, and opinion situations appropriate to each level. Run `npx vitest run lib/freestyle`.

- [ ] **Step 3: Commit**

```bash
git add data/wortlisten/b2.json && git commit -m "content: NaDoch B2 word list with meanings"
git add data/wortlisten/c1.json && git commit -m "content: NaDoch C1 word list with meanings"
git add lib/freestyle/scenarios.ts && git commit -m "content: conversation scenarios for every level"
```

Then run `npx tsc --noEmit && npm test && npm run build`, and in the app, open the deck with a fresh data dir and review a few cards at A1.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Sessions and modes: Tasks 5, 6, 8 and 9.
  - The End flow: Tasks 6 and 10.
  - Deck data, SRS and queue: Tasks 1 and 3.
  - Adding words: Tasks 3 and 8.
  - Starter import and introduction: Task 3.
  - The lesson-flashcard move: Task 4.
  - Pages and navigation: Tasks 7–10.
  - API: Tasks 3 and 6.
  - Content: Tasks 11 and 12.
  - Registered but hidden modes (spoken, exam practice): Task 5 registry.
- **Error codes:** `session_exists` is used for a concurrent End ("busy"); starting while a session is open resumes it, so a start never raises it.
