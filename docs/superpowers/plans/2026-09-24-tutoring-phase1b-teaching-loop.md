# Tutoring Phase 1B — The Teaching Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the student learn: browse the curriculum tree for their active track+level, take lessons one exercise at a time with immediate grading and a retry round, earn sticky lesson completion (which unlocks the next level when a level is finished), review completed exercises through spaced repetition in a capped Daily Queue, and ask an AI tutor about any answered exercise in a persisted per-lesson chat.

**Architecture:** Pure, table-testable logic lives in `lib/tutoring/` (dates, SM-2, completion rule, queue selection, exercise views, answer helpers, chat prompt). DB-backed services in `lib/services/` compose it: `progressService` (tree, lesson view, level-finished check, Daily Queue), `attemptService` (grading, first-answer-per-day rule, completion, review seeding, unlock), `lessonChatService` (thread and AI context). Thin Next.js routes under `/api/tutoring/` expose the services; client components (`components/tutoring/`) call the routes and render translated text through next-intl. This plan builds on Plan 1A (branch `tutoring-phase1a`): the level system, `grading.ts`, the AI free-text grader, `HomeNotices`, and the translation setup.

**Tech Stack:** Next.js 14.2 App Router, React 18.3, TypeScript, better-sqlite3, next-intl 3.26 (locale from `profile.uiLanguage`, no locale routing), vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-24-tutoring-section-design.md` (Phase 1). Plan 1A is `docs/superpowers/plans/2026-09-24-tutoring-phase1a-levels-placement-admin.md`.

## Global Constraints

- Every client fetch checks `res.ok` and shows a visible error (`role="alert"`) instead of hanging on "Loading..." (spec: Phase 1 Error Handling).
- AI failures (no provider, network, rate limit, a response that isn't the expected shape) surface as a distinct, retryable error, and nothing the student typed is lost. A malformed free-text grading response is treated as a failed call.
- Free-text grading has no self-assessment fallback: with no working provider the answer isn't graded, the student sees a clear error with a link to Settings, the typed answer is kept, and they can retry.
- `messages/en.json` and `messages/de.json` keep identical keys and placeholders (`messages/catalogs.test.ts`). Interface text only is translated; learning content (explanations, examples, exercises) stays exactly as authored. German uses "du", as the existing catalog does.
- Days are the computer's local calendar date (`YYYY-MM-DD`); an exercise is due when `next_due_at <= today`.
- Styling is out of scope: new pages follow the app's plain-HTML conventions.
- No writes to Core's `memory_store`; everything is implicitly scoped to the one local profile.
- Tests: pure logic is table-driven; services use a real SQLite DB (`createDbClient(':memory:')`); routes use a temp-file DB via `GAIT_DATA_DIR`; AI-calling code is tested with a mocked `aiService`/injected fake, never a real API; client components with multi-step effects use `test/delayedResponse.ts` (a response delayed by a real timer).
- Test output must be pristine (no act() or next-intl warnings).
- Verify every task with `npx tsc --noEmit` AND `npm test`.
- Commit messages: the subject alone on the first line; any trailers after a blank line.

## Refinements the plan makes to the spec

These settle details the spec leaves open or that implementation showed need a small change. Each is recorded so a reviewer can check it against the spec.

1. **`lesson_attempts` columns.** Beside the spec's columns, the table gets `source` (`'lesson'` or `'queue'`), needed to count queue answers against the daily cap while practice re-dos don't count, and `answered_on` (the local calendar date), needed for the first-answer-per-day rule. The spec's `free_text_answer` becomes `answer_text` and stores the student's answer for every type (the chosen option's text, the typed text, or the flashcard rating), because "Ask AI" sends "the student's answer" as context for multiple-choice and fill-blank exercises too.
2. **Two extra routes.** `GET /api/tutoring/lessons/[id]` returns the lesson for the student, with answers stripped before answering (as placement does), plus progress; the existing read-only curriculum API stays admin-facing. `POST /api/tutoring/lessons/[id]/complete` is the spec's "Mark as done" for a lesson without exercises.
3. **Which levels are checked after a completion.** The spec says the service checks "that lesson's track+level". A completion can also finish the same level in another track through a concept link (links always join the same level), so the check runs for that level in every track. The outcome is the same kind of unlock (the next level, globally), just not missed.
4. **An empty level never counts as finished**, so a track+level with no visible lessons can't unlock anything.
5. **Daily Queue.** An exercise already answered in the queue today leaves the queue for the rest of the day, even if the answer didn't move its schedule (it was not the first answer that day). The cap counts all queue answers today.
6. **"A working provider"** for the chat and the UI is an active connection with a selected model whose status is not `invalid`. `failing` still allows a try, since it means a validated connection hit a runtime error.
7. **SM-2 constants.** Ease changes by +0.10 (correct), −0.15 (almost), −0.20 (wrong), rounded to two decimals, floor 1.3. Intervals are whole days: 1, then 6, then `round(previous × ease)`. Entering review: first-ever attempt `correct` → repetitions 1, interval 3, due in 3 days; anything else → repetitions 0, interval 1, due tomorrow.
8. **Practice runs.** Re-opening a completed lesson runs every exercise again; a practice run in progress isn't stored, so leaving restarts it.
9. **Chat history.** A call sends at most the last 20 messages including the new one, dropping leading assistant messages so the first message is always the learner's (some providers require that).
10. **Where the first-answer-per-day rule is tested.** The spec lists it among the pure `lib/tutoring` tests. The rule is one database question ("has this exercise been answered today?"), so it lives in `attemptService` and is tested there against a real database (Task 7, "moves the schedule only on the first answer of the day"). The pure part, the SM-2 step it gates, has its own table tests in Task 2.
11. **"Almost" grows the interval less.** `computeNextReview` applies the lowered ease before computing the interval, so an `almost` answer grows the interval less than a `correct` one, as the spec's Grades section says.

## File Structure

**Pure logic (`lib/tutoring/`)**
- `dates.ts` — `localDate`, `addDays`.
- `srs.ts` — `SrsState`, `computeNextReview`, `seedReview`.
- `completion.ts` — `isPassing`, `meetsCompletionRule`, `lessonStatus`.
- `queue.ts` — `selectDueItems`, `remainingReviews`, `suggestNextLesson`.
- `exerciseView.ts` — `ExerciseView`, `toExerciseView` (what the student sees before answering).
- `lessonAnswers.ts` — `LessonAnswer`, `parseLessonAnswer`, `AttemptOutcome`, `correctAnswerFor`, `answerTextFor`, `taskTextFor`.
- `progressTypes.ts` — the tree, lesson-view, and queue response types.
- `lessonChat.ts` — `ChatMessageView`, `buildLessonChatSystemPrompt`, `recentHistory`.
- `levels.ts` (modify) — gains `TRACKS` and `isTrack`, replacing five local copies.

**Services (`lib/services/`)**
- `progressService.ts` — tree, lesson view, done state, level-finished check, Daily Queue.
- `attemptService.ts` — records and grades attempts, completion, review seeding and scheduling, "Mark as done".
- `lessonChatService.ts` — the lesson thread and AI context.
- `unlockService.ts` (modify) — `checkLevelFinishedAfterCompletion`.
- `aiService.ts` (modify) — `isAiAvailable`.
- `profileService.ts` (modify) — `dailyReviewCap`, `ProfileUpdateError`.
- `curriculumService.ts` (modify) — exercises in the order they were added.
- `placementService.ts` (modify) — `unlockOffer` on the outcome.

**Routes (`app/api/tutoring/`)**: `tree`, `queue`, `attempts`, `lessons/[id]`, `lessons/[id]/complete`, `lessons/[id]/chat`.

**Pages and components**
- `app/page.tsx` (modify), `app/lesson/[id]/page.tsx`, `app/queue/page.tsx`.
- `components/tutoring/ExerciseCard.tsx`, `LessonChat.tsx`, `LessonPage.tsx`, `CurriculumTree.tsx`, `QueuePage.tsx`.
- `components/home/HomeScreen.tsx` (new), `HomeNotices.tsx` and `HomeIntro.tsx` (modify).
- `components/settings/SettingsPage.tsx`, `components/onboarding/OnboardingWizard.tsx`, `components/placement/PlacementTest.tsx` (modify).

**Test helpers**: `test/tutoringFixtures.ts`.

## Task Order

1. Progress tables and the daily review limit
2. Local dates and spaced repetition
3. Completion rule and queue selection
4. One list of tracks
5. Exercise views, test fixtures, and the progress service
6. The Daily Queue in the progress service
7. Recording attempts, completion, and unlocking
8. Tutoring API routes
9. The lesson chat service and route
10. The exercise card
11. The lesson chat panel
12. The lesson page
13. The curriculum tree on the home page
14. The Daily Queue page
15. The daily review limit in Settings
16. Visible errors for the remaining Settings and onboarding requests
17. Placement follow-ups

---

### Task 1: Progress tables and the daily review limit

**Files:**
- Modify: `lib/db/schema.ts`, `lib/types.ts`, `lib/services/profileService.ts`, `app/api/profile/route.ts`
- Create: `lib/db/tutoringSchema.test.ts`
- Test: `lib/services/profileService.test.ts`, `app/api/profile/route.test.ts`

**Interfaces:**
- Produces: tables `lesson_attempts`, `lesson_completions`, `exercise_srs_state`, `lesson_chat_messages`; `profile.daily_review_cap`; `Profile.dailyReviewCap: number`; `ProfileUpdate.dailyReviewCap?: number`; `class ProfileUpdateError extends Error` (and `LockedLevelError extends ProfileUpdateError`); `isValidDailyReviewCap(value: unknown): value is number`; `DAILY_REVIEW_CAP_MIN = 1`, `DAILY_REVIEW_CAP_MAX = 500`. `PATCH /api/profile` answers any `ProfileUpdateError` with `400 { error }`.

- [ ] **Step 1: Write the schema tests**

Create `lib/db/tutoringSchema.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the profile tests**

In `lib/services/profileService.test.ts`, change the import line to:

```ts
import { createProfileService, LockedLevelError, ProfileUpdateError } from './profileService';
```

and append inside the `describe('profileService', ...)` block:

```ts
  it('stores a daily review limit and rejects values outside 1–500', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(service.getProfile().dailyReviewCap).toBe(50);
    expect(service.updateProfile({ dailyReviewCap: 120 }).dailyReviewCap).toBe(120);
    for (const bad of [0, 501, 2.5]) {
      expect(() => service.updateProfile({ dailyReviewCap: bad })).toThrow(ProfileUpdateError);
    }
    expect(service.getProfile().dailyReviewCap).toBe(120);
  });

  it('treats a locked level as a profile update error', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(() => service.updateProfile({ activeLevel: 'B2' })).toThrow(ProfileUpdateError);
  });
```

In `app/api/profile/route.test.ts`, append inside the `describe('/api/profile', ...)` block:

```ts
  it('PATCH returns 400 for an invalid daily review limit', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ dailyReviewCap: 0 }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The daily review limit must be a whole number from 1 to 500' });
  });

  it('PATCH saves a valid daily review limit', async () => {
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ dailyReviewCap: 25 }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).dailyReviewCap).toBe(25);
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/db/tutoringSchema.test.ts lib/services/profileService.test.ts app/api/profile/route.test.ts`
Expected: FAIL — `no such table: lesson_attempts`, `ProfileUpdateError` is not exported, and `dailyReviewCap` is undefined.

- [ ] **Step 4: Add the tables and the migration**

In `lib/db/schema.ts`:

(a) In the `CREATE TABLE IF NOT EXISTS profile` statement, add this line directly after `onboarding_choices_saved INTEGER NOT NULL DEFAULT 0,`:

```sql
      daily_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (daily_review_cap BETWEEN 1 AND 500),
```

(b) Add this function directly after `migrateProfileLevelColumns`:

```ts
/**
 * Adds the Daily Queue's per-day review limit to a profile created before the teaching loop.
 * Fresh databases already have the column.
 */
function migrateDailyReviewCap(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'daily_review_cap')) return;
  db.exec('ALTER TABLE profile ADD COLUMN daily_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (daily_review_cap BETWEEN 1 AND 500)');
}
```

(c) In `runMigrations`, call it right after `migrateProfileLevelColumns(db);`:

```ts
    migrateDailyReviewCap(db);
```

(d) In `createTablesIfMissing`, add these tables at the end of the SQL string, directly after the `placement_best_result` table:

```sql
    CREATE TABLE IF NOT EXISTS lesson_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('lesson','queue')),
      result TEXT NOT NULL CHECK (result IN ('correct','almost','wrong')),
      answer_text TEXT,
      ai_feedback TEXT,
      answered_at TEXT NOT NULL,
      answered_on TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_attempts_exercise ON lesson_attempts(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_attempts_lesson ON lesson_attempts(lesson_id);

    CREATE TABLE IF NOT EXISTS lesson_completions (
      lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_srs_state (
      exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
      repetitions INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      next_due_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_chat_lesson ON lesson_chat_messages(lesson_id);
```

- [ ] **Step 5: Add the field to the profile**

In `lib/types.ts`, add `dailyReviewCap: number;` to `Profile`, directly after `onboardingChoicesSaved: boolean;`.

Replace `lib/services/profileService.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { Profile, Track, CefrLevel, PlacementStatus } from '../types';
import { isAtOrBelow, isCefrLevel } from '../tutoring/levels';

interface Row {
  display_name: string;
  ui_language: 'en' | 'de';
  active_track: Track;
  active_level: CefrLevel;
  freestyle_default: number;
  onboarding_complete: number;
  highest_unlocked_level: CefrLevel;
  placement_status: PlacementStatus;
  unlock_notice_level: CefrLevel | null;
  onboarding_choices_saved: number;
  daily_review_cap: number;
  updated_at: string;
}

function rowToProfile(row: Row): Profile {
  return {
    displayName: row.display_name,
    uiLanguage: row.ui_language,
    activeTrack: row.active_track,
    activeLevel: row.active_level,
    freestyleDefault: row.freestyle_default === 1,
    onboardingComplete: row.onboarding_complete === 1,
    highestUnlockedLevel: row.highest_unlocked_level,
    placementStatus: row.placement_status,
    unlockNoticeLevel: row.unlock_notice_level,
    onboardingChoicesSaved: row.onboarding_choices_saved === 1,
    dailyReviewCap: row.daily_review_cap,
    updatedAt: row.updated_at,
  };
}

// A client update the profile can't accept; the profile route answers it with 400.
export class ProfileUpdateError extends Error {}
export class LockedLevelError extends ProfileUpdateError {}

export const DAILY_REVIEW_CAP_MIN = 1;
export const DAILY_REVIEW_CAP_MAX = 500;

export function isValidDailyReviewCap(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DAILY_REVIEW_CAP_MIN &&
    value <= DAILY_REVIEW_CAP_MAX
  );
}

export interface ProfileUpdate {
  displayName?: string;
  uiLanguage?: 'en' | 'de';
  activeTrack?: Track;
  activeLevel?: CefrLevel;
  freestyleDefault?: boolean;
  onboardingComplete?: boolean;
  onboardingChoicesSaved?: boolean;
  dailyReviewCap?: number;
}

export interface LevelStateUpdate {
  activeLevel?: CefrLevel;
  highestUnlockedLevel?: CefrLevel;
  placementStatus?: PlacementStatus;
  unlockNoticeLevel?: CefrLevel | null;
}

export function createProfileService(db: Database.Database) {
  function ensureRow(): void {
    db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  }

  function getProfile(): Profile {
    ensureRow();
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Row;
    return rowToProfile(row);
  }

  function updateProfile(input: ProfileUpdate): Profile {
    ensureRow();
    const current = getProfile();
    if (
      input.activeLevel !== undefined &&
      (!isCefrLevel(input.activeLevel) || !isAtOrBelow(input.activeLevel, current.highestUnlockedLevel))
    ) {
      throw new LockedLevelError(`Level ${input.activeLevel} is locked`);
    }
    if (input.dailyReviewCap !== undefined && !isValidDailyReviewCap(input.dailyReviewCap)) {
      throw new ProfileUpdateError('The daily review limit must be a whole number from 1 to 500');
    }
    db.prepare(
      `UPDATE profile SET display_name = ?, ui_language = ?, active_track = ?, active_level = ?, freestyle_default = ?,
         onboarding_complete = ?, onboarding_choices_saved = ?, daily_review_cap = ?, updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      input.displayName ?? current.displayName,
      input.uiLanguage ?? current.uiLanguage,
      input.activeTrack ?? current.activeTrack,
      input.activeLevel ?? current.activeLevel,
      (input.freestyleDefault ?? current.freestyleDefault) ? 1 : 0,
      (input.onboardingComplete ?? current.onboardingComplete) ? 1 : 0,
      (input.onboardingChoicesSaved ?? current.onboardingChoicesSaved) ? 1 : 0,
      input.dailyReviewCap ?? current.dailyReviewCap
    );
    return getProfile();
  }

  // Level state changes only through the unlock and placement services, never a client PATCH.
  function writeLevelState(update: LevelStateUpdate): Profile {
    ensureRow();
    const current = getProfile();
    db.prepare(
      `UPDATE profile SET active_level = ?, highest_unlocked_level = ?, placement_status = ?, unlock_notice_level = ?,
         updated_at = datetime('now') WHERE id = 1`
    ).run(
      update.activeLevel ?? current.activeLevel,
      update.highestUnlockedLevel ?? current.highestUnlockedLevel,
      update.placementStatus ?? current.placementStatus,
      'unlockNoticeLevel' in update ? (update.unlockNoticeLevel ?? null) : current.unlockNoticeLevel
    );
    return getProfile();
  }

  return { getProfile, updateProfile, writeLevelState };
}

export type ProfileService = ReturnType<typeof createProfileService>;
```

In `app/api/profile/route.ts`, change the import to `import { createProfileService, ProfileUpdateError } from '@/lib/services/profileService';` and change the catch line to:

```ts
    if (err instanceof ProfileUpdateError) return NextResponse.json({ error: err.message }, { status: 400 });
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/db lib/services/profileService.test.ts app/api/profile/route.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`. Both must pass. If `tsc` reports an object typed `Profile` that is missing `dailyReviewCap`, add `dailyReviewCap: 50` to that object.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/tutoringSchema.test.ts lib/types.ts lib/services/profileService.ts lib/services/profileService.test.ts app/api/profile/route.ts app/api/profile/route.test.ts
git commit -m "feat: add lesson progress tables and the daily review limit"
```

---

### Task 2: Local dates and spaced repetition

**Files:**
- Create: `lib/tutoring/dates.ts`, `lib/tutoring/dates.test.ts`, `lib/tutoring/srs.ts`, `lib/tutoring/srs.test.ts`

**Interfaces:**
- Consumes: `GradeResult` from `lib/tutoring/grading.ts` (Plan 1A).
- Produces: `localDate(now?: Date): string`; `addDays(date: string, days: number): string`; `interface SrsState { repetitions: number; easeFactor: number; intervalDays: number; nextDueAt: string }`; `INITIAL_EASE = 2.5`; `MIN_EASE = 1.3`; `computeNextReview(state: SrsState, result: GradeResult, today: string): SrsState`; `seedReview(firstAttempt: GradeResult, today: string): SrsState`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDays, localDate } from './dates';

describe('localDate', () => {
  it('uses the local calendar day, even late in the evening', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 8, 24, 0, 5))).toBe('2026-09-24');
  });
});

describe('addDays', () => {
  it.each([
    ['2026-09-24', 0, '2026-09-24'],
    ['2026-09-24', 1, '2026-09-25'],
    ['2026-02-27', 3, '2026-03-02'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-10-01', 17, '2026-10-18'],
  ])('%s + %i days = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
```

Create `lib/tutoring/srs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeNextReview, seedReview, type SrsState } from './srs';

const fresh: SrsState = { repetitions: 0, easeFactor: 2.5, intervalDays: 0, nextDueAt: '2026-09-24' };

describe('computeNextReview', () => {
  it('grows the interval 1 → 6 → interval × ease on correct answers, nudging ease up', () => {
    const first = computeNextReview(fresh, 'correct', '2026-09-24');
    expect(first).toEqual({ repetitions: 1, easeFactor: 2.6, intervalDays: 1, nextDueAt: '2026-09-25' });
    const second = computeNextReview(first, 'correct', '2026-09-25');
    expect(second).toEqual({ repetitions: 2, easeFactor: 2.7, intervalDays: 6, nextDueAt: '2026-10-01' });
    const third = computeNextReview(second, 'correct', '2026-10-01');
    expect(third).toEqual({ repetitions: 3, easeFactor: 2.8, intervalDays: 17, nextDueAt: '2026-10-18' });
  });

  it('grows the interval on almost, but lowers ease', () => {
    const state: SrsState = { repetitions: 2, easeFactor: 2.5, intervalDays: 6, nextDueAt: '2026-10-01' };
    expect(computeNextReview(state, 'almost', '2026-10-01')).toEqual({
      repetitions: 3,
      easeFactor: 2.35,
      intervalDays: 14,
      nextDueAt: '2026-10-15',
    });
  });

  it('starts over on wrong: due tomorrow, ease lower', () => {
    const state: SrsState = { repetitions: 5, easeFactor: 2.5, intervalDays: 30, nextDueAt: '2026-10-01' };
    expect(computeNextReview(state, 'wrong', '2026-10-01')).toEqual({
      repetitions: 0,
      easeFactor: 2.3,
      intervalDays: 1,
      nextDueAt: '2026-10-02',
    });
  });

  it('never lets ease fall below 1.3', () => {
    const low: SrsState = { repetitions: 3, easeFactor: 1.35, intervalDays: 10, nextDueAt: '2026-10-01' };
    expect(computeNextReview(low, 'wrong', '2026-10-01').easeFactor).toBe(1.3);
    expect(computeNextReview({ ...low, easeFactor: 1.3 }, 'almost', '2026-10-01').easeFactor).toBe(1.3);
  });
});

describe('seedReview', () => {
  it('schedules an exercise answered correctly on the first try in 3 days', () => {
    expect(seedReview('correct', '2026-09-24')).toEqual({
      repetitions: 1,
      easeFactor: 2.5,
      intervalDays: 3,
      nextDueAt: '2026-09-27',
    });
  });

  it.each(['almost', 'wrong'] as const)('schedules anything else (%s) for tomorrow', (result) => {
    expect(seedReview(result, '2026-09-24')).toEqual({
      repetitions: 0,
      easeFactor: 2.5,
      intervalDays: 1,
      nextDueAt: '2026-09-25',
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/dates.test.ts lib/tutoring/srs.test.ts`
Expected: FAIL — cannot resolve `./dates` and `./srs`.

- [ ] **Step 3: Implement**

Create `lib/tutoring/dates.ts`:

```ts
// Days in the teaching loop are the computer's local calendar date (spec: Spaced Repetition).
export function localDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calendar arithmetic on a YYYY-MM-DD date, done in UTC so daylight-saving changes can't shift it.
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
```

Create `lib/tutoring/srs.ts`:

```ts
import type { GradeResult } from './grading';
import { addDays } from './dates';

export interface SrsState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextDueAt: string; // local calendar date, YYYY-MM-DD
}

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;

const EASE_CHANGE: Record<GradeResult, number> = { correct: 0.1, almost: -0.15, wrong: -0.2 };

function roundEase(value: number): number {
  return Math.round(value * 100) / 100;
}

// Simplified SM-2 (spec: Spaced Repetition). Written against a plain state object, not a
// table, so Phase 3's vocabulary deck can reuse it unchanged.
export function computeNextReview(state: SrsState, result: GradeResult, today: string): SrsState {
  const easeFactor = Math.max(MIN_EASE, roundEase(state.easeFactor + EASE_CHANGE[result]));
  if (result === 'wrong') {
    return { repetitions: 0, easeFactor, intervalDays: 1, nextDueAt: addDays(today, 1) };
  }
  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(state.intervalDays * easeFactor));
  return { repetitions, easeFactor, intervalDays, nextDueAt: addDays(today, intervalDays) };
}

// Entering review when a lesson completes, from the exercise's first-ever attempt:
// correct on the first try → in 3 days; anything else → tomorrow.
export function seedReview(firstAttempt: GradeResult, today: string): SrsState {
  return firstAttempt === 'correct'
    ? { repetitions: 1, easeFactor: INITIAL_EASE, intervalDays: 3, nextDueAt: addDays(today, 3) }
    : { repetitions: 0, easeFactor: INITIAL_EASE, intervalDays: 1, nextDueAt: addDays(today, 1) };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/dates.test.ts lib/tutoring/srs.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/dates.ts lib/tutoring/dates.test.ts lib/tutoring/srs.ts lib/tutoring/srs.test.ts
git commit -m "feat: add local dates and simplified SM-2 scheduling"
```

---

### Task 3: Completion rule and queue selection

**Files:**
- Create: `lib/tutoring/completion.ts`, `lib/tutoring/completion.test.ts`, `lib/tutoring/queue.ts`, `lib/tutoring/queue.test.ts`

**Interfaces:**
- Consumes: `GradeResult` (Plan 1A).
- Produces: `isPassing(result: GradeResult): boolean`; `meetsCompletionRule(exerciseIds: string[], passedExerciseIds: ReadonlySet<string>): boolean`; `type LessonStatus = 'not_started' | 'in_progress' | 'complete' | 'covered'`; `lessonStatus(input: { completed: boolean; covered: boolean; attempted: boolean }): LessonStatus`; `interface DueCandidate { exerciseId: string; nextDueAt: string }`; `selectDueItems<T extends DueCandidate>(candidates: T[], today: string, remaining: number): T[]`; `remainingReviews(cap: number, answeredInQueueToday: number): number`; `interface SuggestionCandidate { id: string; done: boolean; prerequisiteIds: string[] }`; `suggestNextLesson(lessonsInTreeOrder: SuggestionCandidate[], doneIds: ReadonlySet<string>): string | null`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/completion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isPassing, lessonStatus, meetsCompletionRule } from './completion';

describe('isPassing', () => {
  it('counts correct and almost as passed', () => {
    expect([isPassing('correct'), isPassing('almost'), isPassing('wrong')]).toEqual([true, true, false]);
  });
});

describe('meetsCompletionRule', () => {
  it.each([
    [['a', 'b'], ['a', 'b'], true],
    [['a', 'b'], ['a'], false],
    [['a'], ['a', 'removed-exercise'], true],
    [[], [], false],
  ])('exercises %j with passed %j → %s', (exerciseIds, passed, expected) => {
    expect(meetsCompletionRule(exerciseIds, new Set(passed))).toBe(expected);
  });
});

describe('lessonStatus', () => {
  it.each([
    [{ completed: true, covered: false, attempted: true }, 'complete'],
    [{ completed: false, covered: true, attempted: true }, 'covered'],
    [{ completed: false, covered: false, attempted: true }, 'in_progress'],
    [{ completed: false, covered: false, attempted: false }, 'not_started'],
  ] as const)('%j → %s', (input, expected) => {
    expect(lessonStatus(input)).toBe(expected);
  });
});
```

Create `lib/tutoring/queue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { remainingReviews, selectDueItems, suggestNextLesson } from './queue';

describe('selectDueItems', () => {
  const candidates = [
    { exerciseId: 'later', nextDueAt: '2026-09-30' },
    { exerciseId: 'today-1', nextDueAt: '2026-09-24' },
    { exerciseId: 'overdue', nextDueAt: '2026-09-20' },
    { exerciseId: 'today-2', nextDueAt: '2026-09-24' },
  ];

  it('returns only due items, most overdue first, keeping the given order for ties', () => {
    expect(selectDueItems(candidates, '2026-09-24', 10).map((c) => c.exerciseId)).toEqual([
      'overdue',
      'today-1',
      'today-2',
    ]);
  });

  it('stops at the number of reviews left today', () => {
    expect(selectDueItems(candidates, '2026-09-24', 2).map((c) => c.exerciseId)).toEqual(['overdue', 'today-1']);
    expect(selectDueItems(candidates, '2026-09-24', 0)).toEqual([]);
  });
});

describe('remainingReviews', () => {
  it.each([
    [50, 0, 50],
    [50, 49, 1],
    [50, 50, 0],
    [10, 12, 0],
  ])('cap %i with %i answered → %i left', (cap, answered, expected) => {
    expect(remainingReviews(cap, answered)).toBe(expected);
  });
});

describe('suggestNextLesson', () => {
  it('picks the first incomplete lesson whose prerequisites are all done', () => {
    const lessons = [
      { id: 'done', done: true, prerequisiteIds: [] },
      { id: 'blocked', done: false, prerequisiteIds: ['elsewhere'] },
      { id: 'ready', done: false, prerequisiteIds: ['done'] },
    ];
    expect(suggestNextLesson(lessons, new Set(['done']))).toBe('ready');
  });

  it('falls back to the first incomplete lesson when none is ready', () => {
    const lessons = [
      { id: 'blocked-1', done: false, prerequisiteIds: ['x'] },
      { id: 'blocked-2', done: false, prerequisiteIds: ['y'] },
    ];
    expect(suggestNextLesson(lessons, new Set())).toBe('blocked-1');
  });

  it('suggests nothing when every lesson is done', () => {
    expect(suggestNextLesson([{ id: 'a', done: true, prerequisiteIds: [] }], new Set(['a']))).toBeNull();
    expect(suggestNextLesson([], new Set())).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/completion.test.ts lib/tutoring/queue.test.ts`
Expected: FAIL — cannot resolve `./completion` and `./queue`.

- [ ] **Step 3: Implement**

Create `lib/tutoring/completion.ts`:

```ts
import type { GradeResult } from './grading';

export type LessonStatus = 'not_started' | 'in_progress' | 'complete' | 'covered';

// `almost` counts as passed for completion (spec: Grades).
export function isPassing(result: GradeResult): boolean {
  return result !== 'wrong';
}

// A lesson completes the first time every exercise has a passing attempt. A lesson with no
// exercises completes only through "Mark as done", never through this rule.
export function meetsCompletionRule(exerciseIds: string[], passedExerciseIds: ReadonlySet<string>): boolean {
  return exerciseIds.length > 0 && exerciseIds.every((id) => passedExerciseIds.has(id));
}

// Own completion wins over shared completion ("covered via another track"), which wins over
// having started.
export function lessonStatus(input: { completed: boolean; covered: boolean; attempted: boolean }): LessonStatus {
  if (input.completed) return 'complete';
  if (input.covered) return 'covered';
  return input.attempted ? 'in_progress' : 'not_started';
}
```

Create `lib/tutoring/queue.ts`:

```ts
export interface DueCandidate {
  exerciseId: string;
  nextDueAt: string;
}

// Most overdue first; Array.prototype.sort is stable, so ties keep the caller's order.
export function selectDueItems<T extends DueCandidate>(candidates: T[], today: string, remaining: number): T[] {
  if (remaining <= 0) return [];
  return candidates
    .filter((c) => c.nextDueAt <= today)
    .sort((a, b) => (a.nextDueAt < b.nextDueAt ? -1 : a.nextDueAt > b.nextDueAt ? 1 : 0))
    .slice(0, remaining);
}

export function remainingReviews(cap: number, answeredInQueueToday: number): number {
  return Math.max(0, cap - answeredInQueueToday);
}

export interface SuggestionCandidate {
  id: string;
  done: boolean;
  prerequisiteIds: string[];
}

// Spec: the first incomplete lesson in tree order whose prerequisites are all done, or the
// first incomplete lesson if none qualify.
export function suggestNextLesson(
  lessonsInTreeOrder: SuggestionCandidate[],
  doneIds: ReadonlySet<string>
): string | null {
  const incomplete = lessonsInTreeOrder.filter((lesson) => !lesson.done);
  const ready = incomplete.find((lesson) => lesson.prerequisiteIds.every((id) => doneIds.has(id)));
  return (ready ?? incomplete[0])?.id ?? null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/completion.test.ts lib/tutoring/queue.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/completion.ts lib/tutoring/completion.test.ts lib/tutoring/queue.ts lib/tutoring/queue.test.ts
git commit -m "feat: add the lesson completion rule and Daily Queue selection"
```

---

### Task 4: One list of tracks

The track list is copied into five files. The services in this plan need it too, so it moves next to `LEVELS`.

**Files:**
- Modify: `lib/tutoring/levels.ts`, `lib/tutoring/levels.test.ts`, `lib/services/curriculumExportService.ts`, `app/api/admin/curriculum/export/[track]/[level]/route.ts`, `app/api/curriculum/tracks/[track]/[level]/route.ts`, `components/admin/ConceptLinkSection.tsx`, `components/admin/LessonEditorForm.tsx`, `components/settings/SettingsPage.tsx`, `components/onboarding/OnboardingWizard.tsx`

**Interfaces:**
- Produces: `TRACKS: readonly Track[]` and `isTrack(value: unknown): value is Track`, both exported from `lib/tutoring/levels.ts`. `curriculumExportService.ts` no longer exports `TRACKS`.

- [ ] **Step 1: Write the test**

Append to `lib/tutoring/levels.test.ts` (add `TRACKS, isTrack` to its existing import from `./levels`):

```ts
describe('tracks', () => {
  it('lists the three tracks in their display order', () => {
    expect(TRACKS).toEqual(['generic', 'telc', 'goethe']);
  });

  it('recognises a track name', () => {
    expect([isTrack('goethe'), isTrack('Goethe'), isTrack('b1'), isTrack(undefined)]).toEqual([true, false, false, false]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run lib/tutoring/levels.test.ts`
Expected: FAIL — `TRACKS` and `isTrack` are not exported.

- [ ] **Step 3: Add the list to `levels.ts`**

In `lib/tutoring/levels.ts`, change the first line to `import type { CefrLevel, Track } from '../types';` and add at the end of the file:

```ts
export const TRACKS: readonly Track[] = ['generic', 'telc', 'goethe'];

export function isTrack(value: unknown): value is Track {
  return typeof value === 'string' && (TRACKS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Replace the copies**

1. `lib/services/curriculumExportService.ts`: delete the line `export const TRACKS: readonly Track[] = ['generic', 'telc', 'goethe'];`, and change `import { LEVELS } from '../tutoring/levels';` to `import { LEVELS, TRACKS } from '../tutoring/levels';`. If `Track` is then unused in that file's `import type` line, remove it from that line.
2. `app/api/admin/curriculum/export/[track]/[level]/route.ts`: remove `TRACKS` from the import of `@/lib/services/curriculumExportService`, and import it from `@/lib/tutoring/levels` alongside `isCefrLevel` (merge it into the existing import from that module).
3. Replace `app/api/curriculum/tracks/[track]/[level]/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import { isCefrLevel, isTrack } from '@/lib/tutoring/levels';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  // This is a public, unauthenticated GET route whose read path (getTrackStructure ->
  // ensureUnsortedExists) has a side-effecting INSERT on every call. Validating track/level
  // here, before that's reached, keeps a bad value from throwing inside the handler (a 500)
  // for what should just be "not found" input — see the finding this addresses for why the
  // side effect itself is out of scope for this fix.
  if (!isTrack(params.track) || !isCefrLevel(params.level)) {
    return NextResponse.json({ error: `Invalid track or level: ${params.track}/${params.level}` }, { status: 400 });
  }
  const service = createCurriculumService(getDb());
  return NextResponse.json(service.getTrackStructure(params.track, params.level));
}
```

4. `components/admin/ConceptLinkSection.tsx`: delete the line `const ALL_TRACKS: Track[] = ['generic', 'telc', 'goethe'];`, add `import { TRACKS } from '@/lib/tutoring/levels';`, and replace `ALL_TRACKS.filter(` with `TRACKS.filter(`.
5. `components/admin/LessonEditorForm.tsx`: delete the lines `const TRACKS: Track[] = ['generic', 'telc', 'goethe'];` and `const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];`, and add `import { LEVELS, TRACKS } from '@/lib/tutoring/levels';`. Remove `Track` and `CefrLevel` from its type import only if `tsc` reports them unused.
6. `components/settings/SettingsPage.tsx`: delete the line `const TRACKS: Track[] = ['generic', 'telc', 'goethe'];` and change `import { levelsUpTo } from '@/lib/tutoring/levels';` to `import { levelsUpTo, TRACKS } from '@/lib/tutoring/levels';`.
7. `components/onboarding/OnboardingWizard.tsx`: delete the line `const TRACKS = ['generic', 'telc', 'goethe'] as const;`; add `import type { Track } from '@/lib/types';` and `import { TRACKS } from '@/lib/tutoring/levels';`; change `useState<(typeof TRACKS)[number]>('generic')` to `useState<Track>('generic')`; and change `setTrack(e.target.value as typeof track)` to `setTrack(e.target.value as Track)`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `grep -rn "'generic', 'telc', 'goethe'" app components lib --include=*.ts --include=*.tsx | grep -v test`
Expected: exactly one line, in `lib/tutoring/levels.ts`.

Run: `npx tsc --noEmit && npm test`
Expected: PASS, with the same test count as before plus the two new tests.

- [ ] **Step 6: Commit**

```bash
git add lib/tutoring/levels.ts lib/tutoring/levels.test.ts lib/services/curriculumExportService.ts "app/api/admin/curriculum/export/[track]/[level]/route.ts" "app/api/curriculum/tracks/[track]/[level]/route.ts" components/admin/ConceptLinkSection.tsx components/admin/LessonEditorForm.tsx components/settings/SettingsPage.tsx components/onboarding/OnboardingWizard.tsx
git commit -m "refactor: keep one list of tracks next to the CEFR levels"
```

---
### Task 5: Exercise views, test fixtures, and the progress service

**Files:**
- Create: `lib/tutoring/exerciseView.ts`, `lib/tutoring/exerciseView.test.ts`, `lib/tutoring/progressTypes.ts`, `lib/services/progressService.ts`, `lib/services/progressService.test.ts`, `test/tutoringFixtures.ts`
- Modify: `lib/services/curriculumService.ts`

**Interfaces:**
- Consumes: `lessonStatus` (Task 3); `TRACKS`, `LEVELS`, `levelIndex`, `isAtOrBelow` (`lib/tutoring/levels.ts`); `unsortedMilestoneId` (`lib/curriculum-admin/unsortedBucket.ts`); `createCurriculumService`, `createProfileService`.
- Produces:
  - `ExerciseView` (a union by `type`, never containing the answer) and `toExerciseView(exercise: Exercise): ExerciseView`.
  - In `progressTypes.ts`: `TreeLesson`, `TreeSection`, `TreeMilestone`, `CurriculumTree`, `LessonView`, `QueueItem`, `DailyQueue`.
  - `createProgressService(db)` with:
    - `getTree(): CurriculumTree`
    - `getLessonView(lessonId: string): LessonView | null`
    - `isLevelFinished(track: Track, level: CefrLevel): boolean`
    - `isCompleted(lessonId: string): boolean`
    - `passedExerciseIds(lessonId: string): string[]` (in exercise order)
  - `curriculumService.getExercises` now returns exercises in the order they were added (`ORDER BY rowid`).
  - Test helpers in `test/tutoringFixtures.ts`: `seedTutoringCurriculum(db)`, `addAttempt(db, exerciseId, result, options?)`, `markComplete(db, lessonId)`, `scheduleReview(db, exerciseId, nextDueAt)`.

- [ ] **Step 1: Write the fixtures**

Create `test/tutoringFixtures.ts`:

```ts
import type Database from 'better-sqlite3';
import type { GradeResult } from '@/lib/tutoring/grading';

/**
 * Generic A1 has two visible lessons (a1-greet, then a1-sein, which builds on a1-greet).
 * Goethe A1 has one lesson, concept-linked to a1-greet. Generic A2 has one lesson.
 * Exercises are inserted in authored order; their ids are deliberately not in that order
 * alphabetically for a1-sein (…__ex10 before …__ex2).
 */
export function seedTutoringCurriculum(db: Database.Database): void {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES
      ('g-a1-m1', 'generic', 'A1', 'Basics', 0),
      ('o-a1-m1', 'goethe', 'A1', 'Goethe basics', 0),
      ('g-a2-m1', 'generic', 'A2', 'Next steps', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES
      ('g-a1-s1', 'g-a1-m1', 'Greetings', 0),
      ('o-a1-s1', 'o-a1-m1', 'Hallo', 0),
      ('g-a2-s1', 'g-a2-m1', 'The past', 0);
    INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES
      ('a1-greet', 'generic', 'A1', 'vocabulary', 'Saying hello', 'Say Hallo to greet someone.', '["Hallo!","Guten Tag!"]'),
      ('a1-sein', 'generic', 'A1', 'grammar', 'The verb sein', 'ich bin, du bist', NULL),
      ('a1-goethe-greet', 'goethe', 'A1', 'vocabulary', 'Goethe greetings', NULL, NULL),
      ('a2-past', 'generic', 'A2', 'grammar', 'The past of sein', NULL, NULL);
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES
      ('a1-greet', 'g-a1-s1', 0),
      ('a1-sein', 'g-a1-s1', 1),
      ('a1-goethe-greet', 'o-a1-s1', 0),
      ('a2-past', 'g-a2-s1', 0);
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-greet__ex1', 'a1-greet', 'multiple_choice', '{"question":"How do you greet someone?","options":["Hallo","Tschüss"],"correctIndex":0}'),
      ('a1-greet__ex2', 'a1-greet', 'flashcard', '{"front":"der Hund","back":"the dog"}'),
      ('a1-sein__ex2', 'a1-sein', 'fill_blank', '{"textWithBlank":"Ich ___ müde.","correctAnswer":"bin"}'),
      ('a1-sein__ex10', 'a1-sein', 'free_text', '{"prompt":"Say that you are tired.","modelAnswer":"Ich bin müde."}'),
      ('a1-goethe-greet__ex1', 'a1-goethe-greet', 'multiple_choice', '{"question":"Hi?","options":["Hallo","Nein"],"correctIndex":0}'),
      ('a2-past__ex1', 'a2-past', 'fill_blank', '{"textWithBlank":"Ich ___ müde.","correctAnswer":"war"}');
    INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-sein', 'a1-greet');
    INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES ('a1-goethe-greet', 'a1-greet');
  `);
}

export function addAttempt(
  db: Database.Database,
  exerciseId: string,
  result: GradeResult,
  options: { source?: 'lesson' | 'queue'; on?: string } = {}
): void {
  const { lesson_id: lessonId } = db.prepare('SELECT lesson_id FROM exercises WHERE id = ?').get(exerciseId) as {
    lesson_id: string;
  };
  const on = options.on ?? '2026-09-24';
  db.prepare(
    `INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, answered_at, answered_on)
     VALUES (?, ?, ?, ?, 'x', ?, ?)`
  ).run(exerciseId, lessonId, options.source ?? 'lesson', result, `${on}T10:00:00.000Z`, on);
}

export function markComplete(db: Database.Database, lessonId: string): void {
  db.prepare("INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, '2026-09-24T10:00:00.000Z')").run(
    lessonId
  );
}

export function scheduleReview(db: Database.Database, exerciseId: string, nextDueAt: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
     VALUES (?, 1, 2.5, 3, ?, '2026-09-24T10:00:00.000Z')`
  ).run(exerciseId, nextDueAt);
}
```

- [ ] **Step 2: Write the tests**

Create `lib/tutoring/exerciseView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toExerciseView } from './exerciseView';

describe('toExerciseView', () => {
  it('never includes the answer', () => {
    expect(
      toExerciseView({
        id: 'mc',
        lessonId: 'l',
        track: null,
        type: 'multiple_choice',
        content: { question: 'Q?', options: ['a', 'b'], correctIndex: 1 },
      })
    ).toEqual({ id: 'mc', type: 'multiple_choice', question: 'Q?', options: ['a', 'b'] });
    expect(
      toExerciseView({
        id: 'fb',
        lessonId: 'l',
        track: null,
        type: 'fill_blank',
        content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', acceptableVariants: ['bin!'] },
      })
    ).toEqual({ id: 'fb', type: 'fill_blank', textWithBlank: 'Ich ___.' });
    expect(
      toExerciseView({
        id: 'ft',
        lessonId: 'l',
        track: null,
        type: 'free_text',
        content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' },
      })
    ).toEqual({ id: 'ft', type: 'free_text', prompt: 'Write.' });
  });

  it('keeps a flashcard back, since the student reveals it and grades themselves', () => {
    expect(
      toExerciseView({ id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } })
    ).toEqual({ id: 'fc', type: 'flashcard', front: 'der Hund', back: 'the dog' });
  });
});
```

Create `lib/services/progressService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { addAttempt, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  return { db, progress: createProgressService(db), profiles: createProfileService(db) };
}

function lessonsOf(tree: ReturnType<ReturnType<typeof createProgressService>['getTree']>) {
  return tree.milestones.flatMap((m) => m.sections.flatMap((s) => s.lessons));
}

describe('progressService.getTree', () => {
  it('lists the active track+level in tree order and hides the Unsorted bucket', () => {
    const { db, progress } = setup();
    const { sectionId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-hidden', '${sectionId}', 0);
    `);

    const tree = progress.getTree();
    expect(tree).toMatchObject({ track: 'generic', level: 'A1' });
    expect(tree.milestones.map((m) => m.title)).toEqual(['Basics']);
    expect(tree.milestones[0].sections.map((s) => s.title)).toEqual(['Greetings']);
    expect(lessonsOf(tree).map((l) => l.id)).toEqual(['a1-greet', 'a1-sein']);
  });

  it('shows not started, in progress, and complete', () => {
    const { db, progress } = setup();
    expect(lessonsOf(progress.getTree()).map((l) => l.status)).toEqual(['not_started', 'not_started']);
    addAttempt(db, 'a1-sein__ex2', 'wrong');
    markComplete(db, 'a1-greet');
    expect(lessonsOf(progress.getTree()).map((l) => l.status)).toEqual(['complete', 'in_progress']);
  });

  it('shows a lesson completed through a concept link as covered via that track', () => {
    const { db, progress, profiles } = setup();
    markComplete(db, 'a1-greet');
    profiles.updateProfile({ activeTrack: 'goethe' });
    expect(lessonsOf(progress.getTree())).toEqual([
      expect.objectContaining({ id: 'a1-goethe-greet', status: 'covered', coveredVia: 'generic' }),
    ]);
  });

  it('warns about unfinished prerequisites, counting shared completion as done', () => {
    const { db, progress } = setup();
    const sein = () => lessonsOf(progress.getTree()).find((l) => l.id === 'a1-sein');
    expect(sein()?.missingPrerequisites).toEqual([{ id: 'a1-greet', title: 'Saying hello' }]);
    markComplete(db, 'a1-goethe-greet');
    expect(sein()?.missingPrerequisites).toEqual([]);
  });
});

describe('progressService.isLevelFinished', () => {
  it('needs every visible lesson done, own or shared, and ignores Unsorted', () => {
    const { db, progress } = setup();
    const { sectionId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-hidden', 'generic', 'A1', 'grammar', 'Hidden');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-hidden', '${sectionId}', 0);
    `);
    expect(progress.isLevelFinished('generic', 'A1')).toBe(false);
    markComplete(db, 'a1-goethe-greet');
    expect(progress.isLevelFinished('generic', 'A1')).toBe(false);
    markComplete(db, 'a1-sein');
    expect(progress.isLevelFinished('generic', 'A1')).toBe(true);
  });

  it('never counts a level without visible lessons as finished', () => {
    const { progress } = setup();
    expect(progress.isLevelFinished('telc', 'A1')).toBe(false);
  });
});

describe('progressService.getLessonView', () => {
  it('returns null for an unknown lesson', () => {
    expect(setup().progress.getLessonView('nope')).toBeNull();
  });

  it('shows a lesson above the unlocked range as locked', () => {
    expect(setup().progress.getLessonView('a2-past')).toEqual({
      locked: true,
      id: 'a2-past',
      title: 'The past of sein',
      level: 'A2',
      unlocksAfter: 'A1',
    });
  });

  it('returns content, exercises in authored order without answers, progress, and prerequisites', () => {
    const { db, progress } = setup();
    addAttempt(db, 'a1-sein__ex10', 'wrong');
    addAttempt(db, 'a1-sein__ex10', 'almost');
    const view = progress.getLessonView('a1-sein');
    expect(view).toEqual({
      locked: false,
      id: 'a1-sein',
      title: 'The verb sein',
      track: 'generic',
      level: 'A1',
      skill: 'grammar',
      explanation: 'ich bin, du bist',
      examples: null,
      exercises: [
        { id: 'a1-sein__ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' },
        { id: 'a1-sein__ex10', type: 'free_text', prompt: 'Say that you are tired.' },
      ],
      passedExerciseIds: ['a1-sein__ex10'],
      completed: false,
      prerequisites: [{ id: 'a1-greet', title: 'Saying hello', done: false }],
    });
  });

  it('reports a completed lesson', () => {
    const { db, progress } = setup();
    markComplete(db, 'a1-greet');
    expect(progress.getLessonView('a1-greet')).toMatchObject({ locked: false, completed: true });
    expect(progress.isCompleted('a1-greet')).toBe(true);
    expect(progress.isCompleted('a1-sein')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/exerciseView.test.ts lib/services/progressService.test.ts`
Expected: FAIL — cannot resolve `./exerciseView` and `./progressService`.

- [ ] **Step 4: Keep exercises in the order they were added**

In `lib/services/curriculumService.ts`, change the query in `getExercises` to:

```ts
    const rows = db.prepare('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY rowid').all(lessonId) as ExerciseRow[];
```

and add this comment on the line above it:

```ts
    // The order exercises were added: authored order for seeded lessons, admin additions at the
    // end. Not by id, since text ids put `__ex10` before `__ex2`.
```

- [ ] **Step 5: Implement the views and types**

Create `lib/tutoring/exerciseView.ts`:

```ts
import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';

// What the student sees of an exercise before answering: never the answer. A flashcard keeps
// its back, since the student reveals it and grades themselves.
export type ExerciseView =
  | { id: string; type: 'multiple_choice'; question: string; options: string[] }
  | { id: string; type: 'fill_blank'; textWithBlank: string }
  | { id: string; type: 'flashcard'; front: string; back: string }
  | { id: string; type: 'free_text'; prompt: string };

export function toExerciseView(exercise: Exercise): ExerciseView {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return { id: exercise.id, type: 'multiple_choice', question: content.question, options: content.options };
    }
    case 'fill_blank': {
      const content = exercise.content as FillBlankContent;
      return { id: exercise.id, type: 'fill_blank', textWithBlank: content.textWithBlank };
    }
    case 'flashcard': {
      const content = exercise.content as FlashcardContent;
      return { id: exercise.id, type: 'flashcard', front: content.front, back: content.back };
    }
    case 'free_text': {
      const content = exercise.content as FreeTextContent;
      return { id: exercise.id, type: 'free_text', prompt: content.prompt };
    }
  }
}
```

Create `lib/tutoring/progressTypes.ts`:

```ts
import type { CefrLevel, Track } from '../types';
import type { Skill } from '../curriculum/types';
import type { LessonStatus } from './completion';
import type { ExerciseView } from './exerciseView';

export interface TreeLesson {
  id: string;
  title: string;
  skill: Skill;
  status: LessonStatus;
  coveredVia: Track | null;
  missingPrerequisites: { id: string; title: string }[];
}

export interface TreeSection {
  id: string;
  title: string;
  lessons: TreeLesson[];
}

export interface TreeMilestone {
  id: string;
  title: string;
  sections: TreeSection[];
}

export interface CurriculumTree {
  track: Track;
  level: CefrLevel;
  milestones: TreeMilestone[];
}

export type LessonView =
  | { locked: true; id: string; title: string; level: CefrLevel; unlocksAfter: CefrLevel }
  | {
      locked: false;
      id: string;
      title: string;
      track: Track;
      level: CefrLevel;
      skill: Skill;
      explanation: string | null;
      examples: string[] | null;
      exercises: ExerciseView[];
      passedExerciseIds: string[];
      completed: boolean;
      prerequisites: { id: string; title: string; done: boolean }[];
    };

export interface QueueItem {
  lessonId: string;
  lessonTitle: string;
  exercise: ExerciseView;
}

export interface DailyQueue {
  track: Track;
  level: CefrLevel;
  cap: number;
  answeredToday: number;
  items: QueueItem[];
  suggestedLesson: { id: string; title: string } | null;
}
```

- [ ] **Step 6: Implement the progress service**

Create `lib/services/progressService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { Skill } from '../curriculum/types';
import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { lessonStatus } from '../tutoring/completion';
import { toExerciseView } from '../tutoring/exerciseView';
import { isAtOrBelow, LEVELS, levelIndex } from '../tutoring/levels';
import type { CurriculumTree, LessonView, TreeLesson } from '../tutoring/progressTypes';
import { createCurriculumService } from './curriculumService';
import { createProfileService } from './profileService';

interface VisibleLessonRow {
  id: string;
  title: string;
  skill: Skill;
  section_id: string;
}

interface DoneState {
  completed: Set<string>;
  coveredVia: Map<string, Track>;
}

export function createProgressService(db: Database.Database) {
  const profiles = createProfileService(db);
  const curriculum = createCurriculumService(db);

  // Own completion is a stored row. Shared completion is display-only: a concept-linked lesson
  // (always in another track) with its own completion (spec: Completion).
  function loadDoneState(): DoneState {
    const completed = new Set(
      (db.prepare('SELECT lesson_id FROM lesson_completions').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
    );
    const links = db
      .prepare(
        `SELECT c.lesson_a_id AS a, c.lesson_b_id AS b, la.track AS a_track, lb.track AS b_track
         FROM lesson_concept_links c
         JOIN lessons la ON la.id = c.lesson_a_id
         JOIN lessons lb ON lb.id = c.lesson_b_id
         ORDER BY c.id`
      )
      .all() as { a: string; b: string; a_track: Track; b_track: Track }[];
    const coveredVia = new Map<string, Track>();
    for (const link of links) {
      if (completed.has(link.a) && !completed.has(link.b) && !coveredVia.has(link.b)) coveredVia.set(link.b, link.a_track);
      if (completed.has(link.b) && !completed.has(link.a) && !coveredVia.has(link.a)) coveredVia.set(link.a, link.b_track);
    }
    return { completed, coveredVia };
  }

  function isDone(state: DoneState, lessonId: string): boolean {
    return state.completed.has(lessonId) || state.coveredVia.has(lessonId);
  }

  // The student-visible lessons of a track+level, in tree order. The Unsorted bucket is admin-only.
  function visibleLessons(track: Track, level: CefrLevel): VisibleLessonRow[] {
    return db
      .prepare(
        `SELECT l.id, l.title, l.skill, s.id AS section_id
         FROM milestones m
         JOIN sections s ON s.milestone_id = m.id
         JOIN lesson_placements p ON p.section_id = s.id
         JOIN lessons l ON l.id = p.lesson_id
         WHERE m.track = ? AND m.level = ? AND m.id != ?
         ORDER BY m.order_index, m.id, s.order_index, s.id, p.order_index, l.id`
      )
      .all(track, level, unsortedMilestoneId(track, level)) as VisibleLessonRow[];
  }

  function prerequisitesByLesson(): Map<string, { id: string; title: string }[]> {
    const rows = db
      .prepare(
        `SELECT lp.lesson_id, l.id, l.title
         FROM lesson_prerequisites lp
         JOIN lessons l ON l.id = lp.prerequisite_lesson_id
         ORDER BY lp.lesson_id, l.title`
      )
      .all() as { lesson_id: string; id: string; title: string }[];
    const map = new Map<string, { id: string; title: string }[]>();
    for (const row of rows) {
      const list = map.get(row.lesson_id) ?? [];
      list.push({ id: row.id, title: row.title });
      map.set(row.lesson_id, list);
    }
    return map;
  }

  function getTree(): CurriculumTree {
    const { activeTrack: track, activeLevel: level } = profiles.getProfile();
    const done = loadDoneState();
    const prerequisites = prerequisitesByLesson();
    const attempted = new Set(
      (db.prepare('SELECT DISTINCT lesson_id FROM lesson_attempts').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
    );

    const lessonsBySection = new Map<string, TreeLesson[]>();
    for (const row of visibleLessons(track, level)) {
      const list = lessonsBySection.get(row.section_id) ?? [];
      list.push({
        id: row.id,
        title: row.title,
        skill: row.skill,
        status: lessonStatus({
          completed: done.completed.has(row.id),
          covered: done.coveredVia.has(row.id),
          attempted: attempted.has(row.id),
        }),
        coveredVia: done.coveredVia.get(row.id) ?? null,
        missingPrerequisites: (prerequisites.get(row.id) ?? []).filter((p) => !isDone(done, p.id)),
      });
      lessonsBySection.set(row.section_id, list);
    }

    const milestones = db
      .prepare('SELECT id, title FROM milestones WHERE track = ? AND level = ? AND id != ? ORDER BY order_index, id')
      .all(track, level, unsortedMilestoneId(track, level)) as { id: string; title: string }[];
    const sectionsOf = db.prepare('SELECT id, title FROM sections WHERE milestone_id = ? ORDER BY order_index, id');
    return {
      track,
      level,
      milestones: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        sections: (sectionsOf.all(m.id) as { id: string; title: string }[]).map((s) => ({
          id: s.id,
          title: s.title,
          lessons: lessonsBySection.get(s.id) ?? [],
        })),
      })),
    };
  }

  // Spec: Level Unlocking. A level with no visible lessons never counts as finished.
  function isLevelFinished(track: Track, level: CefrLevel): boolean {
    const lessons = visibleLessons(track, level);
    if (lessons.length === 0) return false;
    const done = loadDoneState();
    return lessons.every((lesson) => isDone(done, lesson.id));
  }

  function isCompleted(lessonId: string): boolean {
    return !!db.prepare('SELECT 1 FROM lesson_completions WHERE lesson_id = ?').get(lessonId);
  }

  // Exercises of the lesson with at least one correct or almost attempt, in exercise order.
  function passedExerciseIds(lessonId: string): string[] {
    const rows = db
      .prepare(
        `SELECT e.id FROM exercises e
         WHERE e.lesson_id = ?
           AND EXISTS (SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.result IN ('correct', 'almost'))
         ORDER BY e.rowid`
      )
      .all(lessonId) as { id: string }[];
    return rows.map((r) => r.id);
  }

  function getLessonView(lessonId: string): LessonView | null {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) return null;
    if (!isAtOrBelow(lesson.sourceLevel, profiles.getProfile().highestUnlockedLevel)) {
      return {
        locked: true,
        id: lesson.id,
        title: lesson.title,
        level: lesson.sourceLevel,
        unlocksAfter: LEVELS[levelIndex(lesson.sourceLevel) - 1],
      };
    }
    const done = loadDoneState();
    return {
      locked: false,
      id: lesson.id,
      title: lesson.title,
      track: lesson.track,
      level: lesson.sourceLevel,
      skill: lesson.skill,
      explanation: lesson.explanation,
      examples: lesson.examples,
      exercises: curriculum.getExercises(lesson.id, lesson.track).map(toExerciseView),
      passedExerciseIds: passedExerciseIds(lesson.id),
      completed: done.completed.has(lesson.id),
      prerequisites: (prerequisitesByLesson().get(lesson.id) ?? []).map((p) => ({ ...p, done: isDone(done, p.id) })),
    };
  }

  return { getTree, getLessonView, isLevelFinished, isCompleted, passedExerciseIds };
}

export type ProgressService = ReturnType<typeof createProgressService>;
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/exerciseView.test.ts lib/services/progressService.test.ts lib/services/curriculumService.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 8: Commit**

```bash
git add lib/tutoring/exerciseView.ts lib/tutoring/exerciseView.test.ts lib/tutoring/progressTypes.ts lib/services/progressService.ts lib/services/progressService.test.ts lib/services/curriculumService.ts test/tutoringFixtures.ts
git commit -m "feat: add the student curriculum tree, lesson view, and level-finished check"
```

---

### Task 6: The Daily Queue in the progress service

**Files:**
- Modify: `lib/services/progressService.ts`, `lib/services/progressService.test.ts`

**Interfaces:**
- Consumes: `selectDueItems`, `remainingReviews`, `suggestNextLesson` (Task 3); `DailyQueue`, `QueueItem` (Task 5).
- Produces: `progressService.getDailyQueue(today: string): DailyQueue`.

- [ ] **Step 1: Write the tests**

In `lib/services/progressService.test.ts`, change the fixtures import to `import { addAttempt, markComplete, scheduleReview, seedTutoringCurriculum } from '@/test/tutoringFixtures';` and append:

```ts
describe('progressService.getDailyQueue', () => {
  const today = '2026-09-24';

  it('lists due exercises of the active track+level, most overdue first, including Unsorted', () => {
    const { db, progress } = setup();
    const { sectionId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`UPDATE lesson_placements SET section_id = '${sectionId}' WHERE lesson_id = 'a1-sein'`);
    scheduleReview(db, 'a1-greet__ex1', '2026-09-24');
    scheduleReview(db, 'a1-sein__ex2', '2026-09-20');
    scheduleReview(db, 'a1-greet__ex2', '2026-09-25');
    scheduleReview(db, 'a1-goethe-greet__ex1', '2026-09-01');

    const queue = progress.getDailyQueue(today);
    expect(queue).toMatchObject({ track: 'generic', level: 'A1', cap: 50, answeredToday: 0 });
    expect(queue.items).toEqual([
      {
        lessonId: 'a1-sein',
        lessonTitle: 'The verb sein',
        exercise: { id: 'a1-sein__ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' },
      },
      {
        lessonId: 'a1-greet',
        lessonTitle: 'Saying hello',
        exercise: { id: 'a1-greet__ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'] },
      },
    ]);
  });

  it('counts queue answers today against the cap and drops what was already answered', () => {
    const { db, progress, profiles } = setup();
    profiles.updateProfile({ dailyReviewCap: 2 });
    scheduleReview(db, 'a1-greet__ex1', '2026-09-20');
    scheduleReview(db, 'a1-greet__ex2', '2026-09-21');
    scheduleReview(db, 'a1-sein__ex2', '2026-09-22');
    addAttempt(db, 'a1-greet__ex1', 'correct', { source: 'queue', on: today });
    addAttempt(db, 'a1-sein__ex2', 'correct', { source: 'lesson', on: today });

    const queue = progress.getDailyQueue(today);
    expect(queue.answeredToday).toBe(1);
    expect(queue.items.map((i) => i.exercise.id)).toEqual(['a1-greet__ex2']);
  });

  it('suggests the first incomplete lesson whose prerequisites are done', () => {
    const { db, progress } = setup();
    expect(progress.getDailyQueue(today).suggestedLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
    markComplete(db, 'a1-greet');
    expect(progress.getDailyQueue(today).suggestedLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
    markComplete(db, 'a1-sein');
    expect(progress.getDailyQueue(today).suggestedLesson).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/progressService.test.ts`
Expected: FAIL — `progress.getDailyQueue is not a function`.

- [ ] **Step 3: Implement**

In `lib/services/progressService.ts`:

(a) Add these imports:

```ts
import type { ExerciseType } from '../curriculum/types';
import { remainingReviews, selectDueItems, suggestNextLesson } from '../tutoring/queue';
import type { DailyQueue } from '../tutoring/progressTypes';
```

(merge `DailyQueue` into the existing `import type { CurriculumTree, LessonView, TreeLesson } from '../tutoring/progressTypes';` line, and `ExerciseType` into the existing `import type { Skill } from '../curriculum/types';` line).

(b) Add this interface below `DoneState`:

```ts
interface DueRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: ExerciseType;
  content: string;
  lesson_title: string;
  next_due_at: string;
}
```

(c) Add this function inside `createProgressService`, before the `return`:

```ts
  // Spec: Pages and Navigation, `/queue`. Reviews follow what was learned, not where it's
  // filed, so lessons an admin moved into Unsorted still count.
  function getDailyQueue(today: string): DailyQueue {
    const { activeTrack: track, activeLevel: level, dailyReviewCap: cap } = profiles.getProfile();
    const answeredToday = (
      db.prepare(`SELECT COUNT(*) AS n FROM lesson_attempts WHERE source = 'queue' AND answered_on = ?`).get(today) as {
        n: number;
      }
    ).n;
    const rows = db
      .prepare(
        `SELECT e.id, e.lesson_id, e.track, e.type, e.content, l.title AS lesson_title, st.next_due_at
         FROM exercise_srs_state st
         JOIN exercises e ON e.id = st.exercise_id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN lesson_placements p ON p.lesson_id = l.id
         JOIN sections s ON s.id = p.section_id
         JOIN milestones m ON m.id = s.milestone_id
         WHERE m.track = ? AND m.level = ? AND st.next_due_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.source = 'queue' AND a.answered_on = ?
           )
         ORDER BY st.next_due_at, m.order_index, s.order_index, p.order_index, e.rowid`
      )
      .all(track, level, today, today) as DueRow[];
    const due = selectDueItems(
      rows.map((row) => ({ ...row, exerciseId: row.id, nextDueAt: row.next_due_at })),
      today,
      remainingReviews(cap, answeredToday)
    );

    const done = loadDoneState();
    const prerequisites = prerequisitesByLesson();
    const lessons = visibleLessons(track, level);
    const suggestedId = suggestNextLesson(
      lessons.map((lesson) => ({
        id: lesson.id,
        done: isDone(done, lesson.id),
        prerequisiteIds: (prerequisites.get(lesson.id) ?? []).map((p) => p.id),
      })),
      new Set([...done.completed, ...done.coveredVia.keys()])
    );
    const suggested = lessons.find((lesson) => lesson.id === suggestedId);

    return {
      track,
      level,
      cap,
      answeredToday,
      items: due.map((row) => ({
        lessonId: row.lesson_id,
        lessonTitle: row.lesson_title,
        exercise: toExerciseView({
          id: row.id,
          lessonId: row.lesson_id,
          track: row.track,
          type: row.type,
          content: JSON.parse(row.content),
        }),
      })),
      suggestedLesson: suggested ? { id: suggested.id, title: suggested.title } : null,
    };
  }
```

(d) Add `getDailyQueue` to the returned object.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/progressService.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/progressService.ts lib/services/progressService.test.ts
git commit -m "feat: build the Daily Queue from due reviews under the daily cap"
```

---

### Task 7: Recording attempts, completion, and unlocking

**Files:**
- Create: `lib/tutoring/lessonAnswers.ts`, `lib/tutoring/lessonAnswers.test.ts`, `lib/services/attemptService.ts`, `lib/services/attemptService.test.ts`
- Modify: `lib/services/unlockService.ts`, `lib/services/unlockService.test.ts`

**Interfaces:**
- Consumes:
  - From Tasks 2, 3 and 5: `localDate`, `computeNextReview`, `seedReview`, `meetsCompletionRule`, `createProgressService`.
  - From Plan 1A: `gradeMultipleChoice`, `gradeFillBlank`, `gradeFreeText`, `FreeTextGradingInput`, `unlockService.raiseUnlockedLevel`.
- Produces:
  - In `lessonAnswers.ts`:
    - Types:
      - `type FlashcardRating = 'knew' | 'sort_of' | 'didnt_know'`
      - `type AttemptSource = 'lesson' | 'queue'`
      - `LessonAnswer`, a union by `type`: `{ selectedIndex }`, `{ text }`, `{ rating }`, `{ text }`
      - `interface AttemptOutcome { result; correctAnswer: string | null; feedback: string | null; passedExerciseIds: string[]; lessonCompleted: boolean; justCompleted: boolean }`
    - Values and functions:
      - `FLASHCARD_GRADES`
      - `parseLessonAnswer(raw: unknown): LessonAnswer | null`
      - `isAttemptSource(value: unknown): value is AttemptSource`
      - `correctAnswerFor(exercise: Exercise): string | null`
      - `answerTextFor(exercise: Exercise, answer: LessonAnswer): string`
      - `taskTextFor(exercise: Exercise): string`
  - In `attemptService.ts`:
    - `class AttemptError` with `kind: 'not_found' | 'locked' | 'bad_request' | 'grading_failed'`
    - `toAttemptErrorResponse(err)`, which maps the kinds to 404, 403, 400 and 502
    - `createAttemptService(db, deps?: { gradeFreeText?; now?: () => Date })`, providing:
      - `recordAttempt(exerciseId, answer, source): Promise<AttemptOutcome>`
      - `markLessonDone(lessonId): { completed: true }`
  - `unlockService.checkLevelFinishedAfterCompletion(level: CefrLevel): Profile`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/lessonAnswers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { answerTextFor, correctAnswerFor, isAttemptSource, parseLessonAnswer, taskTextFor } from './lessonAnswers';

const mc: Exercise = { id: 'mc', lessonId: 'l', track: null, type: 'multiple_choice', content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } };
const fill: Exercise = { id: 'fb', lessonId: 'l', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin' } };
const card: Exercise = { id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
const free: Exercise = { id: 'ft', lessonId: 'l', track: null, type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };

describe('parseLessonAnswer', () => {
  it.each([
    [{ type: 'multiple_choice', selectedIndex: 1 }, { type: 'multiple_choice', selectedIndex: 1 }],
    [{ type: 'fill_blank', text: 'bin' }, { type: 'fill_blank', text: 'bin' }],
    [{ type: 'flashcard', rating: 'sort_of' }, { type: 'flashcard', rating: 'sort_of' }],
    [{ type: 'free_text', text: 'Ich schreibe.' }, { type: 'free_text', text: 'Ich schreibe.' }],
    [{ type: 'multiple_choice', selectedIndex: 1.5 }, null],
    [{ type: 'flashcard', rating: 'maybe' }, null],
    [{ type: 'fill_blank' }, null],
    ['bin', null],
    [null, null],
  ])('%j → %j', (raw, expected) => {
    expect(parseLessonAnswer(raw)).toEqual(expected);
  });
});

describe('isAttemptSource', () => {
  it('accepts lesson and queue only', () => {
    expect([isAttemptSource('lesson'), isAttemptSource('queue'), isAttemptSource('freestyle')]).toEqual([true, true, false]);
  });
});

describe('answer helpers', () => {
  it('names the correct answer, or the model answer for free text', () => {
    expect([correctAnswerFor(mc), correctAnswerFor(fill), correctAnswerFor(card), correctAnswerFor(free)]).toEqual([
      'Hallo',
      'bin',
      null,
      'Ich schreibe.',
    ]);
  });

  it('turns an answer into text for the log and the chat', () => {
    expect(answerTextFor(mc, { type: 'multiple_choice', selectedIndex: 1 })).toBe('Nein');
    expect(answerTextFor(fill, { type: 'fill_blank', text: 'bin' })).toBe('bin');
    expect(answerTextFor(card, { type: 'flashcard', rating: 'knew' })).toBe('knew');
    expect(answerTextFor(free, { type: 'free_text', text: 'Ich schreib.' })).toBe('Ich schreib.');
  });

  it('describes the task', () => {
    expect([taskTextFor(mc), taskTextFor(fill), taskTextFor(card), taskTextFor(free)]).toEqual([
      'Hi? (options: Hallo | Nein)',
      'Ich ___.',
      'der Hund',
      'Write.',
    ]);
  });
});
```

Create `lib/services/attemptService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { AttemptError, createAttemptService, toAttemptErrorResponse } from './attemptService';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup(options: { day?: number; grade?: ReturnType<typeof vi.fn> } = {}) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  let day = options.day ?? 24;
  const gradeFreeText = options.grade ?? vi.fn().mockResolvedValue({ ok: true, result: 'correct', feedback: 'Gut.' });
  const service = createAttemptService(db, { gradeFreeText, now: () => new Date(2026, 8, day, 10, 0) });
  return {
    db,
    service,
    gradeFreeText,
    profiles: createProfileService(db),
    setDay: (value: number) => {
      day = value;
    },
    srs: (exerciseId: string) =>
      db.prepare('SELECT repetitions, interval_days, next_due_at FROM exercise_srs_state WHERE exercise_id = ?').get(exerciseId),
    count: (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
  };
}

const right = { type: 'multiple_choice', selectedIndex: 0 } as const;
const wrong = { type: 'multiple_choice', selectedIndex: 1 } as const;
const knew = { type: 'flashcard', rating: 'knew' } as const;

describe('attemptService.recordAttempt', () => {
  it('grades a multiple-choice answer and names the correct option', async () => {
    const { service } = setup();
    expect(await service.recordAttempt('a1-greet__ex1', wrong, 'lesson')).toEqual({
      result: 'wrong',
      correctAnswer: 'Hallo',
      feedback: null,
      passedExerciseIds: [],
      lessonCompleted: false,
      justCompleted: false,
    });
  });

  it('completes the lesson once every exercise has passed, and seeds review from first attempts', async () => {
    const { service, srs, count } = setup();
    await service.recordAttempt('a1-greet__ex1', wrong, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(count('lesson_completions')).toBe(0);

    const outcome = await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(outcome).toMatchObject({ result: 'correct', lessonCompleted: true, justCompleted: true });
    expect(outcome.passedExerciseIds).toEqual(['a1-greet__ex1', 'a1-greet__ex2']);
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 0, interval_days: 1, next_due_at: '2026-09-25' });
    expect(srs('a1-greet__ex2')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
  });

  it('keeps a completion when an exercise is added later, and seeds that exercise from its first attempt', async () => {
    const { db, service, srs, count } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES ('a1-greet__ex3', 'a1-greet', 'fill_blank', '{"textWithBlank":"___","correctAnswer":"Hallo"}')`);

    const outcome = await service.recordAttempt('a1-greet__ex3', { type: 'fill_blank', text: 'Hallo' }, 'lesson');
    expect(outcome).toMatchObject({ lessonCompleted: true, justCompleted: false });
    expect(count('lesson_completions')).toBe(1);
    expect(srs('a1-greet__ex3')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });
  });

  it('moves the schedule only on the first answer of the day', async () => {
    const { service, srs, setDay, count } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 1, interval_days: 3, next_due_at: '2026-09-27' });

    setDay(27);
    await service.recordAttempt('a1-greet__ex1', right, 'queue');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 2, interval_days: 6, next_due_at: '2026-10-03' });

    await service.recordAttempt('a1-greet__ex1', wrong, 'lesson');
    expect(srs('a1-greet__ex1')).toEqual({ repetitions: 2, interval_days: 6, next_due_at: '2026-10-03' });
    expect(count('lesson_attempts')).toBe(4);
  });

  it('grades free text with the AI in the UI language and stores the answer and feedback', async () => {
    const { db, service, gradeFreeText, profiles } = setup({
      grade: vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Fast.' }),
    });
    profiles.updateProfile({ uiLanguage: 'de' });
    const outcome = await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(outcome).toMatchObject({ result: 'almost', feedback: 'Fast.', correctAnswer: 'Ich bin müde.' });
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Say that you are tired.',
      modelAnswer: 'Ich bin müde.',
      studentAnswer: 'Ich bin mude.',
      level: 'A1',
      uiLanguage: 'de',
    });
    expect(db.prepare('SELECT answer_text, ai_feedback, source FROM lesson_attempts').get()).toEqual({
      answer_text: 'Ich bin mude.',
      ai_feedback: 'Fast.',
      source: 'lesson',
    });
  });

  it('stores nothing when free-text grading fails', async () => {
    const { service, count } = setup({ grade: vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up' }) });
    await expect(
      service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson')
    ).rejects.toMatchObject({ kind: 'grading_failed', message: 'No AI provider is set up' });
    expect(count('lesson_attempts')).toBe(0);
  });

  it('rejects a locked lesson, an unknown exercise, and a mismatched or impossible answer', async () => {
    const { service } = setup();
    await expect(service.recordAttempt('a2-past__ex1', { type: 'fill_blank', text: 'war' }, 'lesson')).rejects.toMatchObject({
      kind: 'locked',
      message: 'Level A2 is locked',
    });
    await expect(service.recordAttempt('nope', right, 'lesson')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.recordAttempt('a1-greet__ex1', knew, 'lesson')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(
      service.recordAttempt('a1-greet__ex1', { type: 'multiple_choice', selectedIndex: 5 }, 'lesson')
    ).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('unlocks the next level when a completion finishes a level, including through a concept link', async () => {
    const { service, profiles } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    expect(profiles.getProfile().highestUnlockedLevel).toBe('A1');
    // Completing a1-greet also covers Goethe A1's only lesson, which finishes Goethe A1.
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2', activeLevel: 'A1' });
  });
});

describe('attemptService.markLessonDone', () => {
  it('completes a lesson without exercises, and refuses one with exercises', () => {
    const { db, service, count } = setup();
    db.exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-read', 'generic', 'A1', 'reading', 'Just read');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-read', 'g-a1-s1', 2);
    `);
    expect(service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(service.markLessonDone('a1-read')).toEqual({ completed: true });
    expect(count('lesson_completions')).toBe(1);
    expect(() => service.markLessonDone('a1-greet')).toThrow(AttemptError);
  });

  it('refuses a locked lesson', () => {
    const { service } = setup();
    expect(() => service.markLessonDone('a2-past')).toThrow('Level A2 is locked');
  });
});

describe('toAttemptErrorResponse', () => {
  it('maps error kinds to HTTP statuses', () => {
    expect(toAttemptErrorResponse(new AttemptError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toAttemptErrorResponse(new Error('x'))).toBeNull();
  });
});
```

Append to `lib/services/unlockService.test.ts` (inside its top-level `describe`, adding imports as needed: `seedTutoringCurriculum`, `markComplete` from `@/test/tutoringFixtures`, and `createDbClient`, `createUnlockService`, `createProfileService` if the file doesn't already import them):

```ts
  it('raises the unlock with a notice when a completion finished the level in any track', () => {
    const db = createDbClient(':memory:');
    seedTutoringCurriculum(db);
    const unlocks = createUnlockService(db);
    expect(unlocks.checkLevelFinishedAfterCompletion('A1').highestUnlockedLevel).toBe('A1');
    markComplete(db, 'a1-goethe-greet');
    expect(unlocks.checkLevelFinishedAfterCompletion('A1')).toMatchObject({
      highestUnlockedLevel: 'A2',
      unlockNoticeLevel: 'A2',
    });
  });

  it('does nothing after finishing C1, since there is no level above it', () => {
    const db = createDbClient(':memory:');
    const profiles = createProfileService(db);
    profiles.writeLevelState({ highestUnlockedLevel: 'C1' });
    expect(createUnlockService(db).checkLevelFinishedAfterCompletion('C1').highestUnlockedLevel).toBe('C1');
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/lessonAnswers.test.ts lib/services/attemptService.test.ts lib/services/unlockService.test.ts`
Expected: FAIL — cannot resolve `./lessonAnswers` and `./attemptService`, and `checkLevelFinishedAfterCompletion` is not a function.

- [ ] **Step 3: Implement the answer helpers**

Create `lib/tutoring/lessonAnswers.ts`:

```ts
import type {
  Exercise,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '../curriculum/types';
import type { GradeResult } from './grading';

export type FlashcardRating = 'knew' | 'sort_of' | 'didnt_know';
export type AttemptSource = 'lesson' | 'queue';

export type LessonAnswer =
  | { type: 'multiple_choice'; selectedIndex: number }
  | { type: 'fill_blank'; text: string }
  | { type: 'flashcard'; rating: FlashcardRating }
  | { type: 'free_text'; text: string };

// What the student gets back after answering an exercise.
export interface AttemptOutcome {
  result: GradeResult;
  correctAnswer: string | null;
  feedback: string | null;
  passedExerciseIds: string[];
  lessonCompleted: boolean;
  justCompleted: boolean;
}

const FLASHCARD_RATINGS: readonly FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

// Spec: Grades — "Knew it" / "Sort of" / "Didn't know it".
export const FLASHCARD_GRADES: Record<FlashcardRating, GradeResult> = {
  knew: 'correct',
  sort_of: 'almost',
  didnt_know: 'wrong',
};

export function parseLessonAnswer(raw: unknown): LessonAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'multiple_choice' && typeof a.selectedIndex === 'number' && Number.isInteger(a.selectedIndex)) {
    return { type: 'multiple_choice', selectedIndex: a.selectedIndex };
  }
  if (a.type === 'fill_blank' && typeof a.text === 'string') return { type: 'fill_blank', text: a.text };
  if (a.type === 'flashcard' && typeof a.rating === 'string' && (FLASHCARD_RATINGS as readonly string[]).includes(a.rating)) {
    return { type: 'flashcard', rating: a.rating as FlashcardRating };
  }
  if (a.type === 'free_text' && typeof a.text === 'string') return { type: 'free_text', text: a.text };
  return null;
}

export function isAttemptSource(value: unknown): value is AttemptSource {
  return value === 'lesson' || value === 'queue';
}

// Shown after answering: the right option or text, or the model answer for free text.
export function correctAnswerFor(exercise: Exercise): string | null {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return content.options[content.correctIndex] ?? null;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).correctAnswer;
    case 'free_text':
      return (exercise.content as FreeTextContent).modelAnswer;
    case 'flashcard':
      return null;
  }
}

// The student's answer as text, for the attempt log and the lesson chat's context.
export function answerTextFor(exercise: Exercise, answer: LessonAnswer): string {
  switch (answer.type) {
    case 'multiple_choice':
      return (exercise.content as MultipleChoiceContent).options[answer.selectedIndex] ?? '';
    case 'fill_blank':
    case 'free_text':
      return answer.text;
    case 'flashcard':
      return answer.rating;
  }
}

// The task as text, for the lesson chat's context.
export function taskTextFor(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      return `${content.question} (options: ${content.options.join(' | ')})`;
    }
    case 'fill_blank':
      return (exercise.content as FillBlankContent).textWithBlank;
    case 'flashcard':
      return (exercise.content as FlashcardContent).front;
    case 'free_text':
      return (exercise.content as FreeTextContent).prompt;
  }
}
```

- [ ] **Step 4: Add the level-finished check to the unlock service**

In `lib/services/unlockService.ts`:

(a) Change the levels import to `import { higherLevel, isAtOrBelow, nextLevel, TRACKS } from '../tutoring/levels';` and add `import { createProgressService } from './progressService';`.

(b) Add this function inside `createUnlockService`, after `raiseUnlockedLevel`:

```ts
  // Spec: Level Unlocking. Runs after every lesson completion. A completion can finish its level
  // in its own track, or in another track through a concept link (links always join the same
  // level), so every track is checked; either way the next level unlocks everywhere.
  function checkLevelFinishedAfterCompletion(level: CefrLevel): Profile {
    const next = nextLevel(level);
    const progress = createProgressService(db);
    if (next && TRACKS.some((track) => progress.isLevelFinished(track, level))) {
      return raiseUnlockedLevel(next, { notify: true });
    }
    return profiles.getProfile();
  }
```

(c) Add `checkLevelFinishedAfterCompletion` to the returned object.

- [ ] **Step 5: Implement the attempt service**

Create `lib/services/attemptService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel } from '../types';
import type { Exercise, FillBlankContent, FreeTextContent, MultipleChoiceContent } from '../curriculum/types';
import { meetsCompletionRule } from '../tutoring/completion';
import { localDate } from '../tutoring/dates';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { gradeFillBlank, gradeMultipleChoice, type GradeResult } from '../tutoring/grading';
import {
  answerTextFor,
  correctAnswerFor,
  FLASHCARD_GRADES,
  type AttemptOutcome,
  type AttemptSource,
  type LessonAnswer,
} from '../tutoring/lessonAnswers';
import { computeNextReview, seedReview, type SrsState } from '../tutoring/srs';
import { createCurriculumService } from './curriculumService';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { createUnlockService } from './unlockService';

export type AttemptErrorKind = 'not_found' | 'locked' | 'bad_request' | 'grading_failed';

export class AttemptError extends Error {
  constructor(
    message: string,
    readonly kind: AttemptErrorKind
  ) {
    super(message);
  }
}

const STATUS_FOR: Record<AttemptErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, grading_failed: 502 };

export function toAttemptErrorResponse(err: unknown): { status: number; body: { error: string } } | null {
  if (!(err instanceof AttemptError)) return null;
  return { status: STATUS_FOR[err.kind], body: { error: err.message } };
}

export interface AttemptDeps {
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Exercise['track'];
  type: Exercise['type'];
  content: string;
}

interface SrsRow {
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_due_at: string;
}

export function createAttemptService(db: Database.Database, deps: AttemptDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const unlocks = createUnlockService(db);

  function getExercise(exerciseId: string): Exercise {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId) as ExerciseRow | undefined;
    if (!row) throw new AttemptError(`Exercise not found: ${exerciseId}`, 'not_found');
    return { id: row.id, lessonId: row.lesson_id, track: row.track, type: row.type, content: JSON.parse(row.content) };
  }

  // Spec: Level Unlocking — the API rejects answers in a locked level.
  function getUnlockedLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new AttemptError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new AttemptError(`Level ${lesson.sourceLevel} is locked`, 'locked');
    }
    return lesson;
  }

  async function grade(
    exercise: Exercise,
    answer: LessonAnswer,
    level: CefrLevel
  ): Promise<{ result: GradeResult; feedback: string | null }> {
    if (answer.type !== exercise.type) {
      throw new AttemptError('The answer does not match the exercise type', 'bad_request');
    }
    switch (answer.type) {
      case 'multiple_choice': {
        const content = exercise.content as MultipleChoiceContent;
        if (answer.selectedIndex < 0 || answer.selectedIndex >= content.options.length) {
          throw new AttemptError('That option does not exist', 'bad_request');
        }
        return { result: gradeMultipleChoice(content, answer.selectedIndex), feedback: null };
      }
      case 'fill_blank':
        return { result: gradeFillBlank(exercise.content as FillBlankContent, answer.text), feedback: null };
      case 'flashcard':
        return { result: FLASHCARD_GRADES[answer.rating], feedback: null };
      case 'free_text': {
        if (!answer.text.trim()) throw new AttemptError('Write an answer first', 'bad_request');
        const content = exercise.content as FreeTextContent;
        const graded = await gradeFree({
          prompt: content.prompt,
          modelAnswer: content.modelAnswer,
          studentAnswer: answer.text,
          level,
          uiLanguage: profiles.getProfile().uiLanguage,
        });
        if (!graded.ok) throw new AttemptError(graded.error, 'grading_failed');
        return { result: graded.result, feedback: graded.feedback };
      }
    }
  }

  function getSrs(exerciseId: string): SrsState | null {
    const row = db
      .prepare('SELECT repetitions, ease_factor, interval_days, next_due_at FROM exercise_srs_state WHERE exercise_id = ?')
      .get(exerciseId) as SrsRow | undefined;
    if (!row) return null;
    return {
      repetitions: row.repetitions,
      easeFactor: row.ease_factor,
      intervalDays: row.interval_days,
      nextDueAt: row.next_due_at,
    };
  }

  function writeSrs(exerciseId: string, state: SrsState, at: string): void {
    db.prepare(
      `INSERT INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(exercise_id) DO UPDATE SET repetitions = excluded.repetitions, ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days, next_due_at = excluded.next_due_at, updated_at = excluded.updated_at`
    ).run(exerciseId, state.repetitions, state.easeFactor, state.intervalDays, state.nextDueAt, at);
  }

  // Spec: Spaced Repetition, "Entering review" — based on the exercise's first-ever attempt.
  function seedFromFirstAttempt(exerciseId: string, today: string, at: string): void {
    const first = db
      .prepare('SELECT result FROM lesson_attempts WHERE exercise_id = ? ORDER BY id LIMIT 1')
      .get(exerciseId) as { result: GradeResult } | undefined;
    if (first) writeSrs(exerciseId, seedReview(first.result, today), at);
  }

  // Stored once and never revoked. The lesson's exercises enter review at this moment, and the
  // level may now be finished.
  function completeLesson(lessonId: string, level: CefrLevel, exerciseIds: string[], today: string, at: string): void {
    db.prepare('INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, ?) ON CONFLICT(lesson_id) DO NOTHING').run(
      lessonId,
      at
    );
    for (const exerciseId of exerciseIds) seedFromFirstAttempt(exerciseId, today, at);
    unlocks.checkLevelFinishedAfterCompletion(level);
  }

  async function recordAttempt(exerciseId: string, answer: LessonAnswer, source: AttemptSource): Promise<AttemptOutcome> {
    const exercise = getExercise(exerciseId);
    const lesson = getUnlockedLesson(exercise.lessonId);
    const { result, feedback } = await grade(exercise, answer, lesson.sourceLevel);
    const answeredAt = now();
    const at = answeredAt.toISOString();
    const today = localDate(answeredAt);

    return db.transaction((): AttemptOutcome => {
      // Spec: only the first answer to an exercise on a given day moves its schedule.
      const firstToday = !db
        .prepare('SELECT 1 FROM lesson_attempts WHERE exercise_id = ? AND answered_on = ?')
        .get(exercise.id, today);
      db.prepare(
        `INSERT INTO lesson_attempts (exercise_id, lesson_id, source, result, answer_text, ai_feedback, answered_at, answered_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(exercise.id, lesson.id, source, result, answerTextFor(exercise, answer), feedback, at, today);

      const wasComplete = progress.isCompleted(lesson.id);
      let justCompleted = false;
      if (wasComplete) {
        const state = getSrs(exercise.id);
        if (!state) seedFromFirstAttempt(exercise.id, today, at); // added after the lesson was completed
        else if (firstToday) writeSrs(exercise.id, computeNextReview(state, result, today), at);
      } else {
        const exerciseIds = curriculum.getExercises(lesson.id, lesson.track).map((e) => e.id);
        if (meetsCompletionRule(exerciseIds, new Set(progress.passedExerciseIds(lesson.id)))) {
          completeLesson(lesson.id, lesson.sourceLevel, exerciseIds, today, at);
          justCompleted = true;
        }
      }

      return {
        result,
        correctAnswer: correctAnswerFor(exercise),
        feedback,
        passedExerciseIds: progress.passedExerciseIds(lesson.id),
        lessonCompleted: wasComplete || justCompleted,
        justCompleted,
      };
    })();
  }

  // Spec: Completion — a lesson with no exercises completes when the student taps "Mark as done".
  function markLessonDone(lessonId: string): { completed: true } {
    const lesson = getUnlockedLesson(lessonId);
    if (curriculum.getExercises(lesson.id, lesson.track).length > 0) {
      throw new AttemptError('This lesson has exercises; answer them to complete it', 'bad_request');
    }
    const doneAt = now();
    db.transaction(() => {
      if (!progress.isCompleted(lesson.id)) {
        completeLesson(lesson.id, lesson.sourceLevel, [], localDate(doneAt), doneAt.toISOString());
      }
    })();
    return { completed: true };
  }

  return { recordAttempt, markLessonDone };
}

export type AttemptService = ReturnType<typeof createAttemptService>;
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/lessonAnswers.test.ts lib/services/attemptService.test.ts lib/services/unlockService.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add lib/tutoring/lessonAnswers.ts lib/tutoring/lessonAnswers.test.ts lib/services/attemptService.ts lib/services/attemptService.test.ts lib/services/unlockService.ts lib/services/unlockService.test.ts
git commit -m "feat: record lesson attempts with completion, review scheduling, and unlocking"
```

---
### Task 8: Tutoring API routes

**Files:**
- Create: `app/api/tutoring/tree/route.ts`, `app/api/tutoring/queue/route.ts`, `app/api/tutoring/attempts/route.ts`, `app/api/tutoring/lessons/[id]/route.ts`, `app/api/tutoring/lessons/[id]/complete/route.ts`, `app/api/tutoring/routes.test.ts`

**Interfaces:**
- Consumes: `createProgressService` (Tasks 5–6), `createAttemptService`, `toAttemptErrorResponse`, `parseLessonAnswer`, `isAttemptSource` (Task 7), `localDate` (Task 2).
- Produces:
  - `GET /api/tutoring/tree` → `CurriculumTree`
  - `GET /api/tutoring/queue` → `DailyQueue` for today's local date
  - `GET /api/tutoring/lessons/[id]` → `LessonView`, or `404 { error }`
  - `POST /api/tutoring/lessons/[id]/complete` → `{ completed: true }`, or the attempt-error statuses
  - `POST /api/tutoring/attempts`
    - body: `{ exerciseId: string, answer: LessonAnswer, source: 'lesson' | 'queue' }`
    - success: `AttemptOutcome`
    - errors, each as `{ error }`: `400` (malformed body), `404`, `403`, `502`

- [ ] **Step 1: Write the route tests**

Create `app/api/tutoring/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { GET as getTree } from './tree/route';
import { GET as getQueue } from './queue/route';
import { POST as postAttempt } from './attempts/route';
import { GET as getLesson } from './lessons/[id]/route';
import { POST as completeLesson } from './lessons/[id]/complete/route';

function attempt(body: unknown) {
  return postAttempt(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

function params(id: string) {
  return { params: { id } };
}

describe('/api/tutoring', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-tutoring-'));
    seedTutoringCurriculum(getDb());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET tree returns the active track+level', async () => {
    const tree = await (await getTree()).json();
    expect(tree).toMatchObject({ track: 'generic', level: 'A1' });
    expect(tree.milestones[0].sections[0].lessons.map((l: { id: string }) => l.id)).toEqual(['a1-greet', 'a1-sein']);
  });

  it('GET lesson returns the lesson, a locked view, or 404', async () => {
    const request = new Request('http://localhost');
    expect(await (await getLesson(request, params('a1-greet'))).json()).toMatchObject({ locked: false, id: 'a1-greet' });
    expect(await (await getLesson(request, params('a2-past'))).json()).toMatchObject({ locked: true, unlocksAfter: 'A1' });
    const missing = await getLesson(request, params('nope'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Lesson not found' });
  });

  it('POST attempts grades an answer', async () => {
    const res = await attempt({
      exerciseId: 'a1-greet__ex1',
      answer: { type: 'multiple_choice', selectedIndex: 0 },
      source: 'lesson',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: 'correct', correctAnswer: 'Hallo', lessonCompleted: false });
  });

  it('POST attempts answers 400, 404, and 403 for bad requests', async () => {
    const mc = { type: 'multiple_choice', selectedIndex: 0 };
    expect((await attempt({ exerciseId: 'a1-greet__ex1', answer: { type: 'multiple_choice' }, source: 'lesson' })).status).toBe(400);
    expect((await attempt({ exerciseId: 'a1-greet__ex1', answer: mc, source: 'freestyle' })).status).toBe(400);
    expect((await attempt({ exerciseId: 'nope', answer: mc, source: 'lesson' })).status).toBe(404);
    const locked = await attempt({ exerciseId: 'a2-past__ex1', answer: { type: 'fill_blank', text: 'war' }, source: 'lesson' });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toEqual({ error: 'Level A2 is locked' });
  });

  it('POST complete refuses a lesson that has exercises', async () => {
    const res = await completeLesson(new Request('http://localhost', { method: 'POST' }), params('a1-greet'));
    expect(res.status).toBe(400);
  });

  it("GET queue returns today's queue with a suggested lesson", async () => {
    expect(await (await getQueue()).json()).toMatchObject({
      cap: 50,
      answeredToday: 0,
      items: [],
      suggestedLesson: { id: 'a1-greet', title: 'Saying hello' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/api/tutoring/routes.test.ts`
Expected: FAIL — the route modules don't exist.

- [ ] **Step 3: Implement the routes**

Create `app/api/tutoring/tree/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(createProgressService(getDb()).getTree());
}
```

Create `app/api/tutoring/queue/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';
import { localDate } from '@/lib/tutoring/dates';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(createProgressService(getDb()).getDailyQueue(localDate()));
}
```

Create `app/api/tutoring/lessons/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const view = createProgressService(getDb()).getLessonView(params.id);
  if (!view) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  return NextResponse.json(view);
}
```

Create `app/api/tutoring/lessons/[id]/complete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createAttemptService, toAttemptErrorResponse } from '@/lib/services/attemptService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(createAttemptService(getDb()).markLessonDone(params.id));
  } catch (err) {
    const mapped = toAttemptErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Create `app/api/tutoring/attempts/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createAttemptService, toAttemptErrorResponse } from '@/lib/services/attemptService';
import { isAttemptSource, parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const exerciseId = body?.exerciseId;
  const answer = parseLessonAnswer(body?.answer);
  const source = body?.source;
  if (typeof exerciseId !== 'string' || !answer || !isAttemptSource(source)) {
    return NextResponse.json(
      { error: 'exerciseId, a valid answer, and source ("lesson" or "queue") are required' },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await createAttemptService(getDb()).recordAttempt(exerciseId, answer, source));
  } catch (err) {
    const mapped = toAttemptErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run app/api/tutoring/routes.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add app/api/tutoring/tree app/api/tutoring/queue app/api/tutoring/attempts "app/api/tutoring/lessons/[id]/route.ts" "app/api/tutoring/lessons/[id]/complete" app/api/tutoring/routes.test.ts
git commit -m "feat: expose the tree, lessons, attempts, and Daily Queue to students"
```

---

### Task 9: The lesson chat service and route

**Files:**
- Create: `lib/tutoring/lessonChat.ts`, `lib/tutoring/lessonChat.test.ts`, `lib/services/lessonChatService.ts`, `lib/services/lessonChatService.test.ts`, `lib/services/aiAvailability.test.ts`, `app/api/tutoring/lessons/[id]/chat/route.ts`, `app/api/tutoring/lessons/[id]/chat/route.test.ts`
- Modify: `lib/services/aiService.ts`

**Interfaces:**
- Consumes:
  - From Plan 1A: `generateWithActiveProvider`, `AiRequest`, `AiResult`.
  - From Task 7: `correctAnswerFor`, `taskTextFor`.
  - From earlier plans: `createCurriculumService`, `createProfileService`, `createUnlockService`.
- Produces:
  - `isAiAvailable(db): boolean` (in `aiService.ts`).
  - In `lessonChat.ts`:
    - `CHAT_HISTORY_LIMIT = 20` and `CHAT_MESSAGE_MAX_LENGTH = 4000`.
    - `interface ChatMessageView { id: number; role: 'user' | 'assistant'; content: string; exerciseId: string | null; createdAt: string }`.
    - `ChatExerciseContext` and `buildLessonChatSystemPrompt(input): string`.
    - `recentHistory(messages: ChatMessage[], limit?): ChatMessage[]`.
  - In `lessonChatService.ts`:
    - `class ChatError` (kinds: `not_found`, `locked`, `bad_request`, `ai_failed`).
    - `toChatErrorResponse(err)`, which maps the kinds to 404, 403, 400 and 502.
    - `createLessonChatService(db, deps?: { generate?; now? })`, which provides:
      - `getThread(lessonId): { messages: ChatMessageView[]; aiAvailable: boolean }`
      - `send(lessonId, message, exerciseId: string | null): Promise<{ messages: ChatMessageView[] }>`, which returns the new user and assistant messages.
  - `GET /api/tutoring/lessons/[id]/chat` returns the thread.
  - `POST /api/tutoring/lessons/[id]/chat` takes the body `{ message: string, exerciseId?: string | null }` and returns `{ messages }`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/lessonChat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../providers/types';
import { buildLessonChatSystemPrompt, recentHistory } from './lessonChat';

describe('buildLessonChatSystemPrompt', () => {
  const base = {
    lessonTitle: 'The verb sein',
    level: 'A1' as const,
    explanation: 'ich bin, du bist',
    examples: ['Ich bin müde.'],
    uiLanguage: 'de' as const,
    exercise: null,
  };

  it('describes the lesson and answers in the UI language', () => {
    const prompt = buildLessonChatSystemPrompt(base);
    expect(prompt).toContain('CEFR level A1');
    expect(prompt).toContain('"The verb sein"');
    expect(prompt).toContain('Answer in German');
    expect(prompt).toContain('Lesson explanation:\nich bin, du bist');
    expect(prompt).toContain('Lesson examples:\n- Ich bin müde.');
    expect(prompt).not.toContain('asking about this exercise');
  });

  it('adds the exercise the learner is asking about', () => {
    const prompt = buildLessonChatSystemPrompt({
      ...base,
      uiLanguage: 'en',
      exercise: {
        task: 'Ich ___ müde.',
        studentAnswer: 'bist',
        result: 'wrong',
        correctAnswer: 'bin',
        isFreeText: false,
        feedback: null,
      },
    });
    expect(prompt).toContain('Answer in English');
    expect(prompt).toContain('Task: Ich ___ müde.');
    expect(prompt).toContain("Learner's answer: bist");
    expect(prompt).toContain('Grade: wrong');
    expect(prompt).toContain('Correct answer: bin');
    expect(prompt).not.toContain('Grader feedback');
  });

  it('calls a free-text answer the model answer and includes the grader feedback', () => {
    const prompt = buildLessonChatSystemPrompt({
      ...base,
      exercise: {
        task: 'Say that you are tired.',
        studentAnswer: 'Ich bin mude.',
        result: 'almost',
        correctAnswer: 'Ich bin müde.',
        isFreeText: true,
        feedback: 'Umlaut.',
      },
    });
    expect(prompt).toContain('Model answer: Ich bin müde.');
    expect(prompt).toContain('Grader feedback: Umlaut.');
  });
});

describe('recentHistory', () => {
  const m = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });

  it('keeps the last messages and starts with a learner message', () => {
    const messages = [m('user', '1'), m('assistant', '2'), m('user', '3'), m('assistant', '4'), m('user', '5')];
    expect(recentHistory(messages, 4)).toEqual([m('user', '3'), m('assistant', '4'), m('user', '5')]);
    expect(recentHistory(messages, 5)).toEqual(messages);
  });
});
```

Create `lib/services/aiAvailability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { isAiAvailable } from './aiService';

function addConnection(db: ReturnType<typeof createDbClient>, values: { active: number; model: string | null; status: string }) {
  db.prepare(
    `INSERT INTO provider_connections (provider_type, selected_model, is_active, last_validated_status)
     VALUES ('ollama', ?, ?, ?)`
  ).run(values.model, values.active, values.status);
}

describe('isAiAvailable', () => {
  it('needs an active connection with a model that has not been found invalid', () => {
    const cases: [{ active: number; model: string | null; status: string } | null, boolean][] = [
      [null, false],
      [{ active: 0, model: 'm', status: 'valid' }, false],
      [{ active: 1, model: null, status: 'valid' }, false],
      [{ active: 1, model: 'm', status: 'invalid' }, false],
      [{ active: 1, model: 'm', status: 'valid' }, true],
      [{ active: 1, model: 'm', status: 'failing' }, true],
      [{ active: 1, model: 'm', status: 'untested' }, true],
    ];
    for (const [connection, expected] of cases) {
      const db = createDbClient(':memory:');
      if (connection) addConnection(db, connection);
      expect({ connection, available: isAiAvailable(db) }).toEqual({ connection, available: expected });
    }
  });
});
```

Create `lib/services/lessonChatService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createAttemptService } from './attemptService';
import { ChatError, createLessonChatService, toChatErrorResponse } from './lessonChatService';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup(generate = vi.fn().mockResolvedValue({ ok: true, text: 'Weil man so grüßt.' })) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const chat = createLessonChatService(db, { generate, now: () => new Date('2026-09-24T10:00:00.000Z') });
  const attempts = createAttemptService(db, { now: () => new Date(2026, 8, 24, 10) });
  return { db, chat, generate, attempts };
}

describe('lessonChatService', () => {
  it('starts with an empty thread and reports whether the AI is available', () => {
    expect(setup().chat.getThread('a1-greet')).toEqual({ messages: [], aiAvailable: false });
  });

  it('stores a general question and its reply', async () => {
    const { chat, generate } = setup();
    const { messages } = await chat.send('a1-greet', '  Was heißt Hallo?  ', null);
    expect(messages).toEqual([
      { id: 1, role: 'user', content: 'Was heißt Hallo?', exerciseId: null, createdAt: '2026-09-24T10:00:00.000Z' },
      { id: 2, role: 'assistant', content: 'Weil man so grüßt.', exerciseId: null, createdAt: '2026-09-24T10:00:00.000Z' },
    ]);
    expect(chat.getThread('a1-greet').messages).toEqual(messages);
    const request = generate.mock.calls[0][0];
    expect(request.systemPrompt).toContain('"Saying hello"');
    expect(request.messages).toEqual([{ role: 'user', content: 'Was heißt Hallo?' }]);
  });

  it('attaches an answered exercise as context and tags the messages with it', async () => {
    const { chat, generate, attempts } = setup();
    await attempts.recordAttempt('a1-greet__ex1', { type: 'multiple_choice', selectedIndex: 1 }, 'lesson');
    const { messages } = await chat.send('a1-greet', 'Warum nicht Tschüss?', 'a1-greet__ex1');
    expect(messages.map((m) => m.exerciseId)).toEqual(['a1-greet__ex1', 'a1-greet__ex1']);
    const prompt: string = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain("Learner's answer: Tschüss");
    expect(prompt).toContain('Grade: wrong');
    expect(prompt).toContain('Correct answer: Hallo');
  });

  it('refuses an unanswered exercise, a flashcard, an exercise of another lesson, and an empty message', async () => {
    const { chat, attempts } = setup();
    await attempts.recordAttempt('a1-greet__ex2', { type: 'flashcard', rating: 'knew' }, 'lesson');
    await expect(chat.send('a1-greet', 'Warum?', 'a1-greet__ex1')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', 'a1-greet__ex2')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', 'a1-sein__ex2')).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', '   ', null)).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('stores nothing when the AI fails', async () => {
    const { chat } = setup(vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic returned 429' }));
    await expect(chat.send('a1-greet', 'Hallo?', null)).rejects.toMatchObject({
      kind: 'ai_failed',
      message: 'Anthropic returned 429',
    });
    expect(chat.getThread('a1-greet').messages).toEqual([]);
  });

  it('sends at most the last 20 messages, starting with a learner message', async () => {
    const { db, chat, generate } = setup();
    const insert = db.prepare(
      `INSERT INTO lesson_chat_messages (lesson_id, role, content, created_at) VALUES ('a1-greet', ?, ?, '2026-09-23T10:00:00.000Z')`
    );
    for (let i = 0; i < 25; i++) insert.run(i % 2 === 0 ? 'assistant' : 'user', `old ${i}`);
    await chat.send('a1-greet', 'new', null);
    const sent = generate.mock.calls[0][0].messages;
    expect(sent).toHaveLength(19);
    expect(sent[0]).toEqual({ role: 'user', content: 'old 7' });
    expect(sent[18]).toEqual({ role: 'user', content: 'new' });
  });

  it('rejects an unknown or locked lesson', async () => {
    const { chat } = setup();
    expect(() => chat.getThread('nope')).toThrow(ChatError);
    expect(() => chat.getThread('a2-past')).toThrow('Level A2 is locked');
    await expect(chat.send('a2-past', 'Hallo?', null)).rejects.toMatchObject({ kind: 'locked' });
  });

  it('maps error kinds to HTTP statuses', () => {
    expect(toChatErrorResponse(new ChatError('x', 'not_found'))?.status).toBe(404);
    expect(toChatErrorResponse(new ChatError('x', 'locked'))?.status).toBe(403);
    expect(toChatErrorResponse(new ChatError('x', 'bad_request'))?.status).toBe(400);
    expect(toChatErrorResponse(new ChatError('x', 'ai_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toChatErrorResponse(new Error('x'))).toBeNull();
  });
});
```

Create `app/api/tutoring/lessons/[id]/chat/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@/lib/services/aiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/aiService')>()),
  generateWithActiveProvider: vi.fn(),
}));

import { getDb, closeDb } from '@/lib/db/client';
import { generateWithActiveProvider } from '@/lib/services/aiService';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { GET, POST } from './route';

function post(id: string, body: unknown) {
  return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: { id } });
}

describe('/api/tutoring/lessons/[id]/chat', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-chat-'));
    seedTutoringCurriculum(getDb());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockReset();
  });

  it('GET returns the thread, or 404 and 403', async () => {
    const request = new Request('http://localhost');
    expect(await (await GET(request, { params: { id: 'a1-greet' } })).json()).toEqual({ messages: [], aiAvailable: false });
    expect((await GET(request, { params: { id: 'nope' } })).status).toBe(404);
    expect((await GET(request, { params: { id: 'a2-past' } })).status).toBe(403);
  });

  it('POST sends a message and returns the new messages', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: 'Hallo!' });
    const res = await post('a1-greet', { message: 'Hi?' });
    expect(res.status).toBe(200);
    expect((await res.json()).messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ['user', 'Hi?'],
      ['assistant', 'Hallo!'],
    ]);
  });

  it('POST answers 502 when the AI fails, and 400 for a malformed body', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up' });
    const failed = await post('a1-greet', { message: 'Hi?' });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: 'No AI provider is set up' });
    expect((await post('a1-greet', { message: 42 })).status).toBe(400);
    expect((await post('a1-greet', { message: 'Hi?', exerciseId: 7 })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/lessonChat.test.ts lib/services/aiAvailability.test.ts lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat/route.test.ts"`
Expected: FAIL — the new modules don't exist and `isAiAvailable` is not exported.

- [ ] **Step 3: Implement AI availability**

Append to `lib/services/aiService.ts`:

```ts
// "A working provider" for the UI (chat, free text): an active connection with a model that has
// not been found invalid. `failing` still allows a try — it passed validation and later hit a
// runtime error. Reads the table directly so it never touches the key file.
export function isAiAvailable(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT selected_model, last_validated_status FROM provider_connections WHERE is_active = 1')
    .get() as { selected_model: string | null; last_validated_status: string } | undefined;
  return !!row && !!row.selected_model && row.last_validated_status !== 'invalid';
}
```

- [ ] **Step 4: Implement the pure chat helpers**

Create `lib/tutoring/lessonChat.ts`:

```ts
import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { GradeResult } from './grading';

export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

export interface ChatMessageView {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  exerciseId: string | null;
  createdAt: string;
}

export interface ChatExerciseContext {
  task: string;
  studentAnswer: string | null;
  result: GradeResult;
  correctAnswer: string | null;
  isFreeText: boolean;
  feedback: string | null;
}

export interface LessonChatPromptInput {
  lessonTitle: string;
  level: CefrLevel;
  explanation: string | null;
  examples: string[] | null;
  uiLanguage: 'en' | 'de';
  exercise: ChatExerciseContext | null;
}

// Spec: AI Behavior — each call sends the lesson's explanation and examples and the tagged
// exercise's context, if any.
export function buildLessonChatSystemPrompt(input: LessonChatPromptInput): string {
  const language = input.uiLanguage === 'de' ? 'German' : 'English';
  const lines = [
    `You are a friendly German tutor. The learner is at CEFR level ${input.level} and is working on the lesson "${input.lessonTitle}".`,
    `Answer in ${language}, and keep German words and example sentences in German.`,
    'Keep answers short and focused on what the learner asked. If they ask about something unrelated to learning German, steer back to the lesson.',
  ];
  if (input.explanation) lines.push('', 'Lesson explanation:', input.explanation);
  if (input.examples && input.examples.length > 0) {
    lines.push('', 'Lesson examples:', ...input.examples.map((example) => `- ${example}`));
  }
  if (input.exercise) {
    const e = input.exercise;
    lines.push(
      '',
      'The learner is asking about this exercise, which they have already answered:',
      `Task: ${e.task}`,
      `Learner's answer: ${e.studentAnswer ?? '(none)'}`,
      `Grade: ${e.result}`
    );
    if (e.correctAnswer) lines.push(`${e.isFreeText ? 'Model answer' : 'Correct answer'}: ${e.correctAnswer}`);
    if (e.feedback) lines.push(`Grader feedback: ${e.feedback}`);
  }
  return lines.join('\n');
}

// The last messages of the thread that fit in one call, starting with a learner message
// (some providers reject a conversation that opens with the assistant).
export function recentHistory(messages: ChatMessage[], limit = CHAT_HISTORY_LIMIT): ChatMessage[] {
  const recent = messages.slice(-limit);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}
```

- [ ] **Step 5: Implement the chat service**

Create `lib/services/lessonChatService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Exercise } from '../curriculum/types';
import type { GradeResult } from '../tutoring/grading';
import { correctAnswerFor, taskTextFor } from '../tutoring/lessonAnswers';
import {
  buildLessonChatSystemPrompt,
  CHAT_MESSAGE_MAX_LENGTH,
  recentHistory,
  type ChatExerciseContext,
  type ChatMessageView,
} from '../tutoring/lessonChat';
import { generateWithActiveProvider, isAiAvailable, type AiRequest, type AiResult } from './aiService';
import { createCurriculumService } from './curriculumService';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

export type ChatErrorKind = 'not_found' | 'locked' | 'bad_request' | 'ai_failed';

export class ChatError extends Error {
  constructor(
    message: string,
    readonly kind: ChatErrorKind
  ) {
    super(message);
  }
}

const STATUS_FOR: Record<ChatErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, ai_failed: 502 };

export function toChatErrorResponse(err: unknown): { status: number; body: { error: string } } | null {
  if (!(err instanceof ChatError)) return null;
  return { status: STATUS_FOR[err.kind], body: { error: err.message } };
}

export interface LessonChatDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  now?: () => Date;
}

interface MessageRow {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  exercise_id: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Exercise['track'];
  type: Exercise['type'];
  content: string;
}

export function createLessonChatService(db: Database.Database, deps: LessonChatDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const now = deps.now ?? (() => new Date());
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const unlocks = createUnlockService(db);

  // Spec: Level Unlocking — chatting about a lesson in a locked level is rejected.
  function getUnlockedLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new ChatError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new ChatError(`Level ${lesson.sourceLevel} is locked`, 'locked');
    }
    return lesson;
  }

  function listMessages(lessonId: string): ChatMessageView[] {
    const rows = db
      .prepare('SELECT id, role, content, exercise_id, created_at FROM lesson_chat_messages WHERE lesson_id = ? ORDER BY id')
      .all(lessonId) as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      exerciseId: row.exercise_id,
      createdAt: row.created_at,
    }));
  }

  function getThread(lessonId: string): { messages: ChatMessageView[]; aiAvailable: boolean } {
    const lesson = getUnlockedLesson(lessonId);
    return { messages: listMessages(lesson.id), aiAvailable: isAiAvailable(db) };
  }

  // "Ask AI" is offered only after answering, and never on flashcards (spec: AI Behavior).
  function exerciseContext(lessonId: string, exerciseId: string): ChatExerciseContext {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ? AND lesson_id = ?').get(exerciseId, lessonId) as
      | ExerciseRow
      | undefined;
    if (!row) throw new ChatError('That exercise is not part of this lesson', 'bad_request');
    if (row.type === 'flashcard') throw new ChatError('Ask AI is not available for flashcards', 'bad_request');
    const attempt = db
      .prepare('SELECT result, answer_text, ai_feedback FROM lesson_attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT 1')
      .get(exerciseId) as { result: GradeResult; answer_text: string | null; ai_feedback: string | null } | undefined;
    if (!attempt) throw new ChatError('Answer this exercise before asking about it', 'bad_request');
    const exercise: Exercise = {
      id: row.id,
      lessonId: row.lesson_id,
      track: row.track,
      type: row.type,
      content: JSON.parse(row.content),
    };
    return {
      task: taskTextFor(exercise),
      studentAnswer: attempt.answer_text,
      result: attempt.result,
      correctAnswer: correctAnswerFor(exercise),
      isFreeText: row.type === 'free_text',
      feedback: attempt.ai_feedback,
    };
  }

  // Nothing is stored unless the AI answers, so a failed call leaves the thread unchanged and
  // the student's typed message stays in the input to retry.
  async function send(lessonId: string, message: string, exerciseId: string | null): Promise<{ messages: ChatMessageView[] }> {
    const content = message.trim();
    if (!content) throw new ChatError('Write a message first', 'bad_request');
    if (content.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new ChatError(`Messages can be at most ${CHAT_MESSAGE_MAX_LENGTH} characters`, 'bad_request');
    }
    const lesson = getUnlockedLesson(lessonId);
    const context = exerciseId ? exerciseContext(lesson.id, exerciseId) : null;
    const history = recentHistory([
      ...listMessages(lesson.id).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ]);
    const reply = await generate({
      systemPrompt: buildLessonChatSystemPrompt({
        lessonTitle: lesson.title,
        level: lesson.sourceLevel,
        explanation: lesson.explanation,
        examples: lesson.examples,
        uiLanguage: profiles.getProfile().uiLanguage,
        exercise: context,
      }),
      messages: history,
    });
    if (!reply.ok) throw new ChatError(reply.error, 'ai_failed');

    const at = now().toISOString();
    const insert = db.prepare(
      'INSERT INTO lesson_chat_messages (lesson_id, exercise_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const ids = db.transaction(() => [
      Number(insert.run(lesson.id, exerciseId, 'user', content, at).lastInsertRowid),
      Number(insert.run(lesson.id, exerciseId, 'assistant', reply.text, at).lastInsertRowid),
    ])();
    return { messages: listMessages(lesson.id).filter((m) => ids.includes(m.id)) };
  }

  return { getThread, send };
}

export type LessonChatService = ReturnType<typeof createLessonChatService>;
```

- [ ] **Step 6: Implement the route**

Create `app/api/tutoring/lessons/[id]/chat/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createLessonChatService, toChatErrorResponse } from '@/lib/services/lessonChatService';

export const dynamic = 'force-dynamic';

function mapError(err: unknown) {
  const mapped = toChatErrorResponse(err);
  if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
  throw err;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(createLessonChatService(getDb()).getThread(params.id));
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const message = body?.message;
  const exerciseId = body?.exerciseId ?? null;
  if (typeof message !== 'string' || (exerciseId !== null && typeof exerciseId !== 'string')) {
    return NextResponse.json({ error: 'message (text) and an optional exerciseId are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createLessonChatService(getDb()).send(params.id, message, exerciseId));
  } catch (err) {
    return mapError(err);
  }
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/lessonChat.test.ts lib/services/aiAvailability.test.ts lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat/route.test.ts"`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 8: Commit**

```bash
git add lib/tutoring/lessonChat.ts lib/tutoring/lessonChat.test.ts lib/services/aiService.ts lib/services/aiAvailability.test.ts lib/services/lessonChatService.ts lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat"
git commit -m "feat: add the per-lesson AI chat with exercise context"
```

---
### Task 10: The exercise card

One component answers any exercise, in a lesson or the Daily Queue: it grades through the API, shows the result, the correct or model answer, and the AI feedback, and offers "Ask AI" (not on flashcards) and "Next". A free-text grading failure shows the error with a Settings link, keeps the typed answer, and offers "Skip for now" so the exercise comes back in the retry round.

**Files:**
- Create: `components/tutoring/ExerciseCard.tsx`, `components/tutoring/ExerciseCard.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `POST /api/tutoring/attempts` (Task 8); `ExerciseView` (Task 5); `AttemptOutcome`, `AttemptSource`, `FlashcardRating`, `LessonAnswer` (Task 7).
- Produces: `ExerciseCard` with props `{ exercise: ExerciseView; source: AttemptSource; onAnswered: (outcome: AttemptOutcome) => void; onNext: () => void; onSkip: () => void; onAskAi?: (exerciseId: string) => void }`. The parent remounts it (a new `key`) for each exercise turn. The `exercise` catalog namespace.

- [ ] **Step 1: Add the catalog text**

Add this top-level namespace to `messages/en.json`, directly after the `placement` namespace:

```json
  "exercise": {
    "answerLabel": "Your answer",
    "submit": "Check",
    "submitting": "Checking…",
    "showAnswer": "Show answer",
    "rating": {
      "knew": "Knew it",
      "sort_of": "Sort of",
      "didnt_know": "Didn’t know it"
    },
    "result": {
      "correct": "Correct!",
      "almost": "Almost — that counts as passed.",
      "wrong": "Not quite."
    },
    "correctAnswer": "Correct answer: {answer}",
    "modelAnswer": "Model answer: {answer}",
    "feedback": "Feedback: {feedback}",
    "askAi": "Ask AI",
    "next": "Next",
    "skipForNow": "Skip for now",
    "gradingFailed": "Your answer could not be graded: {error}. Your answer is kept, so you can try again. <link>Visit Settings</link> if this keeps happening.",
    "genericError": "Something went wrong: {error}"
  },
```

and to `messages/de.json`, directly after its `placement` namespace:

```json
  "exercise": {
    "answerLabel": "Deine Antwort",
    "submit": "Prüfen",
    "submitting": "Wird geprüft …",
    "showAnswer": "Antwort zeigen",
    "rating": {
      "knew": "Gewusst",
      "sort_of": "Halb gewusst",
      "didnt_know": "Nicht gewusst"
    },
    "result": {
      "correct": "Richtig!",
      "almost": "Fast – das zählt als bestanden.",
      "wrong": "Nicht ganz."
    },
    "correctAnswer": "Richtige Antwort: {answer}",
    "modelAnswer": "Musterantwort: {answer}",
    "feedback": "Rückmeldung: {feedback}",
    "askAi": "KI fragen",
    "next": "Weiter",
    "skipForNow": "Vorerst überspringen",
    "gradingFailed": "Deine Antwort konnte nicht bewertet werden: {error}. Deine Antwort bleibt erhalten, du kannst es noch einmal versuchen. <link>Öffne die Einstellungen</link>, falls das öfter passiert.",
    "genericError": "Etwas ist schiefgelaufen: {error}"
  },
```

- [ ] **Step 2: Write the component tests**

Create `components/tutoring/ExerciseCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import { ExerciseCard } from './ExerciseCard';

const MC: ExerciseView = { id: 'ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'] };
const FILL: ExerciseView = { id: 'ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' };
const CARD: ExerciseView = { id: 'ex3', type: 'flashcard', front: 'der Hund', back: 'the dog' };
const FREE: ExerciseView = { id: 'ex4', type: 'free_text', prompt: 'Say that you are tired.' };

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    result: 'correct',
    correctAnswer: 'Hallo',
    feedback: null,
    passedExerciseIds: [],
    lessonCompleted: false,
    justCompleted: false,
    ...overrides,
  };
}

function stubAttempts(...responses: (() => Promise<unknown>)[]) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderCard(exercise: ExerciseView) {
  const props = { onAnswered: vi.fn(), onNext: vi.fn(), onSkip: vi.fn(), onAskAi: vi.fn() };
  renderWithIntl(<ExerciseCard exercise={exercise} source="lesson" {...props} />);
  return props;
}

describe('ExerciseCard', () => {
  it('sends a multiple-choice answer, shows the result, and offers Ask AI and Next', async () => {
    const fetchMock = stubAttempts(() => delayedResponse(outcome()));
    const props = renderCard(MC);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(check);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 0 }, source: 'lesson' }),
    });
    expect(props.onAnswered).toHaveBeenCalledWith(outcome());
    expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(props.onAskAi).toHaveBeenCalledWith('ex1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it('shows the correct answer after a wrong fill-in answer', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'wrong', correctAnswer: 'bin' })));
    renderCard(FILL);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'bist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin')).toBeInTheDocument();
  });

  it('reveals a flashcard and grades it with the student’s own rating, without Ask AI', async () => {
    const fetchMock = stubAttempts(() => delayedResponse(outcome({ correctAnswer: null })));
    renderCard(CARD);
    expect(screen.getByText('der Hund')).toBeInTheDocument();
    expect(screen.queryByText('the dog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('the dog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Knew it' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ answer: { type: 'flashcard', rating: 'knew' } });
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('keeps a free-text answer and offers Settings and Skip when grading fails', async () => {
    stubAttempts(() => delayedResponse({ error: 'No AI provider is set up' }, { ok: false, status: 502 }));
    const props = renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin müde.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer could not be graded: No AI provider is set up.');
    expect(screen.getByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByLabelText('Your answer')).toHaveValue('Ich bin müde.');
    expect(props.onAnswered).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(props.onSkip).toHaveBeenCalled();
  });

  it('shows the model answer and the AI feedback for free text', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback: 'Watch the umlaut.' })));
    renderCard(FREE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost — that counts as passed.')).toBeInTheDocument();
    expect(screen.getByText('Model answer: Ich bin müde.')).toBeInTheDocument();
    expect(screen.getByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
  });

  it('shows any other failure as an error', async () => {
    stubAttempts(() => delayedResponse({ error: 'Level A2 is locked' }, { ok: false, status: 403 }));
    renderCard(MC);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Level A2 is locked');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).not.toBeDisabled());
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/ExerciseCard.test.tsx`
Expected: FAIL — cannot resolve `./ExerciseCard`.

- [ ] **Step 4: Implement the component**

Create `components/tutoring/ExerciseCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptOutcome, AttemptSource, FlashcardRating, LessonAnswer } from '@/lib/tutoring/lessonAnswers';

const RATINGS: FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

export interface ExerciseCardProps {
  exercise: ExerciseView;
  source: AttemptSource;
  onAnswered: (outcome: AttemptOutcome) => void;
  onNext: () => void;
  onSkip: () => void;
  onAskAi?: (exerciseId: string) => void;
}

function taskText(exercise: ExerciseView): string {
  switch (exercise.type) {
    case 'multiple_choice':
      return exercise.question;
    case 'fill_blank':
      return exercise.textWithBlank;
    case 'flashcard':
      return exercise.front;
    case 'free_text':
      return exercise.prompt;
  }
}

export function ExerciseCard({ exercise, source, onAnswered, onNext, onSkip, onAskAi }: ExerciseCardProps) {
  const t = useTranslations('exercise');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);

  async function submit(answer: LessonAnswer) {
    setBusy(true);
    setError(null);
    setGradingError(null);
    try {
      const res = await fetch('/api/tutoring/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: exercise.id, answer, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOutcome(data as AttemptOutcome);
        onAnswered(data as AttemptOutcome);
        return;
      }
      const detail = typeof data.error === 'string' ? data.error : String(res.status);
      // 502: the AI could not grade the answer (spec: AI Behavior).
      if (res.status === 502) setGradingError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function currentAnswer(): LessonAnswer | null {
    if (exercise.type === 'multiple_choice') {
      return selectedIndex === null ? null : { type: 'multiple_choice', selectedIndex };
    }
    if (exercise.type === 'flashcard') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    return exercise.type === 'fill_blank' ? { type: 'fill_blank', text: trimmed } : { type: 'free_text', text: trimmed };
  }

  const alerts = (
    <>
      {gradingError && (
        <p role="alert">
          {t.rich('gradingFailed', {
            error: gradingError,
            link: (chunks) => <Link href="/settings">{chunks}</Link>,
          })}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );

  if (outcome) {
    const showAnswer =
      exercise.type !== 'flashcard' &&
      outcome.correctAnswer !== null &&
      (outcome.result !== 'correct' || exercise.type === 'free_text');
    return (
      <div>
        <p>{taskText(exercise)}</p>
        {exercise.type === 'flashcard' && <p>{exercise.back}</p>}
        <p>{t(`result.${outcome.result}`)}</p>
        {showAnswer && (
          <p>
            {exercise.type === 'free_text'
              ? t('modelAnswer', { answer: outcome.correctAnswer ?? '' })
              : t('correctAnswer', { answer: outcome.correctAnswer ?? '' })}
          </p>
        )}
        {outcome.feedback && <p>{t('feedback', { feedback: outcome.feedback })}</p>}
        {exercise.type !== 'flashcard' && onAskAi && (
          <button type="button" onClick={() => onAskAi(exercise.id)}>
            {t('askAi')}
          </button>
        )}
        <button type="button" onClick={onNext}>
          {t('next')}
        </button>
      </div>
    );
  }

  if (exercise.type === 'flashcard') {
    return (
      <div>
        <p>{exercise.front}</p>
        {revealed ? (
          <div>
            <p>{exercise.back}</p>
            {RATINGS.map((rating) => (
              <button key={rating} type="button" disabled={busy} onClick={() => submit({ type: 'flashcard', rating })}>
                {t(`rating.${rating}`)}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setRevealed(true)}>
            {t('showAnswer')}
          </button>
        )}
        {alerts}
      </div>
    );
  }

  const answer = currentAnswer();
  return (
    <div>
      {exercise.type === 'multiple_choice' && (
        <fieldset>
          <legend>{exercise.question}</legend>
          {exercise.options.map((option, index) => (
            <label key={index}>
              <input
                type="radio"
                name={`exercise-${exercise.id}`}
                checked={selectedIndex === index}
                onChange={() => setSelectedIndex(index)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      )}
      {exercise.type === 'fill_blank' && (
        <div>
          <p>{exercise.textWithBlank}</p>
          <input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {exercise.type === 'free_text' && (
        <div>
          <p>{exercise.prompt}</p>
          <textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <button type="button" disabled={busy || answer === null} onClick={() => answer && submit(answer)}>
        {busy ? t('submitting') : t('submit')}
      </button>
      {gradingError && (
        <button type="button" onClick={onSkip}>
          {t('skipForNow')}
        </button>
      )}
      {alerts}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/ExerciseCard.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/ExerciseCard.tsx components/tutoring/ExerciseCard.test.tsx messages/en.json messages/de.json
git commit -m "feat: add the exercise card for lessons and reviews"
```

---

### Task 11: The lesson chat panel

**Files:**
- Create: `components/tutoring/LessonChat.tsx`, `components/tutoring/LessonChat.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET` and `POST /api/tutoring/lessons/[id]/chat` (Task 9); `ChatMessageView` (Task 9).
- Produces:
  - `interface AskAbout { exerciseId: string; label: string }`
  - `LessonChat`, with props `{ lessonId: string; open: boolean; onToggle: () => void; askAbout: AskAbout | null; onClearAskAbout: () => void }`.
    - It loads the thread the first time it is opened.
    - It sends `{ message, exerciseId }`.
    - After a successful send, it clears the draft and calls `onClearAskAbout`.
  - The `chat` catalog namespace.

- [ ] **Step 1: Add the catalog text**

Add to `messages/en.json`, directly after the `exercise` namespace:

```json
  "chat": {
    "show": "Ask the AI tutor",
    "hide": "Hide the AI tutor",
    "loadFailed": "Could not load the chat.",
    "empty": "Ask anything about this lesson.",
    "you": "You",
    "tutor": "Tutor",
    "aboutExercise": "(about an exercise)",
    "unavailable": "The AI tutor needs a working AI provider. <link>Visit Settings</link> to set one up.",
    "askingAbout": "Asking about {label}",
    "clearAskAbout": "Stop asking about this exercise",
    "messageLabel": "Your message",
    "send": "Send",
    "sending": "Sending…",
    "aiFailed": "The AI tutor could not answer: {error}. Your message is kept, so you can try again. <link>Visit Settings</link> if this keeps happening.",
    "genericError": "Something went wrong: {error}"
  },
```

and to `messages/de.json`, directly after its `exercise` namespace:

```json
  "chat": {
    "show": "KI-Tutor fragen",
    "hide": "KI-Tutor ausblenden",
    "loadFailed": "Der Chat konnte nicht geladen werden.",
    "empty": "Frag alles zu dieser Lektion.",
    "you": "Du",
    "tutor": "Tutor",
    "aboutExercise": "(zu einer Übung)",
    "unavailable": "Der KI-Tutor braucht einen funktionierenden KI-Anbieter. <link>Öffne die Einstellungen</link>, um einen einzurichten.",
    "askingAbout": "Frage zu {label}",
    "clearAskAbout": "Nicht mehr zu dieser Übung fragen",
    "messageLabel": "Deine Nachricht",
    "send": "Senden",
    "sending": "Wird gesendet …",
    "aiFailed": "Der KI-Tutor konnte nicht antworten: {error}. Deine Nachricht bleibt erhalten, du kannst es noch einmal versuchen. <link>Öffne die Einstellungen</link>, falls das öfter passiert.",
    "genericError": "Etwas ist schiefgelaufen: {error}"
  },
```

- [ ] **Step 2: Write the component tests**

Create `components/tutoring/LessonChat.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { LessonChat } from './LessonChat';

const URL = '/api/tutoring/lessons/a1-greet/chat';
const EARLIER = { id: 1, role: 'user', content: 'Was heißt Hallo?', exerciseId: null, createdAt: '2026-09-24T09:00:00.000Z' };
const REPLY = { id: 2, role: 'assistant', content: 'Hello.', exerciseId: null, createdAt: '2026-09-24T09:00:00.000Z' };

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderChat(props: Partial<Parameters<typeof LessonChat>[0]> = {}) {
  const all = { lessonId: 'a1-greet', open: true, onToggle: vi.fn(), askAbout: null, onClearAskAbout: vi.fn(), ...props };
  renderWithIntl(<LessonChat {...all} />);
  return all;
}

describe('LessonChat', () => {
  it('stays closed and loads nothing until opened', () => {
    const fetchMock = stubFetch({});
    const props = renderChat({ open: false });
    fireEvent.click(screen.getByRole('button', { name: 'Ask the AI tutor' }));
    expect(props.onToggle).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the thread and sends a question about an exercise', async () => {
    const fetchMock = stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [EARLIER], aiAvailable: true }),
      [`POST ${URL}`]: () =>
        delayedResponse({
          messages: [
            { id: 3, role: 'user', content: 'Warum?', exerciseId: 'ex1', createdAt: 'x' },
            { id: 4, role: 'assistant', content: 'Weil…', exerciseId: 'ex1', createdAt: 'x' },
          ],
        }),
    });
    const props = renderChat({ askAbout: { exerciseId: 'ex1', label: 'exercise 1' } });

    expect(await screen.findByText('Was heißt Hallo?')).toBeInTheDocument();
    expect(screen.getByText('Asking about exercise 1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Weil…')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Warum?', exerciseId: 'ex1' }),
    });
    expect(screen.getByLabelText('Your message')).toHaveValue('');
    expect(props.onClearAskAbout).toHaveBeenCalled();
  });

  it('is disabled with a Settings link when no AI provider works', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: false }) });
    renderChat();
    expect(await screen.findByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByLabelText('Your message')).toBeDisabled();
  });

  it('keeps the message and shows a Settings link when the AI fails', async () => {
    stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: true }),
      [`POST ${URL}`]: () => delayedResponse({ error: 'Anthropic returned 429' }, { ok: false, status: 502 }),
    });
    renderChat();
    expect(await screen.findByText('Ask anything about this lesson.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hallo?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI tutor could not answer: Anthropic returned 429.');
    expect(screen.getByLabelText('Your message')).toHaveValue('Hallo?');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled());
  });

  it('shows an error when the thread cannot load', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({}, { ok: false, status: 500 }) });
    renderChat();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the chat.');
  });

  it('labels who wrote each message', async () => {
    stubFetch({ [`GET ${URL}`]: () => delayedResponse({ messages: [EARLIER, REPLY], aiAvailable: true }) });
    renderChat();
    expect(await screen.findByText('Hello.')).toBeInTheDocument();
    expect(screen.getByText('You:')).toBeInTheDocument();
    expect(screen.getByText('Tutor:')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/LessonChat.test.tsx`
Expected: FAIL — cannot resolve `./LessonChat`.

- [ ] **Step 4: Implement the component**

Create `components/tutoring/LessonChat.tsx`:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ChatMessageView } from '@/lib/tutoring/lessonChat';

export interface AskAbout {
  exerciseId: string;
  label: string;
}

export interface LessonChatProps {
  lessonId: string;
  open: boolean;
  onToggle: () => void;
  askAbout: AskAbout | null;
  onClearAskAbout: () => void;
}

export function LessonChat({ lessonId, open, onToggle, askAbout, onClearAskAbout }: LessonChatProps) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // The thread loads the first time the panel opens.
  useEffect(() => {
    if (!open || messages !== null || loadFailed) return;
    let cancelled = false;
    fetch(`/api/tutoring/lessons/${lessonId}/chat`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages);
        setAiAvailable(data.aiAvailable);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lessonId, messages, loadFailed]);

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lessonId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, exerciseId: askAbout?.exerciseId ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages((previous) => [...(previous ?? []), ...(data.messages as ChatMessageView[])]);
        setDraft('');
        onClearAskAbout();
        return;
      }
      const detail = typeof data.error === 'string' ? data.error : String(res.status);
      if (res.status === 502) setAiError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  const settingsLink = (chunks: ReactNode) => <Link href="/settings">{chunks}</Link>;

  return (
    <section>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        {open ? t('hide') : t('show')}
      </button>
      {open && (
        <div>
          {loadFailed && <p role="alert">{t('loadFailed')}</p>}
          {!loadFailed && messages === null && <p>{tCommon('loading')}</p>}
          {messages && messages.length === 0 && <p>{t('empty')}</p>}
          {messages && messages.length > 0 && (
            <ul>
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.role === 'user' ? `${t('you')}:` : `${t('tutor')}:`}</strong>{' '}
                  {m.exerciseId && <em>{t('aboutExercise')} </em>}
                  {m.content}
                </li>
              ))}
            </ul>
          )}
          {messages && !aiAvailable && <p>{t.rich('unavailable', { link: settingsLink })}</p>}
          {askAbout && (
            <p>
              {t('askingAbout', { label: askAbout.label })}{' '}
              <button type="button" aria-label={t('clearAskAbout')} onClick={onClearAskAbout}>
                ×
              </button>
            </p>
          )}
          <textarea
            aria-label={t('messageLabel')}
            value={draft}
            disabled={!aiAvailable || busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" disabled={!aiAvailable || busy || messages === null || !draft.trim()} onClick={send}>
            {busy ? t('sending') : t('send')}
          </button>
          {aiError && <p role="alert">{t.rich('aiFailed', { error: aiError, link: settingsLink })}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/LessonChat.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/LessonChat.tsx components/tutoring/LessonChat.test.tsx messages/en.json messages/de.json
git commit -m "feat: add the lesson chat panel"
```

---

### Task 12: The lesson page

**Files:**
- Create: `app/lesson/[id]/page.tsx`, `app/lesson/[id]/page.test.tsx`, `components/tutoring/LessonPage.tsx`, `components/tutoring/LessonPage.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/tutoring/lessons/[id]` and `POST /api/tutoring/lessons/[id]/complete` (Task 8); `LessonView` (Task 5); `ExerciseCard` (Task 10); `LessonChat`, `AskAbout` (Task 11).
- Produces: the `/lesson/[id]` page; `LessonPage` with props `{ lessonId: string }`; the `lesson` catalog namespace.

- [ ] **Step 1: Add the catalog text**

Add to `messages/en.json`, directly after the `chat` namespace:

```json
  "lesson": {
    "backToTree": "Back to your lessons",
    "loadFailed": "Could not load this lesson. Please reload the page.",
    "notFound": "This lesson does not exist.",
    "locked": "Locked — unlocks after finishing {level}.",
    "buildsOn": "Builds on:",
    "prerequisiteDone": "done",
    "prerequisiteNotDone": "not done yet",
    "examples": "Examples",
    "start": "Start the exercises",
    "continue": "Continue the exercises",
    "practiceAgain": "Practice again",
    "practiceNote": "Practice run: this lesson is already complete.",
    "progress": "{passed} of {total} exercises passed",
    "completedNow": "Lesson complete! Its exercises will come back in your daily review.",
    "allPassed": "All exercises passed.",
    "practiceFinished": "Practice finished.",
    "toQueue": "Go to your daily review",
    "markDone": "Mark as done",
    "markFailed": "Could not mark this lesson as done: {error}",
    "done": "Done — this lesson is complete.",
    "exerciseLabel": "exercise {number}"
  },
```

and to `messages/de.json`, directly after its `chat` namespace:

```json
  "lesson": {
    "backToTree": "Zurück zu deinen Lektionen",
    "loadFailed": "Diese Lektion konnte nicht geladen werden. Bitte lade die Seite neu.",
    "notFound": "Diese Lektion gibt es nicht.",
    "locked": "Gesperrt – wird freigeschaltet, wenn du {level} abgeschlossen hast.",
    "buildsOn": "Baut auf:",
    "prerequisiteDone": "erledigt",
    "prerequisiteNotDone": "noch nicht erledigt",
    "examples": "Beispiele",
    "start": "Übungen starten",
    "continue": "Übungen fortsetzen",
    "practiceAgain": "Noch einmal üben",
    "practiceNote": "Übungsrunde: Diese Lektion ist schon abgeschlossen.",
    "progress": "{passed} von {total} Übungen bestanden",
    "completedNow": "Lektion abgeschlossen! Ihre Übungen kommen in deiner täglichen Wiederholung wieder.",
    "allPassed": "Alle Übungen bestanden.",
    "practiceFinished": "Übungsrunde beendet.",
    "toQueue": "Zur täglichen Wiederholung",
    "markDone": "Als erledigt markieren",
    "markFailed": "Die Lektion konnte nicht als erledigt markiert werden: {error}",
    "done": "Erledigt – diese Lektion ist abgeschlossen.",
    "exerciseLabel": "Übung {number}"
  },
```

- [ ] **Step 2: Write the tests**

Create `app/lesson/[id]/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockGetProfile } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetProfile: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/components/tutoring/LessonPage', () => ({ LessonPage: () => null }));

import Lesson from './page';

describe('Lesson page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Lesson({ params: { id: 'a1-greet' } });
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the lesson otherwise', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(Lesson({ params: { id: 'a1-greet' } })).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

Create `components/tutoring/LessonPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { LessonPage } from './LessonPage';

const LESSON = {
  locked: false,
  id: 'a1-greet',
  title: 'Saying hello',
  track: 'generic',
  level: 'A1',
  skill: 'vocabulary',
  explanation: 'Say Hallo to greet someone.',
  examples: ['Hallo!'],
  exercises: [
    { id: 'ex1', type: 'multiple_choice', question: 'Greeting?', options: ['Hallo', 'Tschüss'] },
    { id: 'ex2', type: 'multiple_choice', question: 'Farewell?', options: ['Hallo', 'Tschüss'] },
  ],
  passedExerciseIds: [] as string[],
  completed: false,
  prerequisites: [{ id: 'a1-basics', title: 'Basics', done: true }],
};

function outcome(result: string, overrides: Record<string, unknown> = {}) {
  return { result, correctAnswer: 'Hallo', feedback: null, passedExerciseIds: [], lessonCompleted: false, justCompleted: false, ...overrides };
}

function stubFetch(routes: Record<string, () => Promise<unknown>>, attempts: (() => Promise<unknown>)[] = []) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (key === 'POST /api/tutoring/attempts') {
      const next = attempts.shift();
      if (!next) throw new Error('Unexpected attempt');
      return next();
    }
    const route = routes[key];
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function answer(option: string) {
  fireEvent.click(screen.getByLabelText(option));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
}

describe('LessonPage', () => {
  it('shows the explanation, examples, and prerequisites, then runs the exercises with a retry round', async () => {
    stubFetch(
      { 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON) },
      [
        () => delayedResponse(outcome('wrong')),
        () => delayedResponse(outcome('correct', { passedExerciseIds: ['ex2'] })),
        () => delayedResponse(outcome('correct', { passedExerciseIds: ['ex1', 'ex2'], lessonCompleted: true, justCompleted: true })),
      ]
    );
    renderWithIntl(<LessonPage lessonId="a1-greet" />);

    expect(await screen.findByText('Say Hallo to greet someone.')).toBeInTheDocument();
    expect(screen.getByText('Hallo!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Basics' })).toHaveAttribute('href', '/lesson/a1-basics');

    fireEvent.click(screen.getByRole('button', { name: 'Start the exercises' }));
    expect(screen.getByText('0 of 2 exercises passed')).toBeInTheDocument();
    expect(screen.getByText('Greeting?')).toBeInTheDocument();

    await answer('Tschüss');
    expect(await screen.findByText('Farewell?')).toBeInTheDocument();
    await answer('Tschüss');
    expect(await screen.findByText('Greeting?')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 exercises passed')).toBeInTheDocument();
    await answer('Hallo');

    expect(await screen.findByText('Lesson complete! Its exercises will come back in your daily review.')).toBeInTheDocument();
  });

  it('continues with the exercises not yet passed', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({ ...LESSON, passedExerciseIds: ['ex1'] }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue the exercises' }));
    expect(screen.getByText('Farewell?')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 exercises passed')).toBeInTheDocument();
  });

  it('runs a completed lesson again as practice', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () =>
        delayedResponse({ ...LESSON, completed: true, passedExerciseIds: ['ex1', 'ex2'] }),
    });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice again' }));
    expect(screen.getByText('Practice run: this lesson is already complete.')).toBeInTheDocument();
    expect(screen.getByText('Greeting?')).toBeInTheDocument();
  });

  it('opens the chat about an exercise from Ask AI', async () => {
    stubFetch(
      {
        'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON),
        'GET /api/tutoring/lessons/a1-greet/chat': () => delayedResponse({ messages: [], aiAvailable: true }),
      },
      [() => delayedResponse(outcome('wrong'))]
    );
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the exercises' }));
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
    expect(await screen.findByText('Asking about exercise 1')).toBeInTheDocument();
    expect(await screen.findByText('Ask anything about this lesson.')).toBeInTheDocument();
  });

  it('marks a lesson without exercises as done', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-read': () => delayedResponse({ ...LESSON, id: 'a1-read', exercises: [] }),
      'POST /api/tutoring/lessons/a1-read/complete': () => delayedResponse({ completed: true }),
    });
    renderWithIntl(<LessonPage lessonId="a1-read" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as done' }));
    expect(await screen.findByText('Done — this lesson is complete.')).toBeInTheDocument();
  });

  it('shows a locked lesson', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a2-past': () =>
        delayedResponse({ locked: true, id: 'a2-past', title: 'The past', level: 'A2', unlocksAfter: 'A1' }),
    });
    renderWithIntl(<LessonPage lessonId="a2-past" />);
    expect(await screen.findByText('Locked — unlocks after finishing A1.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the exercises' })).not.toBeInTheDocument();
  });

  it('shows errors for a missing lesson and a failed load', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/nope': () => delayedResponse({ error: 'Lesson not found' }, { ok: false, status: 404 }) });
    renderWithIntl(<LessonPage lessonId="nope" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This lesson does not exist.');
  });

  it('shows an error when the lesson fails to load', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({}, { ok: false, status: 500 }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this lesson. Please reload the page.');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/LessonPage.test.tsx "app/lesson/[id]/page.test.tsx"`
Expected: FAIL — the modules don't exist.

- [ ] **Step 4: Implement the component and the page**

Create `components/tutoring/LessonPage.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LessonView } from '@/lib/tutoring/progressTypes';
import type { AttemptOutcome } from '@/lib/tutoring/lessonAnswers';
import { ExerciseCard } from './ExerciseCard';
import { LessonChat, type AskAbout } from './LessonChat';

type OpenLesson = Extract<LessonView, { locked: false }>;

// One run through the lesson's exercises. Exercises not passed yet move to the end (the retry
// round) until every one has passed (spec: Pages and Navigation, `/lesson/[id]`).
interface Run {
  pending: string[];
  total: number;
  passed: number;
  practice: boolean;
}

export function LessonPage({ lessonId }: { lessonId: string }) {
  const t = useTranslations('lesson');
  const tCommon = useTranslations('common');
  const [view, setView] = useState<LessonView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [turn, setTurn] = useState(0);
  const [lastPassed, setLastPassed] = useState(false);
  const [completedNow, setCompletedNow] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [askAbout, setAskAbout] = useState<AskAbout | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutoring/lessons/${lessonId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LessonView;
        if (!cancelled) setView(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  function startRun(lesson: OpenLesson) {
    const practice = lesson.completed;
    const passed = new Set(lesson.passedExerciseIds);
    const pending = lesson.exercises.map((e) => e.id).filter((id) => practice || !passed.has(id));
    setRun({ pending, total: lesson.exercises.length, passed: lesson.exercises.length - pending.length, practice });
    setTurn((n) => n + 1);
  }

  function handleAnswered(outcome: AttemptOutcome) {
    setLastPassed(outcome.result !== 'wrong');
    if (outcome.justCompleted) setCompletedNow(true);
    setView((current) =>
      current && !current.locked
        ? { ...current, passedExerciseIds: outcome.passedExerciseIds, completed: outcome.lessonCompleted }
        : current
    );
  }

  function advance(passed: boolean) {
    setRun((current) => {
      if (!current || current.pending.length === 0) return current;
      const [head, ...rest] = current.pending;
      return {
        ...current,
        pending: passed ? rest : [...rest, head],
        passed: current.passed + (passed ? 1 : 0),
      };
    });
    setLastPassed(false);
    setTurn((n) => n + 1);
  }

  async function markDone(lesson: OpenLesson) {
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lesson.id}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMarkError(t('markFailed', { error: typeof data.error === 'string' ? data.error : String(res.status) }));
        return;
      }
      setView({ ...lesson, completed: true });
    } catch (err) {
      setMarkError(t('markFailed', { error: (err as Error).message }));
    } finally {
      setMarking(false);
    }
  }

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (notFound) {
    return (
      <div>
        <p role="alert">{t('notFound')}</p>
        <Link href="/">{t('backToTree')}</Link>
      </div>
    );
  }
  if (!view) return <p>{tCommon('loading')}</p>;
  if (view.locked) {
    return (
      <div>
        <nav>
          <Link href="/">{t('backToTree')}</Link>
        </nav>
        <h1>{view.title}</h1>
        <p>{t('locked', { level: view.unlocksAfter })}</p>
      </div>
    );
  }

  const lesson = view;
  const currentId = run?.pending[0];
  const current = currentId ? (lesson.exercises.find((e) => e.id === currentId) ?? null) : null;

  function askAi(exerciseId: string) {
    const number = lesson.exercises.findIndex((e) => e.id === exerciseId) + 1;
    setAskAbout({ exerciseId, label: t('exerciseLabel', { number }) });
    setChatOpen(true);
  }

  return (
    <div>
      <nav>
        <Link href="/">{t('backToTree')}</Link>
      </nav>
      <h1>{lesson.title}</h1>
      {lesson.prerequisites.length > 0 && (
        <p>
          {t('buildsOn')}{' '}
          {lesson.prerequisites.map((p, index) => (
            <span key={p.id}>
              {index > 0 && ', '}
              <Link href={`/lesson/${p.id}`}>{p.title}</Link> ({p.done ? t('prerequisiteDone') : t('prerequisiteNotDone')})
            </span>
          ))}
        </p>
      )}
      {lesson.explanation && <p>{lesson.explanation}</p>}
      {lesson.examples && lesson.examples.length > 0 && (
        <div>
          <h2>{t('examples')}</h2>
          <ul>
            {lesson.examples.map((example, index) => (
              <li key={index}>{example}</li>
            ))}
          </ul>
        </div>
      )}

      {lesson.exercises.length === 0 ? (
        lesson.completed ? (
          <p>{t('done')}</p>
        ) : (
          <div>
            <button type="button" disabled={marking} onClick={() => markDone(lesson)}>
              {t('markDone')}
            </button>
            {markError && <p role="alert">{markError}</p>}
          </div>
        )
      ) : !run ? (
        <button type="button" onClick={() => startRun(lesson)}>
          {lesson.completed ? t('practiceAgain') : lesson.passedExerciseIds.length > 0 ? t('continue') : t('start')}
        </button>
      ) : current ? (
        <div>
          <p>{t('progress', { passed: run.passed, total: run.total })}</p>
          {run.practice && <p>{t('practiceNote')}</p>}
          <ExerciseCard
            key={turn}
            exercise={current}
            source="lesson"
            onAnswered={handleAnswered}
            onNext={() => advance(lastPassed)}
            onSkip={() => advance(false)}
            onAskAi={askAi}
          />
        </div>
      ) : (
        <div>
          <p>{run.practice ? t('practiceFinished') : completedNow ? t('completedNow') : t('allPassed')}</p>
          <Link href="/">{t('backToTree')}</Link> <Link href="/queue">{t('toQueue')}</Link>
        </div>
      )}

      <LessonChat
        lessonId={lesson.id}
        open={chatOpen}
        onToggle={() => setChatOpen((open) => !open)}
        askAbout={askAbout}
        onClearAskAbout={() => setAskAbout(null)}
      />
    </div>
  );
}
```

Create `app/lesson/[id]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { LessonPage } from '@/components/tutoring/LessonPage';

export const dynamic = 'force-dynamic';

export default function Lesson({ params }: { params: { id: string } }) {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <LessonPage lessonId={params.id} />;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/LessonPage.test.tsx "app/lesson/[id]/page.test.tsx" messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/LessonPage.tsx components/tutoring/LessonPage.test.tsx "app/lesson/[id]" messages/en.json messages/de.json
git commit -m "feat: add the lesson page with a retry round and the lesson chat"
```

---
### Task 13: The curriculum tree on the home page

**Files:**
- Create: `components/tutoring/CurriculumTree.tsx`, `components/tutoring/CurriculumTree.test.tsx`, `components/home/HomeScreen.tsx`, `components/home/HomeScreen.test.tsx`
- Modify: `components/home/HomeNotices.tsx`, `components/home/HomeNotices.test.tsx`, `components/home/HomeIntro.tsx`, `components/home/HomeIntro.test.tsx`, `app/page.tsx`, `app/page.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/tutoring/tree` (Task 8), `CurriculumTree` type (Task 5), `HomeNotices` (Plan 1A).
- Produces:
  - `CurriculumTree` component with props `{ reloadKey: number }`. It refetches whenever `reloadKey` changes.
  - `HomeScreen`, which renders the notices and the tree, and reloads the tree after a notice changes the profile.
  - `HomeNotices` gains an optional `onChange?: (profile: Profile) => void`.
  - The `tree` catalog namespace.
  - `home.dailyQueue` replaces `home.intro`.

- [ ] **Step 1: Update the catalog text**

In `messages/en.json`, replace the `home` namespace with:

```json
  "home": {
    "title": "German AI Tutor",
    "dailyQueue": "Daily review",
    "settings": "Settings"
  },
```

and add, directly after the `lesson` namespace:

```json
  "tree": {
    "heading": "{track} {level}",
    "loadFailed": "Could not load your lessons. Please reload the page.",
    "empty": "There are no lessons at this level yet.",
    "status": {
      "not_started": "Not started",
      "in_progress": "In progress",
      "complete": "Complete",
      "covered": "Covered"
    },
    "coveredVia": "Covered via {track}",
    "buildsOn": "Builds on: {lessons}"
  },
```

In `messages/de.json`, replace the `home` namespace with:

```json
  "home": {
    "title": "German AI Tutor",
    "dailyQueue": "Tägliche Wiederholung",
    "settings": "Einstellungen"
  },
```

and add, directly after its `lesson` namespace:

```json
  "tree": {
    "heading": "{track} {level}",
    "loadFailed": "Deine Lektionen konnten nicht geladen werden. Bitte lade die Seite neu.",
    "empty": "Auf diesem Niveau gibt es noch keine Lektionen.",
    "status": {
      "not_started": "Nicht begonnen",
      "in_progress": "Begonnen",
      "complete": "Abgeschlossen",
      "covered": "Abgedeckt"
    },
    "coveredVia": "Abgedeckt über {track}",
    "buildsOn": "Baut auf: {lessons}"
  },
```

- [ ] **Step 2: Write the tests**

Create `components/tutoring/CurriculumTree.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { CurriculumTree } from './CurriculumTree';

const TREE = {
  track: 'generic',
  level: 'A1',
  milestones: [
    {
      id: 'm1',
      title: 'Basics',
      sections: [
        {
          id: 's1',
          title: 'Greetings',
          lessons: [
            { id: 'a1-greet', title: 'Saying hello', skill: 'vocabulary', status: 'complete', coveredVia: null, missingPrerequisites: [] },
            {
              id: 'a1-sein',
              title: 'The verb sein',
              skill: 'grammar',
              status: 'in_progress',
              coveredVia: null,
              missingPrerequisites: [{ id: 'a1-pronouns', title: 'Pronouns' }],
            },
            { id: 'a1-bye', title: 'Saying goodbye', skill: 'vocabulary', status: 'covered', coveredVia: 'goethe', missingPrerequisites: [] },
          ],
        },
      ],
    },
  ],
};

function stubTree(response: () => Promise<unknown>) {
  const fetchMock = vi.fn(() => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CurriculumTree', () => {
  it('shows milestones, sections, and each lesson with its status and warnings', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);

    expect(await screen.findByRole('heading', { name: 'Generic A1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/lesson/a1-greet');
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Builds on: Pronouns')).toBeInTheDocument();
    expect(screen.getByText('Covered via Goethe')).toBeInTheDocument();
  });

  it('says when a level has no lessons yet', async () => {
    stubTree(() => delayedResponse({ track: 'telc', level: 'A1', milestones: [] }));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('There are no lessons at this level yet.')).toBeInTheDocument();
  });

  it('shows an error when the tree cannot load', async () => {
    stubTree(() => delayedResponse({}, { ok: false, status: 500 }));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your lessons. Please reload the page.');
  });

  it('renders in German', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />, 'de');
    expect(await screen.findByRole('heading', { name: 'Allgemein A1' })).toBeInTheDocument();
    expect(screen.getByText('Abgedeckt über Goethe')).toBeInTheDocument();
  });
});
```

Create `components/home/HomeScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { HomeScreen } from './HomeScreen';

const TREE = { track: 'generic', level: 'A1', milestones: [] };

describe('HomeScreen', () => {
  it('reloads the tree after switching to a newly unlocked level', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/profile') return delayedResponse({ placementStatus: 'taken', unlockNoticeLevel: 'A2' });
      if (url === '/api/tutoring/unlock-notice') return delayedResponse({ placementStatus: 'taken', unlockNoticeLevel: null });
      if (url === '/api/tutoring/tree') return delayedResponse(TREE);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const treeCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/tutoring/tree').length;

    renderWithIntl(<HomeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch' }));

    await waitFor(() => expect(treeCalls()).toBe(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument());
  });
});
```

Append to `components/home/HomeNotices.test.tsx`, inside its `describe`:

```tsx
  it('reports the changed profile to its parent', async () => {
    stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse({ ...BASE_PROFILE, activeLevel: 'A2' }),
    });
    const onChange = vi.fn();
    renderWithIntl(<HomeNotices onChange={onChange} />);
    fireEvent.click(await screen.findByText('Switch'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...BASE_PROFILE, activeLevel: 'A2' }));
  });
```

Replace `components/home/HomeIntro.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { HomeIntro } from './HomeIntro';

describe('HomeIntro', () => {
  it('renders the title and links to the Daily review and Settings', () => {
    renderWithIntl(<HomeIntro />);
    expect(screen.getByRole('heading', { name: 'German AI Tutor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Daily review' })).toHaveAttribute('href', '/queue');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders in German', () => {
    renderWithIntl(<HomeIntro />, 'de');
    expect(screen.getByRole('link', { name: 'Tägliche Wiederholung' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
  });
});
```

In `app/page.test.tsx`, replace the line `vi.mock('@/components/home/HomeNotices', () => ({ HomeNotices: () => null }));` with:

```tsx
vi.mock('@/components/home/HomeScreen', () => ({ HomeScreen: () => null }));
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/CurriculumTree.test.tsx components/home app/page.test.tsx`
Expected: FAIL. `CurriculumTree` and `HomeScreen` don't exist, `onChange` is never called, and the Daily review link is missing.

- [ ] **Step 4: Implement**

Create `components/tutoring/CurriculumTree.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CurriculumTree as CurriculumTreeData } from '@/lib/tutoring/progressTypes';

// Spec: Pages and Navigation, `/`. Every lesson stays clickable; unfinished prerequisites are a
// warning only.
export function CurriculumTree({ reloadKey }: { reloadKey: number }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const [tree, setTree] = useState<CurriculumTreeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/tree')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as CurriculumTreeData;
        if (!cancelled) {
          setTree(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (failed) return <p role="alert">{t('loadFailed')}</p>;
  if (!tree) return <p>{tCommon('loading')}</p>;

  const empty = tree.milestones.every((m) => m.sections.every((s) => s.lessons.length === 0));
  return (
    <div>
      <h2>{t('heading', { track: tTracks(tree.track), level: tree.level })}</h2>
      {empty && <p>{t('empty')}</p>}
      {tree.milestones.map((milestone) => (
        <section key={milestone.id}>
          <h3>{milestone.title}</h3>
          {milestone.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.title}</h4>
              <ul>
                {section.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/lesson/${lesson.id}`}>{lesson.title}</Link> —{' '}
                    <span>
                      {lesson.coveredVia
                        ? t('coveredVia', { track: tTracks(lesson.coveredVia) })
                        : t(`status.${lesson.status}`)}
                    </span>
                    {lesson.missingPrerequisites.length > 0 && (
                      <p>{t('buildsOn', { lessons: lesson.missingPrerequisites.map((p) => p.title).join(', ') })}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

Create `components/home/HomeScreen.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { HomeNotices } from './HomeNotices';
import { CurriculumTree } from '@/components/tutoring/CurriculumTree';

// Switching to an unlocked level changes which tree to show, so a notice action reloads it.
export function HomeScreen() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <HomeNotices onChange={() => setReloadKey((key) => key + 1)} />
      <CurriculumTree reloadKey={reloadKey} />
    </>
  );
}
```

In `components/home/HomeNotices.tsx`:
- Change the signature to `export function HomeNotices({ onChange }: { onChange?: (profile: Profile) => void } = {}) {`.
- In `post`, replace `setProfile(await res.json());` with:

```tsx
      const updated = (await res.json()) as Profile;
      setProfile(updated);
      onChange?.(updated);
```

Replace `components/home/HomeIntro.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function HomeIntro() {
  const t = useTranslations('home');
  return (
    <div>
      <h1>{t('title')}</h1>
      <nav>
        <Link href="/queue" aria-label={t('dailyQueue')} title={t('dailyQueue')}>
          🗓
        </Link>{' '}
        <Link href="/settings">{t('settings')}</Link>
      </nav>
    </div>
  );
}
```

Replace `app/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ActiveProviderBanner } from '@/components/ActiveProviderBanner';
import { HomeIntro } from '@/components/home/HomeIntro';
import { HomeScreen } from '@/components/home/HomeScreen';

// Reads the DB on every request; without this Next would evaluate it at build
// time and freeze the onboarding gate into the static output.
export const dynamic = 'force-dynamic';

export default function Home() {
  const profile = createProfileService(getDb()).getProfile();
  if (!profile.onboardingComplete) {
    redirect('/onboarding');
  }
  return (
    <div>
      <ActiveProviderBanner />
      <HomeIntro />
      <HomeScreen />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/CurriculumTree.test.tsx components/home app/page.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/CurriculumTree.tsx components/tutoring/CurriculumTree.test.tsx components/home app/page.tsx app/page.test.tsx messages/en.json messages/de.json
git commit -m "feat: show the curriculum tree on the home page"
```

---

### Task 14: The Daily Queue page

**Files:**
- Create: `app/queue/page.tsx`, `app/queue/page.test.tsx`, `components/tutoring/QueuePage.tsx`, `components/tutoring/QueuePage.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/tutoring/queue` (Task 8), `DailyQueue` and `QueueItem` (Task 5), `ExerciseCard` (Task 10), `LessonChat` and `AskAbout` (Task 11).
- Produces: the `/queue` page, the `QueuePage` component, and the `queue` catalog namespace.

- [ ] **Step 1: Add the catalog text**

Add to `messages/en.json`, directly after the `tree` namespace:

```json
  "queue": {
    "title": "Daily review",
    "backToTree": "Back to your lessons",
    "loadFailed": "Could not load today’s reviews. Please reload the page.",
    "remaining": "{count, plural, one {# review left today} other {# reviews left today}}",
    "fromLesson": "From the lesson: {lesson}",
    "thisReview": "this review",
    "allDone": "All done for today. Well done!",
    "nothingDue": "Nothing to review right now.",
    "capReached": "You reached today’s review limit. The rest wait until tomorrow.",
    "nextLesson": "Next lesson",
    "noSuggestion": "You have finished every lesson at this level."
  },
```

and to `messages/de.json`, directly after its `tree` namespace:

```json
  "queue": {
    "title": "Tägliche Wiederholung",
    "backToTree": "Zurück zu deinen Lektionen",
    "loadFailed": "Die heutigen Wiederholungen konnten nicht geladen werden. Bitte lade die Seite neu.",
    "remaining": "Heute noch {count, plural, one {# Wiederholung} other {# Wiederholungen}}",
    "fromLesson": "Aus der Lektion: {lesson}",
    "thisReview": "diese Wiederholung",
    "allDone": "Für heute ist alles erledigt. Gut gemacht!",
    "nothingDue": "Gerade gibt es nichts zu wiederholen.",
    "capReached": "Du hast dein Tageslimit erreicht. Der Rest wartet bis morgen.",
    "nextLesson": "Nächste Lektion",
    "noSuggestion": "Du hast alle Lektionen auf diesem Niveau abgeschlossen."
  },
```

- [ ] **Step 2: Write the tests**

Create `app/queue/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockGetProfile } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetProfile: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/components/tutoring/QueuePage', () => ({ QueuePage: () => null }));

import Queue from './page';

describe('Queue page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Queue();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the queue otherwise', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(Queue()).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

Create `components/tutoring/QueuePage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { QueuePage } from './QueuePage';

const QUEUE = {
  track: 'generic',
  level: 'A1',
  cap: 50,
  answeredToday: 0,
  items: [
    {
      lessonId: 'a1-greet',
      lessonTitle: 'Saying hello',
      exercise: { id: 'ex1', type: 'multiple_choice', question: 'Greeting?', options: ['Hallo', 'Tschüss'] },
    },
    { lessonId: 'a1-sein', lessonTitle: 'The verb sein', exercise: { id: 'ex2', type: 'fill_blank', textWithBlank: 'Ich ___ müde.' } },
  ],
  suggestedLesson: { id: 'a1-bye', title: 'Saying goodbye' },
};

const OUTCOME = {
  result: 'correct',
  correctAnswer: 'x',
  feedback: null,
  passedExerciseIds: [],
  lessonCompleted: true,
  justCompleted: false,
};

function stubFetch(queue: unknown, options: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url === '/api/tutoring/queue') return delayedResponse(queue, options);
    if (url === '/api/tutoring/attempts') return delayedResponse(OUTCOME);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('QueuePage', () => {
  it('works through the due reviews one at a time, then suggests the next lesson', async () => {
    const fetchMock = stubFetch(QUEUE);
    renderWithIntl(<QueuePage />);

    expect(await screen.findByText('2 reviews left today')).toBeInTheDocument();
    expect(screen.getByText('From the lesson: Saying hello')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByText('1 review left today')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'bin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByText('All done for today. Well done!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying goodbye' })).toHaveAttribute('href', '/lesson/a1-bye');
    const attemptBody = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/tutoring/attempts')?.[1]?.body as string);
    expect(attemptBody).toMatchObject({ exerciseId: 'ex1', source: 'queue' });
  });

  it('says when nothing is due', async () => {
    stubFetch({ ...QUEUE, items: [] });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
  });

  it('says when the daily limit is reached, and when every lesson is done', async () => {
    stubFetch({ ...QUEUE, items: [], answeredToday: 50, suggestedLesson: null });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByText('You reached today’s review limit. The rest wait until tomorrow.')).toBeInTheDocument();
    expect(screen.getByText('You have finished every lesson at this level.')).toBeInTheDocument();
  });

  it('shows an error when the queue cannot load', async () => {
    stubFetch({}, { ok: false, status: 500 });
    renderWithIntl(<QueuePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load today’s reviews. Please reload the page.');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/QueuePage.test.tsx app/queue/page.test.tsx`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 4: Implement**

Create `components/tutoring/QueuePage.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DailyQueue, QueueItem } from '@/lib/tutoring/progressTypes';
import { ExerciseCard } from './ExerciseCard';
import { LessonChat, type AskAbout } from './LessonChat';

// Spec: Pages and Navigation, `/queue` — due reviews one at a time, with the same grading and
// "Ask AI" as inside a lesson, then one suggested next lesson.
export function QueuePage() {
  const t = useTranslations('queue');
  const tCommon = useTranslations('common');
  const [queue, setQueue] = useState<DailyQueue | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [answered, setAnswered] = useState(0);
  const [turn, setTurn] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [askAbout, setAskAbout] = useState<AskAbout | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/queue')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as DailyQueue;
        if (cancelled) return;
        setQueue(data);
        setPending(data.items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function moveOn() {
    setTurn((n) => n + 1);
    setChatOpen(false);
    setAskAbout(null);
  }

  function next() {
    setPending((items) => items.slice(1));
    moveOn();
  }

  // A review whose free-text grading failed goes to the back of today's queue.
  function skip() {
    setPending((items) => (items.length > 1 ? [...items.slice(1), items[0]] : items));
    moveOn();
  }

  if (failed) return <p role="alert">{t('loadFailed')}</p>;
  if (!queue) return <p>{tCommon('loading')}</p>;

  const current = pending[0] ?? null;
  return (
    <div>
      <nav>
        <Link href="/">{t('backToTree')}</Link>
      </nav>
      <h1>{t('title')}</h1>
      {current ? (
        <div>
          <p>{t('remaining', { count: pending.length })}</p>
          <p>{t('fromLesson', { lesson: current.lessonTitle })}</p>
          <ExerciseCard
            key={turn}
            exercise={current.exercise}
            source="queue"
            onAnswered={() => setAnswered((n) => n + 1)}
            onNext={next}
            onSkip={skip}
            onAskAi={(exerciseId) => {
              setAskAbout({ exerciseId, label: t('thisReview') });
              setChatOpen(true);
            }}
          />
          <LessonChat
            key={current.lessonId}
            lessonId={current.lessonId}
            open={chatOpen}
            onToggle={() => setChatOpen((open) => !open)}
            askAbout={askAbout}
            onClearAskAbout={() => setAskAbout(null)}
          />
        </div>
      ) : (
        <p>{answered > 0 ? t('allDone') : queue.answeredToday >= queue.cap ? t('capReached') : t('nothingDue')}</p>
      )}
      <h2>{t('nextLesson')}</h2>
      {queue.suggestedLesson ? (
        <Link href={`/lesson/${queue.suggestedLesson.id}`}>{queue.suggestedLesson.title}</Link>
      ) : (
        <p>{t('noSuggestion')}</p>
      )}
    </div>
  );
}
```

Create `app/queue/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { QueuePage } from '@/components/tutoring/QueuePage';

export const dynamic = 'force-dynamic';

export default function Queue() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <QueuePage />;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/QueuePage.test.tsx app/queue/page.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/QueuePage.tsx components/tutoring/QueuePage.test.tsx app/queue messages/en.json messages/de.json
git commit -m "feat: add the Daily Queue page"
```

---
### Task 15: The daily review limit in Settings

**Files:**
- Modify: `components/settings/SettingsPage.tsx`, `components/settings/SettingsPage.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `Profile.dailyReviewCap` and `PATCH /api/profile` with `{ dailyReviewCap }` (Task 1).
- Produces: a "Daily review limit" number field in Settings, holding whole numbers from 1 to 500. It saves when it loses focus.

- [ ] **Step 1: Add the catalog text**

In `messages/en.json`, add these keys to the `settings` namespace, directly after `"levelHint"`:

```json
    "dailyReview": "Daily review",
    "dailyReviewLimit": "Daily review limit",
    "dailyReviewHint": "How many reviews the daily review shows per day (1–500). The rest wait until tomorrow.",
    "dailyReviewInvalid": "Enter a whole number from 1 to 500.",
```

In `messages/de.json`, add the same keys to its `settings` namespace, directly after `"levelHint"`:

```json
    "dailyReview": "Tägliche Wiederholung",
    "dailyReviewLimit": "Tageslimit für Wiederholungen",
    "dailyReviewHint": "So viele Wiederholungen zeigt die tägliche Wiederholung pro Tag (1–500). Der Rest wartet bis morgen.",
    "dailyReviewInvalid": "Gib eine ganze Zahl von 1 bis 500 ein.",
```

- [ ] **Step 2: Write the tests**

In `components/settings/SettingsPage.test.tsx`, add `dailyReviewCap: 50,` to the `PROFILE` fixture, directly after `onboardingChoicesSaved: true,`. Then append inside the `describe('SettingsPage', ...)` block:

```tsx
  it('saves a new daily review limit when the field loses focus', async () => {
    const fetchMock = stubFetch({ 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, dailyReviewCap: 30 }) } });
    renderWithIntl(<SettingsPage />);
    const field = await screen.findByLabelText('Daily review limit');
    expect(field).toHaveValue(50);

    fireEvent.change(field, { target: { value: '30' } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyReviewCap: 30 }),
      })
    );
    await waitFor(() => expect(field).toHaveValue(30));
  });

  it('rejects a daily review limit outside 1–500 without saving it', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<SettingsPage />);
    const field = await screen.findByLabelText('Daily review limit');

    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.blur(field);

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 500.');
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/settings/SettingsPage.test.tsx`
Expected: FAIL, with the error "Unable to find a label with the text of: Daily review limit".

- [ ] **Step 4: Implement**

In `components/settings/SettingsPage.tsx`:

(a) Add these state hooks next to the other `useState` calls:

```tsx
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
```

(b) Add this function directly after `handleProfileChange`:

```tsx
  // Saved on blur, so typing "3" on the way to "30" doesn't save 3.
  async function saveDailyReviewCap() {
    if (capDraft === null || !profile) return;
    const value = Number(capDraft);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setCapError(t('dailyReviewInvalid'));
      return;
    }
    setCapError(null);
    setCapDraft(null);
    if (value !== profile.dailyReviewCap) await handleProfileChange({ dailyReviewCap: value });
  }
```

(c) Insert this section directly before the section that starts with `<h2>{t('placement')}</h2>`:

```tsx
      <section>
        <h2>{t('dailyReview')}</h2>
        <label>
          {t('dailyReviewLimit')}{' '}
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={capDraft ?? String(profile.dailyReviewCap)}
            onChange={(e) => setCapDraft(e.target.value)}
            onBlur={saveDailyReviewCap}
          />
        </label>
        <p>{t('dailyReviewHint')}</p>
        {capError && <p role="alert">{capError}</p>}
      </section>

```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/settings/SettingsPage.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/settings/SettingsPage.tsx components/settings/SettingsPage.test.tsx messages/en.json messages/de.json
git commit -m "feat: let the student set the daily review limit in Settings"
```

---

### Task 16: Visible errors for the remaining Settings and onboarding requests

Plan 1A left some older provider, backup, and reset requests without a `res.ok` check (1A final review, carried to 1B). The spec requires one on every client fetch, so each of those requests now shows an alert when it fails. The per-connection usage totals stay a quiet background display: a failed usage request shows zeros, not an alert, following Plan 1A's ruling for the provider banner's background poll.

**Files:**
- Modify: `components/settings/SettingsPage.tsx`, `components/settings/SettingsPage.test.tsx`, `components/onboarding/OnboardingWizard.tsx`, `components/onboarding/OnboardingWizard.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Produces: new `settings` keys `providersLoadFailed`, `actionFailed`, `modelSaveFailed`, `exportFailed`, `importFailed`, `importDone`, `resetFailed`, and the `onboarding` key `modelSaveFailed`. There are no new props or routes.

- [ ] **Step 1: Add the catalog text**

In `messages/en.json`, add to the `settings` namespace directly after `"dailyReviewInvalid"`:

```json
    "providersLoadFailed": "Could not load your AI providers.",
    "actionFailed": "Could not complete that: {error}",
    "modelSaveFailed": "Could not save the model. Please try again.",
    "exportFailed": "Could not export the backup. Please try again.",
    "importFailed": "Could not restore the backup: {error}",
    "importDone": "Backup restored. Reload the page to see the restored data.",
    "resetFailed": "Could not reset the app data. Please try again.",
```

and to the `onboarding` namespace, directly after `"finishFailed"`, add `,` to the end of that line and then:

```json
    "modelSaveFailed": "Could not save the model. Please try again."
```

In `messages/de.json`, add to the `settings` namespace directly after `"dailyReviewInvalid"`:

```json
    "providersLoadFailed": "Deine KI-Anbieter konnten nicht geladen werden.",
    "actionFailed": "Das hat nicht geklappt: {error}",
    "modelSaveFailed": "Das Modell konnte nicht gespeichert werden. Bitte versuch es noch einmal.",
    "exportFailed": "Die Sicherung konnte nicht exportiert werden. Bitte versuch es noch einmal.",
    "importFailed": "Die Sicherung konnte nicht wiederhergestellt werden: {error}",
    "importDone": "Sicherung wiederhergestellt. Lade die Seite neu, um die Daten zu sehen.",
    "resetFailed": "Die App-Daten konnten nicht zurückgesetzt werden. Bitte versuch es noch einmal.",
```

and to its `onboarding` namespace, the same way:

```json
    "modelSaveFailed": "Das Modell konnte nicht gespeichert werden. Bitte versuch es noch einmal."
```

- [ ] **Step 2: Write the tests**

Append inside `describe('SettingsPage', ...)` in `components/settings/SettingsPage.test.tsx`:

```tsx
  const CONNECTION = {
    id: 3,
    providerType: 'ollama',
    label: null,
    ollamaHost: 'http://localhost:11434',
    selectedModel: 'llama',
    isActive: false,
    lastValidatedStatus: 'valid',
    lastValidatedAt: null,
    lastError: null,
    createdAt: '',
  };

  it('shows an error when a provider action fails', async () => {
    stubFetch({
      'GET /api/providers': { ok: true, json: async () => [CONNECTION] },
      'PUT /api/providers/active': { ok: false, status: 500, json: async () => ({ error: 'boom' }) },
    });
    renderWithIntl(<SettingsPage />);
    fireEvent.click(await screen.findByText('Make active'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete that: boom');
  });

  it('shows an error when the providers cannot load', async () => {
    stubFetch({ 'GET /api/providers': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your AI providers.');
  });

  it('confirms a restored backup, and says why a restore failed', async () => {
    stubFetch({ 'POST /api/backup/import': { ok: true, json: async () => ({ ok: true }) } });
    const { container } = renderWithIntl(<SettingsPage />);
    await screen.findByText('Export backup');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['x'], 'backup.gaitbackup')] } });
    expect(await screen.findByText('Backup restored. Reload the page to see the restored data.')).toBeInTheDocument();

    stubFetch({ 'POST /api/backup/import': { ok: false, status: 400, json: async () => ({ error: 'Not a backup file' }) } });
    fireEvent.change(input, { target: { files: [new File(['y'], 'other.gaitbackup')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore the backup: Not a backup file');
  });

  it('shows an error and stays when the reset fails', async () => {
    stubFetch({ 'POST /api/reset': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.click(await screen.findByText('Reset app data'));
    fireEvent.click(screen.getByText('Yes, reset everything'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reset the app data. Please try again.');
  });
```

Append inside `describe('OnboardingWizard', ...)` in `components/onboarding/OnboardingWizard.test.tsx`:

```tsx
  it('shows an error when the working connection cannot be made active', async () => {
    stubFetch({ '/api/providers/active': { ok: false, json: async () => ({}) } });
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save provider connection'));
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('stays on the provider step when the chosen model cannot be saved', async () => {
    stubFetch({ '/api/providers/1': { ok: false, json: async () => ({}) } });
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the model. Please try again.');
    expect(screen.getByText('Test connection')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/settings/SettingsPage.test.tsx components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL. None of the new alerts appear.

- [ ] **Step 4: Settings: check every request**

In `components/settings/SettingsPage.tsx`:

(a) Add these state hooks next to the others:

```tsx
  const [providersFailed, setProvidersFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);
```

(b) In the first `useEffect`, replace `fetch('/api/providers').then((r) => r.json()).then(setConnections);` with:

```tsx
    fetch('/api/providers')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setConnections(await res.json());
      })
      .catch(() => setProvidersFailed(true));
```

(c) In the usage `useEffect`, directly after `const res = await fetch(...)`, add:

```tsx
        // Usage is a quiet background display: a failed request shows zeros, not an alert.
        if (!res.ok) return [c.id, { requestCount: 0, tokenCount: 0 }] as const;
```

(d) Replace `refreshConnections`, `handleSetActive`, `handleRetest`, and `handleDelete` with:

```tsx
  async function refreshConnections() {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) throw new Error(String(res.status));
      setConnections(await res.json());
      setProvidersFailed(false);
    } catch {
      setProvidersFailed(true);
    }
  }

  // Provider buttons show an alert when their request fails, instead of silently doing nothing.
  async function providerAction(url: string, init: RequestInit) {
    setActionError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(t('actionFailed', { error: data.error ?? String(res.status) }));
      }
    } catch (err) {
      setActionError(t('actionFailed', { error: (err as Error).message }));
    }
    await refreshConnections();
  }

  function handleSetActive(id: number) {
    return providerAction('/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  function handleRetest(id: number) {
    return providerAction(`/api/providers/${id}/test`, { method: 'POST' });
  }

  function handleDelete(id: number) {
    return providerAction(`/api/providers/${id}`, { method: 'DELETE' });
  }
```

(e) Replace `handleSaveModel`, `handleExport`, `handleImport`, and `handleReset` with:

```tsx
  async function handleSaveModel() {
    setModelSaveError(null);
    if (addedConnectionId !== null && newSelectedModel) {
      try {
        const res = await fetch(`/api/providers/${addedConnectionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedModel: newSelectedModel }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setModelSaveError(t('modelSaveFailed'));
        return;
      }
      await refreshConnections();
    }
    closeAddProvider();
  }

  async function handleExport() {
    setBackupError(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'germanaitutor-backup.gaitbackup';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBackupError(t('exportFailed'));
    }
  }

  async function handleImport(file: File) {
    setBackupError(null);
    setImportMessage(null);
    try {
      const res = await fetch('/api/backup/import', { method: 'POST', body: file });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBackupError(t('importFailed', { error: data.error ?? String(res.status) }));
        return;
      }
      setImportMessage(t('importDone'));
    } catch (err) {
      setBackupError(t('importFailed', { error: (err as Error).message }));
    }
  }

  async function handleReset() {
    setResetError(null);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setResetError(t('resetFailed'));
      return;
    }
    setConfirmingReset(false);
    window.location.href = '/onboarding';
  }
```

(f) Render the new messages:
- In the providers section, directly after `<h2>{t('providers')}</h2>`, add:

```tsx
        {providersFailed && <p role="alert">{t('providersLoadFailed')}</p>}
        {actionError && <p role="alert">{actionError}</p>}
```

- In the backup section, directly after the file `<input ... />`, add:

```tsx
        {backupError && <p role="alert">{backupError}</p>}
        {importMessage && <p>{importMessage}</p>}
```

- In the danger-zone section, directly before its closing `</section>`, add:

```tsx
        {resetError && <p role="alert">{resetError}</p>}
```

- In the model picker, directly after `<button onClick={handleSaveModel}>{t('done')}</button>`, add:

```tsx
            {modelSaveError && <p role="alert">{modelSaveError}</p>}
```

- In `closeAddProvider`, add `setModelSaveError(null);` next to the other resets.

- [ ] **Step 5: Onboarding: check every request**

In `components/onboarding/OnboardingWizard.tsx`:

(a) Add a state hook: `const [providerNextError, setProviderNextError] = useState<string | null>(null);`

(b) Replace `handleConnectAndTest` and `handleProviderNext` with:

```tsx
  async function handleConnectAndTest() {
    setSaving(true);
    setTestError(null);
    try {
      const body = providerType === 'ollama' ? { providerType, ollamaHost } : { providerType, apiKey };
      const createRes = await fetch('/api/providers', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!createRes.ok) {
        setTestError(t('saveFailed'));
        return;
      }
      const created = await createRes.json();
      const testRes = await fetch(`/api/providers/${created.id}/test`, { method: 'POST' });
      if (!testRes.ok) {
        setTestError(t('connectionFailed'));
        return;
      }
      const result = await testRes.json();
      if (!result.ok) {
        setTestError(result.error ?? t('connectionFailed'));
        return;
      }
      const activeRes = await fetch('/api/providers/active', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: created.id }),
      });
      if (!activeRes.ok) {
        setTestError(t('saveFailed'));
        return;
      }
      setValidated(true);
      setConnectionId(created.id);
      await loadModels(created.id);
    } catch {
      setTestError(t('connectionFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleProviderNext() {
    setProviderNextError(null);
    if (connectionId !== null && selectedModel) {
      try {
        const res = await fetch(`/api/providers/${connectionId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ selectedModel }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setProviderNextError(t('modelSaveFailed'));
        return;
      }
    }
    setStep('track');
  }
```

(c) In the provider step, directly after its Next button, add:

```tsx
        {providerNextError && <p role="alert">{providerNextError}</p>}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/settings/SettingsPage.test.tsx components/onboarding/OnboardingWizard.test.tsx messages/catalogs.test.ts`
Expected: PASS with no warnings, and every existing test in both files still passes. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add components/settings/SettingsPage.tsx components/settings/SettingsPage.test.tsx components/onboarding/OnboardingWizard.tsx components/onboarding/OnboardingWizard.test.tsx messages/en.json messages/de.json
git commit -m "fix: show an error for every failed Settings and onboarding request"
```

---

### Task 17: Placement follow-ups

These are the placement items the Plan 1A final review deferred to 1B:
- The end screen offers "Switch to it?" after a higher retake, which the spec asks for there.
- The test returns to its start when the attempt in progress is gone (a 409 from answer or stop).
- The three placement routes share one error mapping.
- Two tests that were missing: a tie keeps the old best, and only one of two simultaneous answers counts.

**Files:**
- Create: `app/api/placement/respond.ts`
- Modify:
  - `app/api/placement/start/route.ts`, `app/api/placement/answer/route.ts`, `app/api/placement/stop/route.ts`
  - `lib/tutoring/placementTypes.ts`
  - `lib/services/placementService.ts`, `lib/services/placementService.test.ts`
  - `components/placement/PlacementTest.tsx`, `components/placement/PlacementTest.test.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Produces:
  - `PlacementOutcome.unlockOffer: CefrLevel | null`. On a retake that raised the unlock, it is the newly unlocked level; otherwise it is `null`.
  - `respondWithPlacementErrors(run: () => unknown): Promise<NextResponse>`.
  - New `placement` catalog keys: `switchOffer`, `switch`, `switched`, `sessionLost`.

- [ ] **Step 1: Add the catalog text**

In `messages/en.json`, add to the `placement` namespace, directly after `"continue"`. Put a comma after the `"continue"` line, and none after the last new key:

```json
    "switchOffer": "{level} is now unlocked. Switch to it?",
    "switch": "Switch",
    "switched": "Switched to {level}.",
    "sessionLost": "The test was interrupted, so it starts again from the first question."
```

In `messages/de.json`, do the same:

```json
    "switchOffer": "{level} ist jetzt freigeschaltet. Dorthin wechseln?",
    "switch": "Wechseln",
    "switched": "Zu {level} gewechselt.",
    "sessionLost": "Der Test wurde unterbrochen und beginnt wieder mit der ersten Frage."
```

- [ ] **Step 2: Write the tests**

Append inside the top-level `describe` of `lib/services/placementService.test.ts`:

```ts
  it('offers the newly unlocked level after a higher retake, and nothing otherwise', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    const first = service.stop();
    expect(first.status === 'finished' && first.outcome.unlockOffer).toBeNull();

    const higher = await answerInOrder(service, exam, exam.length);
    expect(higher).toMatchObject({ outcome: { placedLevel: 'C1', unlockOffer: 'C1' } });

    const lower = await answerInOrder(service, exam, 0);
    expect(lower).toMatchObject({ outcome: { unlockOffer: null } });
  });

  it('a retake with the same score keeps the earlier best result', async () => {
    const { db, service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    service.stop();
    db.prepare("UPDATE placement_best_result SET taken_at = '2026-01-01 00:00:00'").run();

    await answerInOrder(service, exam, 2, 2);
    expect(service.stop()).toMatchObject({ outcome: { isNewBest: false } });
    expect(service.getBestResult()).toMatchObject({ score: 2, takenAt: '2026-01-01 00:00:00' });
  });

  it('accepts only one of two simultaneous answers to the same question', async () => {
    const gradeFreeText = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true as const, result: 'correct' as const, feedback: 'Gut.' };
    });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();

    const answer = { type: 'free_text' as const, text: 'Ich schreibe.' };
    const results = await Promise.allSettled([service.answer('free', answer), service.answer('free', answer)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { kind: 'bad_request' } });
  });
```

Append inside the `describe` of `components/placement/PlacementTest.test.tsx`:

```tsx
  it('goes back to the start when the test in progress is gone', async () => {
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/stop': () => delayedResponse({ error: 'No placement test is in progress' }, { ok: false, status: 409 }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    fireEvent.click(await screen.findByText('Beyond my knowledge'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The test was interrupted, so it starts again from the first question.'
    );
    expect(screen.getByText('Start the test')).toBeInTheDocument();
  });

  it('offers to switch to a level that a retake unlocked', async () => {
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/stop': () =>
        delayedResponse({ status: 'finished', outcome: { ...OUTCOME, placedLevel: 'B2', unlockOffer: 'B2' } }),
      '/api/tutoring/unlock-notice': () => delayedResponse({}),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    fireEvent.click(await screen.findByText('Beyond my knowledge'));

    expect(await screen.findByText('B2 is now unlocked. Switch to it?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(await screen.findByText('Switched to B2.')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/services/placementService.test.ts components/placement/PlacementTest.test.tsx`
Expected: FAIL. `unlockOffer` is undefined, and the 409 and switch texts are missing. The tie and double-submit tests already pass, since they only cover existing behavior.

- [ ] **Step 4: Implement the service change**

In `lib/tutoring/placementTypes.ts`, add `unlockOffer: CefrLevel | null;` to `PlacementOutcome`, directly after `isNewBest: boolean;`.

In `lib/services/placementService.ts`, inside `finish`, replace the block from `const profile = profiles.getProfile();` through the end of its `if/else` with:

```ts
      const profile = profiles.getProfile();
      let unlockOffer: CefrLevel | null = null;
      if (profile.placementStatus !== 'taken') {
        // First placement: the active level is the placed level (Ruling M-4), but the
        // highest unlocked level never lowers one already open (e.g. from finished lessons).
        // Any notice left over from before is for a level at or below this new highest level,
        // so it is always obsolete here.
        const highest = higherLevel(profile.highestUnlockedLevel, placed);
        profiles.writeLevelState({
          highestUnlockedLevel: highest,
          activeLevel: placed,
          placementStatus: 'taken',
          unlockNoticeLevel: null,
        });
      } else {
        // Retake: unlocks only go up. A higher placement is offered on the end screen too.
        const raised = unlocks.raiseUnlockedLevel(placed, { notify: true });
        if (raised.highestUnlockedLevel !== profile.highestUnlockedLevel) unlockOffer = placed;
      }
```

and add `unlockOffer,` to the returned outcome object, directly after `isNewBest,`.

If any existing assertion in `placementService.test.ts` compares a whole outcome with `toEqual`, add `unlockOffer: null` to its expected value.

- [ ] **Step 5: Share the route error mapping**

Create `app/api/placement/respond.ts`:

```ts
import { NextResponse } from 'next/server';
import { toPlacementErrorResponse } from '@/lib/services/placementService';

// The start, answer, and stop routes share one error mapping (not a route: only route.ts is).
export async function respondWithPlacementErrors(run: () => unknown): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Replace `app/api/placement/start/route.ts` with:

```ts
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { respondWithPlacementErrors } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST() {
  return respondWithPlacementErrors(() => createPlacementService(getDb()).start());
}
```

Replace `app/api/placement/stop/route.ts` with:

```ts
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { respondWithPlacementErrors } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST() {
  return respondWithPlacementErrors(() => createPlacementService(getDb()).stop());
}
```

Replace `app/api/placement/answer/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { parsePlacementAnswer } from '@/lib/tutoring/placementTypes';
import { respondWithPlacementErrors } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const questionId = body?.questionId;
  const answer = parsePlacementAnswer(body?.answer);
  if (typeof questionId !== 'string' || !answer) {
    return NextResponse.json({ error: 'questionId and a valid answer are required' }, { status: 400 });
  }
  return respondWithPlacementErrors(() => createPlacementService(getDb()).answer(questionId, answer));
}
```

- [ ] **Step 6: Implement the component changes**

In `components/placement/PlacementTest.tsx`:

(a) Add a state hook: `const [switched, setSwitched] = useState(false);`

(b) In `send`, replace the non-`ok` branch:

```tsx
        if (res.status === 502) {
          setGradingErrorDetail(detail);
        } else {
          setError(t('genericError', { error: detail }));
        }
```

with:

```tsx
        if (res.status === 502) {
          setGradingErrorDetail(detail);
        } else if (res.status === 409 && url !== '/api/placement/start') {
          // The attempt is gone (restarted elsewhere, or an admin replaced the exam): start over.
          setQuestion(null);
          setPhase('intro');
          setError(t('sessionLost'));
        } else {
          setError(t('genericError', { error: detail }));
        }
```

(c) Add this function after `send`:

```tsx
  async function switchToOffer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutoring/unlock-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch' }),
      });
      if (!res.ok) {
        setError(t('genericError', { error: String(res.status) }));
        return;
      }
      setSwitched(true);
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }
```

(d) In the result view, directly after `<p>{t(`stopReason.${outcome.stopReason}`)}</p>`, add:

```tsx
      {outcome.unlockOffer &&
        (switched ? (
          <p>{t('switched', { level: outcome.unlockOffer })}</p>
        ) : (
          <p>
            {t('switchOffer', { level: outcome.unlockOffer })}{' '}
            <button type="button" disabled={busy} onClick={switchToOffer}>
              {t('switch')}
            </button>
          </p>
        ))}
      {errorAlert()}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run lib/services/placementService.test.ts components/placement app/api/placement messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 8: Commit**

```bash
git add app/api/placement lib/tutoring/placementTypes.ts lib/services/placementService.ts lib/services/placementService.test.ts components/placement messages/en.json messages/de.json
git commit -m "feat: offer the unlocked level after a retake and restart a lost placement attempt"
```

---

## Spec Coverage

| Spec requirement (Phase 1) | Where |
|---|---|
| Data model: attempts, completions, SRS state, chat, `daily_review_cap` | Task 1 (see Refinement 1) |
| Grades table, flashcard self-assessment buttons | Tasks 7, 10 |
| Admin content changes: delete cascades, edit in place keeps progress, a new exercise doesn't reopen a completion | Task 1 (cascades, editor edits), Task 7 (sticky completion, seeding a late exercise) |
| Completion rule, sticky completion, "Mark as done", exercise-less lessons | Tasks 3, 7, 12 |
| Shared completion via concept links (display-only) | Task 5 (tree, warnings, level finished), Task 6 (suggested next) |
| Simplified SM-2, entering review, first answer per day, local days | Tasks 2, 7 |
| Level finished → unlock in every track, unlocks never go down, notice | Task 7 (+ Plan 1A's `unlockService`) |
| Hard lock: locked lesson page, API rejects answers and chat | Tasks 5, 7, 9, 12 |
| `/` tree with statuses, covered via, "builds on", Unsorted hidden, queue icon, banners | Task 13 |
| `/queue`: active track+level incl. Unsorted, most overdue first, cap, suggested next | Tasks 6, 14 |
| `/lesson/[id]`: explanation first, fixed order, progress counter, retry round, resume, practice, prerequisites | Tasks 5, 12 |
| Lesson chat, Ask AI (not flashcards, only after answering), last 20 messages, disabled without a provider | Tasks 9, 10, 11 |
| Free-text grading blocked without a provider, Settings link, answer kept | Tasks 7, 10 |
| Settings: daily review limit 1–500 | Tasks 1, 15 |
| Translations for every new student page | Tasks 10–15 |
| Placement "Switch to it?" on the end screen | Task 17 |
| Every client fetch checks `res.ok` | Tasks 10–16 |
