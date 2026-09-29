# Tutoring Phase 2: Practice Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After finishing a lesson, a student can practise it with batches of 5 extra exercises. The exercises come from a shared, AI-grown pool that the admin curates, and practice never touches completion or review. Five Phase 1 leftovers are fixed along the way:
- sticky Ask-AI context;
- server errors shown in the interface language;
- retrying a failed chat load;
- validating the answer source for queue answers;
- the intermittent test failure.

**Architecture:**
- **Pure logic** in `lib/tutoring/`: allowed practice types, the generation prompt, reply parsing, duplicate keys, and error codes.
- **Services** in `lib/services/` compose that logic:
  - `practiceService`: serve a batch, generate the missing exercises, grade without recording;
  - `practiceAdminService`: list, approve, reject, edit, promote;
  - plus extensions to `attemptService`, `lessonChatService`, and the seed loader and export.
- **API routes** are thin wrappers over the services.
- **Client:** a new `PracticeRun` component and a practice mode on the existing `ExerciseCard`. Admin gets a review page and a pool section on the lesson page.

**Tech Stack:** Next.js 16 (App Router, async `params`), React 18.3, TypeScript, better-sqlite3, next-intl 4, vitest 5 with Testing Library in jsdom.

**Spec:** `docs/superpowers/specs/2026-09-29-tutoring-phase2-practice-pool-design.md`. Phase 1 context is in `docs/superpowers/specs/2026-09-24-tutoring-section-design.md`.

## Global Constraints

- Practice answers are never stored. They never touch `lesson_attempts`, completion, review scheduling, the Daily Queue, or the daily cap. The only per-student state is `practice_seen`.
- Practice is available only for a lesson that is in an unlocked level and has its **own** `lesson_completions` row.
- Batch size is 5. Exercises are served one at a time, each shown once, with no retry round.
- What the student sees:
  - "Right".
  - "Wrong" plus the correct answer.
  - "Almost" plus the model answer, for free text only.
  - No AI feedback text.
- Ask AI is offered on every practice exercise except flashcards.
- Generated exercises must pass `validateExerciseContent`, obey the flashcard rule (flashcards only in vocabulary lessons), and use only the lesson's allowed types.
- A malformed AI reply, for generation or grading, is a failed call. It is never guessed at.
- Every client fetch checks `res.ok` and shows an error with `role="alert"`. Free-text answers the student typed are never lost.
- Student-facing API errors return `{ error, code, params? }`. The client shows `errors.<code>` from the catalog, and falls back to `error` for an unknown code. Admin routes stay English and code-free.
- `messages/en.json` and `messages/de.json` keep identical keys and placeholders. German uses "du". Admin pages stay English.
- Tests:
  - Services use a real SQLite database: `createDbClient(':memory:')`, or a temp dir through `GAIT_DATA_DIR` for routes.
  - AI is always mocked or injected. There are no real calls.
  - Client tests with several steps use `test/delayedResponse.ts`.
  - Test output must be pristine.
- Verify every task with `npx tsc --noEmit` AND `npm test`.
- Commit messages: the subject alone on the first line, trailers after a blank line.

## Review Focus

Five situations the spec implies but doesn't spell out. Each is pinned by a test in the task that owns the code:

1. **The student presses "Get more exercises" twice quickly.** The button must be disabled while a batch loads, so two batches aren't fetched at once. (Task 12)
2. **An exercise disappears mid-batch**, because an admin promoted or rejected-and-deleted it, or deleted its lesson. Answering it returns `404` with code `not_found`, and the card offers "Skip for now" so the batch can continue. (Tasks 7 and 12)
3. **The AI returns more exercises than asked for.** Only the needed number are kept and served. (Task 7)
4. **A non-vocabulary lesson whose only authored exercises are flashcards** (one of the 86 Phase 1 violations). The allowed types fall back to multiple choice and fill-in-the-blank. Generation must not produce flashcards for it. (Task 6)
5. **The student switches active track, then answers a queue item left over from the old track.** The answer is rejected with `not_due` and nothing is recorded. (Task 4)

## File Structure

**Pure logic (`lib/tutoring/`)**
- `errorCodes.ts`: the `ErrorCode` union, `ErrorParams`, `ApiErrorBody`, and `errorBody()`.
- `practiceTypes.ts`: `PRACTICE_BATCH_SIZE` and `allowedPracticeTypes()`.
- `practiceGeneration.ts`: `buildPracticeGenerationPrompt()`, `parseGeneratedExercises()`, and `contentKey()`.
- `practiceViews.ts`: the `PracticeGradeOutcome` and `PracticeBatch` response types.

**Services (`lib/services/`)**
- `exerciseGrading.ts` (new): the shared `gradeExerciseAnswer()`, extracted from `attemptService`.
- `practiceService.ts` (new).
- `practiceAdminService.ts` (new).
- Modified:
  - `aiService.ts` and `freeTextGradingService.ts`: add error codes.
  - `attemptService.ts`, `lessonChatService.ts`, `placementService.ts`, `profileService.ts`: add error codes, the `not_due` check, and chat about practice exercises.
  - `curriculumSeedLoader.ts` and `curriculumExportService.ts`: the `practice` list.

**Routes**
- New:
  - `app/api/tutoring/lessons/[id]/practice/route.ts`
  - `app/api/tutoring/practice/answer/route.ts`
  - `app/api/admin/practice/route.ts`
  - `app/api/admin/practice/[id]/route.ts`
  - `app/api/admin/practice/[id]/promote/route.ts`
- Modified to add error codes:
  - the tutoring routes
  - the placement routes
  - the profile route

**Client**
- `components/useApiErrorText.ts` (new): the hook that turns an error body into translated text.
- `components/tutoring/PracticeRun.tsx` (new).
- `ExerciseCard.tsx`: add a practice mode.
- `LessonPage.tsx`: host practice.
- `LessonChat.tsx`:
  - context stays attached;
  - a failed load retries;
  - the `AskAbout` union covers practice exercises.
- `QueuePage.tsx`: use the `AskAbout` union.
- `PlacementTest.tsx` and `SettingsPage.tsx`: show error text through the new hook.
- Admin:
  - `components/admin/ExerciseEditor.tsx`: export `ExerciseContentFields`.
  - `components/admin/PracticePoolList.tsx` (new).
  - `app/admin/practice-review/page.tsx` (new).
  - `components/admin/CurriculumBrowser.tsx`: add a pool section.
  - `app/admin/curriculum/page.tsx`: add a link to the review page.

**Schema:** `lib/db/schema.ts`.

**Test helpers:** `test/tutoringFixtures.ts` gains `addPracticeExercise()`.

## Task Order

1. Practice pool tables
2. Error codes on the server
3. Translated error text on the client
4. Queue answers must be due
5. Shared exercise grading
6. Practice types and generation (pure)
7. The practice service
8. Practice routes
9. Chat about practice exercises
10. The practice admin service and routes
11. Approved practice in the curriculum export
12. Practice mode in the exercise card, and `PracticeRun`
13. Lesson page wiring, sticky chat context, and chat load retry
14. Admin review page and lesson pool section
15. Chasing the intermittent test failure

---

### Task 1: Practice pool tables

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/practiceSchema.test.ts`

**Interfaces:**
- Produces:
  - Table `practice_exercises(id, lesson_id, type, content, review_status, created_at, reviewed_at)`.
  - Table `practice_seen(practice_exercise_id, served_at)`.
  - Column `lesson_chat_messages.practice_exercise_id`.

- [ ] **Step 1: Write the tests**

Create `lib/db/practiceSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

function seed(db: Database.Database) {
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
    INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at)
      VALUES ('a1-l1__px-1', 'a1-l1', 'fill_blank', '{"textWithBlank":"___","correctAnswer":"ja"}', 'unreviewed', '2026-09-29T10:00:00.000Z');
    INSERT INTO practice_seen (practice_exercise_id, served_at) VALUES ('a1-l1__px-1', '2026-09-29T10:00:00.000Z');
    INSERT INTO lesson_chat_messages (lesson_id, practice_exercise_id, role, content, created_at)
      VALUES ('a1-l1', 'a1-l1__px-1', 'user', 'Why?', '2026-09-29T10:00:00.000Z');
  `);
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('practice pool tables', () => {
  it('deleting a lesson removes its pool, what was seen, and its chat', () => {
    const db = createDbClient(':memory:');
    seed(db);
    db.prepare("DELETE FROM lessons WHERE id = 'a1-l1'").run();
    for (const table of ['practice_exercises', 'practice_seen', 'lesson_chat_messages']) {
      expect({ table, rows: count(db, table) }).toEqual({ table, rows: 0 });
    }
  });

  it('deleting a pool exercise forgets it was seen and untags its chat messages', () => {
    const db = createDbClient(':memory:');
    seed(db);
    db.prepare("DELETE FROM practice_exercises WHERE id = 'a1-l1__px-1'").run();
    expect(count(db, 'practice_seen')).toBe(0);
    expect(db.prepare('SELECT practice_exercise_id FROM lesson_chat_messages').get()).toEqual({ practice_exercise_id: null });
  });

  it('rejects an unknown review status or type', () => {
    const db = createDbClient(':memory:');
    seed(db);
    expect(() =>
      db.prepare("UPDATE practice_exercises SET review_status = 'maybe' WHERE id = 'a1-l1__px-1'").run()
    ).toThrow();
    expect(() => db.prepare("UPDATE practice_exercises SET type = 'essay' WHERE id = 'a1-l1__px-1'").run()).toThrow();
  });

  it('adds the practice column to a chat table from before Phase 2', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE lesson_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        exercise_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    runMigrations(db);
    const columns = (db.prepare('PRAGMA table_info(lesson_chat_messages)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('practice_exercise_id');
    runMigrations(db);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/db/practiceSchema.test.ts`
Expected: FAIL with "no such table: practice_exercises".

- [ ] **Step 3: Add the tables and the migration**

In `lib/db/schema.ts`:

(a) In the `CREATE TABLE IF NOT EXISTS lesson_chat_messages` statement, add this line directly after the `exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,` line:

```sql
      practice_exercise_id TEXT REFERENCES practice_exercises(id) ON DELETE SET NULL,
```

(b) Add these tables at the end of the SQL string in `createTablesIfMissing`, after the `idx_lesson_chat_lesson` index:

```sql
    CREATE TABLE IF NOT EXISTS practice_exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','approved','rejected')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_practice_exercises_lesson ON practice_exercises(lesson_id);

    CREATE TABLE IF NOT EXISTS practice_seen (
      practice_exercise_id TEXT PRIMARY KEY REFERENCES practice_exercises(id) ON DELETE CASCADE,
      served_at TEXT NOT NULL
    );
```

(c) Add this function directly after `migrateDailyReviewCap`:

```ts
/**
 * Chat messages can be about a practice-pool exercise (Tutoring Phase 2). Adds the column to a
 * chat table created before Phase 2; fresh databases already have it.
 */
function migrateChatPracticeColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(lesson_chat_messages)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'practice_exercise_id')) return;
  db.exec(
    'ALTER TABLE lesson_chat_messages ADD COLUMN practice_exercise_id TEXT REFERENCES practice_exercises(id) ON DELETE SET NULL'
  );
}
```

(d) In `runMigrations`, call it right after `migrateDailyReviewCap(db);`:

```ts
    migrateChatPracticeColumn(db);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/db`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/practiceSchema.test.ts
git commit -m "feat: add the practice pool tables"
```

---

### Task 2: Error codes on the server

Student-facing API errors gain a stable `code`, plus `params` where the text needs values. The client can then show them in the interface language (Task 3). AI failures carry their own code: `no_provider`, `no_model`, `credentials_unreadable`, or `ai_failed` with the provider's message as `params.detail`. A malformed AI reply is `ai_bad_reply`.

**Files:**
- Create: `lib/tutoring/errorCodes.ts`, `lib/tutoring/errorCodes.test.ts`
- Modify:
  - Services: `lib/services/aiService.ts`, `lib/services/freeTextGradingService.ts`, `lib/services/attemptService.ts`, `lib/services/lessonChatService.ts`, `lib/services/placementService.ts`, `lib/services/profileService.ts`
  - Routes: `app/api/profile/route.ts`, `app/api/tutoring/attempts/route.ts`, `app/api/tutoring/lessons/[id]/route.ts`, `app/api/tutoring/lessons/[id]/chat/route.ts`, `app/api/placement/answer/route.ts`
- Test (update expectations):
  - Services: `lib/services/aiService.test.ts`, `lib/services/freeTextGradingService.test.ts`, `lib/services/attemptService.test.ts`, `lib/services/lessonChatService.test.ts`, `lib/services/placementService.test.ts`
  - Routes: `app/api/tutoring/routes.test.ts`, `app/api/tutoring/lessons/[id]/chat/route.test.ts`, `app/api/placement/routes.test.ts`, `app/api/profile/route.test.ts`

**Interfaces:**
- Produces:
  - Types:
    - `type ErrorCode = 'not_found' | 'level_locked' | 'bad_request' | 'lesson_not_completed' | 'not_due' | 'no_provider' | 'no_model' | 'credentials_unreadable' | 'ai_failed' | 'ai_bad_reply' | 'no_session' | 'no_exam' | 'invalid_daily_cap'`
    - `type ErrorParams = Record<string, string>`
    - `interface ApiErrorBody { error: string; code: ErrorCode; params?: ErrorParams }`
  - `errorBody(error, code, params?)`.
  - `AiResult` failure becomes `{ ok: false; error: string; code?: ErrorCode; params?: ErrorParams }`, and `FreeTextGradeOutcome` failure takes the same shape. `code` is optional so that existing mocks still type-check. A missing code means `ai_failed`.
  - `AttemptError`, `ChatError`, `PlacementError` and `ProfileUpdateError` each carry `code: ErrorCode` and `params?: ErrorParams`. Their `to…ErrorResponse` functions return `body: ApiErrorBody`.

- [ ] **Step 1: Write the pure tests**

Create `lib/tutoring/errorCodes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { errorBody } from './errorCodes';

describe('errorBody', () => {
  it('includes params only when there are some', () => {
    expect(errorBody('Lesson not found', 'not_found')).toEqual({ error: 'Lesson not found', code: 'not_found' });
    expect(errorBody('Level B1 is locked', 'level_locked', { level: 'B1' })).toEqual({
      error: 'Level B1 is locked',
      code: 'level_locked',
      params: { level: 'B1' },
    });
  });
});
```

- [ ] **Step 2: Update the service and route expectations**

These tests currently compare whole error results. Change them to the new shapes:

1. `lib/services/aiService.test.ts`:
   - The "no provider is active" expectation becomes `{ ok: false, error: 'No AI provider is set up', code: 'no_provider' }`.
   - The "no model selected" expectation becomes `{ ok: false, error: 'The active AI provider has no model selected', code: 'no_model' }`.
   - The adapter-rejection expectation becomes `{ ok: false, error: 'Anthropic returned 429', code: 'ai_failed', params: { detail: 'Anthropic returned 429' } }`.
2. `lib/services/freeTextGradingService.test.ts`:
   - "treats an unexpected reply as a failure" expects `{ ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' }`.
   - "passes through a provider failure" mocks `{ ok: false, error: 'No AI provider is set up', code: 'no_provider' }` and expects exactly that object back.
3. `lib/services/attemptService.test.ts`: replace the four `toAttemptErrorResponse` expectations with:

```ts
    expect(toAttemptErrorResponse(new AttemptError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x', code: 'not_found' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x', code: 'level_locked' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toAttemptErrorResponse(new AttemptError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x', code: 'ai_failed' } });
```

   Then add inside `describe('attemptService.recordAttempt', ...)`:

```ts
  it('names the locked level and the AI failure in the error code', async () => {
    const { service } = setup({ grade: vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }) });
    await expect(service.recordAttempt('a2-past__ex1', { type: 'fill_blank', text: 'war' }, 'lesson')).rejects.toMatchObject({
      code: 'level_locked',
      params: { level: 'A2' },
    });
    await expect(
      service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin müde.' }, 'lesson')
    ).rejects.toMatchObject({ kind: 'grading_failed', code: 'no_provider' });
  });
```

4. `lib/services/lessonChatService.test.ts`: the `ai_failed` expectation becomes `{ status: 502, body: { error: 'x', code: 'ai_failed' } }`.
5. `lib/services/placementService.test.ts`: the four `toPlacementErrorResponse` expectations become:
   - bad_request → `{ status: 400, body: { error: 'x', code: 'bad_request' } }`
   - grading_failed → `{ status: 502, body: { error: 'x', code: 'ai_failed' } }`
   - no_session → `{ status: 409, body: { error: 'x', code: 'no_session' } }`
   - no_exam → `{ status: 409, body: { error: 'x', code: 'no_exam' } }`
6. `app/api/tutoring/routes.test.ts`:
   - The missing-lesson body becomes `{ error: 'Lesson not found', code: 'not_found' }`.
   - The locked body becomes `{ error: 'Level A2 is locked', code: 'level_locked', params: { level: 'A2' } }`.
7. `app/api/tutoring/lessons/[id]/chat/route.test.ts`: the mocked failure becomes `{ ok: false, error: 'No AI provider is set up', code: 'no_provider' }`, and the expected body becomes `{ error: 'No AI provider is set up', code: 'no_provider' }`.
8. `app/api/placement/routes.test.ts`: the wrong-question body becomes `{ error: 'That question is not the current one', code: 'bad_request' }`.
9. `app/api/profile/route.test.ts`:
   - `{ error: 'Level B2 is locked', code: 'level_locked', params: { level: 'B2' } }`
   - `{ error: 'Level Z9 is locked', code: 'level_locked', params: { level: 'Z9' } }`
   - `{ error: 'The daily review limit must be a whole number from 1 to 500', code: 'invalid_daily_cap' }`

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/errorCodes.test.ts lib/services app/api`
Expected: FAIL, because `./errorCodes` doesn't exist and the bodies lack `code`.

- [ ] **Step 4: Add the error-code module**

Create `lib/tutoring/errorCodes.ts`:

```ts
// Stable identifiers for student-facing API errors. The client shows `errors.<code>` from the
// message catalog (in the interface language) and falls back to the English `error` text.
export type ErrorCode =
  | 'not_found'
  | 'level_locked'
  | 'bad_request'
  | 'lesson_not_completed'
  | 'not_due'
  | 'no_provider'
  | 'no_model'
  | 'credentials_unreadable'
  | 'ai_failed'
  | 'ai_bad_reply'
  | 'no_session'
  | 'no_exam'
  | 'invalid_daily_cap';

export type ErrorParams = Record<string, string>;

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
  params?: ErrorParams;
}

export function errorBody(error: string, code: ErrorCode, params?: ErrorParams): ApiErrorBody {
  return params ? { error, code, params } : { error, code };
}
```

- [ ] **Step 5: Give the AI results and the free-text grader a code**

In `lib/services/aiService.ts`:
- Add `import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';`.
- Change the type to:
  `export type AiResult = { ok: true; text: string } | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };`
- Change the four failure returns in `generateWithActiveProvider` to:

```ts
  if (!active) return { ok: false, error: 'No AI provider is set up', code: 'no_provider' };
  if (!active.selectedModel) return { ok: false, error: 'The active AI provider has no model selected', code: 'no_model' };
```

```ts
    return { ok: false, error: 'Stored credentials could not be decrypted', code: 'credentials_unreadable' };
```

```ts
    return { ok: false, error: message, code: 'ai_failed', params: { detail: message } };
```

In `lib/services/freeTextGradingService.ts`:
- Add `import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';`.
- Change the type to:
  `export type FreeTextGradeOutcome = { ok: true; result: GradeResult; feedback: string } | { ok: false; error: string; code?: ErrorCode; params?: ErrorParams };`
- Change the malformed-reply line to:

```ts
  if (!parsed) return { ok: false, error: 'The AI replied in an unexpected format', code: 'ai_bad_reply' };
```

- [ ] **Step 6: Give the service errors a code**

In `lib/services/attemptService.ts`, add `import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';`. Then replace the `AttemptError` class and `toAttemptErrorResponse` with:

```ts
const DEFAULT_CODE: Record<AttemptErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

export class AttemptError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: AttemptErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

const STATUS_FOR: Record<AttemptErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, grading_failed: 502 };

export function toAttemptErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof AttemptError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}
```

Then, in the same file:
- The locked throw in `getUnlockedLesson` becomes:
  `throw new AttemptError(\`Level ${lesson.sourceLevel} is locked\`, 'locked', 'level_locked', { level: lesson.sourceLevel });`
- The free-text failure becomes:
  `if (!graded.ok) throw new AttemptError(graded.error, 'grading_failed', graded.code, graded.params);`

In `lib/services/lessonChatService.ts`, add the same import and apply the same pattern:

```ts
const DEFAULT_CODE: Record<ChatErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  bad_request: 'bad_request',
  ai_failed: 'ai_failed',
};

export class ChatError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: ChatErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

const STATUS_FOR: Record<ChatErrorKind, number> = { not_found: 404, locked: 403, bad_request: 400, ai_failed: 502 };

export function toChatErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof ChatError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}
```

Then:
- The locked throw becomes:
  `throw new ChatError(\`Level ${lesson.sourceLevel} is locked\`, 'locked', 'level_locked', { level: lesson.sourceLevel });`
- The AI failure becomes:
  `if (!reply.ok) throw new ChatError(reply.error, 'ai_failed', reply.code, reply.params);`

In `lib/services/placementService.ts`, add the same import and replace the class and response function with:

```ts
const DEFAULT_CODE: Record<PlacementErrorKind, ErrorCode> = {
  no_exam: 'no_exam',
  no_session: 'no_session',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

export class PlacementError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: PlacementErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toPlacementErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PlacementError)) return null;
  const status = err.kind === 'bad_request' ? 400 : err.kind === 'grading_failed' ? 502 : 409;
  return { status, body: errorBody(err.message, err.code, err.params) };
}
```

and change the grading failure to:
`if (!graded.ok) throw new PlacementError(graded.error, 'grading_failed', graded.code, graded.params);`

In `lib/services/profileService.ts`, add `import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';`. Then replace the two error classes with:

```ts
// A client update the profile can't accept; the profile route answers it with 400.
export class ProfileUpdateError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode = 'bad_request',
    readonly params?: ErrorParams
  ) {
    super(message);
  }
}
export class LockedLevelError extends ProfileUpdateError {}
```

and change the two throws in `updateProfile` to:

```ts
      throw new LockedLevelError(`Level ${input.activeLevel} is locked`, 'level_locked', { level: String(input.activeLevel) });
```

```ts
      throw new ProfileUpdateError('The daily review limit must be a whole number from 1 to 500', 'invalid_daily_cap');
```

- [ ] **Step 7: Return the code from the routes**

1. `app/api/profile/route.ts`: import `errorBody` from `@/lib/tutoring/errorCodes`, and change the catch line to:
   `if (err instanceof ProfileUpdateError) return NextResponse.json(errorBody(err.message, err.code, err.params), { status: 400 });`
2. `app/api/tutoring/attempts/route.ts`: the malformed-body response becomes
   `NextResponse.json(errorBody('exerciseId, a valid answer, and source ("lesson" or "queue") are required', 'bad_request'), { status: 400 })`.
3. `app/api/tutoring/lessons/[id]/route.ts`: the 404 becomes
   `NextResponse.json(errorBody('Lesson not found', 'not_found'), { status: 404 })`.
4. `app/api/tutoring/lessons/[id]/chat/route.ts`: the 400 becomes
   `NextResponse.json(errorBody('message (text) and an optional exerciseId are required', 'bad_request'), { status: 400 })`.
5. `app/api/placement/answer/route.ts`: the 400 becomes
   `NextResponse.json(errorBody('questionId and a valid answer are required', 'bad_request'), { status: 400 })`.

Each route imports `errorBody` from `@/lib/tutoring/errorCodes`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run lib app`
Expected: PASS. Then run `npx tsc --noEmit && npm test`. Any other test that compared a whole student-facing error body with `toEqual` needs the new `code`. Update it the same way, and list it in your report.

- [ ] **Step 9: Commit**

```bash
git add lib/tutoring/errorCodes.ts lib/tutoring/errorCodes.test.ts lib/services app/api/profile app/api/tutoring app/api/placement
git commit -m "feat: give student-facing API errors a stable code"
```

---

### Task 3: Translated error text on the client

**Files:**
- Create: `components/useApiErrorText.ts`, `components/useApiErrorText.test.tsx`
- Modify:
  - `messages/en.json`, `messages/de.json`
  - `components/tutoring/ExerciseCard.tsx`, `components/tutoring/LessonChat.tsx`, `components/tutoring/LessonPage.tsx`
  - `components/placement/PlacementTest.tsx`, `components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `ApiErrorBody` (Task 2).
- Produces: `useApiErrorText(): (data: unknown, fallback: string) => string`, and the `errors` catalog namespace.

- [ ] **Step 1: Add the catalog text**

Add this top-level namespace to `messages/en.json`, directly after `common`:

```json
  "errors": {
    "not_found": "That could not be found",
    "level_locked": "Level {level} is locked",
    "bad_request": "That request was not valid",
    "lesson_not_completed": "Finish the lesson first",
    "not_due": "This review is not due right now",
    "no_provider": "No AI provider is set up",
    "no_model": "The active AI provider has no model selected",
    "credentials_unreadable": "The stored API key could not be read",
    "ai_failed": "The AI provider reported an error ({detail})",
    "ai_bad_reply": "The AI replied in an unexpected format",
    "no_session": "No placement test is in progress",
    "no_exam": "No placement exam is loaded",
    "invalid_daily_cap": "The daily review limit must be a whole number from 1 to 500"
  },
```

and to `messages/de.json`, directly after its `common`:

```json
  "errors": {
    "not_found": "Das wurde nicht gefunden",
    "level_locked": "Das Niveau {level} ist gesperrt",
    "bad_request": "Diese Anfrage war ungültig",
    "lesson_not_completed": "Schließ zuerst die Lektion ab",
    "not_due": "Diese Wiederholung ist gerade nicht fällig",
    "no_provider": "Es ist kein KI-Anbieter eingerichtet",
    "no_model": "Für den aktiven KI-Anbieter ist kein Modell ausgewählt",
    "credentials_unreadable": "Der gespeicherte API-Schlüssel konnte nicht gelesen werden",
    "ai_failed": "Der KI-Anbieter hat einen Fehler gemeldet ({detail})",
    "ai_bad_reply": "Die KI hat in einem unerwarteten Format geantwortet",
    "no_session": "Es läuft gerade kein Einstufungstest",
    "no_exam": "Es ist kein Einstufungstest geladen",
    "invalid_daily_cap": "Das Tageslimit muss eine ganze Zahl von 1 bis 500 sein"
  },
```

The texts have no final period. They are inserted into sentences such as "Your answer could not be graded: {error}.", which supply their own.

- [ ] **Step 2: Write the tests**

Create `components/useApiErrorText.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { useApiErrorText } from './useApiErrorText';

function Probe({ data, fallback = 'fallback' }: { data: unknown; fallback?: string }) {
  const errorText = useApiErrorText();
  return <p>{errorText(data, fallback)}</p>;
}

describe('useApiErrorText', () => {
  it('translates a known code with its params', () => {
    renderWithIntl(<Probe data={{ error: 'Level B1 is locked', code: 'level_locked', params: { level: 'B1' } }} />, 'de');
    expect(screen.getByText('Das Niveau B1 ist gesperrt')).toBeInTheDocument();
  });

  it('keeps the provider detail inside the translated sentence', () => {
    renderWithIntl(
      <Probe data={{ error: 'Anthropic returned 429', code: 'ai_failed', params: { detail: 'Anthropic returned 429' } }} />
    );
    expect(screen.getByText('The AI provider reported an error (Anthropic returned 429)')).toBeInTheDocument();
  });

  it('falls back to the English error for an unknown or missing code, then to the fallback', () => {
    renderWithIntl(
      <>
        <Probe data={{ error: 'Something new', code: 'brand_new' }} />
        <Probe data={{ error: 'Old style' }} />
        <Probe data={null} fallback="500" />
      </>
    );
    expect(screen.getByText('Something new')).toBeInTheDocument();
    expect(screen.getByText('Old style')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });
});
```

Add to `components/tutoring/ExerciseCard.test.tsx`, inside its `describe`:

```tsx
  it('shows a coded error in the interface language', async () => {
    stubAttempts(() =>
      delayedResponse({ error: 'Level A2 is locked', code: 'level_locked', params: { level: 'A2' } }, { ok: false, status: 403 })
    );
    renderCard(MC);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Level A2 is locked');
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/useApiErrorText.test.tsx messages/catalogs.test.ts`
Expected: FAIL, because `./useApiErrorText` doesn't exist.

- [ ] **Step 4: Implement the hook**

Create `components/useApiErrorText.ts`:

```ts
'use client';

import { useTranslations } from 'next-intl';

// Turns an API error body into text in the interface language: `errors.<code>` when the catalog
// knows the code, else the server's English `error`, else the caller's fallback.
export function useApiErrorText(): (data: unknown, fallback: string) => string {
  const t = useTranslations('errors');
  return (data, fallback) => {
    const body = (data && typeof data === 'object' ? data : {}) as {
      error?: unknown;
      code?: unknown;
      params?: unknown;
    };
    if (typeof body.code === 'string' && t.has(body.code)) {
      const params = body.params && typeof body.params === 'object' ? (body.params as Record<string, string>) : {};
      return t(body.code, params);
    }
    return typeof body.error === 'string' ? body.error : fallback;
  };
}
```

- [ ] **Step 5: Use it wherever a server error is shown**

In each of these components, add `import { useApiErrorText } from '@/components/useApiErrorText';` and `const errorText = useApiErrorText();` next to the component's other hooks. Then replace the expression that reads the server's error text:

1. `components/tutoring/ExerciseCard.tsx`, in `submit`:
   `const detail = typeof data.error === 'string' ? data.error : String(res.status);`
   → `const detail = errorText(data, String(res.status));`
2. `components/tutoring/LessonChat.tsx`, in `send`:
   `const detail = typeof data.error === 'string' ? data.error : String(res.status);`
   → `const detail = errorText(data, String(res.status));`
3. `components/tutoring/LessonPage.tsx`, in `markDone`:
   `t('markFailed', { error: typeof data.error === 'string' ? data.error : String(res.status) })`
   → `t('markFailed', { error: errorText(data, String(res.status)) })`
4. `components/placement/PlacementTest.tsx`, in `send`:
   `const detail = typeof data.error === 'string' ? data.error : String(res.status);`
   → `const detail = errorText(data, String(res.status));`
5. `components/settings/SettingsPage.tsx`, in `handleProfileChange`:
   `t('profileSaveFailed', { error: data.error ?? String(res.status) })`
   → `t('profileSaveFailed', { error: errorText(data, String(res.status)) })`

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components messages/catalogs.test.ts`
Expected: PASS with no warnings. Every existing component test still passes, because bodies without a code fall back to `error`. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add components/useApiErrorText.ts components/useApiErrorText.test.tsx components/tutoring components/placement/PlacementTest.tsx components/settings/SettingsPage.tsx messages/en.json messages/de.json
git commit -m "feat: show server errors in the interface language"
```

---

### Task 4: Queue answers must be due

**Files:**
- Modify: `lib/services/attemptService.ts`, `lib/services/attemptService.test.ts`, `app/api/tutoring/routes.test.ts`

**Interfaces:**
- Produces: `recordAttempt(..., 'queue')` rejects with `AttemptError` of kind `bad_request` and code `not_due` in three cases:
  - the exercise's lesson isn't placed in the active track and level;
  - the exercise has no review schedule, or its `next_due_at` is after today;
  - it was already answered in the queue today.

  In each case nothing is recorded. Lesson answers are unaffected.

- [ ] **Step 1: Write the tests**

Append inside `describe('attemptService.recordAttempt', ...)` in `lib/services/attemptService.test.ts`:

```ts
  it('accepts a queue answer only for a due review in the active track and level, once a day', async () => {
    const { db, service, setDay, count, profiles } = setup();
    await service.recordAttempt('a1-greet__ex1', right, 'lesson');
    await service.recordAttempt('a1-greet__ex2', knew, 'lesson');
    // Seeded: ex1 due 2026-09-27.
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).rejects.toMatchObject({ code: 'not_due' });
    expect(count('lesson_attempts')).toBe(2);

    setDay(27);
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).resolves.toMatchObject({ result: 'correct' });
    await expect(service.recordAttempt('a1-greet__ex1', right, 'queue')).rejects.toMatchObject({ code: 'not_due' });
    await expect(service.recordAttempt('a1-greet__ex1', right, 'lesson')).resolves.toMatchObject({ result: 'correct' });

    // Review Focus 5: after switching track, a leftover queue item from the old track is refused.
    db.prepare("UPDATE exercise_srs_state SET next_due_at = '2026-09-27' WHERE exercise_id = 'a1-greet__ex2'").run();
    profiles.updateProfile({ activeTrack: 'goethe' });
    await expect(service.recordAttempt('a1-greet__ex2', knew, 'queue')).rejects.toMatchObject({ code: 'not_due' });
  });
```

In `app/api/tutoring/routes.test.ts`, add inside its `describe`:

```ts
  it('POST attempts refuses a queue answer that is not due', async () => {
    const res = await attempt({ exerciseId: 'a1-greet__ex1', answer: { type: 'multiple_choice', selectedIndex: 0 }, source: 'queue' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'This review is not due', code: 'not_due' });
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/attemptService.test.ts app/api/tutoring/routes.test.ts`
Expected: FAIL. Today the queue answers are accepted.

- [ ] **Step 3: Implement**

In `lib/services/attemptService.ts`:

(a) Add this function inside `createAttemptService`, after `getUnlockedLesson`:

```ts
  // Phase 2 leftover: a queue answer must be a real, due review of the active track+level that
  // hasn't been answered in the queue today — otherwise it would count against the daily cap.
  function assertDueInQueue(exerciseId: string, today: string): void {
    const { activeTrack, activeLevel } = profiles.getProfile();
    const due = db
      .prepare(
        `SELECT 1
         FROM exercises e
         JOIN exercise_srs_state st ON st.exercise_id = e.id
         JOIN lesson_placements p ON p.lesson_id = e.lesson_id
         JOIN sections s ON s.id = p.section_id
         JOIN milestones m ON m.id = s.milestone_id
         WHERE e.id = ? AND m.track = ? AND m.level = ? AND st.next_due_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.source = 'queue' AND a.answered_on = ?
           )`
      )
      .get(exerciseId, activeTrack, activeLevel, today, today);
    if (!due) throw new AttemptError('This review is not due', 'bad_request', 'not_due');
  }
```

(b) In `recordAttempt`, after `const lesson = getUnlockedLesson(exercise.lessonId);`, add:

```ts
    if (source === 'queue') assertDueInQueue(exercise.id, localDate(now()));
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/attemptService.test.ts app/api/tutoring/routes.test.ts`
Expected: PASS, including the existing "moves the schedule only on the first answer of the day" test, whose queue answer is due. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/attemptService.ts lib/services/attemptService.test.ts app/api/tutoring/routes.test.ts
git commit -m "fix: accept a queue answer only for a due review"
```

---
### Task 5: Shared exercise grading

Practice answers are graded exactly like lesson answers but not recorded. So the grading step moves out of `attemptService` into one shared function that both services call.

**Files:**
- Create: `lib/services/exerciseGrading.ts`, `lib/services/exerciseGrading.test.ts`
- Modify: `lib/services/attemptService.ts`

**Interfaces:**
- Consumes: `gradeMultipleChoice` and `gradeFillBlank` (Phase 1), `FLASHCARD_GRADES` and `LessonAnswer`, `FreeTextGradeOutcome` (Task 2).
- Produces:
  - `type ExerciseGradeOutcome` is one of:
    - `{ ok: true; result: GradeResult; feedback: string | null }`
    - `{ ok: false; reason: 'bad_request'; message: string }`
    - `{ ok: false; reason: 'grading_failed'; message: string; code?: ErrorCode; params?: ErrorParams }`
  - `interface ExerciseGradingDeps { gradeFreeText(input): Promise<FreeTextGradeOutcome>; uiLanguage: 'en' | 'de' }`
  - `gradeExerciseAnswer(exercise: Exercise, answer: LessonAnswer, level: CefrLevel, deps: ExerciseGradingDeps): Promise<ExerciseGradeOutcome>`

- [ ] **Step 1: Write the tests**

Create `lib/services/exerciseGrading.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Exercise } from '../curriculum/types';
import { gradeExerciseAnswer } from './exerciseGrading';

const mc: Exercise = { id: 'mc', lessonId: 'l', track: null, type: 'multiple_choice', content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } };
const fill: Exercise = { id: 'fb', lessonId: 'l', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin' } };
const card: Exercise = { id: 'fc', lessonId: 'l', track: null, type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
const free: Exercise = { id: 'ft', lessonId: 'l', track: null, type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };

function deps(outcome: unknown = { ok: true, result: 'almost', feedback: 'Fast.' }) {
  return { gradeFreeText: vi.fn().mockResolvedValue(outcome), uiLanguage: 'de' as const };
}

describe('gradeExerciseAnswer', () => {
  it('grades deterministic types and flashcard ratings without the AI', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(mc, { type: 'multiple_choice', selectedIndex: 1 }, 'A1', d)).toEqual({ ok: true, result: 'wrong', feedback: null });
    expect(await gradeExerciseAnswer(fill, { type: 'fill_blank', text: ' bin ' }, 'A1', d)).toEqual({ ok: true, result: 'correct', feedback: null });
    expect(await gradeExerciseAnswer(card, { type: 'flashcard', rating: 'sort_of' }, 'A1', d)).toEqual({ ok: true, result: 'almost', feedback: null });
    expect(d.gradeFreeText).not.toHaveBeenCalled();
  });

  it('grades free text with the AI in the UI language', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: 'Ich schreib.' }, 'A2', d)).toEqual({
      ok: true,
      result: 'almost',
      feedback: 'Fast.',
    });
    expect(d.gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
      uiLanguage: 'de',
    });
  });

  it('reports a bad request for a mismatched type, a missing option, or blank free text', async () => {
    const d = deps();
    expect(await gradeExerciseAnswer(mc, { type: 'fill_blank', text: 'x' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(mc, { type: 'multiple_choice', selectedIndex: 7 }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: '   ' }, 'A1', d)).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  it('passes an AI failure on with its code', async () => {
    const d = deps({ ok: false, error: 'No AI provider is set up', code: 'no_provider' });
    expect(await gradeExerciseAnswer(free, { type: 'free_text', text: 'x' }, 'A1', d)).toEqual({
      ok: false,
      reason: 'grading_failed',
      message: 'No AI provider is set up',
      code: 'no_provider',
      params: undefined,
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/exerciseGrading.test.ts`
Expected: FAIL, because `./exerciseGrading` doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/exerciseGrading.ts`:

```ts
import type { CefrLevel } from '../types';
import type { Exercise, FillBlankContent, FreeTextContent, MultipleChoiceContent } from '../curriculum/types';
import type { ErrorCode, ErrorParams } from '../tutoring/errorCodes';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { gradeFillBlank, gradeMultipleChoice, type GradeResult } from '../tutoring/grading';
import { FLASHCARD_GRADES, type LessonAnswer } from '../tutoring/lessonAnswers';
import type { FreeTextGradeOutcome } from './freeTextGradingService';

export type ExerciseGradeOutcome =
  | { ok: true; result: GradeResult; feedback: string | null }
  | { ok: false; reason: 'bad_request'; message: string }
  | { ok: false; reason: 'grading_failed'; message: string; code?: ErrorCode; params?: ErrorParams };

export interface ExerciseGradingDeps {
  gradeFreeText: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  uiLanguage: 'en' | 'de';
}

// The one grading rule for authored and practice exercises (spec: Grades): deterministic for
// multiple choice and fill-in-the-blank, the student's own rating for flashcards, the AI for free text.
export async function gradeExerciseAnswer(
  exercise: Exercise,
  answer: LessonAnswer,
  level: CefrLevel,
  deps: ExerciseGradingDeps
): Promise<ExerciseGradeOutcome> {
  if (answer.type !== exercise.type) {
    return { ok: false, reason: 'bad_request', message: 'The answer does not match the exercise type' };
  }
  switch (answer.type) {
    case 'multiple_choice': {
      const content = exercise.content as MultipleChoiceContent;
      if (answer.selectedIndex < 0 || answer.selectedIndex >= content.options.length) {
        return { ok: false, reason: 'bad_request', message: 'That option does not exist' };
      }
      return { ok: true, result: gradeMultipleChoice(content, answer.selectedIndex), feedback: null };
    }
    case 'fill_blank':
      return { ok: true, result: gradeFillBlank(exercise.content as FillBlankContent, answer.text), feedback: null };
    case 'flashcard':
      return { ok: true, result: FLASHCARD_GRADES[answer.rating], feedback: null };
    case 'free_text': {
      if (!answer.text.trim()) return { ok: false, reason: 'bad_request', message: 'Write an answer first' };
      const content = exercise.content as FreeTextContent;
      const graded = await deps.gradeFreeText({
        prompt: content.prompt,
        modelAnswer: content.modelAnswer,
        studentAnswer: answer.text,
        level,
        uiLanguage: deps.uiLanguage,
      });
      if (!graded.ok) {
        return { ok: false, reason: 'grading_failed', message: graded.error, code: graded.code, params: graded.params };
      }
      return { ok: true, result: graded.result, feedback: graded.feedback };
    }
  }
}
```

In `lib/services/attemptService.ts`, replace the whole `grade` function with:

```ts
  async function grade(
    exercise: Exercise,
    answer: LessonAnswer,
    level: CefrLevel
  ): Promise<{ result: GradeResult; feedback: string | null }> {
    const graded = await gradeExerciseAnswer(exercise, answer, level, {
      gradeFreeText: gradeFree,
      uiLanguage: profiles.getProfile().uiLanguage,
    });
    if (graded.ok) return { result: graded.result, feedback: graded.feedback };
    if (graded.reason === 'bad_request') throw new AttemptError(graded.message, 'bad_request');
    throw new AttemptError(graded.message, 'grading_failed', graded.code, graded.params);
  }
```

Add `import { gradeExerciseAnswer } from './exerciseGrading';`. Then remove the imports `attemptService.ts` no longer uses: `FillBlankContent`, `FreeTextContent`, `MultipleChoiceContent`, `gradeFillBlank`, `gradeMultipleChoice`, and `FLASHCARD_GRADES`. Keep `type GradeResult`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/exerciseGrading.test.ts lib/services/attemptService.test.ts`
Expected: PASS. All of `attemptService`'s existing tests are unchanged. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/exerciseGrading.ts lib/services/exerciseGrading.test.ts lib/services/attemptService.ts
git commit -m "refactor: share exercise grading between lessons and practice"
```

---

### Task 6: Practice types and generation (pure)

**Files:**
- Create:
  - `lib/tutoring/practiceTypes.ts`, `lib/tutoring/practiceTypes.test.ts`
  - `lib/tutoring/practiceGeneration.ts`, `lib/tutoring/practiceGeneration.test.ts`
  - `lib/tutoring/practiceViews.ts`

**Interfaces:**
- Produces:
  - `PRACTICE_BATCH_SIZE = 5`
  - `allowedPracticeTypes(skill: Skill, authoredTypes: readonly ExerciseType[]): ExerciseType[]`
  - `MAX_STYLE_EXAMPLES = 10`
  - `PracticeLessonContext` and `GeneratedExercise`
  - `buildPracticeGenerationPrompt(ctx, allowedTypes, count): { systemPrompt: string; messages: ChatMessage[] }`
  - `parseGeneratedExercises(text, allowedTypes, skill): GeneratedExercise[] | null`, where `null` means a malformed reply
  - `contentKey(type, content): string`
  - `PracticeBatch { exercises: ExerciseView[] }` and `PracticeGradeOutcome { result: GradeResult; correctAnswer: string | null }`

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/practiceTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allowedPracticeTypes, PRACTICE_BATCH_SIZE } from './practiceTypes';

describe('allowedPracticeTypes', () => {
  it('mirrors the lesson’s authored types, in a fixed order', () => {
    expect(allowedPracticeTypes('grammar', ['free_text', 'multiple_choice', 'multiple_choice'])).toEqual(['multiple_choice', 'free_text']);
    expect(allowedPracticeTypes('vocabulary', ['flashcard', 'multiple_choice'])).toEqual(['multiple_choice', 'flashcard']);
  });

  it('never allows flashcards outside a vocabulary lesson', () => {
    expect(allowedPracticeTypes('grammar', ['flashcard', 'fill_blank'])).toEqual(['fill_blank']);
  });

  it('falls back to multiple choice and fill-in-the-blank (plus flashcards for vocabulary) when nothing usable is authored', () => {
    expect(allowedPracticeTypes('reading', [])).toEqual(['multiple_choice', 'fill_blank']);
    expect(allowedPracticeTypes('vocabulary', [])).toEqual(['multiple_choice', 'fill_blank', 'flashcard']);
    // Review Focus 4: a non-vocabulary lesson whose only authored exercises are flashcards.
    expect(allowedPracticeTypes('grammar', ['flashcard', 'flashcard'])).toEqual(['multiple_choice', 'fill_blank']);
  });

  it('serves batches of 5', () => {
    expect(PRACTICE_BATCH_SIZE).toBe(5);
  });
});
```

Create `lib/tutoring/practiceGeneration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPracticeGenerationPrompt, contentKey, parseGeneratedExercises } from './practiceGeneration';

const ctx = {
  title: 'Saying hello',
  level: 'A1' as const,
  skill: 'vocabulary' as const,
  explanation: 'Say Hallo to greet someone.',
  examples: ['Hallo!'],
  authoredExercises: [{ type: 'multiple_choice' as const, content: { question: 'Hi?', options: ['Hallo', 'Nein'], correctIndex: 0 } }],
};

describe('buildPracticeGenerationPrompt', () => {
  it('names the lesson, the count, the allowed types and only their shapes', () => {
    const { systemPrompt, messages } = buildPracticeGenerationPrompt(ctx, ['multiple_choice', 'flashcard'], 3);
    expect(systemPrompt).toContain('"Saying hello" at CEFR level A1 (skill: vocabulary)');
    expect(systemPrompt).toContain('Write exactly 3 new exercises. Use only these types: multiple_choice, flashcard.');
    expect(systemPrompt).toContain('- multiple_choice: ');
    expect(systemPrompt).toContain('- flashcard: ');
    expect(systemPrompt).not.toContain('- free_text: ');
    expect(systemPrompt).toContain('Reply with only a JSON object');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Lesson explanation:\nSay Hallo to greet someone.');
    expect(messages[0].content).toContain('Lesson examples:\n- Hallo!');
    expect(messages[0].content).toContain('"question":"Hi?"');
  });

  it('includes at most 10 authored exercises as style examples', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: 'fill_blank' as const,
      content: { textWithBlank: `Satz ${i} ___`, correctAnswer: 'x' },
    }));
    const { messages } = buildPracticeGenerationPrompt({ ...ctx, authoredExercises: many }, ['fill_blank'], 5);
    expect(messages[0].content).toContain('Satz 9 ___');
    expect(messages[0].content).not.toContain('Satz 10 ___');
  });
});

describe('parseGeneratedExercises', () => {
  const allowed = ['multiple_choice', 'flashcard'] as const;

  it('keeps valid exercises of allowed types and drops the rest', () => {
    const reply = `Here you go: ${JSON.stringify({
      exercises: [
        { type: 'multiple_choice', content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } },
        { type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'x' } },
        { type: 'multiple_choice', content: { question: 'Bad', options: ['only one'], correctIndex: 0 } },
        { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
        'nonsense',
      ],
    })}`;
    expect(parseGeneratedExercises(reply, [...allowed], 'vocabulary')).toEqual([
      { type: 'multiple_choice', content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } },
      { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
    ]);
  });

  it('drops flashcards for a non-vocabulary lesson even if allowed was mis-set', () => {
    const reply = JSON.stringify({ exercises: [{ type: 'flashcard', content: { front: 'a', back: 'b' } }] });
    expect(parseGeneratedExercises(reply, ['flashcard'], 'grammar')).toEqual([]);
  });

  it('treats a reply without the expected JSON shape as malformed', () => {
    expect(parseGeneratedExercises('No exercises today.', ['multiple_choice'], 'grammar')).toBeNull();
    expect(parseGeneratedExercises('{"items": []}', ['multiple_choice'], 'grammar')).toBeNull();
    expect(parseGeneratedExercises('{broken', ['multiple_choice'], 'grammar')).toBeNull();
  });
});

describe('contentKey', () => {
  it('ignores case, surrounding spaces, and key order', () => {
    expect(contentKey('flashcard', { front: ' Die Katze ', back: 'the cat' })).toBe(
      contentKey('flashcard', { back: 'The Cat', front: 'die katze' })
    );
    expect(contentKey('flashcard', { front: 'a', back: 'b' })).not.toBe(contentKey('flashcard', { front: 'a', back: 'c' }));
    expect(contentKey('fill_blank', { textWithBlank: 'a', correctAnswer: 'b' })).not.toBe(
      contentKey('free_text', { textWithBlank: 'a', correctAnswer: 'b' })
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/practiceTypes.test.ts lib/tutoring/practiceGeneration.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement**

Create `lib/tutoring/practiceTypes.ts`:

```ts
import type { ExerciseType, Skill } from '../curriculum/types';

export const PRACTICE_BATCH_SIZE = 5;

const TYPE_ORDER: readonly ExerciseType[] = ['multiple_choice', 'fill_blank', 'flashcard', 'free_text'];

// Practice mirrors the lesson's own exercise types; flashcards only ever in vocabulary lessons
// (Phase 1 rule). A lesson with nothing usable authored falls back to the two deterministic types.
export function allowedPracticeTypes(skill: Skill, authoredTypes: readonly ExerciseType[]): ExerciseType[] {
  const fromLesson = TYPE_ORDER.filter(
    (type) => authoredTypes.includes(type) && (type !== 'flashcard' || skill === 'vocabulary')
  );
  if (fromLesson.length > 0) return fromLesson;
  return skill === 'vocabulary' ? ['multiple_choice', 'fill_blank', 'flashcard'] : ['multiple_choice', 'fill_blank'];
}
```

Create `lib/tutoring/practiceGeneration.ts`:

```ts
import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { ExerciseContent, ExerciseType, Skill } from '../curriculum/types';
import { validateExerciseContent } from '../curriculum/exerciseContentValidation';

export const MAX_STYLE_EXAMPLES = 10;

export interface PracticeLessonContext {
  title: string;
  level: CefrLevel;
  skill: Skill;
  explanation: string | null;
  examples: string[] | null;
  authoredExercises: { type: ExerciseType; content: ExerciseContent }[];
}

export interface GeneratedExercise {
  type: ExerciseType;
  content: ExerciseContent;
}

const SHAPES: Record<ExerciseType, string> = {
  multiple_choice: 'multiple_choice: {"question": string, "options": [2 to 5 strings], "correctIndex": index of the right option}',
  fill_blank:
    'fill_blank: {"textWithBlank": a sentence with ___ for the gap, "correctAnswer": string, "acceptableVariants": optional array of other accepted answers}',
  flashcard: 'flashcard: {"front": a German word or phrase, "back": its meaning}',
  free_text: 'free_text: {"prompt": the task, "modelAnswer": one good answer}',
};

export function buildPracticeGenerationPrompt(
  ctx: PracticeLessonContext,
  allowedTypes: ExerciseType[],
  count: number
): { systemPrompt: string; messages: ChatMessage[] } {
  const systemPrompt = [
    'You write extra practice exercises for a German course.',
    `The lesson is "${ctx.title}" at CEFR level ${ctx.level} (skill: ${ctx.skill}).`,
    `Write exactly ${count} new exercises. Use only these types: ${allowedTypes.join(', ')}.`,
    "Match the language, style and difficulty of the lesson's example exercises, and keep German learning content in German.",
    'Do not repeat the example exercises or each other.',
    'Content shapes:',
    ...allowedTypes.map((type) => `- ${SHAPES[type]}`),
    'Reply with only a JSON object: {"exercises": [{"type": "...", "content": {...}}]}',
  ].join('\n');

  const parts: string[] = [];
  if (ctx.explanation) parts.push(`Lesson explanation:\n${ctx.explanation}`);
  if (ctx.examples && ctx.examples.length > 0) {
    parts.push(`Lesson examples:\n${ctx.examples.map((example) => `- ${example}`).join('\n')}`);
  }
  const style = ctx.authoredExercises.slice(0, MAX_STYLE_EXAMPLES);
  if (style.length > 0) parts.push(`Example exercises:\n${JSON.stringify(style)}`);
  parts.push(`Write ${count} new exercises now.`);

  return { systemPrompt, messages: [{ role: 'user', content: parts.join('\n\n') }] };
}

// `null` when the reply is not the expected JSON shape — a failed call, never guessed at.
// Otherwise the usable exercises, in reply order: allowed type, valid content, flashcard rule.
export function parseGeneratedExercises(
  text: string,
  allowedTypes: ExerciseType[],
  skill: Skill
): GeneratedExercise[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (data as { exercises?: unknown } | null)?.exercises;
  if (!Array.isArray(list)) return null;

  const usable: GeneratedExercise[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { type, content } = item as { type?: unknown; content?: unknown };
    if (typeof type !== 'string' || !(allowedTypes as string[]).includes(type)) continue;
    if (type === 'flashcard' && skill !== 'vocabulary') continue;
    if (validateExerciseContent(type, content).length > 0) continue;
    usable.push({ type: type as ExerciseType, content: content as ExerciseContent });
  }
  return usable;
}

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])])
    );
  }
  return value;
}

// Duplicate detection: exact after trimming, case-folding, and ordering object keys.
export function contentKey(type: ExerciseType | string, content: unknown): string {
  return `${type}:${JSON.stringify(canonical(content))}`;
}
```

Create `lib/tutoring/practiceViews.ts`:

```ts
import type { ExerciseView } from './exerciseView';
import type { GradeResult } from './grading';

// What `POST /api/tutoring/lessons/[id]/practice` returns: never the answers.
export interface PracticeBatch {
  exercises: ExerciseView[];
}

// What `POST /api/tutoring/practice/answer` returns. Nothing is stored.
export interface PracticeGradeOutcome {
  result: GradeResult;
  correctAnswer: string | null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/practiceTypes.test.ts lib/tutoring/practiceGeneration.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/practiceTypes.ts lib/tutoring/practiceTypes.test.ts lib/tutoring/practiceGeneration.ts lib/tutoring/practiceGeneration.test.ts lib/tutoring/practiceViews.ts
git commit -m "feat: add practice type rules and the generation prompt and parser"
```

---

### Task 7: The practice service

**Files:**
- Create: `lib/services/practiceService.ts`, `lib/services/practiceService.test.ts`
- Modify: `test/tutoringFixtures.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `gradeExerciseAnswer`.
  - From Task 6: `allowedPracticeTypes`, `PRACTICE_BATCH_SIZE`, `buildPracticeGenerationPrompt`, `parseGeneratedExercises`, `contentKey`, `PracticeBatch` and `PracticeGradeOutcome`.
  - From Task 2: `errorBody` and the error-code types.
  - From Phase 1: `toExerciseView`, `correctAnswerFor`, `generateWithActiveProvider`, `randomSuffix`, and the curriculum, profile, progress and unlock services.
- Produces:
  - `class PracticeError`, with kinds `not_found`, `locked`, `not_completed`, `bad_request` and `ai_failed`. It carries `code` and `params`.
  - `toPracticeErrorResponse(err)`, which maps the kinds to 404, 403, 409, 400 and 502 respectively.
  - `createPracticeService(db, deps?: { generate?; gradeFreeText?; now? })`, which provides:
    - `serveBatch(lessonId): Promise<PracticeBatch>`
    - `gradeAnswer(practiceExerciseId, answer): Promise<PracticeGradeOutcome>`
  - A new test helper, `addPracticeExercise(db, id, lessonId, options?)`.

- [ ] **Step 1: Add the fixture helper**

Append to `test/tutoringFixtures.ts`:

```ts
export function addPracticeExercise(
  db: Database.Database,
  id: string,
  lessonId: string,
  options: { type?: string; content?: unknown; status?: 'unreviewed' | 'approved' | 'rejected'; createdAt?: string } = {}
): void {
  db.prepare(
    `INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    lessonId,
    options.type ?? 'multiple_choice',
    JSON.stringify(options.content ?? { question: `Question ${id}?`, options: ['ja', 'nein'], correctIndex: 0 }),
    options.status ?? 'unreviewed',
    options.createdAt ?? '2026-09-29T10:00:00.000Z'
  );
}
```

- [ ] **Step 2: Write the tests**

Create `lib/services/practiceService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createPracticeService, PracticeError, toPracticeErrorResponse } from './practiceService';
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function reply(exercises: unknown[]) {
  return { ok: true as const, text: JSON.stringify({ exercises }) };
}

const mc = (q: string) => ({ type: 'multiple_choice', content: { question: q, options: ['ja', 'nein'], correctIndex: 0 } });

function setup(generate = vi.fn().mockResolvedValue(reply([]))) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  markComplete(db, 'a1-greet');
  const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Fast.' });
  const service = createPracticeService(db, { generate, gradeFreeText, now: () => new Date('2026-09-29T10:00:00.000Z') });
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return { db, service, generate, gradeFreeText, count };
}

describe('practiceService.serveBatch', () => {
  it('refuses a lesson that is unknown, locked, or not completed by the student', async () => {
    const { service } = setup();
    await expect(service.serveBatch('nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.serveBatch('a2-past')).rejects.toMatchObject({ code: 'level_locked', params: { level: 'A2' } });
    await expect(service.serveBatch('a1-sein')).rejects.toMatchObject({ kind: 'not_completed', code: 'lesson_not_completed' });
  });

  it('serves unseen, non-rejected pool exercises first and marks them seen, without calling the AI', async () => {
    const { db, service, generate, count } = setup();
    for (let i = 1; i <= 6; i++) addPracticeExercise(db, `px-${i}`, 'a1-greet', { createdAt: `2026-09-29T10:00:0${i}.000Z` });
    db.prepare("UPDATE practice_exercises SET review_status = 'rejected' WHERE id = 'px-1'").run();
    const batch = await service.serveBatch('a1-greet');
    expect(batch.exercises.map((e) => e.id)).toEqual(['px-2', 'px-3', 'px-4', 'px-5', 'px-6']);
    expect(batch.exercises[0]).toEqual({ id: 'px-2', type: 'multiple_choice', question: 'Question px-2?', options: ['ja', 'nein'] });
    expect(count('SELECT COUNT(*) AS n FROM practice_seen')).toBe(5);
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates only what is missing, keeping valid, allowed, new exercises', async () => {
    const generate = vi.fn().mockResolvedValue(
      reply([
        { type: 'multiple_choice', content: { question: 'HOW do you greet someone?', options: ['Hallo', 'Tschüss'], correctIndex: 0 } },
        mc('Neu 1?'),
        { type: 'flashcard', content: { front: 'die Katze', back: 'the cat' } },
        { type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'x' } },
        { type: 'multiple_choice', content: { question: 'Bad', options: ['one'], correctIndex: 0 } },
        mc('Neu 2?'),
        mc('Neu 3?'),
      ])
    );
    const { db, service, count } = setup(generate);
    addPracticeExercise(db, 'px-1', 'a1-greet');
    addPracticeExercise(db, 'px-2', 'a1-greet');

    const batch = await service.serveBatch('a1-greet');
    // Review Focus 3: the AI returned more usable exercises than needed; only 3 are kept.
    expect(batch.exercises).toHaveLength(5);
    expect(batch.exercises.slice(0, 2).map((e) => e.id)).toEqual(['px-1', 'px-2']);
    expect(batch.exercises.slice(2).map((e) => (e.type === 'multiple_choice' ? e.question : e.type))).toEqual([
      'Neu 1?',
      'flashcard',
      'Neu 2?',
    ]);
    expect(count("SELECT COUNT(*) AS n FROM practice_exercises WHERE review_status = 'unreviewed'")).toBe(5);
    expect(count('SELECT COUNT(*) AS n FROM practice_seen')).toBe(5);
    const { systemPrompt } = generate.mock.calls[0][0];
    expect(systemPrompt).toContain('Write exactly 3 new exercises. Use only these types: multiple_choice, flashcard.');
  });

  it('never re-generates an exercise that already exists in the pool, even a rejected one', async () => {
    const generate = vi.fn().mockResolvedValue(reply([mc('Old?'), mc('Fresh?')]));
    const { db, service } = setup(generate);
    addPracticeExercise(db, 'px-old', 'a1-greet', { status: 'rejected', content: { question: 'Old?', options: ['ja', 'nein'], correctIndex: 0 } });
    const batch = await service.serveBatch('a1-greet');
    expect(batch.exercises.map((e) => (e.type === 'multiple_choice' ? e.question : ''))).toEqual(['Fresh?']);
  });

  it('serves a short batch when generation fails but the pool had something', async () => {
    const { db, service } = setup(vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }));
    addPracticeExercise(db, 'px-1', 'a1-greet');
    expect((await service.serveBatch('a1-greet')).exercises.map((e) => e.id)).toEqual(['px-1']);
  });

  it('fails with the AI error when there is nothing at all to serve', async () => {
    const noProvider = setup(vi.fn().mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' }));
    await expect(noProvider.service.serveBatch('a1-greet')).rejects.toMatchObject({ kind: 'ai_failed', code: 'no_provider' });

    const malformed = setup(vi.fn().mockResolvedValue({ ok: true, text: 'Sorry, no.' }));
    await expect(malformed.service.serveBatch('a1-greet')).rejects.toMatchObject({ code: 'ai_bad_reply' });

    const unusable = setup(vi.fn().mockResolvedValue(reply([{ type: 'free_text', content: { prompt: 'x', modelAnswer: 'y' } }])));
    await expect(unusable.service.serveBatch('a1-greet')).rejects.toMatchObject({ code: 'ai_bad_reply' });
  });
});

describe('practiceService.gradeAnswer', () => {
  it('grades without recording anything', async () => {
    const { db, service, count } = setup();
    addPracticeExercise(db, 'px-mc', 'a1-greet');
    addPracticeExercise(db, 'px-card', 'a1-greet', { type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } });
    expect(await service.gradeAnswer('px-mc', { type: 'multiple_choice', selectedIndex: 1 })).toEqual({ result: 'wrong', correctAnswer: 'ja' });
    expect(await service.gradeAnswer('px-card', { type: 'flashcard', rating: 'knew' })).toEqual({ result: 'correct', correctAnswer: null });
    expect(count('SELECT COUNT(*) AS n FROM lesson_attempts')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM exercise_srs_state')).toBe(0);
  });

  it('grades free text with the AI and shows the model answer, without feedback', async () => {
    const { db, service, gradeFreeText } = setup();
    addPracticeExercise(db, 'px-free', 'a1-greet', { type: 'free_text', content: { prompt: 'Greet a friend.', modelAnswer: 'Hallo!' } });
    expect(await service.gradeAnswer('px-free', { type: 'free_text', text: 'Halo!' })).toEqual({ result: 'almost', correctAnswer: 'Hallo!' });
    expect(gradeFreeText).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Greet a friend.', modelAnswer: 'Hallo!', level: 'A1' }));
  });

  it('reports a missing exercise, a mismatched answer, and an AI failure', async () => {
    const { db, service, gradeFreeText } = setup();
    // Review Focus 2: an exercise promoted or deleted mid-batch is simply gone.
    await expect(service.gradeAnswer('px-gone', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ code: 'not_found' });
    addPracticeExercise(db, 'px-mc', 'a1-greet');
    await expect(service.gradeAnswer('px-mc', { type: 'fill_blank', text: 'ja' })).rejects.toMatchObject({ kind: 'bad_request' });
    addPracticeExercise(db, 'px-free', 'a1-greet', { type: 'free_text', content: { prompt: 'p', modelAnswer: 'm' } });
    gradeFreeText.mockResolvedValueOnce({ ok: false, error: 'Anthropic returned 429', code: 'ai_failed', params: { detail: 'Anthropic returned 429' } });
    await expect(service.gradeAnswer('px-free', { type: 'free_text', text: 'x' })).rejects.toMatchObject({
      kind: 'ai_failed',
      params: { detail: 'Anthropic returned 429' },
    });
  });
});

describe('toPracticeErrorResponse', () => {
  it('maps kinds to statuses and bodies with codes', () => {
    expect(toPracticeErrorResponse(new PracticeError('x', 'not_found'))).toEqual({ status: 404, body: { error: 'x', code: 'not_found' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'locked'))).toEqual({ status: 403, body: { error: 'x', code: 'level_locked' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'not_completed'))).toEqual({ status: 409, body: { error: 'x', code: 'lesson_not_completed' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x', code: 'bad_request' } });
    expect(toPracticeErrorResponse(new PracticeError('x', 'ai_failed', 'no_provider'))).toEqual({ status: 502, body: { error: 'x', code: 'no_provider' } });
    expect(toPracticeErrorResponse(new Error('x'))).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/services/practiceService.test.ts`
Expected: FAIL, because `./practiceService` doesn't exist.

- [ ] **Step 4: Implement**

Create `lib/services/practiceService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Exercise, ExerciseContent, ExerciseType } from '../curriculum/types';
import { randomSuffix } from '../curriculum-admin/randomId';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { toExerciseView } from '../tutoring/exerciseView';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { correctAnswerFor, type LessonAnswer } from '../tutoring/lessonAnswers';
import { buildPracticeGenerationPrompt, contentKey, parseGeneratedExercises, type GeneratedExercise } from '../tutoring/practiceGeneration';
import { allowedPracticeTypes, PRACTICE_BATCH_SIZE } from '../tutoring/practiceTypes';
import type { PracticeBatch, PracticeGradeOutcome } from '../tutoring/practiceViews';
import { generateWithActiveProvider, type AiRequest, type AiResult } from './aiService';
import { createCurriculumService } from './curriculumService';
import { gradeExerciseAnswer } from './exerciseGrading';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';
import { createUnlockService } from './unlockService';

export type PracticeErrorKind = 'not_found' | 'locked' | 'not_completed' | 'bad_request' | 'ai_failed';

const DEFAULT_CODE: Record<PracticeErrorKind, ErrorCode> = {
  not_found: 'not_found',
  locked: 'level_locked',
  not_completed: 'lesson_not_completed',
  bad_request: 'bad_request',
  ai_failed: 'ai_failed',
};

const STATUS_FOR: Record<PracticeErrorKind, number> = {
  not_found: 404,
  locked: 403,
  not_completed: 409,
  bad_request: 400,
  ai_failed: 502,
};

export class PracticeError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: PracticeErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toPracticeErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PracticeError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}

export interface PracticeDeps {
  generate?: (request: AiRequest) => Promise<AiResult>;
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
}

interface PoolRow {
  id: string;
  lesson_id: string;
  type: ExerciseType;
  content: string;
}

interface GenerationFailure {
  message: string;
  code?: ErrorCode;
  params?: ErrorParams;
}

export function createPracticeService(db: Database.Database, deps: PracticeDeps = {}) {
  const generate = deps.generate ?? ((request: AiRequest) => generateWithActiveProvider(db, request));
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const now = deps.now ?? (() => new Date());
  const curriculum = createCurriculumService(db);
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const unlocks = createUnlockService(db);

  // Spec: practice is only for a lesson in an unlocked level with the student's own completion.
  function getPracticeLesson(lessonId: string) {
    const lesson = curriculum.getLesson(lessonId, 'generic'); // getLesson ignores its track argument
    if (!lesson) throw new PracticeError(`Lesson not found: ${lessonId}`, 'not_found');
    if (!unlocks.isLevelUnlocked(lesson.sourceLevel)) {
      throw new PracticeError(`Level ${lesson.sourceLevel} is locked`, 'locked', 'level_locked', { level: lesson.sourceLevel });
    }
    if (!progress.isCompleted(lesson.id)) throw new PracticeError('Finish the lesson first', 'not_completed');
    return lesson;
  }

  function rowToExercise(row: PoolRow): Exercise {
    return { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content: JSON.parse(row.content) as ExerciseContent };
  }

  async function generateMissing(
    lesson: NonNullable<ReturnType<typeof curriculum.getLesson>>,
    need: number
  ): Promise<{ exercises: GeneratedExercise[]; failure: GenerationFailure | null }> {
    const authored = curriculum.getExercises(lesson.id, lesson.track);
    const allowed = allowedPracticeTypes(
      lesson.skill,
      authored.map((e) => e.type)
    );
    const reply = await generate(
      buildPracticeGenerationPrompt(
        {
          title: lesson.title,
          level: lesson.sourceLevel,
          skill: lesson.skill,
          explanation: lesson.explanation,
          examples: lesson.examples,
          authoredExercises: authored.map((e) => ({ type: e.type, content: e.content })),
        },
        allowed,
        need
      )
    );
    if (!reply.ok) return { exercises: [], failure: { message: reply.error, code: reply.code, params: reply.params } };
    const parsed = parseGeneratedExercises(reply.text, allowed, lesson.skill);
    if (!parsed) return { exercises: [], failure: { message: 'The AI replied in an unexpected format', code: 'ai_bad_reply' } };

    const pool = db.prepare('SELECT type, content FROM practice_exercises WHERE lesson_id = ?').all(lesson.id) as {
      type: ExerciseType;
      content: string;
    }[];
    const known = new Set([
      ...authored.map((e) => contentKey(e.type, e.content)),
      ...pool.map((row) => contentKey(row.type, JSON.parse(row.content))),
    ]);
    const fresh: GeneratedExercise[] = [];
    for (const exercise of parsed) {
      const key = contentKey(exercise.type, exercise.content);
      if (known.has(key)) continue;
      known.add(key);
      fresh.push(exercise);
      if (fresh.length === need) break;
    }
    return {
      exercises: fresh,
      failure: fresh.length === 0 ? { message: 'The AI replied with no usable exercises', code: 'ai_bad_reply' } : null,
    };
  }

  // Spec: Student Flow, "Starting a batch". Unseen pool exercises first; the AI fills the rest.
  async function serveBatch(lessonId: string): Promise<PracticeBatch> {
    const lesson = getPracticeLesson(lessonId);
    const unseen = db
      .prepare(
        `SELECT p.id, p.lesson_id, p.type, p.content FROM practice_exercises p
         WHERE p.lesson_id = ? AND p.review_status != 'rejected'
           AND NOT EXISTS (SELECT 1 FROM practice_seen s WHERE s.practice_exercise_id = p.id)
         ORDER BY p.created_at, p.rowid
         LIMIT ?`
      )
      .all(lesson.id, PRACTICE_BATCH_SIZE) as PoolRow[];

    const need = PRACTICE_BATCH_SIZE - unseen.length;
    const generated = need > 0 ? await generateMissing(lesson, need) : { exercises: [], failure: null };
    if (unseen.length === 0 && generated.exercises.length === 0) {
      const failure = generated.failure ?? { message: 'No practice exercises could be prepared', code: 'ai_failed' as const };
      throw new PracticeError(failure.message, 'ai_failed', failure.code, failure.params);
    }

    const at = now().toISOString();
    const insert = db.prepare(
      `INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at) VALUES (?, ?, ?, ?, 'unreviewed', ?)`
    );
    const markSeen = db.prepare('INSERT OR IGNORE INTO practice_seen (practice_exercise_id, served_at) VALUES (?, ?)');
    const served = db.transaction((): PoolRow[] => {
      const rows = [...unseen];
      for (const exercise of generated.exercises) {
        const id = `${lesson.id}__px-${randomSuffix()}`;
        const content = JSON.stringify(exercise.content);
        insert.run(id, lesson.id, exercise.type, content, at);
        rows.push({ id, lesson_id: lesson.id, type: exercise.type, content });
      }
      for (const row of rows) markSeen.run(row.id, at);
      return rows;
    })();
    return { exercises: served.map((row) => toExerciseView(rowToExercise(row))) };
  }

  // Spec: Student Flow, "Answering". Graded like a lesson answer; nothing is written.
  async function gradeAnswer(practiceExerciseId: string, answer: LessonAnswer): Promise<PracticeGradeOutcome> {
    const row = db
      .prepare('SELECT id, lesson_id, type, content FROM practice_exercises WHERE id = ?')
      .get(practiceExerciseId) as PoolRow | undefined;
    if (!row) throw new PracticeError(`Practice exercise not found: ${practiceExerciseId}`, 'not_found');
    const lesson = getPracticeLesson(row.lesson_id);
    const exercise = rowToExercise(row);
    const graded = await gradeExerciseAnswer(exercise, answer, lesson.sourceLevel, {
      gradeFreeText: gradeFree,
      uiLanguage: profiles.getProfile().uiLanguage,
    });
    if (!graded.ok) {
      if (graded.reason === 'bad_request') throw new PracticeError(graded.message, 'bad_request');
      throw new PracticeError(graded.message, 'ai_failed', graded.code, graded.params);
    }
    return { result: graded.result, correctAnswer: correctAnswerFor(exercise) };
  }

  return { serveBatch, gradeAnswer };
}

export type PracticeService = ReturnType<typeof createPracticeService>;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/services/practiceService.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add lib/services/practiceService.ts lib/services/practiceService.test.ts test/tutoringFixtures.ts
git commit -m "feat: serve practice batches from the pool and generate what is missing"
```

---

### Task 8: Practice routes

**Files:**
- Create:
  - `app/api/tutoring/lessons/[id]/practice/route.ts`
  - `app/api/tutoring/practice/answer/route.ts`
  - `app/api/tutoring/practice/routes.test.ts`

**Interfaces:**
- Consumes: `createPracticeService` and `toPracticeErrorResponse` (Task 7), `parseLessonAnswer` (Phase 1), `errorBody` (Task 2).
- Produces:
  - `POST /api/tutoring/lessons/[id]/practice` returns `PracticeBatch`, or an error body with a code.
  - `POST /api/tutoring/practice/answer` takes `{ practiceExerciseId, answer }` and returns `PracticeGradeOutcome`, or an error body with a code.

- [ ] **Step 1: Write the route tests**

Create `app/api/tutoring/practice/routes.test.ts`:

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
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { POST as startBatch } from '../lessons/[id]/practice/route';
import { POST as answer } from './answer/route';

function batch(id: string) {
  return startBatch(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id }) });
}

function grade(body: unknown) {
  return answer(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/tutoring practice routes', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-practice-'));
    const db = getDb();
    seedTutoringCurriculum(db);
    markComplete(db, 'a1-greet');
    for (let i = 1; i <= 5; i++) addPracticeExercise(db, `px-${i}`, 'a1-greet');
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
    vi.mocked(generateWithActiveProvider).mockReset();
  });

  it('serves a batch from the pool, then reports the AI failure when the pool is used up', async () => {
    const first = await batch('a1-greet');
    expect(first.status).toBe(200);
    expect((await first.json()).exercises).toHaveLength(5);

    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up', code: 'no_provider' });
    const second = await batch('a1-greet');
    expect(second.status).toBe(502);
    expect(await second.json()).toEqual({ error: 'No AI provider is set up', code: 'no_provider' });
  });

  it('refuses a lesson the student has not completed', async () => {
    const res = await batch('a1-sein');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Finish the lesson first', code: 'lesson_not_completed' });
  });

  it('grades a practice answer, and answers 400 and 404 for bad requests', async () => {
    const ok = await grade({ practiceExerciseId: 'px-1', answer: { type: 'multiple_choice', selectedIndex: 1 } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ result: 'wrong', correctAnswer: 'ja' });

    const malformed = await grade({ practiceExerciseId: 'px-1' });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).code).toBe('bad_request');

    const missing = await grade({ practiceExerciseId: 'px-gone', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/api/tutoring/practice/routes.test.ts`
Expected: FAIL, because the route modules don't exist.

- [ ] **Step 3: Implement the routes**

Create `app/api/tutoring/lessons/[id]/practice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPracticeService, toPracticeErrorResponse } from '@/lib/services/practiceService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(await createPracticeService(getDb()).serveBatch(params.id));
  } catch (err) {
    const mapped = toPracticeErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Create `app/api/tutoring/practice/answer/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPracticeService, toPracticeErrorResponse } from '@/lib/services/practiceService';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const practiceExerciseId = body?.practiceExerciseId;
  const answer = parseLessonAnswer(body?.answer);
  if (typeof practiceExerciseId !== 'string' || !answer) {
    return NextResponse.json(errorBody('practiceExerciseId and a valid answer are required', 'bad_request'), { status: 400 });
  }
  try {
    return NextResponse.json(await createPracticeService(getDb()).gradeAnswer(practiceExerciseId, answer));
  } catch (err) {
    const mapped = toPracticeErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run app/api/tutoring/practice/routes.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/tutoring/lessons/[id]/practice" app/api/tutoring/practice
git commit -m "feat: expose practice batches and practice grading"
```

---
### Task 9: Chat about practice exercises

Practice answers aren't stored, so Ask AI on a practice exercise sends the student's answer and result with the message. The server builds the same exercise context that Phase 1 builds from a stored attempt. Both chat messages are tagged with `practice_exercise_id`.

**Files:**
- Modify:
  - `lib/tutoring/lessonChat.ts`
  - `lib/services/lessonChatService.ts`, `lib/services/lessonChatService.test.ts`
  - `app/api/tutoring/lessons/[id]/chat/route.ts`, `app/api/tutoring/lessons/[id]/chat/route.test.ts`

**Interfaces:**
- Consumes: `correctAnswerFor`, `taskTextFor` (Phase 1), `CHAT_MESSAGE_MAX_LENGTH`, the `practice_exercises` table (Task 1).
- Produces:
  - `ChatMessageView` gains `practiceExerciseId: string | null`.
  - `interface PracticeChatAbout { practiceExerciseId: string; answerText: string; result: GradeResult }`.
  - `lessonChatService.send(lessonId, message, exerciseId: string | null, practice?: PracticeChatAbout | null)`. At most one of `exerciseId` and `practice` may be set.
  - The `POST /api/tutoring/lessons/[id]/chat` body gains:
    - `practiceExerciseId?: string | null`
    - `practiceAnswer?: { answerText: string; result: 'correct' | 'almost' | 'wrong' }`, which is required when `practiceExerciseId` is set.

- [ ] **Step 1: Write the tests**

In `lib/services/lessonChatService.test.ts`:
- Change the import of the fixtures to `import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';`.
- In the existing test "stores a general question and its reply", add `practiceExerciseId: null` to both expected messages. Place it right after `exerciseId: null`.
- Append inside `describe('lessonChatService', ...)`:

```ts
  it('attaches a practice exercise and the answer the student sent, and tags the messages with it', async () => {
    const { db, chat, generate } = setup();
    markComplete(db, 'a1-greet');
    addPracticeExercise(db, 'px-1', 'a1-greet', { content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } });
    const { messages } = await chat.send('a1-greet', 'Warum?', null, {
      practiceExerciseId: 'px-1',
      answerText: 'Hallo',
      result: 'wrong',
    });
    expect(messages.map((m) => [m.exerciseId, m.practiceExerciseId])).toEqual([
      [null, 'px-1'],
      [null, 'px-1'],
    ]);
    const prompt: string = generate.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain('Task: Bye? (options: Tschüss | Hallo)');
    expect(prompt).toContain("Learner's answer: Hallo");
    expect(prompt).toContain('Grade: wrong');
    expect(prompt).toContain('Correct answer: Tschüss');
  });

  it('refuses a practice exercise of another lesson, a practice flashcard, and both kinds at once', async () => {
    const { db, chat, attempts } = setup();
    addPracticeExercise(db, 'px-sein', 'a1-sein');
    addPracticeExercise(db, 'px-card', 'a1-greet', { type: 'flashcard', content: { front: 'a', back: 'b' } });
    addPracticeExercise(db, 'px-ok', 'a1-greet');
    await attempts.recordAttempt('a1-greet__ex1', { type: 'multiple_choice', selectedIndex: 0 }, 'lesson');
    const about = (id: string) => ({ practiceExerciseId: id, answerText: 'x', result: 'wrong' as const });
    await expect(chat.send('a1-greet', 'Warum?', null, about('px-sein'))).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', null, about('px-card'))).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(chat.send('a1-greet', 'Warum?', 'a1-greet__ex1', about('px-ok'))).rejects.toMatchObject({ kind: 'bad_request' });
  });
```

In `app/api/tutoring/lessons/[id]/chat/route.test.ts`, add inside its `describe`:

```ts
  it('POST validates the practice answer that comes with a practice exercise', async () => {
    expect((await post('a1-greet', { message: 'Hi?', practiceExerciseId: 'px-1' })).status).toBe(400);
    expect(
      (await post('a1-greet', { message: 'Hi?', practiceExerciseId: 'px-1', practiceAnswer: { answerText: 'x', result: 'great' } })).status
    ).toBe(400);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat/route.test.ts"`
Expected: FAIL. `practiceExerciseId` is missing from the messages, and `send` ignores a fourth argument.

- [ ] **Step 3: Implement**

In `lib/tutoring/lessonChat.ts`, add `practiceExerciseId: string | null;` to `ChatMessageView`, directly after `exerciseId: string | null;`. Then add:

```ts
// Ask AI on a practice exercise: its answer isn't stored, so the client sends it with the message.
export interface PracticeChatAbout {
  practiceExerciseId: string;
  answerText: string;
  result: GradeResult;
}
```

In `lib/services/lessonChatService.ts`:

(a) Add `practice_exercise_id: string | null;` to `MessageRow`. Change the `listMessages` query and mapping to:

```ts
    const rows = db
      .prepare(
        'SELECT id, role, content, exercise_id, practice_exercise_id, created_at FROM lesson_chat_messages WHERE lesson_id = ? ORDER BY id'
      )
      .all(lessonId) as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      exerciseId: row.exercise_id,
      practiceExerciseId: row.practice_exercise_id,
      createdAt: row.created_at,
    }));
```

(b) Add this function after `exerciseContext`:

```ts
  function practiceContext(lessonId: string, about: PracticeChatAbout): ChatExerciseContext {
    const row = db
      .prepare('SELECT id, lesson_id, type, content FROM practice_exercises WHERE id = ? AND lesson_id = ?')
      .get(about.practiceExerciseId, lessonId) as { id: string; lesson_id: string; type: Exercise['type']; content: string } | undefined;
    if (!row) throw new ChatError('That practice exercise is not part of this lesson', 'bad_request');
    if (row.type === 'flashcard') throw new ChatError('Ask AI is not available for flashcards', 'bad_request');
    const exercise: Exercise = { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content: JSON.parse(row.content) };
    return {
      task: taskTextFor(exercise),
      studentAnswer: about.answerText,
      result: about.result,
      correctAnswer: correctAnswerFor(exercise),
      isFreeText: row.type === 'free_text',
      feedback: null,
    };
  }
```

(c) Change `send` to accept a fourth argument and use it. The changed lines are:

```ts
  async function send(
    lessonId: string,
    message: string,
    exerciseId: string | null,
    practice: PracticeChatAbout | null = null
  ): Promise<{ messages: ChatMessageView[] }> {
```

```ts
    if (exerciseId && practice) throw new ChatError('Ask about one exercise at a time', 'bad_request');
    const lesson = getUnlockedLesson(lessonId);
    const context = exerciseId
      ? exerciseContext(lesson.id, exerciseId)
      : practice
        ? practiceContext(lesson.id, practice)
        : null;
```

```ts
    const insert = db.prepare(
      'INSERT INTO lesson_chat_messages (lesson_id, exercise_id, practice_exercise_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const practiceId = practice?.practiceExerciseId ?? null;
    const ids = db.transaction(() => [
      Number(insert.run(lesson.id, exerciseId, practiceId, 'user', content, at).lastInsertRowid),
      Number(insert.run(lesson.id, exerciseId, practiceId, 'assistant', reply.text, at).lastInsertRowid),
    ])();
```

Also import `type PracticeChatAbout` from `'../tutoring/lessonChat'`.

In `app/api/tutoring/lessons/[id]/chat/route.ts`, replace the body parsing and the `send` call in `POST` with:

```ts
  const body = await request.json().catch(() => null);
  const message = body?.message;
  const exerciseId = body?.exerciseId ?? null;
  const practiceExerciseId = body?.practiceExerciseId ?? null;
  const practiceAnswer = body?.practiceAnswer;
  const validResult = (value: unknown) => value === 'correct' || value === 'almost' || value === 'wrong';
  const practiceOk =
    practiceExerciseId === null ||
    (typeof practiceExerciseId === 'string' &&
      typeof practiceAnswer?.answerText === 'string' &&
      practiceAnswer.answerText.length <= CHAT_MESSAGE_MAX_LENGTH &&
      validResult(practiceAnswer?.result));
  if (typeof message !== 'string' || (exerciseId !== null && typeof exerciseId !== 'string') || !practiceOk) {
    return NextResponse.json(
      errorBody('message (text), an optional exerciseId, or a practiceExerciseId with its practiceAnswer are required', 'bad_request'),
      { status: 400 }
    );
  }
  const practice =
    practiceExerciseId === null
      ? null
      : { practiceExerciseId, answerText: practiceAnswer.answerText as string, result: practiceAnswer.result };
  try {
    return NextResponse.json(await createLessonChatService(getDb()).send(params.id, message, exerciseId, practice));
  } catch (err) {
    return mapError(err);
  }
```

Import `CHAT_MESSAGE_MAX_LENGTH` from `@/lib/tutoring/lessonChat`, alongside the existing `errorBody` import from Task 2.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat/route.test.ts" lib/tutoring/lessonChat.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/lessonChat.ts lib/services/lessonChatService.ts lib/services/lessonChatService.test.ts "app/api/tutoring/lessons/[id]/chat"
git commit -m "feat: let the lesson chat talk about a practice exercise"
```

---

### Task 10: The practice admin service and routes

**Files:**
- Create:
  - `lib/services/practiceAdminService.ts`, `lib/services/practiceAdminService.test.ts`
  - `app/api/admin/practice/route.ts`, `app/api/admin/practice/[id]/route.ts`, `app/api/admin/practice/[id]/promote/route.ts`
  - `app/api/admin/practice/routes.test.ts`

**Interfaces:**
- Consumes: `flashcardRuleViolation` (lessonAdminService, Phase 1A), `validateExerciseContent`, `correctAnswerFor`, `randomSuffix`, `isAdminSessionValid` (async).
- Produces:
  - Types:
    - `type PracticeReviewStatus = 'unreviewed' | 'approved' | 'rejected'`.
    - `interface PracticePoolItem { id; lessonId; lessonTitle; track; level; type; content; correctAnswer: string | null; reviewStatus; createdAt; reviewedAt: string | null }`.
    - `class PracticeAdminError`, with kinds `not_found` and `bad_request`.
  - `createPracticeAdminService(db, deps?: { now? })`, which provides:
    - `list(filter?: { status?; track?; level?; lessonId? }): PracticePoolItem[]`, oldest first.
    - `setStatus(id, 'approved' | 'rejected'): PracticePoolItem`.
    - `editContent(id, content): PracticePoolItem`. It validates the content, keeps the type, and marks the exercise approved.
    - `promote(id): { exerciseId: string }`.
  - Routes (admin only; English, code-free errors):
    - `GET /api/admin/practice?status=&track=&level=&lessonId=` returns `PracticePoolItem[]`.
    - `PATCH /api/admin/practice/[id]` takes `{ action: 'approve' | 'reject' }` or `{ content }`.
    - `POST /api/admin/practice/[id]/promote` returns `{ exerciseId }`.

- [ ] **Step 1: Write the service tests**

Create `lib/services/practiceAdminService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createPracticeAdminService, PracticeAdminError } from './practiceAdminService';
import { addPracticeExercise, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const admin = createPracticeAdminService(db, { now: () => new Date('2026-09-30T08:00:00.000Z') });
  return { db, admin };
}

function kindOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (err) {
    return (err as PracticeAdminError).kind;
  }
  return undefined;
}

describe('practiceAdminService', () => {
  it('lists pool exercises with their lesson, oldest first, filtered by status, track, level and lesson', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-2', 'a1-greet', { createdAt: '2026-09-29T10:00:02.000Z' });
    addPracticeExercise(db, 'px-1', 'a1-greet', { createdAt: '2026-09-29T10:00:01.000Z' });
    addPracticeExercise(db, 'px-3', 'a1-goethe-greet', { status: 'approved' });
    expect(admin.list({ status: 'unreviewed' }).map((i) => i.id)).toEqual(['px-1', 'px-2']);
    expect(admin.list({ track: 'goethe', level: 'A1' }).map((i) => i.id)).toEqual(['px-3']);
    expect(admin.list({ lessonId: 'a1-greet' }).map((i) => i.id)).toEqual(['px-1', 'px-2']);
    expect(admin.list({ status: 'unreviewed' })[0]).toEqual({
      id: 'px-1',
      lessonId: 'a1-greet',
      lessonTitle: 'Saying hello',
      track: 'generic',
      level: 'A1',
      type: 'multiple_choice',
      content: { question: 'Question px-1?', options: ['ja', 'nein'], correctIndex: 0 },
      correctAnswer: 'ja',
      reviewStatus: 'unreviewed',
      createdAt: '2026-09-29T10:00:01.000Z',
      reviewedAt: null,
    });
  });

  it('approves and rejects', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-1', 'a1-greet');
    expect(admin.setStatus('px-1', 'approved')).toMatchObject({ reviewStatus: 'approved', reviewedAt: '2026-09-30T08:00:00.000Z' });
    expect(admin.setStatus('px-1', 'rejected')).toMatchObject({ reviewStatus: 'rejected' });
    expect(() => admin.setStatus('nope', 'approved')).toThrow(PracticeAdminError);
  });

  it('edits content in place, keeping the type and approving it, and rejects invalid content', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-1', 'a1-greet');
    const edited = admin.editContent('px-1', { question: 'Fixed?', options: ['ja', 'nein'], correctIndex: 1 });
    expect(edited).toMatchObject({ type: 'multiple_choice', reviewStatus: 'approved', correctAnswer: 'nein' });
    expect(kindOf(() => admin.editContent('px-1', { question: '', options: ['ja'], correctIndex: 0 }))).toBe('bad_request');
  });

  it('promotes into the lesson’s authored exercises, keeps the completion, and leaves the pool', () => {
    const { db, admin } = setup();
    markComplete(db, 'a1-greet');
    addPracticeExercise(db, 'px-1', 'a1-greet');
    const { exerciseId } = admin.promote('px-1');
    expect(exerciseId).toMatch(/^a1-greet__ex-[0-9a-f]{6}$/);
    expect(db.prepare('SELECT lesson_id, type FROM exercises WHERE id = ?').get(exerciseId)).toEqual({
      lesson_id: 'a1-greet',
      type: 'multiple_choice',
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM practice_exercises WHERE id = 'px-1'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM lesson_completions WHERE lesson_id = 'a1-greet'").get()).toEqual({ n: 1 });
  });

  it('refuses to promote a flashcard into a non-vocabulary lesson', () => {
    const { db, admin } = setup();
    addPracticeExercise(db, 'px-card', 'a1-sein', { type: 'flashcard', content: { front: 'a', back: 'b' } });
    expect(kindOf(() => admin.promote('px-card'))).toBe('bad_request');
    expect(db.prepare("SELECT COUNT(*) AS n FROM practice_exercises WHERE id = 'px-card'").get()).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 2: Write the route tests**

Create `app/api/admin/practice/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { addPracticeExercise, seedTutoringCurriculum } from '@/test/tutoringFixtures';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { GET } from './route';
import { PATCH } from './[id]/route';
import { POST as promote } from './[id]/promote/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/admin/practice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-practice-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    const db = getDb();
    seedTutoringCurriculum(db);
    addPracticeExercise(db, 'px-1', 'a1-greet');
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('requires an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await GET(new Request('http://localhost/api/admin/practice'))).status).toBe(401);
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{}' }), ctx('px-1'))).status).toBe(401);
    expect((await promote(new Request('http://localhost', { method: 'POST' }), ctx('px-1'))).status).toBe(401);
  });

  it('lists, approves, edits and promotes', async () => {
    const listed = await (await GET(new Request('http://localhost/api/admin/practice?status=unreviewed&track=generic&level=A1'))).json();
    expect(listed.map((i: { id: string }) => i.id)).toEqual(['px-1']);

    const approved = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }), ctx('px-1'));
    expect((await approved.json()).reviewStatus).toBe('approved');

    const bad = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'maybe' }) }), ctx('px-1'));
    expect(bad.status).toBe(400);

    const promoted = await promote(new Request('http://localhost', { method: 'POST' }), ctx('px-1'));
    expect((await promoted.json()).exerciseId).toMatch(/^a1-greet__ex-/);

    const gone = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }), ctx('px-1'));
    expect(gone.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/services/practiceAdminService.test.ts app/api/admin/practice/routes.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 4: Implement the service**

Create `lib/services/practiceAdminService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { Exercise, ExerciseContent, ExerciseType, Skill } from '../curriculum/types';
import { validateExerciseContent } from '../curriculum/exerciseContentValidation';
import { randomSuffix } from '../curriculum-admin/randomId';
import { correctAnswerFor } from '../tutoring/lessonAnswers';
import { flashcardRuleViolation } from './lessonAdminService';

export type PracticeReviewStatus = 'unreviewed' | 'approved' | 'rejected';

export interface PracticePoolItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  track: Track;
  level: CefrLevel;
  type: ExerciseType;
  content: ExerciseContent;
  correctAnswer: string | null;
  reviewStatus: PracticeReviewStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export class PracticeAdminError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_found' | 'bad_request'
  ) {
    super(message);
  }
}

interface ItemRow {
  id: string;
  lesson_id: string;
  lesson_title: string;
  track: Track;
  level: CefrLevel;
  skill: Skill;
  type: ExerciseType;
  content: string;
  review_status: PracticeReviewStatus;
  created_at: string;
  reviewed_at: string | null;
}

const SELECT_ITEMS = `
  SELECT p.id, p.lesson_id, l.title AS lesson_title, l.track, l.source_level AS level, l.skill,
         p.type, p.content, p.review_status, p.created_at, p.reviewed_at
  FROM practice_exercises p
  JOIN lessons l ON l.id = p.lesson_id`;

function rowToItem(row: ItemRow): PracticePoolItem {
  const content = JSON.parse(row.content) as ExerciseContent;
  const exercise: Exercise = { id: row.id, lessonId: row.lesson_id, track: null, type: row.type, content };
  return {
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    track: row.track,
    level: row.level,
    type: row.type,
    content,
    correctAnswer: correctAnswerFor(exercise),
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export function createPracticeAdminService(db: Database.Database, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());

  function getRow(id: string): ItemRow {
    const row = db.prepare(`${SELECT_ITEMS} WHERE p.id = ?`).get(id) as ItemRow | undefined;
    if (!row) throw new PracticeAdminError(`Practice exercise not found: ${id}`, 'not_found');
    return row;
  }

  function list(
    filter: { status?: PracticeReviewStatus; track?: Track; level?: CefrLevel; lessonId?: string } = {}
  ): PracticePoolItem[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.status) (where.push('p.review_status = ?'), args.push(filter.status));
    if (filter.track) (where.push('l.track = ?'), args.push(filter.track));
    if (filter.level) (where.push('l.source_level = ?'), args.push(filter.level));
    if (filter.lessonId) (where.push('p.lesson_id = ?'), args.push(filter.lessonId));
    const sql = `${SELECT_ITEMS}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at, p.rowid`;
    return (db.prepare(sql).all(...args) as ItemRow[]).map(rowToItem);
  }

  function setStatus(id: string, status: 'approved' | 'rejected'): PracticePoolItem {
    getRow(id);
    db.prepare('UPDATE practice_exercises SET review_status = ?, reviewed_at = ? WHERE id = ?').run(status, now().toISOString(), id);
    return rowToItem(getRow(id));
  }

  // Spec: Admin, "Edit" — same type, validated like the admin editor, and marked approved.
  function editContent(id: string, content: unknown): PracticePoolItem {
    const row = getRow(id);
    const errors = validateExerciseContent(row.type, content);
    if (errors.length > 0) throw new PracticeAdminError(`Invalid content: ${errors.join('; ')}`, 'bad_request');
    db.prepare("UPDATE practice_exercises SET content = ?, review_status = 'approved', reviewed_at = ? WHERE id = ?").run(
      JSON.stringify(content),
      now().toISOString(),
      id
    );
    return rowToItem(getRow(id));
  }

  // Spec: Admin, "Promote" — becomes an authored exercise of its lesson and leaves the pool. The
  // flashcard rule applies; a completed lesson stays complete (Phase 1: completion is sticky).
  function promote(id: string): { exerciseId: string } {
    return db.transaction(() => {
      const row = getRow(id);
      const violation = flashcardRuleViolation(row.skill, [{ type: row.type }]);
      if (violation) throw new PracticeAdminError(violation, 'bad_request');
      const exerciseId = `${row.lesson_id}__ex-${randomSuffix()}`;
      db.prepare('INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, NULL, ?, ?)').run(
        exerciseId,
        row.lesson_id,
        row.type,
        row.content
      );
      db.prepare('DELETE FROM practice_exercises WHERE id = ?').run(id);
      return { exerciseId };
    })();
  }

  return { list, setStatus, editContent, promote };
}

export type PracticeAdminService = ReturnType<typeof createPracticeAdminService>;
```

- [ ] **Step 5: Implement the routes**

Create `app/api/admin/practice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, type PracticeReviewStatus } from '@/lib/services/practiceAdminService';
import { isCefrLevel, isTrack } from '@/lib/tutoring/levels';

export const dynamic = 'force-dynamic';

const STATUSES: readonly string[] = ['unreviewed', 'approved', 'rejected'];

export async function GET(request: Request) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const status = query.get('status');
  const track = query.get('track');
  const level = query.get('level');
  const lessonId = query.get('lessonId');
  return NextResponse.json(
    createPracticeAdminService(getDb()).list({
      status: status && STATUSES.includes(status) ? (status as PracticeReviewStatus) : undefined,
      track: isTrack(track) ? track : undefined,
      level: isCefrLevel(level) ? level : undefined,
      lessonId: lessonId ?? undefined,
    })
  );
}
```

Create `app/api/admin/practice/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, PracticeAdminError } from '@/lib/services/practiceAdminService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const service = createPracticeAdminService(getDb());
  try {
    if (body?.action === 'approve') return NextResponse.json(service.setStatus(id, 'approved'));
    if (body?.action === 'reject') return NextResponse.json(service.setStatus(id, 'rejected'));
    if (body && 'content' in body) return NextResponse.json(service.editContent(id, body.content));
    return NextResponse.json({ error: 'Send { action: "approve" | "reject" } or { content }' }, { status: 400 });
  } catch (err) {
    if (err instanceof PracticeAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === 'not_found' ? 404 : 400 });
    }
    throw err;
  }
}
```

Create `app/api/admin/practice/[id]/promote/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPracticeAdminService, PracticeAdminError } from '@/lib/services/practiceAdminService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  try {
    return NextResponse.json(createPracticeAdminService(getDb()).promote(id));
  } catch (err) {
    if (err instanceof PracticeAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === 'not_found' ? 404 : 400 });
    }
    throw err;
  }
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/services/practiceAdminService.test.ts app/api/admin/practice/routes.test.ts`
Expected: PASS. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add lib/services/practiceAdminService.ts lib/services/practiceAdminService.test.ts app/api/admin/practice
git commit -m "feat: let admins approve, reject, edit and promote practice exercises"
```

---

### Task 11: Approved practice in the curriculum export

**Files:**
- Modify: `lib/services/curriculumSeedLoader.ts`, `lib/services/curriculumExportService.ts`, `lib/services/curriculumExportService.test.ts`
- Create: `lib/services/curriculumSeedLoader.practice.test.ts`

**Interfaces:**
- Produces:
  - `SeedFile.practice?: { id: string; lessonId: string; type: string; content: unknown }[]`.
  - `exportTrackLevel` fills `practice` with the approved pool exercises of the lessons placed in the file, oldest first.
  - The loader inserts listed practice exercises as `approved` if their id doesn't exist yet. It skips any whose lesson doesn't exist.

- [ ] **Step 1: Write the tests**

Create `lib/services/curriculumSeedLoader.practice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';

function seed(practice?: SeedFile['practice']): SeedFile {
  return {
    seedVersion: '7',
    track: 'generic',
    level: 'A1',
    milestones: [
      {
        milestone: { id: 'g-m', track: 'generic', level: 'A1', title: 'M', description: null, orderIndex: 0 },
        sections: [{ section: { id: 'g-s', milestoneId: 'g-m', title: 'S', description: null, orderIndex: 0 }, lessonRefs: [{ lessonId: 'a1-l', orderIndex: 0 }] }],
      },
    ],
    lessons: [{ id: 'a1-l', track: 'generic', sourceLevel: 'A1', skill: 'grammar', title: 'L', explanation: null, examples: null }],
    exercises: [],
    prerequisites: [],
    ...(practice ? { practice } : {}),
  };
}

function load(file: SeedFile) {
  const dir = mkdtempSync(join(tmpdir(), 'gait-practice-seed-'));
  writeFileSync(join(dir, 'generic-a1.json'), JSON.stringify(file));
  const db = createDbClient(':memory:');
  loadSeedIfNeeded(db, dir);
  return db;
}

describe('seed loader: practice', () => {
  it('loads listed practice exercises as approved, skipping any whose lesson is missing', () => {
    const db = load(
      seed([
        { id: 'a1-l__px-1', lessonId: 'a1-l', type: 'fill_blank', content: { textWithBlank: '___', correctAnswer: 'ja' } },
        { id: 'a1-x__px-1', lessonId: 'a1-x', type: 'fill_blank', content: { textWithBlank: '___', correctAnswer: 'ja' } },
      ])
    );
    expect(db.prepare('SELECT id, review_status FROM practice_exercises').all()).toEqual([{ id: 'a1-l__px-1', review_status: 'approved' }]);
  });

  it('loads a file without a practice list as before', () => {
    expect(load(seed()).prepare('SELECT COUNT(*) AS n FROM practice_exercises').get()).toEqual({ n: 0 });
  });
});
```

Append inside `describe('curriculumExportService', ...)` in `lib/services/curriculumExportService.test.ts`:

```ts
  it('exports only approved practice exercises, and they load back as approved', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('g-m', 'generic', 'A1', 'M', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('g-s', 'g-m', 'S', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g', 'generic', 'A1', 'grammar', 'G');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-g', 'g-s', 0);
      INSERT INTO practice_exercises (id, lesson_id, type, content, review_status, created_at) VALUES
        ('a1-g__px-b', 'a1-g', 'fill_blank', '{"textWithBlank":"b ___","correctAnswer":"x"}', 'approved', '2026-09-29T10:00:02.000Z'),
        ('a1-g__px-a', 'a1-g', 'fill_blank', '{"textWithBlank":"a ___","correctAnswer":"x"}', 'approved', '2026-09-29T10:00:01.000Z'),
        ('a1-g__px-u', 'a1-g', 'fill_blank', '{"textWithBlank":"u ___","correctAnswer":"x"}', 'unreviewed', '2026-09-29T10:00:03.000Z'),
        ('a1-g__px-r', 'a1-g', 'fill_blank', '{"textWithBlank":"r ___","correctAnswer":"x"}', 'rejected', '2026-09-29T10:00:04.000Z');
    `);
    const seed = createCurriculumExportService(db).exportTrackLevel('generic', 'A1');
    expect(seed.practice).toEqual([
      { id: 'a1-g__px-a', lessonId: 'a1-g', type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'x' } },
      { id: 'a1-g__px-b', lessonId: 'a1-g', type: 'fill_blank', content: { textWithBlank: 'b ___', correctAnswer: 'x' } },
    ]);

    const dir = mkdtempSync(join(tmpdir(), 'gait-export-practice-'));
    writeFileSync(join(dir, 'generic-a1.json'), JSON.stringify({ ...seed, seedVersion: 'next' }));
    const target = createDbClient(':memory:');
    loadSeedIfNeeded(target, dir);
    expect(createCurriculumExportService(target).exportTrackLevel('generic', 'A1').practice).toEqual(seed.practice);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/curriculumSeedLoader.practice.test.ts lib/services/curriculumExportService.test.ts`
Expected: FAIL. Nothing is loaded yet, and `seed.practice` is undefined.

- [ ] **Step 3: Implement**

In `lib/services/curriculumSeedLoader.ts`:

(a) Add this to the `SeedFile` interface, after `conceptLinks?`:

```ts
  practice?: { id: string; lessonId: string; type: string; content: unknown }[];
```

(b) At the end of `upsertSeedFile`, after the concept-link loop, add:

```ts
  // Tutoring Phase 2: approved practice exercises travel with the curriculum. An existing pool
  // row (any status) is never overwritten, so an install's own review decisions stand.
  const insertPractice = db.prepare(
    `INSERT OR IGNORE INTO practice_exercises (id, lesson_id, type, content, review_status, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, 'approved', datetime('now'), datetime('now'))`
  );
  for (const item of seed.practice ?? []) {
    if (!lessonExists.get(item.lessonId)) continue;
    insertPractice.run(item.id, item.lessonId, item.type, JSON.stringify(item.content));
  }
```

In `lib/services/curriculumExportService.ts`, inside `exportTrackLevel`, before the `return`:

```ts
    const practiceStmt = db.prepare(
      "SELECT id, lesson_id, type, content FROM practice_exercises WHERE lesson_id = ? AND review_status = 'approved' ORDER BY created_at, rowid"
    );
    const practice = lessonIds.flatMap((id) =>
      (practiceStmt.all(id) as { id: string; lesson_id: string; type: string; content: string }[]).map((p) => ({
        id: p.id,
        lessonId: p.lesson_id,
        type: p.type,
        content: JSON.parse(p.content) as unknown,
      }))
    );
```

Then add `practice` to the returned object, after `conceptLinks`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/curriculumSeedLoader.practice.test.ts lib/services/curriculumExportService.test.ts lib/services/curriculumSeedLoader.test.ts lib/services/curriculumSeedLoader.conceptLinks.test.ts app/api/admin/curriculum/export`
Expected: PASS. The existing whole-curriculum round trip still matches, with an empty `practice` on both sides. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/curriculumSeedLoader.ts lib/services/curriculumSeedLoader.practice.test.ts lib/services/curriculumExportService.ts lib/services/curriculumExportService.test.ts
git commit -m "feat: export approved practice exercises with the curriculum"
```

---
### Task 12: Practice mode in the exercise card, and `PracticeRun`

**Files:**
- Create: `components/tutoring/PracticeRun.tsx`, `components/tutoring/PracticeRun.test.tsx`
- Modify: `components/tutoring/ExerciseCard.tsx`, `components/tutoring/ExerciseCard.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes:
  - From Task 8: `POST /api/tutoring/lessons/[id]/practice` and `POST /api/tutoring/practice/answer`.
  - From Tasks 3 and 6: `PracticeBatch`, `PracticeGradeOutcome`, and `useApiErrorText`.
- Produces:
  - `ExerciseCard` gains three props:
    - `mode?: 'lesson' | 'practice'` (default `'lesson'`).
    - `onPracticeAnswered?: (outcome: PracticeGradeOutcome) => void`.
    - `onAnswered` becomes optional.
  - `onAskAi` becomes `(exerciseId: string, answer: { answerText: string; result: GradeResult }) => void`. Existing one-argument callers still type-check.
  - `PracticeRun`, with props `{ lessonId: string; onAskAi: (practiceExerciseId: string, answer: { answerText: string; result: GradeResult }) => void }`.
  - The `practice` catalog namespace, and `exercise.practiceResult`.

- [ ] **Step 1: Add the catalog text**

In `messages/en.json`, add inside the `exercise` namespace, directly after `"result": { ... },`:

```json
    "practiceResult": {
      "correct": "Right",
      "almost": "Almost",
      "wrong": "Wrong"
    },
```

and add this top-level namespace directly after `exercise`:

```json
  "practice": {
    "getMore": "Get more exercises",
    "preparing": "Preparing exercises…",
    "counter": "Practice {current} of {total}",
    "summary": "{correct} right, {almost} almost, {wrong} wrong",
    "summarySkipped": "{skipped} skipped",
    "generationFailed": "No practice exercises could be prepared: {error}. <link>Visit Settings</link> if this keeps happening.",
    "genericError": "Something went wrong: {error}"
  },
```

In `messages/de.json`, add the same keys in the same places:

```json
    "practiceResult": {
      "correct": "Richtig",
      "almost": "Fast richtig",
      "wrong": "Falsch"
    },
```

```json
  "practice": {
    "getMore": "Mehr Übungen",
    "preparing": "Übungen werden vorbereitet …",
    "counter": "Übung {current} von {total}",
    "summary": "{correct} richtig, {almost} fast richtig, {wrong} falsch",
    "summarySkipped": "{skipped} übersprungen",
    "generationFailed": "Es konnten keine Übungen vorbereitet werden: {error}. <link>Öffne die Einstellungen</link>, falls das öfter passiert.",
    "genericError": "Etwas ist schiefgelaufen: {error}"
  },
```

- [ ] **Step 2: Write the tests**

Append inside `describe('ExerciseCard', ...)` in `components/tutoring/ExerciseCard.test.tsx`:

```tsx
  it('in practice mode grades through the practice endpoint and shows Wrong with the correct answer', async () => {
    const fetchMock = stubAttempts(() => delayedResponse({ result: 'wrong', correctAnswer: 'Hallo' }));
    const onPracticeAnswered = vi.fn();
    const onAskAi = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="practice" onPracticeAnswered={onPracticeAnswered} onNext={vi.fn()} onSkip={vi.fn()} onAskAi={onAskAi} />
    );
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Wrong')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Hallo')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/practice/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceExerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
    expect(onPracticeAnswered).toHaveBeenCalledWith({ result: 'wrong', correctAnswer: 'Hallo' });
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(onAskAi).toHaveBeenCalledWith('ex1', { answerText: 'Tschüss', result: 'wrong' });
  });

  it('in practice mode shows Right alone, and Almost with the model answer for free text', async () => {
    stubAttempts(() => delayedResponse({ result: 'correct', correctAnswer: 'Hallo' }));
    const { unmount } = renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="practice" onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Right')).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer:/)).not.toBeInTheDocument();
    unmount();

    stubAttempts(() => delayedResponse({ result: 'almost', correctAnswer: 'Ich bin müde.' }));
    renderWithIntl(<ExerciseCard exercise={FREE} source="lesson" mode="practice" onNext={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Almost')).toBeInTheDocument();
    expect(screen.getByText('Model answer: Ich bin müde.')).toBeInTheDocument();
  });

  it('in practice mode offers Skip for any error, such as an exercise removed mid-batch', async () => {
    stubAttempts(() => delayedResponse({ error: 'Practice exercise not found: ex1', code: 'not_found' }, { ok: false, status: 404 }));
    const onSkip = vi.fn();
    renderWithIntl(<ExerciseCard exercise={MC} source="lesson" mode="practice" onNext={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: That could not be found');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onSkip).toHaveBeenCalled();
  });
```

Create `components/tutoring/PracticeRun.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { PracticeRun } from './PracticeRun';

const BATCH = {
  exercises: [
    { id: 'px-1', type: 'multiple_choice', question: 'First?', options: ['ja', 'nein'] },
    { id: 'px-2', type: 'multiple_choice', question: 'Second?', options: ['ja', 'nein'] },
  ],
};

function stubFetch(batch: () => Promise<unknown>, answers: (() => Promise<unknown>)[] = []) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url === '/api/tutoring/lessons/a1-greet/practice') return batch();
    if (url === '/api/tutoring/practice/answer') {
      const next = answers.shift();
      if (!next) throw new Error('Unexpected answer');
      return next();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function answerWith(option: string) {
  fireEvent.click(screen.getByLabelText(option));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
}

describe('PracticeRun', () => {
  it('runs a batch one exercise at a time, then shows a summary and offers more', async () => {
    const fetchMock = stubFetch(() => delayedResponse(BATCH), [
      () => delayedResponse({ result: 'correct', correctAnswer: 'ja' }),
      () => delayedResponse({ result: 'wrong', correctAnswer: 'ja' }),
    ]);
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    // Review Focus 1: no second batch while one is loading.
    expect(screen.getByRole('button', { name: 'Get more exercises' })).toBeDisabled();
    expect(screen.getByText('Preparing exercises…')).toBeInTheDocument();

    expect(await screen.findByText('Practice 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('First?')).toBeInTheDocument();
    await answerWith('ja');
    expect(await screen.findByText('Practice 2 of 2')).toBeInTheDocument();
    await answerWith('nein');

    expect(await screen.findByText('1 right, 0 almost, 1 wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get more exercises' })).not.toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/tutoring/lessons/a1-greet/practice')).toHaveLength(1);
  });

  it('counts a skipped exercise in the summary', async () => {
    stubFetch(() => delayedResponse({ exercises: [BATCH.exercises[0]] }), [
      () => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 }),
    ]);
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    fireEvent.click(await screen.findByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('0 right, 0 almost, 0 wrong')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('shows the generation failure with a Settings link and lets the student try again', async () => {
    stubFetch(() => delayedResponse({ error: 'No AI provider is set up', code: 'no_provider' }, { ok: false, status: 502 }));
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No practice exercises could be prepared: No AI provider is set up.'
    );
    expect(screen.getByRole('link', { name: 'Visit Settings' })).toHaveAttribute('href', '/settings');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get more exercises' })).not.toBeDisabled());
  });

  it('passes Ask AI through with the practice answer', async () => {
    stubFetch(() => delayedResponse({ exercises: [BATCH.exercises[0]] }), [
      () => delayedResponse({ result: 'wrong', correctAnswer: 'ja' }),
    ]);
    const onAskAi = vi.fn();
    renderWithIntl(<PracticeRun lessonId="a1-greet" onAskAi={onAskAi} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get more exercises' }));
    fireEvent.click(await screen.findByLabelText('nein'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
    expect(onAskAi).toHaveBeenCalledWith('px-1', { answerText: 'nein', result: 'wrong' });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/ExerciseCard.test.tsx components/tutoring/PracticeRun.test.tsx`
Expected: FAIL, because practice mode and `./PracticeRun` don't exist.

- [ ] **Step 4: Add practice mode to the exercise card**

In `components/tutoring/ExerciseCard.tsx`:

(a) Change the imports and props:

```tsx
import type { GradeResult } from '@/lib/tutoring/grading';
import type { PracticeGradeOutcome } from '@/lib/tutoring/practiceViews';
```

```tsx
export interface ExerciseCardProps {
  exercise: ExerciseView;
  source: AttemptSource;
  mode?: 'lesson' | 'practice';
  onAnswered?: (outcome: AttemptOutcome) => void;
  onPracticeAnswered?: (outcome: PracticeGradeOutcome) => void;
  onNext: () => void;
  onSkip: () => void;
  onAskAi?: (exerciseId: string, answer: { answerText: string; result: GradeResult }) => void;
}

// What the card shows after an answer, in lesson or practice mode.
interface Shown {
  result: GradeResult;
  correctAnswer: string | null;
  feedback: string | null;
  answerText: string;
}

function answerTextOf(exercise: ExerciseView, answer: LessonAnswer): string {
  switch (answer.type) {
    case 'multiple_choice':
      return exercise.type === 'multiple_choice' ? (exercise.options[answer.selectedIndex] ?? '') : '';
    case 'fill_blank':
    case 'free_text':
      return answer.text;
    case 'flashcard':
      return answer.rating;
  }
}
```

(b) Change the component signature and state, replacing the `outcome` state:

```tsx
export function ExerciseCard({
  exercise,
  source,
  mode = 'lesson',
  onAnswered,
  onPracticeAnswered,
  onNext,
  onSkip,
  onAskAi,
}: ExerciseCardProps) {
```

```tsx
  const [shown, setShown] = useState<Shown | null>(null);
```

(c) Replace `submit` with:

```tsx
  async function submit(answer: LessonAnswer) {
    setBusy(true);
    setError(null);
    setGradingError(null);
    try {
      const practice = mode === 'practice';
      const res = await fetch(practice ? '/api/tutoring/practice/answer' : '/api/tutoring/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          practice ? { practiceExerciseId: exercise.id, answer } : { exerciseId: exercise.id, answer, source }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const answerText = answerTextOf(exercise, answer);
        if (practice) {
          const outcome = data as PracticeGradeOutcome;
          setShown({ result: outcome.result, correctAnswer: outcome.correctAnswer, feedback: null, answerText });
          onPracticeAnswered?.(outcome);
        } else {
          const outcome = data as AttemptOutcome;
          setShown({ result: outcome.result, correctAnswer: outcome.correctAnswer, feedback: outcome.feedback, answerText });
          onAnswered?.(outcome);
        }
        return;
      }
      const detail = errorText(data, String(res.status));
      // 502: the AI could not grade the answer (spec: AI Behavior).
      if (res.status === 502) setGradingError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }
```

(d) Replace the `if (outcome) { ... }` block with:

```tsx
  if (shown) {
    // Practice (spec Phase 2): the right answer only when the student missed it. Lessons keep
    // Phase 1's rule of also showing the model answer for correct free text.
    const showAnswer =
      exercise.type !== 'flashcard' &&
      shown.correctAnswer !== null &&
      (shown.result !== 'correct' || (mode === 'lesson' && exercise.type === 'free_text'));
    return (
      <div>
        <p>{taskText(exercise)}</p>
        {exercise.type === 'flashcard' && <p>{exercise.back}</p>}
        <p>{mode === 'practice' ? t(`practiceResult.${shown.result}`) : t(`result.${shown.result}`)}</p>
        {showAnswer && (
          <p>
            {exercise.type === 'free_text'
              ? t('modelAnswer', { answer: shown.correctAnswer ?? '' })
              : t('correctAnswer', { answer: shown.correctAnswer ?? '' })}
          </p>
        )}
        {shown.feedback && <p>{t('feedback', { feedback: shown.feedback })}</p>}
        {exercise.type !== 'flashcard' && onAskAi && (
          <button type="button" onClick={() => onAskAi(exercise.id, { answerText: shown.answerText, result: shown.result })}>
            {t('askAi')}
          </button>
        )}
        <button type="button" onClick={onNext}>
          {t('next')}
        </button>
      </div>
    );
  }
```

(e) Change the skip condition to cover practice:

```tsx
      {(gradingError || ((source === 'queue' || mode === 'practice') && error)) && (
```

and update the comment above it to say the Daily Queue and a practice batch have no retry round.

- [ ] **Step 5: Implement `PracticeRun`**

Create `components/tutoring/PracticeRun.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { GradeResult } from '@/lib/tutoring/grading';
import type { PracticeBatch, PracticeGradeOutcome } from '@/lib/tutoring/practiceViews';
import { ExerciseCard } from './ExerciseCard';

type Phase = 'idle' | 'loading' | 'running' | 'summary';

interface Tally {
  correct: number;
  almost: number;
  wrong: number;
  skipped: number;
}

const EMPTY_TALLY: Tally = { correct: 0, almost: 0, wrong: 0, skipped: 0 };

export interface PracticeRunProps {
  lessonId: string;
  onAskAi: (practiceExerciseId: string, answer: { answerText: string; result: GradeResult }) => void;
}

// Spec Phase 2: a batch of practice exercises, each shown once, no retry round, nothing recorded.
// When the batch ends the button comes back for more.
export function PracticeRun({ lessonId, onAskAi }: PracticeRunProps) {
  const t = useTranslations('practice');
  const errorText = useApiErrorText();
  const [phase, setPhase] = useState<Phase>('idle');
  const [exercises, setExercises] = useState<ExerciseView[]>([]);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [lastResult, setLastResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  async function start() {
    setPhase('loading');
    setError(null);
    setGenerationError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lessonId}/practice`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = errorText(data, String(res.status));
        if (res.status === 502) setGenerationError(detail);
        else setError(t('genericError', { error: detail }));
        setPhase('idle');
        return;
      }
      setExercises((data as PracticeBatch).exercises);
      setIndex(0);
      setTally(EMPTY_TALLY);
      setLastResult(null);
      setTurn((n) => n + 1);
      setPhase('running');
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
      setPhase('idle');
    }
  }

  function advance(counted: keyof Tally) {
    setTally((current) => ({ ...current, [counted]: current[counted] + 1 }));
    setLastResult(null);
    setTurn((n) => n + 1);
    if (index + 1 >= exercises.length) setPhase('summary');
    else setIndex(index + 1);
  }

  const current = phase === 'running' ? exercises[index] : undefined;

  return (
    <section>
      {current ? (
        <div>
          <p>{t('counter', { current: index + 1, total: exercises.length })}</p>
          <ExerciseCard
            key={turn}
            exercise={current}
            source="lesson"
            mode="practice"
            onPracticeAnswered={(outcome: PracticeGradeOutcome) => setLastResult(outcome.result)}
            onNext={() => advance(lastResult ?? 'skipped')}
            onSkip={() => advance('skipped')}
            onAskAi={onAskAi}
          />
        </div>
      ) : (
        <div>
          {phase === 'summary' && (
            <p>
              <span>{t('summary', { correct: tally.correct, almost: tally.almost, wrong: tally.wrong })}</span>
              {tally.skipped > 0 && (
                <>
                  {' · '}
                  <span>{t('summarySkipped', { skipped: tally.skipped })}</span>
                </>
              )}
            </p>
          )}
          <button type="button" disabled={phase === 'loading'} onClick={start}>
            {t('getMore')}
          </button>
          {phase === 'loading' && <p>{t('preparing')}</p>}
          {generationError && (
            <p role="alert">
              {t.rich('generationFailed', {
                error: generationError,
                link: (chunks) => <Link href="/settings">{chunks}</Link>,
              })}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
```

The summary and the skipped count sit in separate `<span>`s so each can be matched as its own text.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/tutoring/ExerciseCard.test.tsx components/tutoring/PracticeRun.test.tsx components/tutoring messages/catalogs.test.ts`
Expected: PASS with no warnings. Every existing ExerciseCard, LessonPage and QueuePage test still passes. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add components/tutoring/ExerciseCard.tsx components/tutoring/ExerciseCard.test.tsx components/tutoring/PracticeRun.tsx components/tutoring/PracticeRun.test.tsx messages/en.json messages/de.json
git commit -m "feat: add practice mode to the exercise card and the practice batch runner"
```

---

### Task 13: Lesson page wiring, sticky chat context, and chat load retry

**Files:**
- Modify:
  - `components/tutoring/LessonChat.tsx`, `components/tutoring/LessonChat.test.tsx`
  - `components/tutoring/LessonPage.tsx`, `components/tutoring/LessonPage.test.tsx`
  - `components/tutoring/QueuePage.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `PracticeRun` (Task 12), and the chat route's practice fields (Task 9).
- Produces: `AskAbout` becomes a union:
  - `{ kind: 'exercise'; exerciseId: string; label: string }`
  - `{ kind: 'practice'; practiceExerciseId: string; answerText: string; result: GradeResult; label: string }`

- [ ] **Step 1: Add the catalog text**

In `messages/en.json`, add `"practiceExerciseLabel": "a practice exercise"` to the `lesson` namespace, after `"exerciseLabel"`. In `messages/de.json`, add `"practiceExerciseLabel": "eine Übung der Übungsrunde"` in the same place.

- [ ] **Step 2: Write the tests**

In `components/tutoring/LessonChat.test.tsx`:
- In "loads the thread and sends a question about an exercise":
  - The `askAbout` prop becomes `{ kind: 'exercise', exerciseId: 'ex1', label: 'exercise 1' }`.
  - Replace `expect(props.onClearAskAbout).toHaveBeenCalled();` with:

```tsx
    // The context stays attached for follow-up questions (Phase 2).
    expect(props.onClearAskAbout).not.toHaveBeenCalled();
    expect(screen.getByText('Asking about exercise 1')).toBeInTheDocument();
```

- Append inside the `describe`:

```tsx
  it('sends a practice exercise’s answer with each message', async () => {
    const fetchMock = stubFetch({
      [`GET ${URL}`]: () => delayedResponse({ messages: [], aiAvailable: true }),
      [`POST ${URL}`]: () => delayedResponse({ messages: [] }),
    });
    renderChat({
      askAbout: { kind: 'practice', practiceExerciseId: 'px-1', answerText: 'Hallo', result: 'wrong', label: 'a practice exercise' },
    });
    expect(await screen.findByText('Asking about a practice exercise')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Warum?', practiceExerciseId: 'px-1', practiceAnswer: { answerText: 'Hallo', result: 'wrong' } }),
      })
    );
  });

  it('tries loading again after a failed load when the panel is reopened', async () => {
    const responses = [
      () => delayedResponse({}, { ok: false, status: 500 }),
      () => delayedResponse({ messages: [EARLIER], aiAvailable: true }),
    ];
    stubFetch({ [`GET ${URL}`]: () => responses.shift()!() });
    const props = { lessonId: 'a1-greet', onToggle: vi.fn(), askAbout: null, onClearAskAbout: vi.fn() };
    const { rerender } = renderWithIntl(<LessonChat {...props} open />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the chat.');
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LessonChat {...props} open={false} />
      </NextIntlClientProvider>
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LessonChat {...props} open />
      </NextIntlClientProvider>
    );
    expect(await screen.findByText('Was heißt Hallo?')).toBeInTheDocument();
  });
```

Add these imports at the top of the file: `import { NextIntlClientProvider } from 'next-intl';` and `import en from '@/messages/en.json';`.

In `components/tutoring/LessonPage.test.tsx`, append inside the `describe`:

```tsx
  it('offers Get more exercises only on a completed lesson', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse({ ...LESSON, completed: true, passedExerciseIds: ['ex1', 'ex2'] }) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByRole('button', { name: 'Get more exercises' })).toBeInTheDocument();
  });

  it('does not offer practice before the lesson is completed', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    await screen.findByRole('button', { name: 'Start the exercises' });
    expect(screen.queryByRole('button', { name: 'Get more exercises' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/LessonChat.test.tsx components/tutoring/LessonPage.test.tsx`
Expected: FAIL. The context is still cleared after a send, the practice body is missing, nothing retries, and there's no practice button.

- [ ] **Step 4: Implement the chat changes**

In `components/tutoring/LessonChat.tsx`:

(a) Replace the `AskAbout` interface with:

```tsx
export type AskAbout =
  | { kind: 'exercise'; exerciseId: string; label: string }
  | { kind: 'practice'; practiceExerciseId: string; answerText: string; result: GradeResult; label: string };
```

and add `import type { GradeResult } from '@/lib/tutoring/grading';`.

(b) Add this effect directly after the thread-loading effect:

```tsx
  // Phase 2 leftover: a failed load is retried the next time the panel opens.
  useEffect(() => {
    if (!open) setLoadFailed(false);
  }, [open]);
```

(c) In `send`, replace the request body and the success branch with:

```tsx
        body: JSON.stringify(
          askAbout?.kind === 'exercise'
            ? { message, exerciseId: askAbout.exerciseId }
            : askAbout?.kind === 'practice'
              ? {
                  message,
                  practiceExerciseId: askAbout.practiceExerciseId,
                  practiceAnswer: { answerText: askAbout.answerText, result: askAbout.result },
                }
              : { message, exerciseId: null }
        ),
```

```tsx
      if (res.ok) {
        setMessages((previous) => [...(previous ?? []), ...(data.messages as ChatMessageView[])]);
        setDraft('');
        // The exercise stays attached for follow-up questions until the student clears it (×)
        // or asks about another one (Phase 2 leftover).
        return;
      }
```

(d) Change the "about an exercise" marker to cover practice messages:

```tsx
                  {(m.exerciseId || m.practiceExerciseId) && <em>{t('aboutExercise')} </em>}
```

- [ ] **Step 5: Wire the lesson page and the queue**

In `components/tutoring/LessonPage.tsx`:

(a) Add `import { PracticeRun } from './PracticeRun';` and `import type { GradeResult } from '@/lib/tutoring/grading';`.

(b) Change `askAi` to build the new union, and add `practiceAskAi` after it:

```tsx
  function askAi(exerciseId: string) {
    const number = lesson.exercises.findIndex((e) => e.id === exerciseId) + 1;
    setAskAbout({ kind: 'exercise', exerciseId, label: t('exerciseLabel', { number }) });
    setChatOpen(true);
  }

  function practiceAskAi(practiceExerciseId: string, answer: { answerText: string; result: GradeResult }) {
    setAskAbout({ kind: 'practice', practiceExerciseId, ...answer, label: t('practiceExerciseLabel') });
    setChatOpen(true);
  }
```

(c) Directly before `<LessonChat`, add:

```tsx
      {/* Spec Phase 2: practice only on a lesson the student has completed themselves, and not
          while a lesson run is showing an exercise. */}
      {lesson.completed && !current && <PracticeRun lessonId={lesson.id} onAskAi={practiceAskAi} />}
```

In `components/tutoring/QueuePage.tsx`, change `setAskAbout({ exerciseId, label: t('thisReview') });` to `setAskAbout({ kind: 'exercise', exerciseId, label: t('thisReview') });`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/tutoring messages/catalogs.test.ts`
Expected: PASS with no warnings. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add components/tutoring/LessonChat.tsx components/tutoring/LessonChat.test.tsx components/tutoring/LessonPage.tsx components/tutoring/LessonPage.test.tsx components/tutoring/QueuePage.tsx messages/en.json messages/de.json
git commit -m "feat: offer practice on completed lessons and keep the chat's exercise context"
```

---

### Task 14: Admin review page and lesson pool section

**Files:**
- Create:
  - `components/admin/PracticePoolList.tsx`, `components/admin/PracticePoolList.test.tsx`
  - `app/admin/practice-review/page.tsx`, `app/admin/practice-review/page.test.tsx`
- Modify:
  - `components/admin/ExerciseEditor.tsx`
  - `components/admin/CurriculumBrowser.tsx`
  - `app/admin/curriculum/page.tsx`, `app/admin/curriculum/page.test.tsx`

**Interfaces:**
- Consumes: the admin practice routes (Task 10) and `PracticePoolItem`.
- Produces:
  - `ExerciseContentFields({ type, content, index, onChange })`, exported from `ExerciseEditor.tsx`.
  - `PracticePoolList`, with props `{ status?: PracticeReviewStatus; lessonId?: string; showFilters?: boolean }`.
  - The `/admin/practice-review` page.

- [ ] **Step 1: Write the tests**

Create `components/admin/PracticePoolList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PracticePoolList } from './PracticePoolList';

const ITEM = {
  id: 'px-1',
  lessonId: 'a1-greet',
  lessonTitle: 'Saying hello',
  track: 'generic',
  level: 'A1',
  type: 'multiple_choice',
  content: { question: 'Bye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 },
  correctAnswer: 'Tschüss',
  reviewStatus: 'unreviewed',
  createdAt: '2026-09-29T10:00:00.000Z',
  reviewedAt: null,
};

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PracticePoolList', () => {
  it('lists unreviewed exercises and approves one', async () => {
    const lists = [() => delayedResponse([ITEM]), () => delayedResponse([])];
    const fetchMock = stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => lists.shift()!(),
      'PATCH /api/admin/practice/px-1': () => delayedResponse({ ...ITEM, reviewStatus: 'approved' }),
    });
    render(<PracticePoolList status="unreviewed" />);
    expect(await screen.findByText('Bye? (Tschüss | Hallo)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/admin/curriculum/lesson/a1-greet?track=generic');
    expect(screen.getByText('Answer: Tschüss')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice/px-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
  });

  it('edits content inline and saves it', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/practice?lessonId=a1-greet': () => delayedResponse([ITEM]),
      'PATCH /api/admin/practice/px-1': () => delayedResponse({ ...ITEM, reviewStatus: 'approved' }),
    });
    render(<PracticePoolList lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Exercise 1 question'), { target: { value: 'Goodbye?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice/px-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { question: 'Goodbye?', options: ['Tschüss', 'Hallo'], correctIndex: 0 } }),
      })
    );
  });

  it('promotes, and shows a server refusal', async () => {
    stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => delayedResponse([ITEM]),
      'POST /api/admin/practice/px-1/promote': () =>
        delayedResponse({ error: 'This lesson has 1 flashcard, which is only allowed in vocabulary lessons.' }, { ok: false, status: 400 }),
    });
    render(<PracticePoolList status="unreviewed" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Promote into the lesson' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This lesson has 1 flashcard');
  });

  it('filters by track and level', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/practice?status=unreviewed': () => delayedResponse([]),
      'GET /api/admin/practice?status=unreviewed&track=goethe': () => delayedResponse([]),
      'GET /api/admin/practice?status=unreviewed&track=goethe&level=B1': () => delayedResponse([]),
    });
    render(<PracticePoolList status="unreviewed" showFilters />);
    await screen.findByText('Nothing here.');
    fireEvent.change(screen.getByLabelText('Track'), { target: { value: 'goethe' } });
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'B1' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/practice?status=unreviewed&track=goethe&level=B1', undefined)
    );
  });

  it('shows an error when the list cannot load', async () => {
    stubFetch({ 'GET /api/admin/practice?status=unreviewed': () => delayedResponse({}, { ok: false, status: 500 }) });
    render(<PracticePoolList status="unreviewed" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load practice exercises');
  });
});
```

Create `app/admin/practice-review/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockIsAdmin } = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  mockIsAdmin: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: mockIsAdmin }));
vi.mock('@/components/admin/PracticePoolList', () => ({ PracticePoolList: () => null }));

import PracticeReviewPage from './page';

describe('Practice review page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a visitor without an admin session to the login', async () => {
    mockIsAdmin.mockResolvedValue(false);
    await expect(PracticeReviewPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('renders the review list for an admin', async () => {
    mockIsAdmin.mockResolvedValue(true);
    expect(await PracticeReviewPage()).toBeTruthy();
  });
});
```

In `app/admin/curriculum/page.test.tsx`, add to "links to the admin tools and the seed exports":

```tsx
    expect(screen.getByRole('link', { name: 'Practice exercises to review' })).toHaveAttribute('href', '/admin/practice-review');
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/PracticePoolList.test.tsx app/admin/practice-review app/admin/curriculum/page.test.tsx`
Expected: FAIL, because the modules and the link don't exist.

- [ ] **Step 3: Export the per-exercise content fields**

In `components/admin/ExerciseEditor.tsx`, add this exported component after `ExerciseEditor`:

```tsx
// One exercise's content form, shared by the lesson editor and the practice review list.
export function ExerciseContentFields({
  type,
  content,
  index,
  onChange,
}: {
  type: ExerciseType;
  content: ExerciseContent;
  index: number;
  onChange: (content: ExerciseContent) => void;
}) {
  switch (type) {
    case 'multiple_choice':
      return <MultipleChoiceFields content={content as MultipleChoiceContent} index={index} onChange={onChange} />;
    case 'fill_blank':
      return <FillBlankFields content={content as FillBlankContent} index={index} onChange={onChange} />;
    case 'flashcard':
      return <FlashcardFields content={content as FlashcardContent} index={index} onChange={onChange} />;
    case 'free_text':
      return <FreeTextFields content={content as FreeTextContent} index={index} onChange={onChange} />;
  }
}
```

Inside `ExerciseEditor`'s `exercises.map`, replace the four `{exercise.type === ... && (<...Fields .../>)}` blocks with:

```tsx
          <ExerciseContentFields
            type={exercise.type}
            content={exercise.content}
            index={index}
            onChange={(content) => updateAt(index, { ...exercise, content })}
          />
```

- [ ] **Step 4: Implement the list and the page**

Create `components/admin/PracticePoolList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type {
  ExerciseContent,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
  MultipleChoiceContent,
} from '@/lib/curriculum/types';
import type { PracticePoolItem, PracticeReviewStatus } from '@/lib/services/practiceAdminService';
import { LEVELS, TRACKS } from '@/lib/tutoring/levels';
import { ExerciseContentFields } from './ExerciseEditor';

function preview(item: PracticePoolItem): string {
  switch (item.type) {
    case 'multiple_choice': {
      const c = item.content as MultipleChoiceContent;
      return `${c.question} (${c.options.join(' | ')})`;
    }
    case 'fill_blank':
      return (item.content as FillBlankContent).textWithBlank;
    case 'flashcard': {
      const c = item.content as FlashcardContent;
      return `${c.front} → ${c.back}`;
    }
    case 'free_text':
      return (item.content as FreeTextContent).prompt;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Admin-only, English. Spec Phase 2: approve, reject, edit, or promote AI-generated exercises.
export function PracticePoolList({
  status,
  lessonId,
  showFilters = false,
}: {
  status?: PracticeReviewStatus;
  lessonId?: string;
  showFilters?: boolean;
}) {
  const [items, setItems] = useState<PracticePoolItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [track, setTrack] = useState('');
  const [level, setLevel] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ id: string; content: ExerciseContent } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (lessonId) query.set('lessonId', lessonId);
    if (track) query.set('track', track);
    if (level) query.set('level', level);
    let cancelled = false;
    fetch(`/api/admin/practice?${query.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PracticePoolItem[];
        if (!cancelled) {
          setItems(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status, lessonId, track, level, reload]);

  async function act(url: string, init: RequestInit) {
    setActionError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
        return;
      }
      setEditing(null);
      setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const patch = (id: string, body: unknown) =>
    act(`/api/admin/practice/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });

  return (
    <div>
      {showFilters && (
        <p>
          <label>
            Track{' '}
            <select aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">All</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            Level{' '}
            <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </p>
      )}
      {loadFailed && <p role="alert">Could not load practice exercises</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {!loadFailed && items === null && <p>Loading...</p>}
      {items && items.length === 0 && <p>Nothing here.</p>}
      {items && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`/admin/curriculum/lesson/${item.lessonId}?track=${item.track}`}>{item.lessonTitle}</a> · {item.track}{' '}
              {item.level} · {item.type} · {item.reviewStatus}
              {editing?.id === item.id ? (
                <div>
                  <ExerciseContentFields
                    type={item.type}
                    content={editing.content}
                    index={0}
                    onChange={(content) => setEditing({ id: item.id, content })}
                  />
                  <button type="button" onClick={() => patch(item.id, { content: editing.content })}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <p>{preview(item)}</p>
                  {item.correctAnswer && <p>Answer: {item.correctAnswer}</p>}
                  <button type="button" onClick={() => patch(item.id, { action: 'approve' })}>
                    Approve
                  </button>
                  <button type="button" onClick={() => patch(item.id, { action: 'reject' })}>
                    Reject
                  </button>
                  <button type="button" onClick={() => setEditing({ id: item.id, content: item.content })}>
                    Edit
                  </button>
                  <button type="button" onClick={() => act(`/api/admin/practice/${item.id}/promote`, { method: 'POST' })}>
                    Promote into the lesson
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

The component imports a type from `@/lib/services/practiceAdminService`. It is a type-only import, so better-sqlite3 is never bundled into the client, the same pattern `LessonPage` uses for its types.

Create `app/admin/practice-review/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { PracticePoolList } from '@/components/admin/PracticePoolList';

export const dynamic = 'force-dynamic';

export default async function PracticeReviewPage() {
  if (!(await isAdminSessionValid())) redirect('/admin/login');
  return (
    <div>
      <p>
        <a href="/admin/curriculum">Back to the curriculum</a>
      </p>
      <h1>Practice exercises to review</h1>
      <PracticePoolList status="unreviewed" showFilters />
    </div>
  );
}
```

In `components/admin/CurriculumBrowser.tsx`, add `import { PracticePoolList } from './PracticePoolList';`. Then, in `LessonDetail`, directly after the exercises `<ul>`, add:

```tsx
      <h2>Practice pool</h2>
      <PracticePoolList lessonId={lessonId} />
```

In `app/admin/curriculum/page.tsx`, add this link after the "Placement exam" link:

```tsx
        {' · '}
        <a href="/admin/practice-review">Practice exercises to review</a>
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/admin app/admin`
Expected: PASS. Every existing ExerciseEditor, LessonEditorForm and CurriculumBrowser test still passes. The CurriculumBrowser tests may need a `GET /api/admin/practice?lessonId=...` route in their fetch stub. If so, add one that returns `[]`, and list it in your report. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 6: Commit**

```bash
git add components/admin/ExerciseEditor.tsx components/admin/PracticePoolList.tsx components/admin/PracticePoolList.test.tsx components/admin/CurriculumBrowser.tsx app/admin/practice-review app/admin/curriculum/page.tsx app/admin/curriculum/page.test.tsx
git commit -m "feat: add the practice review page and each lesson's practice pool"
```

---

### Task 15: Chasing the intermittent test failure

One full-suite run in Phase 1B failed once and was never reproduced. The failing test's name wasn't captured. This task either finds and fixes it, or documents that it couldn't be reproduced. It must not guess at a fix.

**Files:**
- Modify: whichever test or code turns out to be flaky, if one does.
- Create: `test/README.md`, if nothing reproduces.

**Interfaces:** none.

- [ ] **Step 1: Run the suite repeatedly under load**

Run from the worktree root:

```bash
mkdir -p /tmp/gait-flaky && rm -f /tmp/gait-flaky/*.log
for i in $(seq 1 10); do
  ( npx vitest run > /tmp/gait-flaky/a-$i.log 2>&1 & npx vitest run > /tmp/gait-flaky/b-$i.log 2>&1 & wait )
done
grep -l "failed" /tmp/gait-flaky/*.log || echo "all 20 runs green"
grep -h "FAIL " /tmp/gait-flaky/*.log | sort | uniq -c
```

This is 20 full runs, two at a time, which is the "under load" condition. Also run the suite 5 times in shuffled order:

```bash
for i in $(seq 1 5); do npx vitest run --sequence.shuffle > /tmp/gait-flaky/shuffle-$i.log 2>&1 || echo "shuffle run $i failed"; done
grep -h "FAIL " /tmp/gait-flaky/shuffle-*.log | sort | uniq -c
```

- [ ] **Step 2a: If a test failed, fix the root cause**

For each failing test name, read its log, and reproduce it alone with `npx vitest run <file> -t "<test name>" --repeat 20`. Find the root cause. The usual causes are:
- an assertion that doesn't wait for asynchronous state (use `findBy`/`waitFor`);
- a real timer that can exceed a timeout under load (raise that test's timeout, or pass a lower work factor if it's password hashing);
- shared state between tests: a temp directory, a module-level singleton, or a global stub.

Make the smallest fix. Rerun Step 1's loop until 20 runs pass, and record in your report the test, its cause, the fix, and the passing run counts. Commit:

```bash
git add <the changed files>
git commit -m "test: fix the intermittent failure in <test name>"
```

- [ ] **Step 2b: If all 25 runs passed, document it**

Create `test/README.md`:

```markdown
# Test notes

## Intermittent failure seen in Phase 1B

On 2026-09-28 one full-suite run failed once (1 of 568 tests); the failing test's name was not
captured, and it never recurred. On <date> the suite was run 20 times, two runs at a time, plus 5
shuffled runs, and all were green. `unstubGlobals: true` (vitest.config.ts) now resets fetch stubs
between tests, which removes one possible cause.

If it recurs, capture the name with `npx vitest run 2>&1 | tee run.log` and look first at:
- the password-hashing tests (`lib/services/adminAuthService.test.ts`, `app/api/admin/auth/route.test.ts`),
  which are CPU-heavy and slow under load;
- `components/tutoring/ExerciseCard.test.tsx` and `components/placement/PlacementTest.test.tsx`,
  which chain several delayed fetches.
```

Fill in the date. Commit:

```bash
git add test/README.md
git commit -m "docs: record the intermittent-failure investigation"
```

---

## Spec Coverage

| Spec section / requirement | Where |
|---|---|
| Data model: `practice_exercises`, `practice_seen`, chat `practice_exercise_id`, migration, cascades | Task 1 |
| Starting a batch: checks, unseen and non-rejected first, generation of the missing ones, marking seen, answers stripped, short batch, `ai_failed` | Tasks 6, 7, 8 |
| Answering: shared graders, free-text AI, almost stays almost, correct answer, nothing written | Tasks 5, 7, 8 |
| Batch screen: counter, shown once, results, summary, button again, "Preparing exercises…" | Task 12 |
| Ask AI on practice: answer sent with the message, tagged, validated | Tasks 9, 13 |
| Generation: one call, prompt contents, style examples ≤10, reply shape, validation, flashcard rule, duplicates incl. rejected, short batch | Tasks 6, 7 |
| Admin review page, lesson Practice pool section, approve / reject / edit / promote, flashcard rule on promote | Tasks 10, 14 |
| Curriculum export of approved exercises, loader, round trip | Task 11 |
| Leftover 1: sticky Ask-AI context | Task 13 |
| Leftover 2: coded errors, `errors` namespace, fallback | Tasks 2, 3 (and Tasks 7, 8 for practice) |
| Leftover 3: chat load retry | Task 13 |
| Leftover 4: queue answers must be due | Task 4 |
| Leftover 5: the intermittent failure | Task 15 |
| Translations for all new student text (en/de parity) | Tasks 3, 12, 13 |
| Error handling: `res.ok` checks and `role="alert"` everywhere | Tasks 3, 12, 13, 14 |
