# Tutoring Phase 3: Freestyle and the Vocabulary Deck — Design Spec

## Overview

The Tutoring spec outlined Freestyle as informal practice outside the track structure. It now has two parts:

1. **🏂 Freestyle hub:** practice modes the student picks freely, at the active level or any unlocked level, scored by an end-of-session summary. Nothing here feeds lesson mastery.
2. **🗂️ Flashcards deck:** a vocabulary deck with its own spaced repetition. It's seeded from official word lists and fed from Freestyle, manual additions, and vocabulary-lesson flashcards, which **move** here from the Daily Queue.

In the build order it comes after the design pass and the telc B1 expansion, and **before** Reading. Reading, Listening, Writing and Speaking plug their exam practice and extra modes into this hub.

### Freestyle modes

| Mode | Status in this sub-project |
|---|---|
| Conversation chat (scenario starters, inline corrections) | built |
| Grammar drill chat (topic from the level's grammar lessons or free text) | built |
| Free reading (an AI article at the level, with questions) | built |
| Free writing (AI corrections, revise and regrade) | built; Writing later upgrades the feedback |
| Free spoken conversation | registered, hidden until Speaking |
| Exam practice: single Teil or full mock, real format | registered, hidden until Reading builds the Teil engine |

### In scope

- The hub, the four built modes, sessions, summaries, and the mode registry (`enabled` flags).
- The deck:
  - tables, SRS, its own queue, badge and daily limits;
  - words added by tapping a word in an AI message, from a session summary, or manually;
  - duplicate detection;
  - starter lists;
  - moving lesson flashcards into the deck.
- **Content:**
  - the official Goethe/telc Wortlisten for A1, A2 and B1, parsed from the published PDFs and committed as data;
  - Claude-drafted "NaDoch list" B2 and C1 word lists;
  - **Claude-drafted meanings for every word**, in English and simple German.
- Nav: the 🏂 and 🗂️ items (floating buttons and sidebar) are enabled.

### Out of scope

- Exam practice and spoken conversation (they're registered here, and built by Reading and Speaking).
- The error log: Writing builds it, and Freestyle's corrections feed it from then on.
- History of ended sessions. There is none, by decision.

## Sessions

- **One open session per mode.** Opening a mode resumes its open session, or starts one after the student picks a level (default: the active level; options: unlocked levels) and, per mode, a scenario or topic.
- **Ending:** a session ends only when the student taps **End**, which asks first. Ending:
  1. makes one AI call for the **summary** `{ wentWell: LocalizedText[]; mistakes: LocalizedText[]; words: { lemma, meaningEn }[] }`;
  2. shows it once, with a checkbox per suggested word ("Save to deck");
  3. **deletes the session and its messages**. There's no history.
- **If the summary call fails:** the student can retry or end without a summary. The session stays open until one of those happens.
- **What Freestyle feeds:** nothing in lesson progress, the tree, or reviews.

```sql
CREATE TABLE freestyle_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL CHECK (mode IN ('conversation','grammar_drill','free_reading','free_writing','spoken','exam_practice')),
  level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
  setup TEXT NOT NULL DEFAULT '{}',        -- JSON: scenario / topic / article / writing prompt, per mode
  started_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_freestyle_one_open ON freestyle_sessions(mode);

CREATE TABLE freestyle_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES freestyle_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  extra TEXT,                              -- JSON: corrections, drill verdicts, reading answers
  created_at TEXT NOT NULL
);
```

Since sessions are deleted on End, the existence of a row means the session is open.

### Modes

- **Conversation:**
  - **Setup:** a scenario starter, chosen from a fixed list per level (e.g. "Arzttermin vereinbaren", "Wohnung besichtigen"; there are 6–10 per level in `lib/freestyle/scenarios.ts`, drafted as content, with titles in en and de), or a free topic.
  - **Each turn** is one AI call returning `{ "corrections": [{ "wrong", "right", "reason_en", "reason_de" }], "reply": "..." }`.
  - **Corrections** appear inline under the student's message, as ~~wrong~~ → right with a one-line reason. The reason is shown in the UI language and has the feedback language toggle.
  - **Replies** are German at the session level, from a friendly conversation partner who stays in the scenario.
- **Grammar drill:**
  - **Setup:** a topic, chosen from the level's grammar lesson titles (for the active track, in the UI language) or typed freely.
  - **The AI asks** one short question at a time.
  - **Each student answer** returns `{ "verdict": "correct" | "almost" | "wrong", "explanation_en", "explanation_de", "next": "..." }`, shown with the verdict colours and the explanation toggle.
- **Free reading:**
  - **Setup:** a topic (free text or suggestions).
  - **One AI call** returns `{ "title", "text", "questions": [{ "question", "options": [...], "correctIndex" }] }`. The German text is sized to the level (A1 ~120 words, up to C1 ~450), with 3–5 multiple-choice questions, all in German.
  - **Answers** are checked locally, and every word in the text can be tapped to save it.
  - **"Another article"** replaces it in the same session.
- **Free writing:**
  - **Setup:** a prompt suggestion, or the student's own topic.
  - **Submitting** the text is one AI call returning `{ "corrections": [...same shape...], "corrected": "...", "comment_en", "comment_de" }`.
  - **Revise and regrade:** the student may revise and submit again. Versions are kept side by side within the session.

AI replies use the active provider. With no working provider, the hub shows the modes as unavailable, with the Settings link.

## The Vocabulary Deck

```sql
CREATE TABLE vocabulary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lemma TEXT NOT NULL,                     -- dictionary form, nouns with article: "der Hund"
  lemma_key TEXT NOT NULL UNIQUE,          -- lowercased, trimmed lemma (duplicate detection)
  part_of_speech TEXT,
  plural TEXT,
  meaning_en TEXT NOT NULL,
  meaning_de TEXT NOT NULL DEFAULT '',     -- simple German explanation; '' falls back to English
  example TEXT,
  level TEXT CHECK (level IS NULL OR level IN ('A1','A2','B1','B2','C1')),
  source TEXT NOT NULL CHECK (source IN ('starter','lesson','freestyle','manual')),
  source_ref TEXT,                          -- starter list id, or the lesson exercise id
  status TEXT NOT NULL CHECK (status IN ('not_started','learning')),
  introduced_on TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE vocabulary_srs_state (
  item_id INTEGER PRIMARY KEY REFERENCES vocabulary_items(id) ON DELETE CASCADE,
  repetitions INTEGER NOT NULL, ease_factor REAL NOT NULL, interval_days REAL NOT NULL,
  next_due_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE vocabulary_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('knew','sort_of','didnt_know')),
  answered_on TEXT NOT NULL, answered_at TEXT NOT NULL
);
ALTER TABLE profile ADD COLUMN new_words_per_day INTEGER NOT NULL DEFAULT 10 CHECK (new_words_per_day BETWEEN 0 AND 50);
ALTER TABLE profile ADD COLUMN deck_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (deck_review_cap BETWEEN 1 AND 500);
```

- **Card:** the front is the German lemma. The back shows the plural, the meaning in the UI language (with the toggle), and the example sentence. Grading is **Knew / Sort of / Didn't know**, using Phase 1's `FLASHCARD_GRADES` and `computeNextReview`.
- **Deck queue:** due `learning` items, most overdue first, capped by `deck_review_cap` per day. Answers are counted from `vocabulary_answers`, and only the first answer per item per day moves its schedule. It's separate from the Daily Queue, with its own 🗂️ badge.
- **Starter words:**
  - **Import:** for every level up to the profile's active level, the level's list is imported as `not_started` items. The import is idempotent by `lemma_key` and runs when the deck opens. Every track uses the same lists: the official A1–B1 lists are shared by Goethe and telc, and B2/C1 are the NaDoch lists.
  - **Introduction:** each day, up to `new_words_per_day` `not_started` items become `learning`, due today. They go lowest level first, then in list order.
  - **Settings:** both numbers are on the deck page.
- **Adding a word** (tap, summary, manual):
  1. One AI call normalizes the word: `{ lemma, partOfSpeech, plural, meaningEn, meaningDe }`, given the word and its sentence.
  2. **Duplicates** are checked by `lemma_key` after normalization. An existing `not_started` item becomes `learning`, due today. An existing `learning` item shows "already in your deck".
  3. **New items** are `learning` and due today.

  Without a working provider, adding is unavailable, with the Settings link.
- **Lesson flashcards move into the deck:**
  - When a vocabulary lesson completes, its flashcards enter the **deck** instead of the Daily Queue, as `source: 'lesson'` items: front → lemma, back → meaning_en. They use Phase 1's seeding rule (right first try → due in 3 days, otherwise tomorrow). An existing item with the same `lemma_key` is kept and set to `learning`, with the earlier due date.
  - The same applies to a flashcard added to an already-completed lesson, and to the restructure's test-out scheduling.
  - The Daily Queue no longer includes flashcard exercises.
  - **Migration:** every existing `exercise_srs_state` row of a flashcard exercise becomes a deck item with the same state, and the row is removed.
  - Answering a flashcard inside a lesson still counts toward lesson completion, exactly as today.

## Pages and Navigation

- 🏂 `/freestyle`:
  - The hub: a card per enabled mode, marked when it has an open session.
  - The mode registry is `lib/freestyle/modes.ts` (`{ mode, labelKey, icon, enabled }`), with spoken and exam practice `enabled: false`.
- `/freestyle/[mode]`:
  - The session screen: setup, then the chat or task.
  - A header shows the level and End. The screen sits inside the shell, not focus mode.
- 🗂️ `/flashcards`:
  - The deck: today's review (focus mode, the card flip, three rating buttons, and shortcuts `1`/`2`/`3`), an add-word field, and a searchable list of the student's words.
  - Settings: words per day, and the daily review limit.
- **Word tap:** every German word in AI messages and articles is a button. Tapping opens a small popover: "Save to deck".
- **Nav:** `freestyle` and `flashcards` flip to `enabled: true` in `lib/nav/navItems.ts`. Flashcards gets a `deckDue` badge from `GET /api/flashcards/count`.

## API

| Route | Does |
|---|---|
| `GET /api/freestyle` | Enabled modes, open sessions, whether AI is available |
| `POST /api/freestyle/[mode]/session` | Start (`{ level, setup }`) or return the open session with its messages |
| `POST /api/freestyle/[mode]/message` | Conversation or drill turn, or a writing submission. Returns the new messages. |
| `POST /api/freestyle/free_reading/article` | Generate an article (new or "another") |
| `POST /api/freestyle/[mode]/end` | Summary, then delete. `{ skipSummary: true }` ends without one. |
| `GET /api/flashcards` | Today's queue, counts, settings |
| `GET /api/flashcards/count` | `{ due }` for the badge |
| `POST /api/flashcards/answer` | `{ itemId, rating }` |
| `POST /api/flashcards/words` | `{ word, sentence? }`: normalize, dedupe, add |
| `GET /api/flashcards/words?query=` | The student's words (learning), for search |
| `PATCH /api/profile` | Accepts `newWordsPerDay` and `deckReviewCap` |

Errors use the Phase 2 codes (`no_provider`, `ai_failed`, `ai_bad_reply`, `bad_request`, `not_found`). New codes: `session_exists` (409, starting when one is open with different setup is a resume instead) and `already_in_deck` (409).

## Content

1. **Official A1–B1 lists** (`data/wortlisten/a1.json`, `a2.json`, `b1.json`):
   - **Source:** a script downloads the published Goethe-Zertifikat Wortliste PDFs (A1, A2, B1; the B1 list is shared with ÖSD and matches telc B1) and extracts `{ lemma, partOfSpeech, plural, example }` with `pdftotext`.
   - **Cleanup:** a content pass fixes what the extraction garbles.
   - **Licensing:** the parsed lists are committed. This is the user's choice, and the copyright must be resolved before a public deployment (see Accounts & hosting).
2. **B2 and C1 NaDoch lists** (`b2.json`, `c1.json`, marked `"source": "nadoch"`):
   - Claude drafts about 1,500 (B2) and 1,500 (C1) entries, from the curriculum's vocabulary lessons and common frequency knowledge.
   - Each entry has an example sentence and doesn't repeat words from lower levels.
3. **Meanings for every word**, in all five lists:
   - `meaningEn`: short, dictionary-style.
   - `meaningDe`: a one-line simple German explanation, at or below the word's level.
   - Drafted by Claude level by level. The user spot-checks.
4. **Conversation scenarios:** 6–10 per level, titles in en and de, with a one-line German opener each.

A validation test checks every list:
- the fields are present and non-empty;
- `lemma_key`s are unique within and across levels;
- nouns have an article;
- the level matches its file.

## Error Handling

- Every AI failure keeps the student's input and offers a retry. A malformed reply is `ai_bad_reply`.
- An End whose summary fails can be retried, or confirmed without a summary.
- The deck works without AI: reviewing and the starter introduction need no provider, because meanings are pre-drafted. Only adding words needs AI.

## Testing

- **Pure:**
  - `lemmaKey`;
  - the introduction selection (N per day, lowest level first, idempotent within a day);
  - the deck queue (cap, first-answer-per-day);
  - parsers for each AI reply shape (conversation, drill, article, writing, summary, normalize), each with a malformed case;
  - the scenario registry.
- **Services:**
  - sessions: one open per mode, resume, End deletes everything, End without summary;
  - the modes' turn handling with a mocked AI;
  - adding words: normalize, dedupe to `not_started`, dedupe to `learning` → 409;
  - the lesson-flashcard move: completion seeds deck items, not exercise reviews;
  - the migration moves existing flashcard reviews;
  - the Daily Queue has no flashcards;
  - the test-out schedules flashcards into the deck.
- **Routes:** each route, with its error codes.
- **Client:**
  - the hub (enabled modes only; open-session marker);
  - conversation (inline correction with its toggle, reply);
  - drill verdicts;
  - reading (tap a word → save; local answer check);
  - writing (corrections, revise);
  - the End flow (summary, word checkboxes, retry);
  - the deck review (flip, rate, shortcuts, focus mode) and add-word;
  - the badges.
- **Content:** the word-list validation test.

## Decisions (2026-09-29)

- **Hub:** conversation, grammar drill, free reading and free writing are built now. Spoken conversation arrives with Speaking, and exam practice (single Teil or full mock, always timed, real format) with Reading.
- **Sessions:** one open session per mode. They end only with End, the summary is shown once, and there is no history. The level is the active one, changeable per session within unlocked levels.
- **Corrections:** conversation corrections appear inline under the student's message.
- **Deck:** Knew / Sort of / Didn't know. Separate from the Daily Queue, with its own badge and limits. 10 new starter words per day, adjustable, lowest level first.
- **Adding words:** tap, summary or manual, with duplicate checks on every add.
- **Starter lists:** official Wortlisten for A1–B1, committed as parsed data (the licensing is flagged for the public launch), plus Claude-drafted B2/C1. **All meanings are drafted by Claude up front.**
- **Lesson flashcards:** vocabulary-lesson flashcards move into the deck, keeping their review state.
- **Removed:** `profile.freestyleDefault` (done in the design pass).
