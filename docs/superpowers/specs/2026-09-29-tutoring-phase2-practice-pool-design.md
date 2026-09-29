# Tutoring Phase 2: Practice Pool — Design Spec

## Context

This is Phase 2 of the Tutoring section (sub-project #3). The Phase 1 spec, `docs/superpowers/specs/2026-09-24-tutoring-section-design.md`, outlined it as "exercise pool growth" and left its details for this brainstorm. Phase 1 is built and on `main`:
- the curriculum tree, the lesson page with a retry round, and sticky completion;
- simplified SM-2 review and the Daily Queue;
- the per-lesson AI chat with "Ask AI";
- level unlocking and the placement test;
- next-intl translations. The app runs on Next.js 16.

This phase lets a student keep practising a finished lesson beyond its authored exercises. The practice exercises come from a shared, growing pool that the AI fills and an admin curates. The phase also clears three leftovers from Phase 1.

## Goals

- A student who has finished a lesson can ask for more practice on it, as often as they like, and never runs out.
- Practice is low-stakes: it shows right, wrong, or almost, and it never changes completion, review, or the Daily Queue.
- AI-generated exercises go into a shared pool, so each one is generated only once. The admin can approve, reject, edit, or promote them.
- Phase 1 behaviour is untouched. Authored exercises, completion, review scheduling, curriculum export, the admin lesson editor, and the flashcard audit never see a generated exercise.

## Decisions

| Topic | Decision |
|---|---|
| Batch size | 5 exercises per "Get more exercises" request. |
| Types | Generated exercises use the types that the lesson's authored exercises use. Flashcards appear only in vocabulary lessons, following the Phase 1 rule. A lesson with no authored exercises gets `multiple_choice` and `fill_blank`, plus `flashcard` if it is a vocabulary lesson. |
| Availability | The button appears only once the lesson has its own completion row. A lesson counted as done only through a concept link in another track does not qualify. The button shows on the lesson page of a completed lesson and on the end-of-run screen. |
| Batch flow | Exercises come one at a time with an "n of 5" counter. Each is shown once, with no retry round. When the batch ends, whatever the results, the button is available again. |
| Feedback | "Right". "Wrong" plus the correct answer. For free text only, "Almost" plus the model answer. No AI feedback text is shown. To learn *why*, the student uses "Ask AI", which opens the lesson chat with the exercise attached. |
| Recording | Practice answers are not stored. They never touch `lesson_attempts`, completion, review, the Daily Queue, or the daily cap. The only thing stored per student is which pool exercises they have been served. |
| Generation timing | On demand. When the pool has no unseen exercises left, one AI call generates the missing ones while the student sees "Preparing exercises…". Nothing is generated in the background. |
| Admin actions | Approve, reject, edit, and promote into the lesson. |
| Storage | A separate `practice_exercises` table, not new columns on `exercises`. |
| Export | Approved pool exercises are included in the curriculum export (seed JSON), so a fresh install starts with the curated pool. Unreviewed and rejected exercises are not exported. |

## Data Model

```sql
CREATE TABLE practice_exercises (
  id TEXT PRIMARY KEY,                     -- `${lessonId}__px-${random}`
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
  content TEXT NOT NULL,                   -- JSON, same shapes as authored exercises
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','approved','rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_practice_exercises_lesson ON practice_exercises(lesson_id);

-- Which pool exercises the (single) student has been served.
CREATE TABLE practice_seen (
  practice_exercise_id TEXT PRIMARY KEY REFERENCES practice_exercises(id) ON DELETE CASCADE,
  served_at TEXT NOT NULL
);

-- Chat messages can now be about a practice exercise as well as an authored one.
ALTER TABLE lesson_chat_messages ADD COLUMN practice_exercise_id TEXT
  REFERENCES practice_exercises(id) ON DELETE SET NULL;
```

- **Seen means served.** An exercise counts as seen once it is sent in a batch, whether or not it is answered. The student never gets it again, even if they leave mid-batch.
- **Rejection.** A rejected exercise is never served again. It stays in the table so the review page can show it and generation can skip duplicates of it.
- **Lesson deletion** cascades through the pool, the seen table, and the chat tags. `ON DELETE SET NULL` untags the chat messages instead of deleting them.
- **Migration.** Like the Phase 1 migrations, the chat column is added only if it is missing. The two new tables use `CREATE TABLE IF NOT EXISTS`.

## Student Flow

### Starting a batch
The student presses **Get more exercises**. The client calls `POST /api/tutoring/lessons/[id]/practice`, and the server:
1. Checks that the lesson exists, is in an unlocked level, and has its own completion. If not, it answers 404, 403, or 409.
2. Takes up to 5 pool exercises for the lesson that are unseen and not rejected. Unreviewed and approved exercises both qualify. They are ordered oldest first.
3. If fewer than 5 are found, it generates the missing number in one AI call, as described in the next section.
4. Marks every exercise it serves as seen.
5. Returns `{ exercises: ExerciseView[] }`. As with authored exercises in Phase 1, answers are stripped. A flashcard keeps its back, because the student reveals it and grades themselves.

**If generation fails**, because there is no working provider, the AI call fails, or no valid exercises come back:
- If the pool already supplied at least one exercise, the batch is served with what it has.
- If there is nothing at all to serve, the server answers `502` with the error code `ai_failed`, and the client shows the same kind of error Phase 1 uses: a message with a Settings link.

### Answering
`POST /api/tutoring/practice/answer` takes `{ practiceExerciseId, answer }` and returns `{ result, correctAnswer }`.
- **Answer shapes.** `answer` uses the Phase 1 `LessonAnswer` shapes.
- **Grading.** Multiple choice and fill-in-the-blank use the Phase 1 deterministic graders. A flashcard uses the student's rating (knew / sort of / didn't know → right / almost / wrong). Free text is graded by the AI with the Phase 1 free-text grader. Its feedback text is discarded, and `almost` stays `almost`.
- **What is shown.**
  - For multiple choice and fill-in-the-blank, `correctAnswer` is always returned, and the client shows it only when the answer is wrong.
  - For free text, the model answer is shown on `wrong` and `almost`.
  - A flashcard shows no correct answer, because its back is already visible.
- **Nothing is written.** Grading has no side effects.
- **Access.** Answering is allowed only while the lesson is unlocked and has its own completion.
- **Failures.** A free-text grading failure returns `502`. The client keeps the typed answer and offers a retry, or lets the student skip the exercise so the batch moves on.

### The batch screen
`PracticeRun` is a client component on the lesson page. It shows the counter and one exercise at a time:
- **Card.** It uses a variant of the Phase 1 exercise card with `mode="practice"`. That mode posts to the practice endpoint, shows only the result and the correct or model answer, and offers **Ask AI** and **Next**. Ask AI is offered on every type except flashcards.
- **End of batch.** After the fifth exercise, it shows a short summary listing each result separately, for example "3 right, 1 almost, 1 wrong", and the **Get more exercises** button again. A skipped exercise, whose free-text grading failed, is counted as "skipped".

### Ask AI on a practice exercise
Practice answers are not stored, so the chat cannot look the answer up the way it does for authored exercises. Instead, the client sends the context with each chat message:

```
{ message, practiceExerciseId, practiceAnswer: { answerText, result } }
```

The server:
- loads the exercise;
- builds the Phase 1 exercise context from it, using the student's answer and result exactly as the client sent them;
- tags both chat messages with `practice_exercise_id`.

The server still checks that the exercise belongs to the lesson and is not a flashcard.

## Generation

- **One AI call per batch.** It goes through `generateWithActiveProvider`, so usage is recorded as in Phase 1.
- **Prompt contents:**
  - the lesson's title, CEFR level, skill, explanation, and examples;
  - the allowed types;
  - how many exercises are needed;
  - up to 10 of the lesson's authored exercises, as style and difficulty guides;
  - the exact JSON shape for each type.
- **Language.** Exercise text follows the style of the lesson's authored exercises. The German learning content stays in German.
- **Reply format.** The AI must reply with only `{ "exercises": [ { "type": ..., "content": { ... } } ] }`. A reply that is not valid JSON in that shape counts as a failed call and is never guessed at, the same rule as the Phase 1 grading.
- **Checks on each returned exercise:**
  - The type must be one of the allowed types.
  - The content must pass `validateExerciseContent`, the same check the admin editor applies.
  - A flashcard is dropped unless the lesson is a vocabulary lesson.
  - Duplicates are dropped. Content is compared as normalized JSON (trimmed, case-folded) against the lesson's authored exercises and every pool exercise, including rejected ones.
- **Keeping what's valid.** Valid exercises are inserted as `unreviewed`. If fewer come back than were needed, the batch is shorter. Nothing is retried in the same request.

## Admin

### Review page
`/admin/practice-review` is admin-gated, like the rest of `/admin`.
- **What it lists.** It shows `unreviewed` pool exercises, oldest first, with filters for track and level.
- **Each row.** A row shows the lesson (linked), the type, the content as it will be displayed, and the correct answer.
- **Actions per row:**
  - **Approve** sets `review_status = 'approved'` and `reviewed_at`.
  - **Reject** sets `review_status = 'rejected'` and `reviewed_at`. The exercise is never served again.
  - **Edit** changes the content inline through the admin exercise editor's content form. It is validated with `validateExerciseContent`, the type cannot change, and saving marks the exercise `approved`.
  - **Promote** adds the exercise to the lesson's authored exercises and deletes it from the pool, all in one transaction. The flashcard rule is enforced: a flashcard cannot be promoted into a non-vocabulary lesson. The authored exercise gets a normal authored id (`${lessonId}__ex-${random}`). Following the Phase 1 rules, a completed lesson stays complete, and the new exercise enters review after its first attempt.

### Lesson detail page
The existing admin lesson page gains a **Practice pool** section. It lists that lesson's pool exercises in every status, with the same actions.

### Admin routes
- `GET /api/admin/practice?status=unreviewed|approved|rejected&track=&level=&lessonId=`
- `PATCH /api/admin/practice/[id]`. The body is `{ action: 'approve' | 'reject' }` or `{ content }` to edit.
- `POST /api/admin/practice/[id]/promote`

## Curriculum Export

- **Format.** The seed format gains an optional `practice` list: `[{ id, lessonId, type, content }]`.
- **What each file holds.** Each per-track+level file carries the `approved` pool exercises of the lessons placed in that file. The zip of all files carries them too.
- **Loading.** The seed loader inserts listed practice exercises as `approved` if their id doesn't exist yet. Like concept links, it skips any whose lesson doesn't exist.
- **Existing files.** Files without the list load as before.
- **Seed version.** The export keeps the current `seedVersion`, as in Phase 1. Replacing the repo's seed files therefore affects only fresh installs, unless someone bumps the version.
- **Round trip.** Exporting and reloading must reproduce the approved pool. The existing round-trip test is extended to cover this.

## Phase 1 Leftovers Included

1. **Ask-AI context stays attached.** Today the chat drops the attached exercise after the first message. In this phase it stays attached to every message until the student clears it with × or presses Ask AI on another exercise. The server already builds context for each message, so this is a client change in `LessonChat` and its parents. It applies to authored and practice exercises alike.
2. **Server errors in the interface language.** Today error messages from services reach the German interface in English, for example "Level B1 is locked" and "No AI provider is set up".
   - **Scope.** Every student-facing API error now returns `{ error, code }`, where `code` is a stable identifier such as `level_locked`, `no_provider`, `ai_failed`, `not_found`, `bad_request`, `grading_failed`, `lesson_not_completed`, or `session_lost`. This covers the tutoring routes, the practice routes, the placement routes, and the profile route.
   - **Translation.** The client shows the translated text from a new `errors` catalog namespace, with interpolation where needed (for example `{level}`). If it receives a code it doesn't know, it falls back to the English `error` string.
   - **Unchanged.** The provider's own failure text, such as "Anthropic returned 429", still appears as a detail inside the translated sentence.
   - **Out of scope.** Admin routes stay English.
3. **Chat load retry.** If the thread failed to load, closing and reopening the chat panel tries again instead of keeping the error until a page reload.
4. **The server checks the answer source.** Today `POST /api/tutoring/attempts` trusts `source: 'queue'`, so an answer to an exercise that isn't due still counts against the daily review limit. In this phase a queue answer is accepted only if the exercise meets every condition below. Otherwise the server answers `400` with the code `not_due`, and lesson answers are unaffected.
   - Its lesson is placed in the active track+level.
   - It has a review schedule with `next_due_at <= today`.
   - It hasn't already been answered in the queue today.
5. **The intermittent test failure.** One full-suite run failed once, the name of the failing test wasn't captured, and the failure has not recurred. The job is to find it:
   - Run the full suite repeatedly (at least 20 times) under parallel load.
   - Capture the name of any failing test.
   - Fix the root cause, for example a timing-dependent assertion or a shared temp directory.
   - The likely suspects from the Phase 1 final review are the password-hashing tests (`adminAuthService` and the admin auth route) and the `ExerciseCard` and `PlacementTest` flows that chain several fetches.
   - If 20 runs under load stay green, say so and add a note to the test README. Don't guess at a fix.

## Translations

New interface text goes into both `messages/en.json` and `messages/de.json`, with identical keys, which the existing parity test checks. That covers the practice button, the counter, the results, the summary, "Preparing exercises…", and the `errors` namespace. German uses "du". Admin pages stay in English.

## Error Handling

- **Visible errors.** Every client fetch checks `res.ok` and shows an error with `role="alert"`, as in Phase 1.
- **Typed answers are kept.** A free-text answer the student typed is never lost, whether practice grading fails or a chat call fails.
- **Malformed AI replies.** A reply in the wrong shape, from generation or grading, counts as a failed call.

## Architecture

**Pure logic** lives in `lib/tutoring/` and is unit-tested without a database:
- `practiceTypes.ts`: the allowed types for a lesson, from its authored exercise types, its skill, and the flashcard rule.
- `practiceGeneration.ts`: builds the generation prompt, parses and validates the reply, and computes duplicate keys.
- `errorCodes.ts`: the error-code union and a helper that maps a service error to `{ error, code }`.

**Services** live in `lib/services/`:
- `practiceService.ts`: serves a batch, generates the missing exercises, and grades a practice answer. Grading reuses Phase 1's graders and has no side effects.
- `practiceAdminService.ts`: lists pool exercises, approves, rejects, edits, and promotes. Promotion reuses Phase 1's exercise insertion and flashcard rule.
- `lessonChatService.ts` (existing): accepts `practiceExerciseId` and `practiceAnswer`.

**Routes:** the student and admin routes listed above. They are thin, like Phase 1's.

**Client:**
- `PracticeRun`;
- a practice mode for `ExerciseCard`;
- `LessonPage`, which shows the button and hosts `PracticeRun`;
- `LessonChat`, where context stays attached and a failed load retries;
- the admin review page and the Practice pool section on the lesson page;
- a small `errorMessage(code, fallback)` helper that uses the `errors` namespace.

## Testing

- **Pure units.** Table-driven tests for:
  - the allowed-type rules, including vocabulary versus non-vocabulary lessons and lessons with no authored exercises;
  - prompt contents;
  - reply parsing: valid, malformed, wrong type, invalid content, and duplicates;
  - error-code mapping.
- **Services**, against a real SQLite database:
  - serving picks unseen, non-rejected exercises and marks them seen;
  - generation fills only what is missing, keeps only valid unique exercises, and returns a short batch when some fail;
  - the request is refused for a lesson that isn't completed or is locked;
  - grading returns the right result and correct answer and writes nothing, so `lesson_attempts` and the review schedule are unchanged;
  - approve, reject, edit, and promote, where promote enforces the flashcard rule, keeps the completion, and removes the exercise from the pool;
  - cascades on lesson delete.
- **AI.** A mocked `aiService` or an injected fake generator. There are no real API calls.
- **Routes.** Temp-file database tests for status codes and error codes.
- **Client.** `PracticeRun` and the practice card tests use `delayedResponse`. They cover:
  - the batch flow and counter;
  - right, wrong, and almost display;
  - the summary and the button coming back;
  - "Preparing exercises…";
  - the generation error with a Settings link;
  - Ask AI sending the practice context.
- **Other client tests:**
  - the chat keeps its context across messages and retries a failed load;
  - a translated error is shown for a known code.
- **Translations.** The en/de parity test stays green.
- **Export.** Export → reload round-trips the approved pool. Unreviewed and rejected exercises are not exported.
- **Answer source.** A queue answer is rejected with `not_due` when the exercise isn't due, isn't in the active track+level, or was already answered in the queue today. A lesson answer still works.

## Out of Scope

- Background prefetching of batches.
- Statistics or gamification on practice results. Answers aren't stored.
- Practice for lessons that are only covered through a concept link, or that aren't finished.
- Automatic quality scoring or de-duplication beyond exact normalized duplicates.
- Styling. It waits for the app-wide design pass.
- Translating admin pages or admin API errors.
- Phase 3, Freestyle mode.
