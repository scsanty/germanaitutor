# Tutoring Section — Design Spec

## Product Context

This is the third of eight sub-projects that make up the German AI Tutor WebApp. Core (#1, complete) built the platform shell — BYOK AI providers, settings, onboarding, a generic structured-memory store. CEFR frameworks (#2, complete) plus its follow-on Curriculum Admin Management sub-project built the curriculum data model and the admin tooling to author and organize it — milestones, sections, lessons, exercises, prerequisites, and cross-track concept links all exist and are fully editable, but **nothing yet consumes any of it as a student**. There is no lesson-delivery UI, no progress/completion tracking, and no spaced-repetition scheduling anywhere in the app.

This spec covers that: **the actual teaching mechanism** — a student takes a lesson, answers its exercises, gets graded, can ask an AI about what they got wrong, and the app tracks what's been learned and when to review it again. It also outlines **Freestyle mode**, a toggleable practice mode named in Core's spec (`profile.freestyleDefault`) but never designed until now.

## Purpose

Let the student (the app's only end-user, on this local single-user app) actually learn: browse the curriculum tree for their active track+level, take lessons one exercise at a time, get graded (deterministically, by self-assessment, or by AI for free text), ask the AI follow-up questions about any exercise they've answered, and have completed material resurface later via spaced repetition.

## Scope

Three phases, each its own plan → implementation cycle. **This spec settles Phase 1 in full; Phases 2 and 3 are outlines** that get their own short brainstorm when they're next, since their open details are better answered once Phase 1 is real and usable.

Phase 1 is implemented as **two plans run back to back**. **Plan 1A** builds the level system and admin work: unlocking, the placement test (including authoring the default exam for review), the flashcard rule and violation list, curriculum export, and exam download/upload. **Plan 1B** builds the teaching loop on top: the tree, lessons, grading, completion, review, the Daily Queue, and the lesson chat. Plan 1B starts from a working level system, so nothing gets reworked. The placement test needs grading, so Plan 1A also builds `grading.ts` (deterministic) and the AI free-text grader; Plan 1B reuses both for lessons and the queue.

**Phase 1 (this cycle) — the core teaching loop:**
- The curriculum tree as the app's home page (`/`), for the active track+level, with progress and soft prerequisite warnings.
- Lesson page: explanation/examples, then exercises one at a time, graded immediately, wrong answers retried until the lesson completes.
- Stored ("sticky") lesson completion, with display-only completion sharing across concept-linked lessons.
- Exercise-level spaced repetition (simplified SM-2), entered at lesson completion, and the Daily Queue with a Settings-configurable daily cap.
- A persisted per-lesson AI chat, including an "Ask AI" button on every answered exercise except flashcards.
- Level unlocking: levels are hard-locked above the student's highest unlocked level, shared across all tracks. Finishing a level in any track unlocks the next level in every track.
- A placement test in onboarding (skippable, retakable from Settings) that sets the starting unlocked range, replacing Core's self-selected level.
- Admin additions: the "flashcards only in vocabulary lessons" rule, a live list of existing violations, curriculum export to seed JSON (per track+level, or a zip of all), and download/upload of the placement exam.

**Phase 2 (outline) — exercise pool growth:** "Get more exercises" per lesson, backed by a shared, growing pool of AI-generated exercises plus an admin review/reject queue.

**Phase 3 (outline) — Freestyle mode:** an open AI practice chat outside the track structure, scored by an end-of-session summary, plus a cross-source vocabulary flashcard deck with its own spaced repetition.

**Out of scope entirely (later sub-projects' job):**
- Skill-specific Freestyle tooling — essay grading (Writing, #4), spoken conversation with STT/TTS (Speaking, #6), Reading/Listening-specific mechanics (#7, #8).
- Gamification — streaks, XP, badges (#5).
- Level exams — a full mock exam per track+level (Reading, Listening, Writing, Speaking, following that track's format and rubric), required to finish a level. This becomes its own sub-project after the Writing, Speaking, Reading, and Listening modules exist; Claude drafts the 15 exams and the user reviews them. Until then, finishing a level means completing its lessons (see Level Unlocking).
- Voice questions in the placement test — added by the Speaking sub-project (#6), which brings speech-to-text.
- Styling. New pages follow the app's current plain-HTML conventions; the deferred app-wide design pass (dark-first, warm orange accent, colors in an external theme file) restyles everything later.
- Multi-user support. Every table is implicitly scoped to the app's one local profile. A future multi-user pass would add a `user_id` column throughout.
- Writing anything to Core's `memory_store`. Phase 1's progress lives in its own tables and nothing in Phase 1 needs cross-call AI memory.
- Creating concept links (already built). This spec only reads them.

## Phase 1: Data Model

```sql
CREATE TABLE lesson_attempts (
  id INTEGER PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('correct', 'almost', 'wrong')),
  free_text_answer TEXT,
  ai_feedback TEXT,
  answered_at TEXT NOT NULL
);

CREATE TABLE lesson_completions (
  lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL
);

CREATE TABLE exercise_srs_state (
  exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  repetitions INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  next_due_at TEXT NOT NULL,   -- local calendar date, YYYY-MM-DD
  updated_at TEXT NOT NULL
);

CREATE TABLE lesson_chat_messages (
  id INTEGER PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,  -- set when the message is about a specific exercise
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE profile ADD COLUMN daily_review_cap INTEGER NOT NULL DEFAULT 50;
ALTER TABLE profile ADD COLUMN highest_unlocked_level TEXT NOT NULL DEFAULT 'A1'
  CHECK (highest_unlocked_level IN ('A1', 'A2', 'B1', 'B2', 'C1'));
ALTER TABLE profile ADD COLUMN placement_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (placement_status IN ('pending', 'skipped', 'taken'));
ALTER TABLE profile ADD COLUMN unlock_notice_level TEXT
  CHECK (unlock_notice_level IN ('A2', 'B1', 'B2', 'C1'));  -- set on unlock, cleared on Switch or dismiss

-- Placement exam: one active exam, ordered by ascending difficulty
CREATE TABLE placement_questions (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,   -- 1..N, easiest first
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'fill_blank', 'free_text')),
  content TEXT NOT NULL               -- JSON, same shapes as lesson ExerciseContent
);

-- The attempt in progress (at most one; starting a new attempt overwrites it)
CREATE TABLE placement_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT NOT NULL,
  next_position INTEGER NOT NULL,
  score REAL NOT NULL,
  mistakes INTEGER NOT NULL,
  answers TEXT NOT NULL               -- JSON list for the end-of-test review screen
);

-- Only the best result is kept
CREATE TABLE placement_best_result (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  placed_level TEXT NOT NULL,
  stop_reason TEXT NOT NULL CHECK (stop_reason IN ('beyond_my_knowledge', 'five_mistakes', 'finished')),
  taken_at TEXT NOT NULL
);
```

**Existing profiles.** A profile created before this change self-selected its level in onboarding. The migration resets it to `highest_unlocked_level = 'A1'`, `active_level = 'A1'`, `placement_status = 'pending'`, so the home tree prompts it to take (or skip) the placement test like a new user.

**Grades.** Every attempt stores one of three results:

| Exercise type | How graded | `correct` | `almost` | `wrong` |
|---|---|---|---|---|
| `multiple_choice` | deterministic | right option | — | wrong option |
| `fill_blank` | deterministic, incl. `acceptableVariants` | match | — | no match |
| `flashcard` | student self-assessment | "Knew it" | "Sort of" | "Didn't know it" |
| `free_text` | AI, against `modelAnswer` | right | small mistakes | wrong |

`almost` counts as passed for completion but grows the review interval less (see SRS below).

**Content changes by an admin:**
- Deleting an exercise or lesson cascades: its attempts, completion, review schedule, and chat go with it. (The admin editor hard-deletes removed exercises, so without the cascade those deletes would fail on the foreign key once a student had answered them.)
- Editing an exercise in place (same id) keeps its attempts and schedule. A real rewrite can be done as delete + add, which starts fresh.
- Adding an authored exercise to an already-completed lesson doesn't reopen it — completion is stored the first time it's earned and never revoked. The new exercise shows as unanswered inside the lesson and enters review after its first attempt (seeded with the rule below).

## Phase 1: Completion

A lesson becomes complete the first time every one of its exercises has at least one `correct` or `almost` attempt. At that moment a `lesson_completions` row is written and the lesson's exercises enter review. It is never removed except by deleting the lesson.

Lessons containing a `free_text` exercise can't complete while no AI provider is working, since free-text grading is blocked in that state (see AI behavior).

**Shared completion through concept links is display-only.** If a concept-linked lesson in another track is complete, this lesson shows "covered via <track>" in the tree and counts as done for the suggested-next lesson and for finishing the level (which unlocks the next one). It gets no `lesson_completions` row, and its exercises don't enter review — the student never practiced them. Everywhere else a lesson is judged "done" — the "builds on" warnings, the suggested-next rule, and finishing a level — own and shared completion count the same.

## Phase 1: Spaced Repetition

Simplified SM-2, implemented as one pure function `computeNextReview(state, result, today) → newState` in `lib/tutoring/srs.ts`:
- `correct` → `repetitions + 1`; interval 1 day → 6 days → `interval × ease_factor`; ease nudged up.
- `almost` → `repetitions + 1`; interval grows as for correct, but ease drops.
- `wrong` → `repetitions = 0`, interval 1 day, ease drops.
- `ease_factor` starts at 2.5 with a floor of 1.3.

The function is written against a plain state object, not a table, so Phase 3's vocabulary deck reuses it unchanged.

**Entering review.** Nothing is scheduled while a lesson is incomplete. When it completes, each exercise gets a first review date based on its first-ever attempt: `correct` on the first try → due in 3 days; anything else (`almost`, `wrong`, or needing retries) → due tomorrow. Exercises added to an already-completed lesson are seeded the same way from their own first attempt.

**Which answers move the schedule.** Only the first answer to an exercise on a given local calendar day, from any source: the Daily Queue, or re-doing a completed lesson for practice. Later same-day answers are still logged and still count toward completion, but they don't move the schedule.

**Days** are the computer's local calendar date. An exercise is due when `next_due_at <= today`.

## Phase 1: Level Unlocking

- **One unlock range for all tracks.** `profile.highest_unlocked_level` opens every level from A1 up to it, in every track. A1 is always open.
- **Hard lock.** A level above the highest unlocked one can't be chosen as the active level (Settings or any prompt), and its lessons can't be opened — `/lesson/[id]` for such a lesson shows "Locked — unlocks after finishing <level below>" instead of the lesson.
- **Finishing a level.** A track+level is finished when every visible lesson in its tree (Unsorted excluded) is complete, own or shared via a concept link. Whenever a lesson completion is recorded, the service checks that lesson's track+level; if it's now finished and the next level is still locked, `highest_unlocked_level` moves up one — in every track. Example: finishing Generic A1 opens A2 in Generic, Goethe, and TELC, so the student can go on to Goethe A2.
- **Unlocks never go down.** Nothing re-locks a level — not a lower placement retake, and not an admin adding lessons to a level that was already finished.
- **Prompt.** When a level unlocks this way (or through a higher placement retake), `unlock_notice_level` is set and the tree shows "A2 unlocked — switch to A2?" until the student taps Switch (changes the active level) or × (keeps it); either clears the notice. If a second unlock happens first, the notice shows the higher level. A first placement sets the active level directly and shows no notice. Nothing past C1.
- **Later.** When the Level exams sub-project lands, finishing a level will also require passing that track+level's exam.

## Phase 1: Placement Test

**Where it runs.** Onboarding becomes: welcome → connect provider → choose track → choose UI language → placement test (or "Skip, start at A1") → done. Replaces Core's self-selected level. A working provider is already guaranteed by that point, so free-text grading is available. Settings gets "Take / retake the placement test" and shows the best result. An existing profile with `placement_status = 'pending'` sees a "Take the placement test" banner on the home tree until it takes or skips it. For a new student, onboarding is complete only once the test is taken or skipped; leaving mid-test reopens onboarding at the placement step. There's no "Ask AI" during the test.

**The exam.** One track-neutral exam, the same for every student, ordered by ascending difficulty — across levels and within each level. The default exam has 40 questions, 8 per level from A1 to C1, roughly 3 multiple choice, 3 fill-blank, and 2 free text per level. Flashcards are excluded (they're self-graded, and placement needs a real grade). Voice questions come with the Speaking sub-project. Claude authors the default exam as a task in the implementation plan, and the user reviews it before it ships as `data/placement-exam.json`. That seed loads only into an empty `placement_questions` table; after that the database, and admin uploads, are authoritative.

**Taking it.** One question at a time, easiest first, with no right/wrong feedback and no counter. Multiple choice and fill-blank are graded deterministically (the same `grading.ts` as lessons); free text is graded by AI as `correct` / `almost` / `wrong`. If free-text grading fails, the student sees an error and retries; their answer is kept. A "Beyond my knowledge" button is always visible. The test stops when the student presses it, makes their 5th `wrong` answer (the button is pressed automatically), or answers every question. Leaving mid-test abandons the attempt; the next start begins again from question 1.

**Scoring (deterministic).** A question is worth points equal to its level: A1 = 1, A2 = 2, B1 = 3, B2 = 4, C1 = 5. `correct` earns the full value, `almost` half, `wrong` nothing. Only `wrong` counts as a mistake. The score is the cumulative total when the test stops. Placement thresholds are computed from the loaded exam: the threshold to be placed at a level is 75% of the maximum points of every level below it. With the default exam:

| Score | Placed at | Unlocks |
|---|---|---|
| under 6 | A1 | A1 |
| 6 – under 18 | A2 | A1–A2 |
| 18 – under 36 | B1 | A1–B1 |
| 36 – under 60 | B2 | A1–B2 |
| 60 – 120 | C1 | A1–C1 |

Being placed at a level means "study here", so passing a level's questions places the student one level up. Placement only unlocks: no lesson below the placed level is marked complete.

**After the test.** The end screen shows the score, the placed level, and every answer next to the correct one. First placement: `highest_unlocked_level` and `active_level` are set to the placed level. Retake: unlocks only ever go up — a higher placement raises `highest_unlocked_level` and offers "You placed at B2. Switch to it?"; a lower one changes nothing. Only the best result is kept in `placement_best_result`, replaced only by a higher score.

## Phase 1: Pages and Navigation

- **`/`** — the curriculum tree for the profile's active track+level: milestones and sections in order, each lesson with its status (not started / in progress / complete / covered via another track). The admin-only Unsorted bucket is hidden. A lesson with an incomplete prerequisite shows a "builds on: X" warning but is always clickable. Keeps the existing onboarding redirect and `ActiveProviderBanner`. Top corner: a Daily Queue icon (Phase 3 adds a Freestyle icon beside it). Shows the level-unlocked prompt and the pending-placement banner described above.
- **`/queue`** — the Daily Queue. Due exercises from lessons in the active track+level only, most overdue first, up to the profile's `daily_review_cap` per day (reviews already answered in the queue today count against it; practice re-dos of completed lessons don't; the rest roll over). Items are shown one at a time with the same grading and "Ask AI" as inside a lesson. Below the reviews: one suggested next lesson — the first incomplete lesson in tree order whose prerequisites are all done, or the first incomplete lesson if none qualify.
- **`/lesson/[id]`** — explanation and examples first. Then exercises one at a time with a progress counter, in fixed order (sorted by exercise id, multiple-choice options exactly as authored). Wrong answers go to a retry round at the end until every exercise has passed. Leaving and coming back resumes with the exercises not yet passed. Re-opening a completed lesson runs it again as practice. The page lists the lesson's prerequisites ("builds on: X, Y") as links with their status; cross-track concept-linked siblings are not shown. A collapsible chat panel shows the lesson's saved thread.
- **`/placement`** — the placement test and its end screen, used from onboarding and from Settings.
- **Settings** gets a "Daily review limit" number field (`daily_review_cap`, default 50), limits the level picker to unlocked levels, and adds the placement retake and best result.

Pages are thin server wrappers around client components, following the existing `AdminLessonPage → LessonDetail` split. No auth gate — student pages are ungated like the rest of the app's non-admin surface.

## Phase 1: AI Behavior

All AI calls go through the existing provider layer using the active connection, and record token usage the same way the rest of the app does.

**Free-text grading.** One `generateText` call with the exercise's `prompt`, `modelAnswer`, the student's answer, and the lesson's CEFR level, returning `correct` / `almost` / `wrong` plus short feedback. Feedback is written in the student's UI language (`profile.uiLanguage`). If no provider is configured or the call fails, the answer isn't graded: the student sees a clear error with a link to Settings, their typed answer is kept, and they can retry. There is no self-assessment fallback. Inside a lesson, an ungraded free-text exercise stays unpassed; the student can move on to the other exercises, and it comes back in the retry round.

**Lesson chat and "Ask AI".** One persisted thread per lesson (`lesson_chat_messages`). Every answered exercise except flashcards has an "Ask AI" button, available only after answering so it can't be used to get the answer first. It opens the lesson's chat panel with that exercise, the student's answer, and the grade attached as context; those messages are tagged with the exercise id. The student can also ask general questions about the lesson in the same thread. Each call sends the lesson's explanation and examples, the tagged exercise's context if any, and the last 20 messages of the thread. Replies arrive whole (the provider layer doesn't stream). With no working provider, the chat is disabled with the same Settings link.

## Phase 1: Admin Additions

**Flashcards only in vocabulary lessons.** The flashcard exercise type is for vocabulary (word ↔ meaning) and only allowed in lessons whose skill is `vocabulary`:
- The lesson editor rejects a save that would leave any flashcard in a non-vocabulary lesson — both adding one, and changing a lesson's skill away from `vocabulary` while it still has flashcards — with a message naming the count ("This lesson has 4 flashcards, which are only allowed in vocabulary lessons. Remove or change them first."). The editor-side type picker hides the flashcard option for non-vocabulary lessons; the service-side check is the real guard.
- There are 86 existing flashcards in non-vocabulary lessons (70 grammar, 7 speaking, 6 writing, 3 reading). They're not migrated. A computed admin list ("flashcards outside vocabulary lessons") shows each affected lesson with its count and an edit link; it empties itself as they're fixed. Until then students see and answer them normally. Because of the save rule above, editing one of those lessons for any reason requires resolving its flashcards first.

**Curriculum export to seed JSON.** From `/admin/curriculum`:
- Per track+level: download one JSON file in exactly the format `data/curriculum-seed/*.json` uses today.
- All: download a zip of all 15 files, ready to unzip over `data/curriculum-seed/`.
- The export carries the **current** `seedVersion` unchanged, so replacing the repo's seed files affects fresh installs only. Existing databases pick up a change only if someone bumps the version by hand.
- Admin-gated with `isAdminSessionValid()` like the rest of `/admin`.
- **The seed format gains a `conceptLinks` list** (every link where at least one lesson is in that file, so each link appears in both files it touches). The loader upserts them in canonical order, skipping any pair whose other lesson doesn't exist yet; that pair lands when the other file loads. The dead per-lesson `conceptId` field is dropped from exports and ignored if present.
- Building a zip needs a small zip dependency; the plan picks one.

**Placement exam download and upload.** From `/admin`:
- Download the active exam as JSON or YAML, in the same format the upload accepts, to use as a template.
- Upload a JSON or YAML file that replaces the whole exam. The file lists questions in order, each with `id`, `level`, `type`, and `content`. It's validated in full before anything changes: allowed types only (no flashcards), valid content shape per type, every level A1–C1 present, levels never decreasing along the order, unique ids. Any problem rejects the whole upload with a list of errors; nothing is half-applied. On success the questions are replaced in one transaction.
- An upload never touches `placement_best_result` or unlock state. An attempt in progress is discarded, since its questions no longer exist.

## Phase 1: Architecture

**Pure logic** (`lib/tutoring/`, unit-tested without a DB):
- `srs.ts` — `computeNextReview`, plus the first-schedule seeding rule.
- `grading.ts` — deterministic grading for `multiple_choice` and `fill_blank`.
- `completion.ts` — whether a lesson's attempts meet the completion rule.
- `queue.ts` — picking due items under the cap, and the suggested next lesson.
- `placementScoring.ts` — question points, the thresholds computed from an exam, score → placed level, and the stop rules.
- `placementExamFormat.ts` — parsing and validating an uploaded exam file.

**Services** (`lib/services/`):
- `attemptService.ts` — records an attempt, grades it (calling the AI for free text), applies the first-per-day rule, writes completion and seeds review at the moment of completion.
- `progressService.ts` — tree status per lesson (own and shared completion), prerequisite warnings, locked-level checks, and the Daily Queue.
- `lessonChatService.ts` — reads and appends the lesson thread, and builds the AI context.
- `curriculumExportService.ts` — builds seed JSON per track+level.
- `unlockService.ts` — the level-finished check after each completion, and raising `highest_unlocked_level`.
- `placementService.ts` — starting, answering, and finishing an attempt; best-result and unlock updates; loading the seed exam and replacing it on upload.
- Existing `profileService.ts` rejects an `active_level` above `highest_unlocked_level`.
- Existing `lessonAdminService.ts` gains the flashcard rule; existing `curriculumSeedLoader.ts` gains concept-link loading.

**API routes:**
- Student: `POST /api/tutoring/attempts`, `GET /api/tutoring/tree`, `GET /api/tutoring/queue`, `GET/POST /api/tutoring/lessons/[id]/chat`, `POST /api/placement/start`, `POST /api/placement/answer`, `POST /api/placement/stop` ("Beyond my knowledge"), `POST /api/placement/skip`, and the Settings fields through the existing profile route.
- Admin: `GET /api/admin/curriculum/export` (zip) and `GET /api/admin/curriculum/export/[track]/[level]` (single file), `GET /api/admin/curriculum/flashcard-violations`, `GET /api/admin/placement-exam?format=json|yaml`, `PUT /api/admin/placement-exam` (upload).

## Phase 1: Error Handling

- Every client fetch checks `res.ok` and shows a visible error (`role="alert"`) instead of hanging on "Loading..." — the prior sub-project's final review caught several places this was missed, so it's a requirement from the start.
- AI failures (no provider, network, rate limit, a response that isn't the expected shape) surface as a distinct, retryable error. Nothing the student typed is lost.
- A malformed free-text grading response is treated as a failed call, not guessed at.

## Phase 1: Testing

- `lib/tutoring/*` — pure, table-driven unit tests (SM-2 interval sequences, seeding rule, first-per-day behavior, cap and suggested-next selection, placement points and thresholds including the default-exam table above, each stop rule, and exam-file validation errors).
- Unlocking and placement — integration tests: finishing a level in one track opens the next level in all tracks; hard lock rejects a locked active level and a locked lesson; a lower retake changes nothing and a higher one raises the unlock; a bad upload changes nothing; the existing-profile migration resets to A1.
- Services and routes — integration tests against a real temp-file SQLite database, matching the existing pattern: completion is written once and survives new exercises; cascades on admin delete; review entry at completion; queue scoping to active track+level; flashcard rule on create, update, and skill change; export output loads back through the seed loader, concept links included.
- AI-calling code — tested against a fake provider adapter, matching `lib/providers/*.test.ts`. No real API calls.
- Client components — timing-realistic fetch mocks (a response delayed by a real timer, not an instantly-resolved promise) for any multi-step effect, per the prior sub-project's final review, which found a race that instant mocks hid.

## Phase 2 (outline): Exercise Pool Growth

A "Get more exercises" button on the lesson page. It serves exercises for that lesson the student hasn't seen yet, and when none are left, asks the AI for new ones, schema-validates them (with the same validation the admin editor applies on save), stores them as `source='ai_generated'`, `review_status='unreviewed'`, and shows them immediately. Generated exercises join a shared pool for future requests. They never count toward completion. An admin review queue can reject bad ones; only `rejected` removes an exercise from circulation. Generation must respect the flashcard rule. Open for that cycle's brainstorm: how many per request, which types, how they fit into the one-at-a-time flow, and whether they enter review.

## Phase 3 (outline): Freestyle Mode

A Freestyle icon next to the Daily Queue icon. An open AI chat at the student's level (skill picker: conversation / grammar / reading / writing / listening, informal rather than exam-format), with sessions stored in `freestyle_sessions` and scored by an end-of-session AI summary that is never written to concept-mastery (per Core's spec). A cross-source vocabulary deck: `vocabulary_items` (word, translation, optional context, source `lesson` or `freestyle`) with its own attempts and review state, reusing Phase 1's `computeNextReview`. Lesson flashcards (vocabulary lessons only, after Phase 1's rule) feed the deck, backfilled once from existing attempt history when this phase lands. Open for that cycle's brainstorm: session start/end triggers, how words get saved from chat, deck grading buttons, and what `profile.freestyleDefault` actually does.

## Key Decisions Log

- **Hybrid interaction model.** Authored lessons and exercises are the primary path; the AI grades free text and answers follow-up questions, but doesn't replace structured content.
- **Three phases**, following the Curriculum Admin Management precedent. The lesson chat moved into Phase 1 once "Ask AI" on exercises was requested — one chat system rather than two.
- **Simplified SM-2** over Leitner boxes — proven for language learning, still a small pure function.
- **Review starts at lesson completion, not first attempt**, and only the first answer per day moves a schedule, so in-lesson retries don't read as recall.
- **Daily Queue is scoped to the active track+level**, with a daily cap configurable in Settings (default 50).
- **Completion is stored and sticky.** An admin adding an exercise never takes a completion away.
- **Shared completion via concept links is display-only** — it counts for the tree, "builds on" warnings, suggested-next, and finishing a level, but not for review.
- **Admin deletes cascade** through all student progress tables.
- **Soft prerequisite gating** — warnings only, every lesson reachable.
- **The tree is the home page at `/`**, with the Daily Queue one tap away. This reverses an earlier draft that made the queue the home screen.
- **Free-text grading is right / almost / wrong**, in the UI language, and **blocked with no working provider** rather than falling back to self-assessment.
- **Flashcards get three self-assessment buttons** (knew it / sort of / didn't know it) and no "Ask AI".
- **Flashcards are only allowed in vocabulary lessons**, enforced on save. The 86 existing violations are listed for manual fixing, not migrated automatically, and stay usable meanwhile.
- **Curriculum export** is an admin download (per track+level, or a zip of all), keeps the current seed version, and extends the seed format with concept links so a fresh install keeps them.
- **Fixed exercise order** and one-at-a-time presentation with an end-of-lesson retry round.
- **Plain HTML now**; styling waits for the deferred app-wide design pass.
- **Placement and unlocking went into Phase 1**, since unlocking replaces the level logic Phase 1 already owned (the old "level complete, move up?" prompt).
- **Levels unlock globally.** One unlocked range covers all tracks, so finishing Generic A1 opens A2 in Goethe and TELC too. Locks are hard.
- **Level exams are a later sub-project.** Finishing a level currently means completing its lessons; passing a four-part mock exam in that track's format gets added once Reading, Listening, Writing, and Speaking exist.
- **Placement test:** one track-neutral exam, ascending difficulty, no voice or flashcards yet, no feedback during the test, stops on "Beyond my knowledge" or the 5th mistake. Points are weighted by level, and thresholds are computed from the loaded exam (75% of every lower level's maximum), so an uploaded replacement scores correctly without code changes.
- **Placement only unlocks** — it never marks lessons complete — and it can be skipped (start at A1) and retaken, keeping only the best result.
- **Existing profiles are reset to A1** and prompted for the placement test, rather than keeping their self-selected level.
- **Placement exam is admin-replaceable** by uploading JSON or YAML, validated in full before replacing anything. Claude drafts the default exam as a plan task for the user's review.
- **Unlock prompt persists until acted on** (Switch or ×), so a student who deliberately stays on a lower level isn't nagged, and unlocks never go down.
- **Phase 1 is two plans:** level system and admin first (1A), teaching loop on top (1B).
- **No `memory_store` writes and no multi-user support** in this phase.
