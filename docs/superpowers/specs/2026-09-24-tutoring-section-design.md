# Tutoring Section — Design Spec

## Product Context

This is the third of eight sub-projects that make up the German AI Tutor WebApp. Core (#1, complete) built the platform shell — BYOK AI providers, settings, onboarding, a generic structured-memory store. CEFR frameworks (#2, complete) plus its follow-on Curriculum Admin Management sub-project built the curriculum data model and the admin tooling to author and organize it — milestones, sections, lessons, exercises, prerequisites, and cross-track concept links all exist and are fully editable, but **nothing yet consumes any of it as a student**. There is no lesson-delivery UI, no progress/completion tracking, and no spaced-repetition scheduling anywhere in the app.

This spec covers that: **the actual teaching mechanism** — a student takes a lesson, answers its exercises, gets graded, and the app tracks what's been learned and when to review it again. It also covers **Freestyle mode**, a toggleable practice mode named in Core's spec (`profile.freestyleDefault`) but never designed until now: open-ended AI conversation practice outside the active track's exam-format structure, plus a cross-source vocabulary flashcard deck.

## Purpose

Let the student (the app's only end-user, on this local single-user app) actually learn: browse the curriculum tree for their active track+level, take lessons, get exercises graded (deterministically or via AI for free-text), request more practice on demand, and have due items resurface later via spaced repetition — both at the exercise level (lesson content) and the vocabulary level (words encountered anywhere, including outside the structured curriculum via Freestyle mode).

## Scope

This is a large feature set, split into four phases, each its own brainstorm → spec → plan → implementation cycle. **This spec designs all four phases up front** (so later phases don't have to re-derive how they fit with Phase 1), **but only Phase 1 is built in the implementation plan that follows this spec.**

**Phase 1 (this cycle) — the core teaching loop:**
- Curriculum tree navigation (`/learn` home) for the active track+level, with progress badges and soft prerequisite warnings.
- Lesson page: explanation/examples, answering exercises of all four types, immediate grading (deterministic for `multiple_choice`/`fill_blank`, self-assessment for `flashcard`, AI-graded for `free_text`).
- Lesson completion tracking (computed, including cross-track concept-link completion sharing).
- Exercise-level spaced repetition (simplified SM-2) and the Daily Queue view (due reviews + a suggested next lesson).

**Phase 2 (deferred) — exercise pool growth:**
- "Get more exercises" — on-demand AI-generated bonus exercises per lesson, served from a shared/growing pool (unseen-existing-first, then generate), schema-validated before saving, never gatekept from student use.
- An admin review/reject queue extending `/admin/curriculum`, so an admin can retroactively pull a bad AI-generated exercise out of circulation.

**Phase 3 (deferred) — persisted per-lesson chat:**
- The "Ask about this" AI chat panel on a lesson page, with its message history saved and retrievable.

**Phase 4 (deferred) — Freestyle mode:**
- Entry point + top-corner nav icon, alongside the Daily Queue icon.
- An open, general-purpose AI chat (skill-picker: conversation/grammar/reading/writing/listening, informal/non-exam-format), scored via an end-of-session AI summary, explicitly excluded from concept-mastery tracking per Core's spec.
- A cross-source vocabulary flashcard deck (words from both lessons and Freestyle) with its own SRS track, separate from exercise-level SRS.

**Out of scope entirely (later sub-projects' job):**
- Skill-specific Freestyle tooling — essay-grading UI (Writing, #4), STT/TTS-driven spoken conversation (Speaking, #6), Reading/Listening-specific freestyle mechanics (#7, #8). Phase 4's chat here is one general-purpose conversation across skills, not specialized per skill.
- Gamification (streaks, XP, badges — sub-project #5).
- Multi-user support. Every table below is implicitly scoped to the app's one local profile; a future multi-user pass would add a `user_id` column throughout, but that's not built now.
- Creating cross-track concept links (already built, prior sub-project). This spec only *consumes* them, for completion-sharing display.

## Data Model

```sql
-- Phase 1: exercise attempts, completion, exercise-level SRS
CREATE TABLE lesson_attempts (
  id INTEGER PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  is_correct INTEGER NOT NULL,
  free_text_answer TEXT,
  ai_feedback TEXT,
  answered_at TEXT NOT NULL
);

CREATE TABLE exercise_srs_state (
  exercise_id TEXT PRIMARY KEY REFERENCES exercises(id),
  repetitions INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  next_due_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Phase 2: AI-generated exercise pool
ALTER TABLE exercises ADD COLUMN source TEXT NOT NULL DEFAULT 'authored';         -- 'authored' | 'ai_generated'
ALTER TABLE exercises ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed'; -- 'unreviewed' | 'approved' | 'rejected'

-- Phase 3: persisted per-lesson chat
CREATE TABLE lesson_chat_messages (
  id INTEGER PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  role TEXT NOT NULL,        -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Phase 4: Freestyle mode — vocabulary deck and session history
CREATE TABLE vocabulary_items (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  context TEXT,
  source TEXT NOT NULL,                  -- 'lesson' | 'freestyle'
  source_exercise_id TEXT REFERENCES exercises(id),
  created_at TEXT NOT NULL
);

CREATE TABLE vocabulary_attempts (
  id INTEGER PRIMARY KEY,
  vocabulary_item_id TEXT NOT NULL REFERENCES vocabulary_items(id),
  is_correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL
);

CREATE TABLE vocabulary_srs_state (
  vocabulary_item_id TEXT PRIMARY KEY REFERENCES vocabulary_items(id),
  repetitions INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  next_due_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE freestyle_sessions (
  id INTEGER PRIMARY KEY,
  skill TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  ai_summary TEXT
);
```

**Design notes:**
- Exercise-level and vocabulary-level SRS state (Phase 1 and Phase 4 respectively) are two separate concrete tables, each with a real foreign key, rather than one polymorphic table — matching this codebase's existing style of many small explicit tables (`lesson_placements`, `lesson_prerequisites`, `lesson_concept_links`) over generic ones. Both share one pure SM-2 function, parameterized rather than tied to a table, so the algorithm itself isn't duplicated across phases.
- A lesson's `flashcard`-type exercise, on first attempt (Phase 1), upserts a matching `vocabulary_items` row once Phase 4 exists (`source='lesson'`, `source_exercise_id` set) — lesson vocabulary automatically feeds the cross-source deck. Freestyle mode (Phase 4) can add a `vocabulary_items` row directly (`source='freestyle'`, `source_exercise_id` null). Phase 1's implementation plan should still create the upsert hook even though `vocabulary_items` doesn't exist yet, OR (simpler, avoids a Phase-1-implements-Phase-4's-table problem) this upsert is added when Phase 4 is actually built, retroactively covering already-attempted flashcard exercises with a one-time backfill. **This spec recommends the latter** — Phase 1 does not need to know Phase 4 exists.
- `vocabulary_attempts`/`vocabulary_srs_state` are separate from `lesson_attempts`/`exercise_srs_state`: reviewing a word in the Freestyle deck doesn't affect lesson completion, and lesson completion doesn't depend on deck review activity.
- `exercises.review_status = 'rejected'` (Phase 2) is the only state that excludes an exercise from the pool. `'unreviewed'` and `'approved'` are both fully usable by students.
- Lesson completion (Phase 1) is **computed, not stored**: a lesson is complete once every `exercises` row for it with `source='authored'` has at least one `is_correct=1` row in `lesson_attempts`. AI-generated bonus exercises (Phase 2) never gate completion. A flashcard's self-assessment ("did I know this?") counts as its correctness signal, same as a graded answer.
- Cross-track completion sharing (already designed in the prior sub-project's spec, via `lesson_concept_links`) is read the same way: a lesson also shows complete if any lesson it's concept-linked to is complete. Query-time check, no write fan-out.

## Phase 1: Core Teaching Loop

### Navigation & Pages

- **`/learn`** (home) — the milestone/section tree for the profile's active track+level (read-only structure, matching admin's `TrackLevelStructure` shape), with progress badges and soft prerequisite warnings that never block navigation. Top-right corner: a Daily Queue icon (Phase 4 adds a Freestyle icon alongside it).
- **`/learn/queue`** — due `exercise_srs_state` reviews across all lessons, plus one suggested next lesson (first incomplete lesson in the active track+level).
- **`/learn/lesson/[id]`** — explanation/examples, exercise list with answer + immediate grading. (Phase 2 adds "Get more exercises" here; Phase 3 adds the chat panel here.)

All pages are new client components with a thin server wrapper, following the existing `AdminLessonPage → LessonDetail` split. No auth gate — student pages are ungated like the rest of the app's non-admin surface.

### Services & Library Architecture

**Pure logic** (`lib/tutoring/`, unit-tested directly, no DB):
- `srs.ts` — `computeNextReview(state, isCorrect) → newState`, the SM-2 function. Written generically enough that Phase 4 reuses it for vocabulary scheduling without modification.
- `completion.ts` — `isLessonComplete(exercises, attempts) → boolean`.
- `exerciseGrading.ts` — deterministic grading for `multiple_choice`/`fill_blank` (exact/variant match).

**Write services** (`lib/services/`):
- `attemptService.ts` — records an attempt, grades it (deterministic, or calls the AI provider for `free_text`), upserts `exercise_srs_state`.

**API routes:**
- `POST /api/tutoring/lessons/[id]/attempts`, `GET /api/tutoring/queue`

### Grading Flow

**Answering an exercise** (`POST /api/tutoring/lessons/[id]/attempts`):
1. Look up the exercise, branch on `type`.
2. `multiple_choice`/`fill_blank`: graded deterministically (`exerciseGrading.ts`), including `acceptableVariants` for fill-blank.
3. `flashcard`: no grading call — the student's self-assessment tap is `is_correct`.
4. `free_text`: `generateText` call with the exercise's `prompt` + `modelAnswer` + the student's answer, returning a correct/incorrect judgment + short feedback text, stored in `lesson_attempts.ai_feedback`.
5. Insert `lesson_attempts`; upsert `exercise_srs_state` via `computeNextReview`.
6. Response includes correctness + feedback + updated lesson-completion status, so the UI can show "lesson complete!" inline.

### Error Handling

- Every mutating fetch checks `res.ok` and surfaces a visible error (`role="alert"`) — the prior sub-project's final review caught several places this was missed after the fact; here it's a requirement from the start.
- `generateText` calls (free-text grading) can fail (network, rate limit, malformed response) — the call site catches and surfaces a distinct error rather than crashing the flow. A failed free-text grading attempt must let the student retry without losing their typed answer.

### Testing Approach

- `lib/tutoring/*` — pure unit tests, table-driven (e.g. SM-2 interval progression across correct/incorrect sequences).
- `attemptService.ts` — integration tests against a real temp-file SQLite DB (matching `curriculumStructureService.test.ts`'s pattern): attempt recording, SRS state upserts, completion computation including concept-link sharing.
- API routes — real-DB integration tests per route.
- `generateText`-calling code (free-text grading) — tested against a fake/mock adapter (matching `lib/providers/*.test.ts`'s existing pattern), never real API calls.

## Phase 2 (deferred): Exercise Pool Growth

**"Get more exercises"** (`POST /api/tutoring/lessons/[id]/more-exercises`), added to the Phase 1 lesson page:
1. Query for existing exercises on this lesson with no `lesson_attempts` row yet (genuinely unseen) and `review_status != 'rejected'` — serve those first if any exist.
2. If exhausted: `generateText` with the lesson's explanation/examples + existing question text (to steer away from duplicates), requesting N new exercises in `ExerciseContent` JSON shape.
3. Schema-validate each against its declared type (reusing the same validation the admin's `ExerciseEditor` already applies on save).
4. Insert valid ones as `source='ai_generated'`, `review_status='unreviewed'`. One retry on total validation failure, then surface an error if that also fails.
5. Return the newly available exercises immediately — no gatekeeping. They're now part of the shared pool for any future request on this lesson.

New write service: `exercisePoolService.ts`. New admin route: `GET/PATCH /api/admin/exercises/review-queue`, gated by `isAdminSessionValid()` like the rest of `/admin`, extending the existing admin curriculum area with an approve/reject UI for `review_status='unreviewed'` exercises.

## Phase 3 (deferred): Persisted Lesson Chat

The "Ask about this" panel on the Phase 1 lesson page, backed by `lesson_chat_messages`. New write service: `lessonChatService.ts` (persist + retrieve). New route: `GET/POST /api/tutoring/lessons/[id]/chat`. Seeded with the lesson's explanation/examples as system context; not tied to grading or completion.

## Phase 4 (deferred): Freestyle Mode

- **Start** (`/freestyle` → skill picker → `POST /api/freestyle/sessions`): creates a `freestyle_sessions` row, opens `/freestyle/chat`.
- **Chat** (`POST /api/freestyle/chat`): `generateText`-backed conversation, system-prompted per chosen skill at the student's active CEFR level (from `profile`). Not tied to a lesson, not graded per-message. The AI can flag a new word worth remembering; a one-tap action saves it (`POST` a `vocabulary_items` row, `source='freestyle'`).
- **End** (`PATCH /api/freestyle/sessions/[id]`): one more `generateText` call producing a short freeform `ai_summary`. Never written to `memory_store`/concept-mastery, per Core's spec ("scored but excluded from concept-mastery tracking").
- **Vocabulary deck** (`/freestyle/vocabulary`): `GET /api/vocabulary/due` returns cards due per `vocabulary_srs_state` (or never-reviewed). Self-assessment → `POST /api/vocabulary/[id]/attempts` → SM-2 update via the same `srs.ts` Phase 1 built.
- One-time backfill (see Data Model notes above): when Phase 4 lands, existing `flashcard`-type `lesson_attempts` history should be walked once to populate `vocabulary_items` for words already learned in Phase 1, so the deck isn't empty on day one for an existing user.

New write services: `vocabularyService.ts`, `freestyleService.ts`. New routes as listed above. New nav: Freestyle icon added alongside Phase 1's Daily Queue icon on `/learn`.

## Key Decisions Log

- **Interaction model: hybrid.** Pre-authored lesson + exercises are the primary path; an AI chat is available per-lesson on demand (Phase 3), not a replacement for structured content.
- **Phased into 4 cycles**, mirroring the precedent set by the Curriculum Admin Management spec — this spec designs all four up front so later phases don't have to re-derive their fit with Phase 1, but only Phase 1 is built in the plan that follows this spec.
- **SRS included in Phase 1, not deferred entirely**, since the CEFR frameworks spec explicitly built stable exercise IDs to support it and retrofitting later would be more disruptive than building it alongside first use. Vocabulary-level SRS (Phase 4) reuses the same algorithm.
- **Simplified SM-2** chosen over Leitner boxes — well-proven for language learning, still simple enough for a from-scratch pure-function implementation.
- **Soft prerequisite gating** — every lesson stays reachable; incomplete prerequisites show as a warning badge only. Matches a self-directed adult learner's expectations better than hard locking.
- **Home screen is the curriculum tree, not a daily queue** — the queue (Phase 1) and Freestyle (Phase 4) are one tap away via top-corner icons, but free browsing/lesson-picking is the primary landing experience. (This reverses an earlier draft of this spec, corrected by the user during brainstorming.)
- **Grading: deterministic where possible, AI only for free-text** — avoids unnecessary API calls/latency on the two exercise types that don't need judgment.
- **Exercise pool (Phase 2) is a shared, growing resource** — AI-generated exercises persist permanently once schema-valid, are immediately usable, and only an explicit admin rejection removes one from circulation. Keeps the "get more exercises" loop cheap after the first few requests per lesson exhaust the initial AI-generation cost.
- **Freestyle mode scope (Phase 4) deliberately narrowed** to a single general-purpose chat + the vocabulary deck, leaving skill-specific freestyle tooling (essay grading, spoken conversation) to the sub-projects already dedicated to those skills.
- **Vocabulary items (Phase 4) are a distinct, lighter-weight concept from flashcard exercises**, not a reuse of the `exercises` table — a word encountered in Freestyle conversation has no natural home in a lesson's exercise set, and unifying the two would force freestyle-sourced words into a schema built for lesson content.
- **Per-lesson chat (Phase 3) is persisted**, unlike an earlier draft of this spec that proposed leaving it ephemeral — corrected by the user during brainstorming, who also flagged that persisting it without a `user_id` is a known simplification for the current single-user scope.
- **No multi-user support** — every table here implicitly belongs to the app's one local profile. A `user_id` column throughout is explicitly future work, not built now.
