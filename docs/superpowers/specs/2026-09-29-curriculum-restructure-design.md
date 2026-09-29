# Curriculum Restructure — Design Spec

## Overview

The curriculum hierarchy today is Track → Level → Milestone → Section → Lesson, with milestones fixed as one per skill (Grammar, Vocabulary, Reading, Listening, Writing, Speaking) and a single "Lessons" section in each (the CEFR frameworks spec called this a placeholder). This sub-project replaces it with **Track → Level → Milestone → Lesson**:

- **Sections are removed.**
- **A milestone is a set of lessons grouped by difficulty**, with a **difficulty rank** (1, 2, 3 …) inside its track+level. Milestones sort by rank; milestones with equal rank are parallel.
- **Milestones are hard-gated by rank**, and inside an open milestone **a lesson is locked until its prerequisites are done**. Lessons are not otherwise ordered.
- **The tree draws each milestone's prerequisite graph as branches**, vertically, with disjoint branches side by side.
- **A milestone test-out** lets a student skip the next locked rank.
- **Claude drafts the regrouping** of all 303 lessons into difficulty milestones, and the user spot-checks it. An existing database gets its structure replaced while keeping lessons, exercises, prerequisites, concept links, and all student progress.

It is the first sub-project in the build order agreed on 2026-09-29 (restructure → bilingual content → design pass → telc B1 expansion → Freestyle → Reading → Listening → Writing → Speaking → expansion of the other levels → Level exams → Accounts & hosting). It is built after Tutoring Phase 2 (practice pool), whose plan is already written, and assumes Phase 2's code is merged: the `errorCodes` module, `SeedFile.practice`, the practice pool tables and routes.

### In scope

- Schema: drop `sections`, move `lesson_placements` onto `milestone_id`, add `milestones.difficulty_rank`, and add test-out tables. There's a data-preserving migration for existing databases.
- Pure rules for milestone state, lesson state, prerequisite scope, test-out draw and scoring, and the branch layout.
- Server enforcement of locks on the lesson page, attempts, lesson chat, and practice pool routes.
- Milestone test-out: start/resume, answer, finish, review, 24-hour cooldown, completion, and review scheduling.
- Seed format v2 (no sections, `difficultyRank`), loader with replace-structure semantics, export in v2.
- Admin: milestone create/edit (title, description, rank)/delete, lesson placement into a milestone, prerequisite-scope validation, section UI and routes removed, and the dependency diagram grouped by milestone.
- Student tree and lesson page: locked/open/done states, branches, "builds on" chips, test-out entry.
- **Content task:** Claude's regrouping of all 15 seed files, which the user spot-checks.

### Out of scope

- Bilingual milestone titles (Bilingual content, the next sub-project, adds `_de` fields). This sub-project's milestone titles are English.
- Visual design of the tree (the design pass styles it). This sub-project delivers a working tree with plain markup and layout coordinates.
- New exercise types. The test-out eligibility rule is written so later types can opt out (see Test-out).
- The level exam node (Level exams sub-project).

## Data Model

```sql
-- milestones: order_index is replaced by difficulty_rank. NULL only for the admin-only Unsorted bucket.
CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
  level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
  title TEXT NOT NULL,
  description TEXT,
  difficulty_rank INTEGER CHECK (difficulty_rank IS NULL OR difficulty_rank >= 1)
);

-- A lesson belongs to exactly one milestone. No order column: inside a milestone the
-- prerequisite graph is the only structure.
CREATE TABLE lesson_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lesson_id)
);

-- How a completion happened. Existing rows become 'lesson'.
ALTER TABLE lesson_completions ADD COLUMN source TEXT NOT NULL DEFAULT 'lesson'
  CHECK (source IN ('lesson','testout'));

-- One row per test-out attempt. At most one in_progress row per milestone (partial unique index).
CREATE TABLE milestone_testouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in_progress','passed','failed')),
  exercise_ids TEXT NOT NULL,          -- JSON array, the drawn questions in order
  answers TEXT NOT NULL DEFAULT '[]',  -- JSON array of { exerciseId, answerText, result, correctAnswer }
  score REAL,
  max_score REAL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX idx_testouts_one_open ON milestone_testouts(milestone_id) WHERE status = 'in_progress';
```

`sections` is dropped.

**Migration (`migrateToMilestoneOnlyStructure`, data-preserving, runs inside `runMigrations`'s transaction):** it runs only if the `sections` table exists.
1. Add `difficulty_rank` and set it to `order_index + 1` for every milestone, or NULL for each `…-unsorted` milestone.
2. Rebuild `lesson_placements` with the create-copy-drop-rename pattern, mapping each placement's `section_id` to its section's `milestone_id`.
3. Drop `sections`, then drop `milestones.order_index`.
4. Add `lesson_completions.source`.
5. Create `milestone_testouts`.

Fresh databases get the new shape from `createTablesIfMissing`. This migration only preserves a working database; the regrouped seed (below) then replaces the placeholder structure.

**Unsorted.** It stays a reserved milestone per track+level (`{track}-{level}-unsorted`, `difficulty_rank` NULL, title "Unsorted"), with no section. It's admin-only, never shown to students, and it never gates anything.

## Rules (pure functions, `lib/tutoring/gating.ts` and `lib/tutoring/testOut.ts`)

### Milestone state

Inputs: the track+level's ranked milestones with their visible lessons, and the set of done lesson ids.

- A lesson is **done** if it has its own completion (any source) or is covered through a concept link, which is the existing `coveredVia` rule.
- A milestone is **complete** when every lesson in it is done. An empty milestone is complete.
- Ranks are sorted ascending. The **open rank** is the lowest rank with an incomplete milestone. Every milestone at or below the open rank is **open**; complete milestones are also open. Milestones above it are **locked**.
- Example: ranks 1, 2, 2, 3. When rank 1 is complete, both rank-2 milestones open together; rank 3 opens when both are complete.

### Lesson state

- **done** (own completion, or covered via a concept link)
- **locked**:
  - its milestone is locked; or
  - some prerequisite isn't done, ignoring prerequisites that sit in Unsorted (see below).
- **open**, otherwise.

**A completed lesson is never locked.** It stays openable even if an admin edit puts it in a locked milestone, and its exercises stay in reviews.

**Prerequisites that sit in Unsorted** can't be done by a student, so they're ignored for locking. The admin sees them flagged in the structure editor.

### Prerequisite scope (admin save validation)

For an edge "L builds on P", both lessons must be in the same track+level, and P must be:
- in the **same milestone** as L, or
- in a milestone of **strictly lower rank**.

A parallel milestone of equal rank doesn't qualify. Edges touching Unsorted are exempt, because Unsorted isn't student-visible.

The rule is checked:
- on lesson create or update, for the lesson's own edges;
- on milestone rank change and lesson moves, for every edge touching the affected lessons.

A violation rejects the whole save with `400`, listing each violating edge as `"<lesson> builds on <prerequisite>, which is in a later or parallel milestone"`.

### Test-out

**Availability.** A test-out is offered for a milestone that meets all of these:
- it is locked;
- its rank is the **next locked rank**, meaning the lowest rank above the open rank;
- it isn't in a failed cooldown;
- enough gradable exercises exist.

Every milestone at that next rank gets its own test-out.

**Gradable exercises.** An exercise can be drawn if all of these hold:
- its type is test-out eligible: `multiple_choice`, `fill_blank` or `free_text` (flashcards never; types added later declare eligibility, and letter tasks and spoken responses won't be eligible);
- its lesson isn't done already;
- for `free_text`, a working AI provider exists.

If fewer than **5** gradable exercises exist, no test-out is offered, with the reason "not enough questions".

**Draw.** For the milestone's not-done lessons in random order:
- **up to 10 lessons:** up to 2 random gradable exercises each;
- **11–20 lessons:** 1 each, plus a second exercise for random lessons until the total reaches 20;
- **more than 20 lessons:** 20 random lessons, 1 each.

The total is capped at 20. The drawn ids are stored in order on the attempt.

**Answering.**
- Answers are graded with the existing graders: the deterministic grader, and the AI grader for free text.
- There's **no feedback during the test**.
- If free-text grading fails with 502, the student retries the same question.
- There is no timer.
- Leaving and coming back **resumes** the same attempt at the next unanswered question.

**Scoring.** Correct earns 1 point, almost 0.5, wrong 0. The result is `passed` if `score / max_score >= 0.8`.

**Finishing.**
- **Pass:**
  - every not-done lesson in the milestone gets a completion with `source = 'testout'`;
  - every exercise of those lessons that was **not answered correct** in this attempt gets a review state due **tomorrow**. That includes almost, wrong and never-drawn exercises, and flashcards. An exercise that already has a review state keeps it;
  - the level-unlock check runs (`checkLevelFinishedAfterCompletion`);
  - the milestone becomes complete, so the next rank opens.
- **Fail:** the attempt is stored, and a new one can start **24 hours** after `finished_at`.
- **Review:** either way, the result screen shows the score and pass/fail, then every question with the student's answer, the result and the correct answer.

**Test-out and attempts.** Test-out answers are **not** written to `lesson_attempts`. They live only on the test-out row, so they don't affect `passedExerciseIds`, and "in progress" lesson status and review stay driven by real lesson work.

### Branch layout (`lib/tutoring/branchLayout.ts`)

`computeBranchLayout(lessonIds, edges)` takes only the lessons of one milestone and the edges between them. It returns `{ id, branch, column, row }[]`:
- **Branches** are the connected components of the undirected graph, ordered by their smallest lesson id so the layout is deterministic. A lesson with no edges is a branch of its own.
- **Row:** 0 for a lesson with no in-milestone prerequisites, otherwise 1 + the maximum row of its in-milestone prerequisites.
- **Column:** within a branch, the index among lessons of the same row, in id order.
- A global column offset puts branches side by side: the width of a branch is its maximum per-row count.

Cycles can't exist, because admin saves reject them. The layout throws on one anyway, like `computeDiagramLayout`.

## Server Enforcement

`progressService.getLessonView` returns three variants:
- `{ locked: 'level', … }` when the level is above the student's unlocked level, as today;
- `{ locked: 'lesson', reason: 'milestone' | 'prerequisites', milestone: { id, title }, missingPrerequisites: {id,title}[] }` for a lesson locked by the new rules;
- the open view.

A completed lesson is always open.

The following refuse a locked, not-completed lesson with `403` and `{ error, code: 'lesson_locked' }`:
- `POST /api/tutoring/attempts` with source `lesson`;
- `POST /api/tutoring/lessons/[id]/chat`;
- `POST /api/tutoring/lessons/[id]/complete`, which is "Mark as done".

The practice pool already requires a completed lesson, so it's unaffected. Queue answers are unaffected, because reviews follow what was learned.

New error codes join Phase 2's `ErrorCode` union and the `errors` catalog (en and de):
- `lesson_locked`: "This lesson is still locked" / "Diese Lektion ist noch gesperrt"
- `testout_unavailable`: "This test-out isn't available" / "Dieser Einstufungstest ist nicht verfügbar"
- `testout_cooldown`: "You can try this test-out again later" / "Du kannst diesen Test später noch einmal versuchen"

The Daily Queue's ordering replaces section and placement order with `difficulty_rank`, then milestone id, then exercise rowid. The suggested next lesson becomes the first **open**, not-done lesson in tree order (rank, then branch layout order).

## Tree Data (`GET /api/tutoring/tree`)

```ts
interface CurriculumTree { track; level; milestones: TreeMilestone[] }  // ranked milestones, Unsorted excluded
interface TreeMilestone {
  id: string; title: string; description: string | null; rank: number;
  state: 'locked' | 'open' | 'complete';
  lessons: TreeLesson[];                          // with layout coordinates
  edges: { from: string; to: string }[];          // prerequisite → dependent, inside this milestone
  testOut:
    | { status: 'none' }
    | { status: 'available' }
    | { status: 'in_progress'; answered: number; total: number }
    | { status: 'cooldown'; retryAt: string }
    | { status: 'too_few_questions' };
}
interface TreeLesson {
  id; title; skill; status: LessonStatus; coveredVia: Track | null;
  locked: boolean;
  earlierPrerequisites: { id: string; title: string; done: boolean }[]; // in lower-rank milestones → "builds on" chips
  branch: number; column: number; row: number;
}
```

`missingPrerequisites` is removed from `TreeLesson`. In-milestone prerequisites are edges now, and earlier ones are chips.

## Test-out Routes

| Route | Does |
|---|---|
| `GET /api/tutoring/milestones/[id]/testout` | Current state: availability, the in-progress attempt's progress, or the last result with its review |
| `POST /api/tutoring/milestones/[id]/testout` | Starts a new attempt or resumes the open one. Returns `{ attemptId, questions: ExerciseView[], answered: number }` |
| `POST /api/tutoring/milestones/[id]/testout/answer` | `{ exerciseId, answer }`. It grades and stores the answer, and returns `{ answered, total }`. The last answer finishes the attempt and returns `{ finished: true, result }` |

`result` is `{ passed, score, maxScore, review: { exercise: ExerciseView, answerText, result, correctAnswer }[] }`.

Errors:
- `testout_unavailable` (409): the milestone isn't eligible;
- `testout_cooldown` (409): includes `params: { retryAt }`;
- `bad_request` (400): the exercise isn't the attempt's next question, or the answer is malformed;
- `ai_failed` (502): free-text grading failed, and the question stays unanswered.

## Seed Format v2

```ts
interface SeedFile {
  seedVersion: string;
  formatVersion: 2;
  track; level;
  milestones: { milestone: { id; track; level; title; description; difficultyRank: number }; lessonIds: string[] }[];
  lessons; exercises; prerequisites; conceptLinks?; practice?;   // unchanged
}
```

**Loader.** When the bundled `seedVersion` differs from the stored one, then for each file, in one transaction:
- upsert lessons, exercises, prerequisites and links as today;
- **replace the structure of that track+level**:
  - upsert the file's milestones;
  - set each listed lesson's placement to its milestone;
  - move every other lesson of that track+level whose placement is in a milestone not listed in the file (such as an admin-created lesson in an admin-created milestone) into Unsorted;
  - then delete milestones of that track+level that aren't in the file (never Unsorted).

A v1 file (with `sections`) is rejected with an error naming the file. Bundled seeds are all v2 after this sub-project.

**Export** writes v2. Milestones are sorted by rank, then id, and `lessonIds` are sorted by id, since there's no order to preserve. The practice pool export (Phase 2) is unchanged.

## Admin

Structure editor (`TrackLevelStructure`):
- Milestones are listed by rank. Each shows its title, description and **rank** (a number input) and its lessons, with Edit and Delete.
- **Delete** moves the lessons to Unsorted after a confirm listing them.
- **"Add milestone"** asks for title, description and rank.
- Each lesson row has a **"Move to…"** milestone select.
- Prerequisite-scope errors show in an alert.
- Lessons whose prerequisites sit in Unsorted are flagged: "builds on a lesson in Unsorted".
- The Tree / Diagram tabs stay. `DependencyDiagram` groups nodes into one band per milestone, using `computeBranchLayout` per milestone.

The lesson editor's **PlacementPicker** becomes: choose a milestone, or "New milestone" with title and rank. Creating directly into Unsorted stays rejected; moving into it on update stays allowed.

Routes:
- `POST /api/admin/curriculum/milestones`: `{ track, level, title, description, difficultyRank }`.
- `PATCH /api/admin/curriculum/milestones/[id]`: `{ title, description, difficultyRank }`. A rank change runs the prerequisite-scope check across the milestone's lessons.
- `DELETE /api/admin/curriculum/milestones/[id]`: unchanged.
- `PATCH /api/admin/curriculum/lessons/[id]/milestone`: `{ milestoneId }`, the "Move to…" action with the scope check.
- Removed: `milestones/reorder` and all `sections` routes.

The curriculum read API `GET /api/curriculum/tracks/[track]/[level]` returns `{ milestone, lessons }[]`.

## Student UI (unstyled; the design pass styles it)

- **Tree:**
  - one `<section>` per milestone in rank order, with its title, rank, state and "x / y done";
  - lessons are placed in a CSS grid by `branch`/`column` → grid column and `row` → grid row;
  - locked lessons render as non-links with a lock label;
  - a lesson's `earlierPrerequisites` render as "builds on: …" chips;
  - the next-rank milestones show "Test out" (or "Resume test-out", "Try again after …", "Not enough questions to test out").
- **Test-out page** `/milestone/[id]/test-out`:
  - questions one at a time, with no feedback, reusing ExerciseCard's input parts in a new `mode="test"` that submits to the test-out route and shows nothing after answering;
  - progress "Question 3 of 16";
  - then the result and review.
- **Lesson page:** a lesson-locked view explains why. For example, "Finish 'Everyday basics' first", or "First complete: Plural, Akkusativ", each linking to that lesson.

All new text is in the `tree`, `lesson` and new `testOut` catalogs, in en and de.

## Content: the Regrouping Draft

A plan task (content, not code) rewrites all 15 `data/curriculum-seed/*.json` files to format v2 and bumps `seedVersion`. For each track+level:
- **3–5 milestones**, grouped by difficulty. A lesson's difficulty comes from its content (sub-level of the grammar, text length and task complexity) and its prerequisite depth.
- **Every prerequisite** points to the same milestone or a strictly lower rank. A validation script, a test over the bundled seeds, enforces this.
- **Titles and descriptions:** short, descriptive English titles (e.g. "Everyday basics", "Talking about the past", "Exam formats"), with a one-sentence description. German versions come in Bilingual content.
- **Ids:** `{track}-{level}-m{rank}-{slug}`.
- **Skills:** mixed across milestones, balanced where the content allows.

The user spot-checks the draft. The tree and test-out work on any valid grouping, so a correction later is an admin edit or a seed bump.

## Error Handling

- Every client fetch checks `res.ok` and shows `role="alert"` text through `useApiErrorText`, following Phase 2's error codes.
- Test-out answers are submitted one at a time, and the button is disabled while a submission is in flight.
- Opening a locked lesson by URL shows the locked view, not an error.
- A lesson view or tree for a track+level with no ranked milestones renders the empty state.

## Testing

- **Pure rules** get table tests:
  - milestone state: parallel ranks, empty milestones, complete-but-later;
  - lesson state: a completed lesson in a locked milestone, prerequisites in Unsorted, concept-link coverage;
  - prerequisite scope: same milestone, lower rank, parallel rank rejected, Unsorted exempt;
  - the test-out draw: ≤10, 11–20 and >20 lessons, too few, flashcards excluded, free text excluded without AI;
  - scoring at the 80% boundary;
  - branch layout: a single chain, a diamond, disjoint branches, a lone lesson.
- **Migration:** build an old-shape database with sections, milestones in order, placements in two sections, and a completion. After migrating: ranks = order + 1, Unsorted rank NULL, placements on milestones, `sections` gone, completion source `lesson`.
- **Seed loader v2:**
  - a lesson moves between milestones;
  - an admin-created milestone is deleted with its lessons moved to Unsorted;
  - Unsorted is never deleted;
  - a v1 file is rejected;
  - the bundled seeds all load and pass the prerequisite-scope validation.
- **Services and routes:**
  - a locked lesson is refused (403 `lesson_locked`) on attempts, chat and complete;
  - a completed lesson in a locked milestone stays open;
  - test-out start → resume → answer → pass (completions with source testout; review states only for exercises not answered correct; existing states kept; level unlock ran);
  - fail → cooldown → retry after 24 h;
  - answering out of order returns 400;
  - free-text grading failure keeps the question.
- **Client:**
  - the tree renders locked/open/done states and a test-out button;
  - the test-out page shows no feedback between questions, then the review;
  - the lesson locked view lists the missing prerequisites as links;
  - admin rank edit and "Move to…" show the scope error.
  - Mocks use the timing-realistic `delayedResponse` helper.

## Decisions (2026-09-29)

- Sections are removed. A milestone is a difficulty group with a rank, and equal ranks are parallel.
- Milestones are hard-gated. Lessons are hard-locked by prerequisites. A completed lesson always stays open.
- Prerequisites must point to the same milestone or a strictly lower rank, within the same track+level.
- Test-out:
  - only for the next locked rank;
  - 2 per lesson, max 20, no flashcards, no timer;
  - 80% to pass, almost counts half;
  - no feedback during the test, full review after;
  - resumable;
  - 24-hour cooldown after a failure.
  - A pass schedules every exercise not answered correct, flashcards included, due tomorrow and trickled by the daily limit.
- A lesson covered by a concept link counts fully: for prerequisites, milestone completion, and exclusion from test-out draws.
- Claude drafts the regrouping, with 3–5 milestones per level. The existing database's structure is replaced; everything else is kept.
- The tree is vertical, with disjoint branches side by side.
