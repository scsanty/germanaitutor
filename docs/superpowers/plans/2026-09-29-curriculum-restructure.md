# Curriculum Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Track → Level → Milestone → Section → Lesson with Track → Level → Milestone → Lesson, where milestones are difficulty-ranked and hard-gated, lessons are locked by their prerequisites, the tree draws prerequisite branches, and a milestone test-out lets a student skip the next locked rank.

**Architecture:**
- **Pure rules** live in `lib/tutoring/` and are table-tested: milestone and lesson gating, prerequisite scope, the test-out draw and scoring, and the branch layout.
- **Gating data:** a new `lib/services/levelGating.ts` loads one track+level's gating state from the database, and every consumer uses it: the tree, the lesson view, attempts, chat, and test-out.
- **Sections** are removed in one atomic task, so the suite stays green. Features are then added on top.
- **Content:** the regrouped seed content is a content task at the end, pinned by a validation test over the bundled seeds.

**Tech Stack:** Next.js 16 App Router, React 18.3, TypeScript, better-sqlite3, next-intl 4, vitest 5 with Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-curriculum-restructure-design.md`

**Precondition:** Tutoring Phase 2 (`docs/superpowers/plans/2026-09-29-tutoring-phase2-practice-pool.md`) is merged. This plan uses what it produced:
- `lib/tutoring/errorCodes.ts` (`ErrorCode`, `ErrorParams`, `ApiErrorBody`, `errorBody`);
- `AttemptError(message, kind, code?, params?)` and `ChatError(message, kind, code?, params?)`;
- `lib/services/exerciseGrading.ts` (`gradeExerciseAnswer`);
- `components/useApiErrorText.ts`, and the `errors` catalog namespace;
- `SeedFile.practice?` and the practice pool tables.

Before starting each task, re-check the line references against the merged code.

## Global Constraints

- Hierarchy: Track → Level → Milestone → Lesson. The `sections` table and every section route, type and UI are removed.
- `milestones.difficulty_rank` is an INTEGER ≥ 1, or NULL only for the Unsorted milestone (`{track}-{level}-unsorted`).
- A milestone is complete when every lesson in it is done. An empty milestone is complete.
- The open rank is the lowest rank with an incomplete milestone. Ranks at or below it are open, and higher ranks are locked. Equal ranks are parallel.
- A lesson is done if it has its own completion (any source) or is covered through a concept link.
- A completed lesson is never locked.
- A lesson is locked if its milestone is locked, or if any of its prerequisites (ignoring prerequisites placed in Unsorted) isn't done.
- Prerequisite scope: the prerequisite must be in the same milestone as the dependent lesson, or in a strictly lower rank, within the same track+level. Edges touching Unsorted are exempt.
- Test-out rules:
  - Offered only for the next locked rank.
  - Eligible types: `multiple_choice`, `fill_blank`, and `free_text` (only when a working AI provider exists). Never flashcards.
  - Draw: 2 per lesson, at most 20; not-done lessons only. Fewer than 5 eligible exercises means no test-out.
  - Scoring: correct = 1, almost = 0.5, wrong = 0. Pass at ≥ 80%.
  - No timer and no feedback during the test. The attempt is resumable, and there is a 24 h cooldown after a failure.
  - Test-out answers are never written to `lesson_attempts`.
- On a test-out pass:
  - completions are recorded with `source = 'testout'`;
  - every exercise of the completed lessons *not answered correct* in the attempt gets a review due tomorrow (flashcards included), and existing review states are kept;
  - then the level-unlock check runs.
- Seed files are `formatVersion: 2`. The loader rejects any other format with an error naming the file.
- New error codes: `lesson_locked`, `testout_unavailable`, `testout_cooldown`, with catalog text in en and de. Admin pages stay English.
- Every client fetch checks `res.ok` and shows a `role="alert"` message. Client tests use the timing-realistic `delayedResponse` helper.

## Review Focus

1. **Stale in-progress attempt:** a milestone whose test-out is in progress becomes open, because the student finished its lessons normally. The tree shows no test-out, and answering the stale attempt returns `testout_unavailable` (Task 5).
2. **Double-submitted answer:** a test-out answer submitted twice for the same question, as with a double click, is rejected as out of order (400), not stored twice (Task 5).
3. **Deleted exercise mid-attempt:** an exercise drawn for an in-progress test-out is deleted by an admin. The next answer to it returns `not_found`, and the attempt can still finish by skipping it (Task 5).
4. **Prerequisite in Unsorted:** a lesson whose only prerequisite sits in Unsorted is open, not locked forever (Task 4).
5. **Lowering a rank:** an admin lowers a milestone's rank below a milestone its lessons depend on. The save is rejected with the violating edges, and nothing changes (Task 3).

## File Structure

| File | Responsibility |
|---|---|
| `lib/tutoring/gating.ts` (new) | Pure milestone states, open and next-locked rank, lesson lock, prerequisite scope violations |
| `lib/tutoring/branchLayout.ts` (new) | Pure per-milestone branch layout |
| `lib/tutoring/testOut.ts` (new) | Pure test-out constants, eligibility, draw, scoring, cooldown |
| `lib/tutoring/testOutViews.ts` (new) | `TestOutStatus`, `TestOutResult`, `TestOutState` types shared by server and client |
| `lib/services/levelGating.ts` (new) | Loads the done state and one track+level's gating from the database; single-lesson lock lookup |
| `lib/services/testOutStatus.ts` (new) | Test-out status of one milestone (used by the tree and the test-out service) |
| `lib/services/testOutService.ts` (new) | Start/resume, answer, finish, and review for test-outs |
| `lib/db/schema.ts` | New shape plus `migrateToMilestoneOnlyStructure` |
| `lib/curriculum-admin/unsortedBucket.ts` | Unsorted milestone without a section |
| `lib/curriculum-admin/placementResolver.ts` | Resolves a placement to a milestone id |
| `lib/services/curriculumService.ts`, `curriculumStructureService.ts`, `lessonAdminService.ts`, `curriculumSeedLoader.ts`, `curriculumExportService.ts`, `progressService.ts`, `attemptService.ts`, `lessonChatService.ts` | Moved onto milestones; gating and scope checks |
| `lib/tutoring/progressTypes.ts` | New tree and lesson-view shapes |
| `app/api/tutoring/milestones/[id]/testout/route.ts`, `…/testout/answer/route.ts` (new) | Test-out routes |
| `app/api/admin/curriculum/lessons/[id]/milestone/route.ts` (new) | "Move to…" |
| `components/tutoring/CurriculumTree.tsx`, `LessonPage.tsx`, `ExerciseCard.tsx`, `TestOutPage.tsx` (new), `app/milestone/[id]/test-out/page.tsx` (new) | Student UI |
| `components/admin/TrackLevelStructure.tsx`, `PlacementPicker.tsx`, `LessonEditorForm.tsx`, `ConceptLinkSection.tsx`, `DependencyDiagram.tsx` | Admin UI on milestones |
| `scripts/convert-seeds-v2.ts` (new, one-off) | Mechanical v1 → v2 conversion of the bundled seeds (Task 2) |
| `data/curriculum-seed/*.json` | v2 seeds; regrouped in Task 8 |
| `test/tutoringFixtures.ts` | Fixture without sections |

## Task Order

1. Pure rules: gating, branch layout, test-out
2. Remove sections: schema, migration, services, seeds v2, routes, admin UI, fixtures
3. Admin: prerequisite-scope validation, "Move to…", Unsorted flags, diagram bands
4. Server gating: lesson view, attempts, chat, complete, queue, suggestion, error codes
5. Test-out service and routes
6. Tree API and tree UI, lesson locked view
7. Test-out page
8. Content: regroup all 15 seed files, with the bundled-seed validation test

---

### Task 1: Pure rules — gating, branch layout, test-out

**Files:**
- Create: `lib/tutoring/gating.ts`, `lib/tutoring/gating.test.ts`, `lib/tutoring/branchLayout.ts`, `lib/tutoring/branchLayout.test.ts`, `lib/tutoring/testOut.ts`, `lib/tutoring/testOut.test.ts`

**Interfaces:**
- Consumes: `GradeResult` (`lib/tutoring/grading.ts`), `ExerciseType` (`lib/curriculum/types.ts`).
- Produces:
  - `gating.ts`:
    - `type MilestoneState = 'locked' | 'open' | 'complete'`
    - `interface RankedMilestone { id: string; rank: number; lessonIds: string[] }`
    - `milestoneStates(milestones: RankedMilestone[], isDone: (lessonId: string) => boolean): Map<string, MilestoneState>`
    - `openRank(milestones, isDone): number | null`
    - `nextLockedRank(milestones, isDone): number | null`
    - `isLessonLocked(input: { lessonId: string; milestoneState: MilestoneState; prerequisiteIds: string[]; unsortedIds: ReadonlySet<string> }, isDone: (id: string) => boolean): boolean`
    - `interface PlacementInfo { milestoneId: string; rank: number | null }`
    - `interface ScopeEdge { lessonId: string; prerequisiteId: string }`
    - `prerequisiteScopeViolations(edges: ScopeEdge[], placementOf: (lessonId: string) => PlacementInfo | undefined): ScopeEdge[]`
  - `branchLayout.ts`:
    - `interface BranchNode { id: string; branch: number; column: number; row: number }`
    - `computeBranchLayout(lessonIds: string[], edges: { from: string; to: string }[]): BranchNode[]`
  - `testOut.ts`:
    - constants `TESTOUT_PASS_RATIO = 0.8`, `TESTOUT_PER_LESSON = 2`, `TESTOUT_MAX_QUESTIONS = 20`, `TESTOUT_MIN_QUESTIONS = 5`, `TESTOUT_COOLDOWN_HOURS = 24`
    - `isTestOutEligibleType(type: ExerciseType, aiAvailable: boolean): boolean`
    - `interface TestOutCandidate { lessonId: string; exerciseIds: string[] }`
    - `drawTestOut(candidates: TestOutCandidate[], random?: () => number): string[]`
    - `scoreTestOut(results: GradeResult[]): { score: number; maxScore: number; passed: boolean }`
    - `cooldownEndsAt(finishedAt: string): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/tutoring/gating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isLessonLocked,
  milestoneStates,
  nextLockedRank,
  openRank,
  prerequisiteScopeViolations,
  type PlacementInfo,
  type RankedMilestone,
} from './gating';

const doneOf = (...ids: string[]) => {
  const set = new Set(ids);
  return (id: string) => set.has(id);
};

const M: RankedMilestone[] = [
  { id: 'm1', rank: 1, lessonIds: ['a', 'b'] },
  { id: 'm2a', rank: 2, lessonIds: ['c'] },
  { id: 'm2b', rank: 2, lessonIds: ['d'] },
  { id: 'm3', rank: 3, lessonIds: ['e'] },
];

describe('milestoneStates', () => {
  it('opens only the lowest incomplete rank at the start', () => {
    const states = milestoneStates(M, doneOf());
    expect(Object.fromEntries(states)).toEqual({ m1: 'open', m2a: 'locked', m2b: 'locked', m3: 'locked' });
    expect(openRank(M, doneOf())).toBe(1);
    expect(nextLockedRank(M, doneOf())).toBe(2);
  });

  it('opens parallel milestones of equal rank together, and the next rank only when all are complete', () => {
    expect(Object.fromEntries(milestoneStates(M, doneOf('a', 'b')))).toEqual({
      m1: 'complete',
      m2a: 'open',
      m2b: 'open',
      m3: 'locked',
    });
    expect(Object.fromEntries(milestoneStates(M, doneOf('a', 'b', 'c')))).toEqual({
      m1: 'complete',
      m2a: 'complete',
      m2b: 'open',
      m3: 'locked',
    });
    expect(nextLockedRank(M, doneOf('a', 'b', 'c'))).toBe(3);
  });

  it('treats an empty milestone as complete', () => {
    const withEmpty: RankedMilestone[] = [{ id: 'e', rank: 1, lessonIds: [] }, ...M.map((m) => ({ ...m, rank: m.rank + 1 }))];
    expect(milestoneStates(withEmpty, doneOf()).get('e')).toBe('complete');
    expect(openRank(withEmpty, doneOf())).toBe(2);
  });

  it('reports a complete later milestone as complete even while an earlier rank is open', () => {
    expect(milestoneStates(M, doneOf('e')).get('m3')).toBe('complete');
  });

  it('has no open or next rank when everything is complete', () => {
    const all = doneOf('a', 'b', 'c', 'd', 'e');
    expect(openRank(M, all)).toBeNull();
    expect(nextLockedRank(M, all)).toBeNull();
  });

  it('has no next locked rank when the open rank is the last one', () => {
    expect(nextLockedRank(M, doneOf('a', 'b', 'c', 'd'))).toBeNull();
  });
});

describe('isLessonLocked', () => {
  const none = new Set<string>();
  it('never locks a done lesson, even in a locked milestone', () => {
    expect(isLessonLocked({ lessonId: 'x', milestoneState: 'locked', prerequisiteIds: ['p'], unsortedIds: none }, doneOf('x'))).toBe(false);
  });

  it('locks every lesson of a locked milestone', () => {
    expect(isLessonLocked({ lessonId: 'x', milestoneState: 'locked', prerequisiteIds: [], unsortedIds: none }, doneOf())).toBe(true);
  });

  it('locks a lesson in an open milestone until its prerequisites are done', () => {
    const input = { lessonId: 'x', milestoneState: 'open' as const, prerequisiteIds: ['p', 'q'], unsortedIds: none };
    expect(isLessonLocked(input, doneOf('p'))).toBe(true);
    expect(isLessonLocked(input, doneOf('p', 'q'))).toBe(false);
  });

  it('ignores prerequisites that sit in Unsorted', () => {
    expect(
      isLessonLocked({ lessonId: 'x', milestoneState: 'open', prerequisiteIds: ['hidden'], unsortedIds: new Set(['hidden']) }, doneOf())
    ).toBe(false);
  });
});

describe('prerequisiteScopeViolations', () => {
  const placements: Record<string, PlacementInfo> = {
    a: { milestoneId: 'm1', rank: 1 },
    b: { milestoneId: 'm1', rank: 1 },
    c: { milestoneId: 'm2a', rank: 2 },
    d: { milestoneId: 'm2b', rank: 2 },
    u: { milestoneId: 'unsorted', rank: null },
  };
  const placementOf = (id: string) => placements[id];

  it('allows the same milestone and a strictly lower rank', () => {
    expect(
      prerequisiteScopeViolations(
        [
          { lessonId: 'b', prerequisiteId: 'a' },
          { lessonId: 'c', prerequisiteId: 'a' },
        ],
        placementOf
      )
    ).toEqual([]);
  });

  it('rejects a parallel milestone of equal rank and a later rank', () => {
    const edges = [
      { lessonId: 'c', prerequisiteId: 'd' },
      { lessonId: 'a', prerequisiteId: 'c' },
    ];
    expect(prerequisiteScopeViolations(edges, placementOf)).toEqual(edges);
  });

  it('exempts edges touching Unsorted or an unplaced lesson', () => {
    expect(
      prerequisiteScopeViolations(
        [
          { lessonId: 'a', prerequisiteId: 'u' },
          { lessonId: 'u', prerequisiteId: 'c' },
          { lessonId: 'a', prerequisiteId: 'nowhere' },
        ],
        placementOf
      )
    ).toEqual([]);
  });
});
```

Create `lib/tutoring/branchLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBranchLayout } from './branchLayout';

const byId = (nodes: ReturnType<typeof computeBranchLayout>) => Object.fromEntries(nodes.map((n) => [n.id, n]));

describe('computeBranchLayout', () => {
  it('lays a chain out top to bottom in one branch', () => {
    const nodes = byId(computeBranchLayout(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]));
    expect(nodes).toEqual({
      a: { id: 'a', branch: 0, column: 0, row: 0 },
      b: { id: 'b', branch: 0, column: 0, row: 1 },
      c: { id: 'c', branch: 0, column: 0, row: 2 },
    });
  });

  it('places a diamond with the join on the row below its deepest prerequisite', () => {
    const nodes = byId(
      computeBranchLayout(
        ['a', 'b', 'c', 'd'],
        [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'd' },
          { from: 'c', to: 'd' },
        ]
      )
    );
    expect(nodes.a).toMatchObject({ row: 0, column: 0 });
    expect(nodes.b).toMatchObject({ row: 1, column: 0 });
    expect(nodes.c).toMatchObject({ row: 1, column: 1 });
    expect(nodes.d).toMatchObject({ row: 2, column: 0 });
  });

  it('puts disjoint branches side by side, including lone lessons, ordered by their smallest id', () => {
    const nodes = byId(computeBranchLayout(['z', 'b', 'a', 'y'], [{ from: 'y', to: 'z' }]));
    // Branches: {a}, {b}, {y, z}. Each branch starts after the widest row of the previous ones.
    expect(nodes.a).toEqual({ id: 'a', branch: 0, column: 0, row: 0 });
    expect(nodes.b).toEqual({ id: 'b', branch: 1, column: 1, row: 0 });
    expect(nodes.y).toEqual({ id: 'y', branch: 2, column: 2, row: 0 });
    expect(nodes.z).toEqual({ id: 'z', branch: 2, column: 2, row: 1 });
  });

  it('ignores edges to lessons outside the milestone', () => {
    expect(byId(computeBranchLayout(['b'], [{ from: 'elsewhere', to: 'b' }])).b).toEqual({ id: 'b', branch: 0, column: 0, row: 0 });
  });

  it('throws on a cycle', () => {
    expect(() => computeBranchLayout(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])).toThrow(/Cycle/);
  });
});
```

Create `lib/tutoring/testOut.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cooldownEndsAt, drawTestOut, isTestOutEligibleType, scoreTestOut, type TestOutCandidate } from './testOut';

function lessons(count: number, perLesson: number): TestOutCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    lessonId: `l${i}`,
    exerciseIds: Array.from({ length: perLesson }, (_, j) => `l${i}__ex${j}`),
  }));
}

function perLessonCounts(ids: string[]): number[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const lesson = id.split('__')[0];
    counts.set(lesson, (counts.get(lesson) ?? 0) + 1);
  }
  return [...counts.values()];
}

// A small deterministic generator so the tests don't depend on Math.random.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('isTestOutEligibleType', () => {
  it('never allows flashcards, and allows free text only with a working AI provider', () => {
    expect(isTestOutEligibleType('flashcard', true)).toBe(false);
    expect(isTestOutEligibleType('multiple_choice', false)).toBe(true);
    expect(isTestOutEligibleType('fill_blank', false)).toBe(true);
    expect(isTestOutEligibleType('free_text', false)).toBe(false);
    expect(isTestOutEligibleType('free_text', true)).toBe(true);
  });
});

describe('drawTestOut', () => {
  it('draws up to 2 per lesson for 10 lessons or fewer', () => {
    const ids = drawTestOut(lessons(4, 3), seeded(1));
    expect(ids).toHaveLength(8);
    expect(perLessonCounts(ids)).toEqual([2, 2, 2, 2]);
  });

  it('takes what a lesson has when it has fewer than 2', () => {
    expect(drawTestOut([{ lessonId: 'a', exerciseIds: ['a__ex0'] }, ...lessons(1, 3)], seeded(2))).toHaveLength(3);
  });

  it('draws 1 per lesson plus seconds up to 20 for 11–20 lessons', () => {
    const ids = drawTestOut(lessons(14, 3), seeded(3));
    expect(ids).toHaveLength(20);
    const counts = perLessonCounts(ids);
    expect(counts).toHaveLength(14);
    expect(counts.every((c) => c === 1 || c === 2)).toBe(true);
  });

  it('draws 20 lessons with 1 each for more than 20 lessons', () => {
    const ids = drawTestOut(lessons(25, 3), seeded(4));
    expect(ids).toHaveLength(20);
    expect(perLessonCounts(ids).every((c) => c === 1)).toBe(true);
  });

  it('never repeats an exercise and skips lessons without exercises', () => {
    const ids = drawTestOut([...lessons(3, 2), { lessonId: 'empty', exerciseIds: [] }], seeded(5));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.startsWith('empty'))).toBe(false);
  });
});

describe('scoreTestOut', () => {
  it('scores correct 1, almost 0.5, wrong 0, and passes at 80%', () => {
    expect(scoreTestOut(['correct', 'correct', 'correct', 'correct', 'wrong'])).toEqual({ score: 4, maxScore: 5, passed: true });
    expect(scoreTestOut(['correct', 'correct', 'correct', 'almost', 'wrong'])).toEqual({ score: 3.5, maxScore: 5, passed: false });
    expect(scoreTestOut(['almost', 'almost'])).toEqual({ score: 1, maxScore: 2, passed: false });
  });
});

describe('cooldownEndsAt', () => {
  it('adds 24 hours', () => {
    expect(cooldownEndsAt('2026-09-29T10:00:00.000Z')).toBe('2026-09-30T10:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/tutoring/gating.test.ts lib/tutoring/branchLayout.test.ts lib/tutoring/testOut.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement the modules**

Create `lib/tutoring/gating.ts`:

```ts
// Spec: Rules. Pure gating for one track+level: milestones are hard-gated by difficulty rank,
// and inside an open milestone a lesson waits for its prerequisites.

export type MilestoneState = 'locked' | 'open' | 'complete';

export interface RankedMilestone {
  id: string;
  rank: number;
  lessonIds: string[];
}

function isComplete(milestone: RankedMilestone, isDone: (lessonId: string) => boolean): boolean {
  return milestone.lessonIds.every(isDone);
}

// The lowest rank that still has an incomplete milestone; null when every milestone is complete.
export function openRank(milestones: RankedMilestone[], isDone: (lessonId: string) => boolean): number | null {
  const incomplete = milestones.filter((m) => !isComplete(m, isDone)).map((m) => m.rank);
  return incomplete.length === 0 ? null : Math.min(...incomplete);
}

// The lowest rank above the open rank: the only rank a test-out is offered for.
export function nextLockedRank(milestones: RankedMilestone[], isDone: (lessonId: string) => boolean): number | null {
  const open = openRank(milestones, isDone);
  if (open === null) return null;
  const above = milestones.map((m) => m.rank).filter((rank) => rank > open);
  return above.length === 0 ? null : Math.min(...above);
}

export function milestoneStates(
  milestones: RankedMilestone[],
  isDone: (lessonId: string) => boolean
): Map<string, MilestoneState> {
  const open = openRank(milestones, isDone);
  const states = new Map<string, MilestoneState>();
  for (const milestone of milestones) {
    if (isComplete(milestone, isDone)) states.set(milestone.id, 'complete');
    else states.set(milestone.id, open !== null && milestone.rank <= open ? 'open' : 'locked');
  }
  return states;
}

// A done lesson is never locked (spec: completed lessons stay open after admin edits).
// Prerequisites placed in Unsorted can't be done by a student, so they never lock anything.
export function isLessonLocked(
  input: { lessonId: string; milestoneState: MilestoneState; prerequisiteIds: string[]; unsortedIds: ReadonlySet<string> },
  isDone: (lessonId: string) => boolean
): boolean {
  if (isDone(input.lessonId)) return false;
  if (input.milestoneState === 'locked') return true;
  return input.prerequisiteIds.some((id) => !input.unsortedIds.has(id) && !isDone(id));
}

export interface PlacementInfo {
  milestoneId: string;
  // null for the Unsorted milestone
  rank: number | null;
}

export interface ScopeEdge {
  lessonId: string;
  prerequisiteId: string;
}

// Spec: Prerequisite scope. A prerequisite must sit in the same milestone or a strictly lower
// rank. Parallel milestones of equal rank don't count. Unsorted and unplaced lessons are exempt.
export function prerequisiteScopeViolations(
  edges: ScopeEdge[],
  placementOf: (lessonId: string) => PlacementInfo | undefined
): ScopeEdge[] {
  return edges.filter((edge) => {
    const lesson = placementOf(edge.lessonId);
    const prerequisite = placementOf(edge.prerequisiteId);
    if (!lesson || !prerequisite || lesson.rank === null || prerequisite.rank === null) return false;
    if (lesson.milestoneId === prerequisite.milestoneId) return false;
    return prerequisite.rank >= lesson.rank;
  });
}
```

Create `lib/tutoring/branchLayout.ts`:

```ts
export interface BranchNode {
  id: string;
  // index of the connected component, ordered by each component's smallest lesson id
  branch: number;
  // global grid column: branches sit side by side
  column: number;
  // depth: 0 for a lesson with no prerequisite inside the milestone
  row: number;
}

// Spec: Branch layout. Pure and deterministic, so the tree renders the same every time.
export function computeBranchLayout(lessonIds: string[], edges: { from: string; to: string }[]): BranchNode[] {
  const ids = new Set(lessonIds);
  const inside = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const prereqsOf = new Map<string, string[]>(lessonIds.map((id) => [id, []]));
  const neighbours = new Map<string, string[]>(lessonIds.map((id) => [id, []]));
  for (const edge of inside) {
    prereqsOf.get(edge.to)!.push(edge.from);
    neighbours.get(edge.to)!.push(edge.from);
    neighbours.get(edge.from)!.push(edge.to);
  }

  const rowCache = new Map<string, number>();
  const visiting = new Set<string>();
  function rowOf(id: string): number {
    const cached = rowCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) throw new Error(`Cycle detected involving lesson ${id}`);
    visiting.add(id);
    const prereqs = prereqsOf.get(id)!;
    const row = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(rowOf));
    visiting.delete(id);
    rowCache.set(id, row);
    return row;
  }

  // Connected components of the undirected graph.
  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  for (const start of [...lessonIds].sort()) {
    if (componentOf.has(start)) continue;
    const members: string[] = [];
    const stack = [start];
    componentOf.set(start, components.length);
    while (stack.length > 0) {
      const id = stack.pop()!;
      members.push(id);
      for (const next of neighbours.get(id)!) {
        if (!componentOf.has(next)) {
          componentOf.set(next, components.length);
          stack.push(next);
        }
      }
    }
    components.push(members);
  }

  const result: BranchNode[] = [];
  let offset = 0;
  components.forEach((members, branch) => {
    const byRow = new Map<number, string[]>();
    for (const id of members) {
      const row = rowOf(id);
      byRow.set(row, [...(byRow.get(row) ?? []), id]);
    }
    let width = 0;
    for (const [row, rowIds] of byRow) {
      rowIds.sort();
      rowIds.forEach((id, index) => result.push({ id, branch, column: offset + index, row }));
      width = Math.max(width, rowIds.length);
    }
    offset += width;
  });
  return result;
}
```

Create `lib/tutoring/testOut.ts`:

```ts
import type { ExerciseType } from '../curriculum/types';
import type { GradeResult } from './grading';

// Spec: Test-out.
export const TESTOUT_PASS_RATIO = 0.8;
export const TESTOUT_PER_LESSON = 2;
export const TESTOUT_MAX_QUESTIONS = 20;
export const TESTOUT_MIN_QUESTIONS = 5;
export const TESTOUT_COOLDOWN_HOURS = 24;

// Types added later declare their own eligibility here (letter tasks and spoken answers won't be).
export function isTestOutEligibleType(type: ExerciseType, aiAvailable: boolean): boolean {
  if (type === 'multiple_choice' || type === 'fill_blank') return true;
  if (type === 'free_text') return aiAvailable;
  return false;
}

export interface TestOutCandidate {
  lessonId: string;
  // the lesson's eligible exercises
  exerciseIds: string[];
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function drawTestOut(candidates: TestOutCandidate[], random: () => number = Math.random): string[] {
  const lessons = shuffled(
    candidates.filter((c) => c.exerciseIds.length > 0),
    random
  ).map((c) => ({ lessonId: c.lessonId, pool: shuffled(c.exerciseIds, random) }));

  if (lessons.length <= TESTOUT_MAX_QUESTIONS / TESTOUT_PER_LESSON) {
    return lessons.flatMap((l) => l.pool.slice(0, TESTOUT_PER_LESSON));
  }
  if (lessons.length > TESTOUT_MAX_QUESTIONS) {
    return lessons.slice(0, TESTOUT_MAX_QUESTIONS).map((l) => l.pool[0]);
  }
  const drawn = lessons.map((l) => l.pool[0]);
  for (const lesson of shuffled(lessons, random)) {
    if (drawn.length >= TESTOUT_MAX_QUESTIONS) break;
    if (lesson.pool.length > 1) drawn.push(lesson.pool[1]);
  }
  return drawn;
}

const POINTS: Record<GradeResult, number> = { correct: 1, almost: 0.5, wrong: 0 };

export function scoreTestOut(results: GradeResult[]): { score: number; maxScore: number; passed: boolean } {
  const score = results.reduce((sum, r) => sum + POINTS[r], 0);
  const maxScore = results.length;
  return { score, maxScore, passed: maxScore > 0 && score / maxScore >= TESTOUT_PASS_RATIO };
}

export function cooldownEndsAt(finishedAt: string): string {
  return new Date(new Date(finishedAt).getTime() + TESTOUT_COOLDOWN_HOURS * 3_600_000).toISOString();
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/tutoring/gating.test.ts lib/tutoring/branchLayout.test.ts lib/tutoring/testOut.test.ts`
Expected: PASS. If the 11–20 draw test fails, check that seconds are only taken from lessons with two or more exercises.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/gating.ts lib/tutoring/gating.test.ts lib/tutoring/branchLayout.ts lib/tutoring/branchLayout.test.ts lib/tutoring/testOut.ts lib/tutoring/testOut.test.ts
git commit -m "feat: add pure gating, branch layout, and test-out rules"
```

---
### Task 2: Remove sections everywhere

Sections are woven through the schema, seeds, services, routes, admin UI and ~23 test files, so they come out in one atomic task: any split would leave the suite red between commits. This task changes **structure only**. It adds no gating, no scope checks, and no new tree states; those arrive in Tasks 3–6.

**Files:**
- Modify:
  - `lib/db/schema.ts`, `lib/curriculum/types.ts`
  - `lib/curriculum-admin/unsortedBucket.ts`, `lib/curriculum-admin/placementResolver.ts`
  - `lib/services/curriculumService.ts`, `lib/services/curriculumStructureService.ts`, `lib/services/lessonAdminService.ts`
  - `lib/services/curriculumSeedLoader.ts`, `lib/services/curriculumExportService.ts`
  - `lib/services/progressService.ts`, `lib/services/attemptService.ts`, `lib/tutoring/progressTypes.ts`
  - `app/api/admin/curriculum/milestones/route.ts`, `app/api/admin/curriculum/milestones/[id]/route.ts`
  - `components/admin/TrackLevelStructure.tsx`, `components/admin/PlacementPicker.tsx`, `components/admin/LessonEditorForm.tsx`, `components/admin/ConceptLinkSection.tsx`, `components/admin/DependencyDiagram.tsx`
  - `components/tutoring/CurriculumTree.tsx`
  - `test/tutoringFixtures.ts`
  - `data/curriculum-seed/*.json` (converted by the script below)
  - every test file listed in Step 7
- Create: `scripts/convert-seeds-v2.ts`, `lib/db/milestoneStructureMigration.test.ts`
- Delete:
  - `app/api/admin/curriculum/sections/route.ts`, `app/api/admin/curriculum/sections/[id]/route.ts`, `app/api/admin/curriculum/sections/reorder/route.ts`, `app/api/admin/curriculum/sections/route.test.ts`
  - `app/api/admin/curriculum/milestones/reorder/route.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `Milestone { id; track; level; title; description: string | null; difficultyRank: number | null }`. The `Section` type is removed. `LessonPlacement { id: number; lessonId: string; milestoneId: string; createdAt: string }`.
  - `ensureUnsortedExists(db, track, level): { milestoneId: string }` and `unsortedMilestoneId(track, level)` (unchanged).
  - `PlacementInput = { milestoneId: string } | { newMilestoneTitle: string; newMilestoneRank: number }`, and `resolvePlacement(db, track, level, input, mode): string` returns a milestone id.
  - `curriculumService.getTrackStructure(track, level): { milestone: Milestone; lessons: Lesson[] }[]`. Ranked milestones come first, ordered by rank then id, and Unsorted is last. Lessons are ordered by title, then id.
  - `curriculumStructureService`:
    - `createMilestone(track, level, title, description, difficultyRank): Milestone`
    - `updateMilestone(id, { title, description, difficultyRank }): Milestone`
    - `previewMilestoneDelete(id): { lessons: DisplacedLesson[] }`
    - `deleteMilestone(id)`
    - `assertValidRank(rank: unknown): number` (exported helper)
  - Seed format v2:
    - `SeedMilestone { id; track; level; title; description: string | null; difficultyRank: number }`
    - `SeedFile { seedVersion; formatVersion: 2; track; level; milestones: { milestone: SeedMilestone; lessonIds: string[] }[]; lessons; exercises; prerequisites; conceptLinks?; practice? }`
  - The tree API (interim shape, extended in Task 6): `TreeMilestone { id; title; lessons: TreeLesson[] }`. `TreeSection` is removed.

- [ ] **Step 1: Write the migration test**

Create `lib/db/milestoneStructureMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './schema';

// The pre-restructure curriculum tables, as an existing app.db has them.
function oldShapeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE milestones (id TEXT PRIMARY KEY, track TEXT NOT NULL, level TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, order_index INTEGER NOT NULL);
    CREATE TABLE sections (id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL);
    CREATE TABLE lessons (id TEXT PRIMARY KEY, track TEXT NOT NULL, source_level TEXT NOT NULL, skill TEXT NOT NULL,
      title TEXT NOT NULL, explanation TEXT, examples TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE lesson_placements (id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(lesson_id));
    CREATE TABLE lesson_completions (lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL);

    INSERT INTO milestones VALUES ('g-a1-grammar', 'generic', 'A1', 'Grammar', NULL, 0),
      ('g-a1-vocab', 'generic', 'A1', 'Vocabulary', NULL, 1),
      ('generic-a1-unsorted', 'generic', 'A1', 'Unsorted', NULL, 0);
    INSERT INTO sections VALUES ('s1', 'g-a1-grammar', 'Lessons', NULL, 0), ('s2', 'g-a1-vocab', 'Lessons', NULL, 0),
      ('s3', 'g-a1-vocab', 'More', NULL, 1), ('generic-a1-unsorted-section', 'generic-a1-unsorted', 'Unsorted', NULL, 0);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1'),
      ('l2', 'generic', 'A1', 'vocabulary', 'L2'), ('l3', 'generic', 'A1', 'vocabulary', 'L3'),
      ('l4', 'generic', 'A1', 'grammar', 'L4');
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0), ('l2', 's2', 0),
      ('l3', 's3', 0), ('l4', 'generic-a1-unsorted-section', 0);
    INSERT INTO lesson_completions VALUES ('l1', '2026-09-28T10:00:00.000Z');
  `);
  return db;
}

describe('migrateToMilestoneOnlyStructure', () => {
  it('ranks milestones by their old order, moves placements onto milestones, and drops sections', () => {
    const db = oldShapeDb();
    runMigrations(db);

    expect(db.prepare('SELECT id, difficulty_rank FROM milestones ORDER BY id').all()).toEqual([
      { id: 'g-a1-grammar', difficulty_rank: 1 },
      { id: 'g-a1-vocab', difficulty_rank: 2 },
      { id: 'generic-a1-unsorted', difficulty_rank: null },
    ]);
    expect(db.prepare('SELECT lesson_id, milestone_id FROM lesson_placements ORDER BY lesson_id').all()).toEqual([
      { lesson_id: 'l1', milestone_id: 'g-a1-grammar' },
      { lesson_id: 'l2', milestone_id: 'g-a1-vocab' },
      { lesson_id: 'l3', milestone_id: 'g-a1-vocab' },
      { lesson_id: 'l4', milestone_id: 'generic-a1-unsorted' },
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sections'").get()).toBeUndefined();
    const milestoneColumns = (db.prepare('PRAGMA table_info(milestones)').all() as { name: string }[]).map((c) => c.name);
    expect(milestoneColumns).not.toContain('order_index');
    expect(db.prepare('SELECT lesson_id, source FROM lesson_completions').all()).toEqual([{ lesson_id: 'l1', source: 'lesson' }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'milestone_testouts'").get()).toBeTruthy();
  });

  it('is a no-op on a second run', () => {
    const db = oldShapeDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_placements').get()).toEqual({ n: 4 });
  });

  it('allows only one in-progress test-out per milestone', () => {
    const db = oldShapeDb();
    runMigrations(db);
    const insert = db.prepare(
      "INSERT INTO milestone_testouts (milestone_id, status, exercise_ids, started_at) VALUES ('g-a1-vocab', ?, '[]', 'x')"
    );
    insert.run('in_progress');
    insert.run('failed');
    expect(() => insert.run('in_progress')).toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/db/milestoneStructureMigration.test.ts`
Expected: FAIL. `difficulty_rank` doesn't exist.

- [ ] **Step 3: Change the schema and add the migration**

In `lib/db/schema.ts`:

(a) In `createTablesIfMissing`, replace the `milestones`, `sections` and `lesson_placements` definitions with:

```sql
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      title TEXT NOT NULL,
      description TEXT,
      difficulty_rank INTEGER CHECK (difficulty_rank IS NULL OR difficulty_rank >= 1)
    );
```

```sql
    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id)
    );
```

(the `sections` definition is deleted). Change `lesson_completions` to:

```sql
    CREATE TABLE IF NOT EXISTS lesson_completions (
      lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson','testout'))
    );
```

and append, after `lesson_chat_messages` and its index:

```sql
    CREATE TABLE IF NOT EXISTS milestone_testouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('in_progress','passed','failed')),
      exercise_ids TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '[]',
      score REAL,
      max_score REAL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_testouts_one_open ON milestone_testouts(milestone_id) WHERE status = 'in_progress';
```

(b) In `migrateConceptIdAndPlacementUniqueness`, which only runs on very old databases that still have `lessons.concept_id`, leave the SQL as it is. It still rebuilds `lesson_placements` with `section_id`, and the new migration below converts that right after.

(c) Add this function after `migrateDailyReviewCap`:

```ts
/**
 * Spec: Curriculum Restructure, Data Model. Sections are removed and milestones get a difficulty
 * rank (old order + 1; NULL for the admin-only Unsorted bucket). Placements move onto their
 * section's milestone with the create-copy-drop-rename pattern, so no curriculum data is lost.
 * The regrouped seeds then replace this placeholder structure.
 */
function migrateToMilestoneOnlyStructure(db: Database.Database): void {
  const hasSections = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sections'").get();
  if (hasSections) {
    db.exec(`
      ALTER TABLE milestones ADD COLUMN difficulty_rank INTEGER CHECK (difficulty_rank IS NULL OR difficulty_rank >= 1);
      UPDATE milestones SET difficulty_rank = CASE WHEN id LIKE '%-unsorted' THEN NULL ELSE order_index + 1 END;

      CREATE TABLE lesson_placements_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(lesson_id)
      );
      INSERT INTO lesson_placements_new (id, lesson_id, milestone_id, created_at)
        SELECT p.id, p.lesson_id, s.milestone_id, p.created_at
        FROM lesson_placements p JOIN sections s ON s.id = p.section_id;
      DROP TABLE lesson_placements;
      ALTER TABLE lesson_placements_new RENAME TO lesson_placements;
      DROP TABLE sections;
      ALTER TABLE milestones DROP COLUMN order_index;
    `);
  }
  const completionColumns = db.prepare('PRAGMA table_info(lesson_completions)').all() as { name: string }[];
  if (!completionColumns.some((c) => c.name === 'source')) {
    db.exec(
      "ALTER TABLE lesson_completions ADD COLUMN source TEXT NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson','testout'))"
    );
  }
}
```

(d) In `runMigrations`, call it last inside the transaction, after `migrateDailyReviewCap(db);` and after any migrations Phase 2 added (`migrateChatPracticeColumn`):

```ts
    migrateToMilestoneOnlyStructure(db);
```

`createTablesIfMissing` already created `milestone_testouts` and its index before this runs. Its milestone foreign key doesn't need `sections`.

In `lib/db/curriculumSchema.test.ts`, in "creates all nine new tables", replace `'sections',` with `'milestone_testouts',`.

- [ ] **Step 4: Run the migration test**

Run: `npx vitest run lib/db/milestoneStructureMigration.test.ts lib/db/curriculumSchema.test.ts`
Expected: PASS. Many other tests now fail; the steps below fix them.

- [ ] **Step 5: Move the library code onto milestones**

(a) `lib/curriculum/types.ts`: delete the `Section` interface, and replace `Milestone` and `LessonPlacement` with:

```ts
export interface Milestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  // 1, 2, 3 … inside its track+level; null only for the admin-only Unsorted bucket
  difficultyRank: number | null;
}
```

```ts
export interface LessonPlacement {
  id: number;
  lessonId: string;
  milestoneId: string;
  createdAt: string;
}
```

(b) Replace `lib/curriculum-admin/unsortedBucket.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

export function unsortedMilestoneId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}-unsorted`;
}

/**
 * Ensures the reserved, non-deletable "Unsorted" milestone exists for this track+level — the
 * admin-only shelf lessons move to when their milestone is deleted. It has no rank and never
 * gates anything. Idempotent.
 */
export function ensureUnsortedExists(db: Database.Database, track: Track, level: CefrLevel): { milestoneId: string } {
  const milestoneId = unsortedMilestoneId(track, level);
  db.prepare(
    `INSERT OR IGNORE INTO milestones (id, track, level, title, description, difficulty_rank)
     VALUES (?, ?, ?, 'Unsorted', NULL, NULL)`
  ).run(milestoneId, track, level);
  return { milestoneId };
}
```

(c) Replace `lib/curriculum-admin/placementResolver.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { randomSuffix } from './randomId';
import { unsortedMilestoneId } from './unsortedBucket';
import { assertValidRank } from '../services/curriculumStructureService';

export type PlacementInput = { milestoneId: string } | { newMilestoneTitle: string; newMilestoneRank: number };

export type PlacementMode = 'create' | 'update';

/**
 * Resolves an Add/Edit form's placement choice into a milestone id, creating a new milestone
 * inline if asked. Callers run it inside the lesson write's transaction, so a later failure rolls
 * the new milestone back too. Creating a lesson directly into Unsorted is rejected; moving an
 * existing lesson there on update is the intended escape hatch.
 */
export function resolvePlacement(
  db: Database.Database,
  track: Track,
  level: CefrLevel,
  input: PlacementInput,
  mode: PlacementMode
): string {
  if ('milestoneId' in input) {
    const milestone = db.prepare('SELECT id, track, level FROM milestones WHERE id = ?').get(input.milestoneId) as
      | { id: string; track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${input.milestoneId}`);
    if (milestone.track !== track || milestone.level !== level) {
      throw new Error(`Milestone ${input.milestoneId} belongs to ${milestone.track}/${milestone.level}, not ${track}/${level}`);
    }
    if (mode === 'create' && input.milestoneId === unsortedMilestoneId(track, level)) {
      throw new Error('Cannot create a lesson directly in the Unsorted milestone');
    }
    return input.milestoneId;
  }

  const rank = assertValidRank(input.newMilestoneRank);
  if (!input.newMilestoneTitle.trim()) throw new Error('A new milestone needs a title');
  const milestoneId = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
  db.prepare(
    'INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, NULL, ?)'
  ).run(milestoneId, track, level, input.newMilestoneTitle.trim(), rank);
  return milestoneId;
}
```

(d) Replace `lib/services/curriculumStructureService.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone } from '../curriculum/types';
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { randomSuffix } from '../curriculum-admin/randomId';

export interface DisplacedLesson {
  id: string;
  title: string;
}

export interface MilestoneDeletePreview {
  lessons: DisplacedLesson[];
}

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  difficulty_rank: number | null;
}

export function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    difficultyRank: row.difficulty_rank,
  };
}

// Spec: a difficulty rank is a whole number of 1 or more.
export function assertValidRank(rank: unknown): number {
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) {
    throw new Error('Difficulty rank must be a whole number of 1 or more');
  }
  return rank;
}

export function createCurriculumStructureService(db: Database.Database) {
  function getMilestone(id: string): Milestone {
    const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow | undefined;
    if (!row) throw new Error(`Milestone not found: ${id}`);
    return rowToMilestone(row);
  }

  function assertNotUnsorted(milestone: Milestone): void {
    if (milestone.id === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('The Unsorted milestone cannot be changed');
    }
  }

  function createMilestone(
    track: Track,
    level: CefrLevel,
    title: string,
    description: string | null,
    difficultyRank: unknown
  ): Milestone {
    const rank = assertValidRank(difficultyRank);
    if (!title?.trim()) throw new Error('A milestone needs a title');
    const id = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, track, level, title.trim(), description, rank);
    return getMilestone(id);
  }

  function updateMilestone(
    id: string,
    input: { title: string; description: string | null; difficultyRank: unknown }
  ): Milestone {
    const milestone = getMilestone(id);
    assertNotUnsorted(milestone);
    const rank = assertValidRank(input.difficultyRank);
    if (!input.title?.trim()) throw new Error('A milestone needs a title');
    db.prepare('UPDATE milestones SET title = ?, description = ?, difficulty_rank = ? WHERE id = ?').run(
      input.title.trim(),
      input.description,
      rank,
      id
    );
    return getMilestone(id);
  }

  function previewMilestoneDelete(id: string): MilestoneDeletePreview {
    return {
      lessons: db
        .prepare(
          'SELECT l.id, l.title FROM lesson_placements p JOIN lessons l ON l.id = p.lesson_id WHERE p.milestone_id = ? ORDER BY l.title'
        )
        .all(id) as DisplacedLesson[],
    };
  }

  // Its lessons move to Unsorted first: the placement foreign key would otherwise cascade them away.
  function deleteMilestone(id: string): void {
    const milestone = getMilestone(id);
    if (id === unsortedMilestoneId(milestone.track, milestone.level)) throw new Error('Cannot delete the Unsorted milestone');
    db.transaction(() => {
      const { milestoneId: unsortedId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      db.prepare('UPDATE lesson_placements SET milestone_id = ? WHERE milestone_id = ?').run(unsortedId, id);
      db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    })();
  }

  return { getMilestone, createMilestone, updateMilestone, previewMilestoneDelete, deleteMilestone };
}

export type CurriculumStructureService = ReturnType<typeof createCurriculumStructureService>;
```

(e) In `lib/services/curriculumService.ts`:
- Delete the `SectionRow` interface and `rowToSection`.
- Change the `MilestoneRow` interface to have `difficulty_rank: number | null` in place of `order_index: number`.
- Change `rowToMilestone` to return `difficultyRank: row.difficulty_rank` in place of `orderIndex`.
- Change the type import to `import type { Milestone, Lesson, Exercise, ExerciseContent, LessonPrerequisite } from '../curriculum/types';`.
- Replace `getTrackStructure` with:

```ts
  function getTrackStructure(track: Track, level: CefrLevel): { milestone: Milestone; lessons: Lesson[] }[] {
    ensureUnsortedExists(db, track, level);
    const unsortedId = unsortedMilestoneId(track, level);
    const milestoneRows = db
      .prepare(
        `SELECT * FROM milestones WHERE track = ? AND level = ?
         ORDER BY (id = ?) ASC, difficulty_rank ASC, id ASC`
      )
      .all(track, level, unsortedId) as MilestoneRow[];
    const lessonsOf = db.prepare(
      `SELECT lessons.* FROM lessons
       JOIN lesson_placements ON lesson_placements.lesson_id = lessons.id
       WHERE lesson_placements.milestone_id = ?
       ORDER BY lessons.title, lessons.id`
    );
    return milestoneRows.map((row) => ({
      milestone: rowToMilestone(row),
      lessons: (lessonsOf.all(row.id) as LessonRow[]).map(rowToLesson),
    }));
  }
```

(f) In `lib/services/lessonAdminService.ts`:
- In `createLesson`, replace the placement block (from `const sectionId = resolvePlacement(` to the placement `INSERT`) with:

```ts
      const milestoneId = resolvePlacement(db, input.track, input.sourceLevel, input.placement, 'create');
      db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run(id, milestoneId);
```

- In `updateLesson`, make the same replacement, ending with:

```ts
      const milestoneId = resolvePlacement(db, input.track, input.sourceLevel, input.placement, 'update');
      db.prepare('DELETE FROM lesson_placements WHERE lesson_id = ?').run(id);
      db.prepare('INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)').run(id, milestoneId);
```

Update the two comments above them to say "milestone" instead of "milestone/section".

(g) Replace the `SeedFile` interface and `upsertSeedFile`/`loadSeedIfNeeded` in `lib/services/curriculumSeedLoader.ts`. **Keep Phase 2's practice import block as it is.** It moves unchanged to the end of the new `upsertSeedFile`, after the concept links.

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';

export const SEED_FORMAT_VERSION = 2;

export interface SeedMilestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  difficultyRank: number;
}

export interface SeedFile {
  seedVersion: string;
  formatVersion: 2;
  track: Track;
  level: CefrLevel;
  milestones: { milestone: SeedMilestone; lessonIds: string[] }[];
  lessons: {
    id: string;
    track: Track;
    sourceLevel: CefrLevel;
    skill: string;
    title: string;
    explanation: string | null;
    examples: string[] | null;
  }[];
  exercises: { id: string; lessonId: string; track: Track | null; type: string; content: unknown }[];
  prerequisites: { lessonId: string; prerequisiteLessonId: string }[];
  conceptLinks?: { lessonAId: string; lessonBId: string }[];
  // Phase 2: keep the existing `practice?` field and its element type exactly as Phase 2 defined them.
}

function readSeedFile(path: string, name: string): SeedFile {
  const seed = JSON.parse(readFileSync(path, 'utf8')) as SeedFile & { formatVersion?: unknown };
  if (seed.formatVersion !== SEED_FORMAT_VERSION) {
    throw new Error(`Seed file ${name} is not seed format ${SEED_FORMAT_VERSION} (it has no sections; see the restructure spec)`);
  }
  return seed;
}

function getCurrentSeedVersion(db: Database.Database): string {
  const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as { seed_version: string } | undefined;
  return row?.seed_version ?? '0';
}

// Spec: Seed Format v2, Loader. The file is the authority for its track+level's structure:
// its milestones are upserted, its lessons placed, and every other milestone of that
// track+level is removed after its lessons move to Unsorted. Unsorted is never removed.
function replaceStructure(db: Database.Database, seed: SeedFile): void {
  const { milestoneId: unsortedId } = ensureUnsortedExists(db, seed.track, seed.level);
  const upsertMilestone = db.prepare(
    `INSERT INTO milestones (id, track, level, title, description, difficulty_rank) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description,
       difficulty_rank = excluded.difficulty_rank`
  );
  const place = db.prepare(
    `INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET milestone_id = excluded.milestone_id`
  );

  for (const { milestone, lessonIds } of seed.milestones) {
    upsertMilestone.run(milestone.id, milestone.track, milestone.level, milestone.title, milestone.description, milestone.difficultyRank);
    for (const lessonId of lessonIds) place.run(lessonId, milestone.id);
  }

  const keep = new Set([unsortedId, ...seed.milestones.map((m) => m.milestone.id)]);
  const stale = (
    db.prepare('SELECT id FROM milestones WHERE track = ? AND level = ?').all(seed.track, seed.level) as { id: string }[]
  )
    .map((r) => r.id)
    .filter((id) => !keep.has(id));
  for (const id of stale) {
    db.prepare('UPDATE lesson_placements SET milestone_id = ? WHERE milestone_id = ?').run(unsortedId, id);
    db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
  }

  // A lesson in the file but in no milestone (an exported Unsorted lesson) lands in Unsorted.
  const placed = db.prepare('SELECT 1 FROM lesson_placements WHERE lesson_id = ?');
  for (const lesson of seed.lessons) {
    if (!placed.get(lesson.id)) place.run(lesson.id, unsortedId);
  }
}

function upsertSeedFile(db: Database.Database, seed: SeedFile): void {
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, explanation = excluded.explanation, examples = excluded.examples`
  );
  const upsertExercise = db.prepare(
    `INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content`
  );
  const upsertPrerequisite = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );

  // Lessons first: placements reference lessons(id).
  for (const lesson of seed.lessons) {
    upsertLesson.run(
      lesson.id,
      lesson.track,
      lesson.sourceLevel,
      lesson.skill,
      lesson.title,
      lesson.explanation,
      lesson.examples ? JSON.stringify(lesson.examples) : null
    );
  }
  replaceStructure(db, seed);
  for (const exercise of seed.exercises) {
    upsertExercise.run(exercise.id, exercise.lessonId, exercise.track, exercise.type, JSON.stringify(exercise.content));
  }
  for (const prereq of seed.prerequisites) {
    upsertPrerequisite.run(prereq.lessonId, prereq.prerequisiteLessonId);
  }

  // Each link is listed in both files it touches; a pair whose other lesson hasn't
  // loaded yet is skipped here and inserted when that lesson's file loads.
  const lessonExists = db.prepare('SELECT 1 FROM lessons WHERE id = ?');
  const insertLink = db.prepare('INSERT OR IGNORE INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)');
  for (const link of seed.conceptLinks ?? []) {
    const [a, b] = link.lessonAId < link.lessonBId ? [link.lessonAId, link.lessonBId] : [link.lessonBId, link.lessonAId];
    if (a === b || !lessonExists.get(a) || !lessonExists.get(b)) continue;
    insertLink.run(a, b);
  }

  // Phase 2's practice block goes here, unchanged.
}

export function loadSeedIfNeeded(db: Database.Database, seedDir: string): void {
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  // Read and validate every file before touching the database.
  const seeds = files.map((file) => readSeedFile(join(seedDir, file), file));
  const bundledVersion = seeds[0].seedVersion;
  if (bundledVersion === getCurrentSeedVersion(db)) return;

  db.transaction(() => {
    for (const seed of seeds) upsertSeedFile(db, seed);
    db.prepare(
      `INSERT INTO curriculum_meta (id, seed_version, last_synced_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET seed_version = excluded.seed_version, last_synced_at = excluded.last_synced_at`
    ).run(bundledVersion);
  })();
}
```

(h) In `lib/services/curriculumExportService.ts`:
- Delete the `SectionRow` interface.
- Change `MilestoneRow` to have `difficulty_rank: number | null` in place of `order_index`.
- Add `import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';`.
- Replace the part of `exportTrackLevel` from `const milestoneRows =` through the `milestones` mapping with:

```ts
    const unsortedId = unsortedMilestoneId(track, level);
    const milestoneRows = (
      db
        .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY difficulty_rank, id')
        .all(track, level) as MilestoneRow[]
    ).filter((m) => m.id !== unsortedId && m.difficulty_rank !== null);
    const placedIn = db.prepare('SELECT lesson_id FROM lesson_placements WHERE milestone_id = ? ORDER BY lesson_id');

    const milestones = milestoneRows.map((m) => ({
      milestone: { id: m.id, track: m.track, level: m.level, title: m.title, description: m.description, difficultyRank: m.difficulty_rank! },
      lessonIds: (placedIn.all(m.id) as { lesson_id: string }[]).map((r) => r.lesson_id),
    }));
    // Unsorted lessons are exported as lessons in no milestone; the loader shelves them in Unsorted again.
    const lessonIds = [
      ...milestones.flatMap((m) => m.lessonIds),
      ...(placedIn.all(unsortedId) as { lesson_id: string }[]).map((r) => r.lesson_id),
    ];
```

- Change the return statement to add `formatVersion: 2 as const` after `seedVersion: currentSeedVersion(),`. Keep Phase 2's `practice` field in the return exactly as it is.

(i) In `lib/services/progressService.ts`:
- `VisibleLessonRow` gets `milestone_id: string` in place of `section_id: string`.
- `visibleLessons` becomes:

```ts
  function visibleLessons(track: Track, level: CefrLevel): VisibleLessonRow[] {
    return db
      .prepare(
        `SELECT l.id, l.title, l.skill, p.milestone_id
         FROM milestones m
         JOIN lesson_placements p ON p.milestone_id = m.id
         JOIN lessons l ON l.id = p.lesson_id
         WHERE m.track = ? AND m.level = ? AND m.id != ?
         ORDER BY m.difficulty_rank, m.id, l.title, l.id`
      )
      .all(track, level, unsortedMilestoneId(track, level)) as VisibleLessonRow[];
  }
```

- In `getTree`:
  - rename `lessonsBySection` to `lessonsByMilestone`, keyed by `row.milestone_id`;
  - replace the milestones query and return with:

```ts
    const milestones = db
      .prepare('SELECT id, title FROM milestones WHERE track = ? AND level = ? AND id != ? ORDER BY difficulty_rank, id')
      .all(track, level, unsortedMilestoneId(track, level)) as { id: string; title: string }[];
    return {
      track,
      level,
      milestones: milestones.map((m) => ({ id: m.id, title: m.title, lessons: lessonsByMilestone.get(m.id) ?? [] })),
    };
```

- In `getDailyQueue`'s SQL, replace the two joins through sections and the `ORDER BY` with:

```sql
         JOIN lesson_placements p ON p.lesson_id = l.id
         JOIN milestones m ON m.id = p.milestone_id
         WHERE m.track = ? AND m.level = ? AND st.next_due_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM lesson_attempts a WHERE a.exercise_id = e.id AND a.source = 'queue' AND a.answered_on = ?
           )
         ORDER BY st.next_due_at, COALESCE(m.difficulty_rank, 1000000), m.id, e.rowid
```

(j) In `lib/services/attemptService.ts` (Phase 2's `assertDueInQueue`), replace the two lines

```sql
         JOIN sections s ON s.id = p.section_id
         JOIN milestones m ON m.id = s.milestone_id
```

with

```sql
         JOIN milestones m ON m.id = p.milestone_id
```

(k) In `lib/tutoring/progressTypes.ts`, delete `TreeSection`, and change `TreeMilestone` to:

```ts
export interface TreeMilestone {
  id: string;
  title: string;
  lessons: TreeLesson[];
}
```

(l) Create `scripts/convert-seeds-v2.ts`. It's a one-off that keeps today's grouping (one milestone per skill), so the app keeps working until Task 8 regroups:

```ts
// One-off (Curriculum Restructure, Task 2): converts the bundled v1 seeds (milestones →
// sections → lessonRefs) to format v2 (ranked milestones → lessonIds), keeping the grouping.
// Run: npx tsx scripts/convert-seeds-v2.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file);
  const v1 = JSON.parse(readFileSync(path, 'utf8'));
  if (v1.formatVersion === 2) continue;
  const milestones = [...v1.milestones]
    .sort((a, b) => a.milestone.orderIndex - b.milestone.orderIndex)
    .map((entry: any, index: number) => ({
      milestone: {
        id: entry.milestone.id,
        track: entry.milestone.track,
        level: entry.milestone.level,
        title: entry.milestone.title,
        description: entry.milestone.description,
        difficultyRank: index + 1,
      },
      lessonIds: [...entry.sections]
        .sort((a: any, b: any) => a.section.orderIndex - b.section.orderIndex)
        .flatMap((s: any) => [...s.lessonRefs].sort((a: any, b: any) => a.orderIndex - b.orderIndex).map((r: any) => r.lessonId)),
    }));
  const { milestones: _old, seedVersion: _v, ...rest } = v1;
  const v2 = { seedVersion: '3', formatVersion: 2, ...rest, milestones };
  writeFileSync(path, JSON.stringify(v2, null, 2) + '\n');
  console.log(`converted ${file}`);
}
```

Run it: `npx tsx scripts/convert-seeds-v2.ts`. Expect 15 "converted" lines. Check that `git diff --stat data/curriculum-seed` touches 15 files, and that `grep -l '"sections"' data/curriculum-seed/*.json` prints nothing.

- [ ] **Step 6: Routes and admin UI**

(a) Delete the section routes, their test, and `milestones/reorder` (the file list is at the top of this task).

(b) `app/api/admin/curriculum/milestones/route.ts`: the POST body becomes `{ track, level, title, description, difficultyRank }`, and the call becomes `service.createMilestone(track, level, title, description, difficultyRank)`.

(c) `app/api/admin/curriculum/milestones/[id]/route.ts`: in PATCH, read `{ title, description, difficultyRank }` and call `service.updateMilestone(params.id, { title, description, difficultyRank })`. Add a GET that returns the delete preview:

```ts
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(createCurriculumStructureService(getDb()).previewMilestoneDelete(params.id));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

(d) Replace `components/admin/PlacementPicker.tsx` with:

```tsx
'use client';

import { useState } from 'react';

export interface PlacementMilestoneOption {
  id: string;
  title: string;
  difficultyRank: number;
}

export type PlacementValue = { milestoneId: string } | { newMilestoneTitle: string; newMilestoneRank: number };

const NEW_OPTION = '__new__';

// Admin-only, English. Spec: choose a milestone, or create one with a title and rank.
export function PlacementPicker({
  milestones,
  onChange,
}: {
  milestones: PlacementMilestoneOption[];
  onChange: (value: PlacementValue | null) => void;
}) {
  const [choice, setChoice] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newRank, setNewRank] = useState('');

  function emit(next: { choice: string; newTitle: string; newRank: string }) {
    if (next.choice === NEW_OPTION) {
      const rank = Number(next.newRank);
      onChange(next.newTitle.trim() && Number.isInteger(rank) && rank >= 1 ? { newMilestoneTitle: next.newTitle, newMilestoneRank: rank } : null);
      return;
    }
    onChange(next.choice ? { milestoneId: next.choice } : null);
  }

  return (
    <div>
      <h3>Placement</h3>
      <label>
        Milestone
        <select
          aria-label="Milestone"
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            emit({ choice: e.target.value, newTitle, newRank });
          }}
        >
          <option value="">Select a milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.difficultyRank}. {m.title}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Create new milestone</option>
        </select>
      </label>
      {choice === NEW_OPTION && (
        <>
          <input
            aria-label="New milestone title"
            placeholder="New milestone title"
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              emit({ choice, newTitle: e.target.value, newRank });
            }}
          />
          <input
            aria-label="New milestone rank"
            type="number"
            min={1}
            step={1}
            placeholder="Rank"
            value={newRank}
            onChange={(e) => {
              setNewRank(e.target.value);
              emit({ choice, newTitle, newRank: e.target.value });
            }}
          />
        </>
      )}
    </div>
  );
}
```

(e) In `components/admin/LessonEditorForm.tsx`:
- Change the `TrackStructureResponse` element type to `{ milestone: { id: string; title: string; difficultyRank: number | null }; lessons: { id: string; title: string }[] }`.
- In the structure effect, set milestones with:

```ts
        setMilestones(
          realEntries.map((entry) => ({ id: entry.milestone.id, title: entry.milestone.title, difficultyRank: entry.milestone.difficultyRank ?? 0 }))
        );
        const allLessons = structure.flatMap((entry) => entry.lessons);
```

- Also check `res.ok`: replace `.then((r) => r.json())` with

```ts
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
```

and add `.catch(() => setError('Failed to load the track structure'))` at the end of the chain.
- Update the comment that mentions "section" to say "milestone".

(f) In `components/admin/ConceptLinkSection.tsx` and `components/admin/DependencyDiagram.tsx`, the structure is now `{ lessons }[]`:
- replace `structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons))` with `structure.flatMap((entry) => entry.lessons)`;
- change the response type annotations to `{ lessons: … }[]`.

The diagram's milestone bands arrive in Task 3.

(g) Replace `components/admin/TrackLevelStructure.tsx` with the milestone-only editor below. Task 3 extends it with "Move to…" and flags.

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { DependencyDiagram } from './DependencyDiagram';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';

export interface StructureLesson {
  id: string;
  title: string;
}
export interface StructureEntry {
  milestone: { id: string; title: string; description: string | null; difficultyRank: number | null };
  lessons: StructureLesson[];
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
}

// Admin-only, English. Spec: milestones listed by difficulty rank; lessons have no order inside one.
export function TrackLevelStructure({ track, level }: { track: Track; level: CefrLevel }) {
  const [structure, setStructure] = useState<StructureEntry[] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newRank, setNewRank] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'tree' | 'diagram'>('tree');

  function load() {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setStructure((await r.json()) as StructureEntry[]);
      })
      .catch(() => setError('Failed to load structure'));
  }

  useEffect(load, [track, level]);

  if (error && !structure) return <p role="alert">{error}</p>;
  if (!structure) return <p>Loading...</p>;

  const unsortedId = unsortedMilestoneId(track, level);

  async function createMilestone() {
    const res = await fetch('/api/admin/curriculum/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, title: newTitle, description: null, difficultyRank: Number(newRank) }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewRank('');
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to create milestone'));
  }

  async function saveMilestone(entry: StructureEntry, changes: Partial<{ title: string; description: string | null; difficultyRank: number }>) {
    const body = {
      title: entry.milestone.title,
      description: entry.milestone.description,
      difficultyRank: entry.milestone.difficultyRank,
      ...changes,
    };
    const res = await fetch(`/api/admin/curriculum/milestones/${entry.milestone.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to save milestone'));
  }

  async function deleteMilestone(entry: StructureEntry) {
    const titles = entry.lessons.map((l) => l.title);
    const message =
      titles.length > 0
        ? `Delete "${entry.milestone.title}"? ${titles.length} lesson(s) will move to Unsorted: ${titles.join(', ')}`
        : `Delete "${entry.milestone.title}"?`;
    if (!window.confirm(message)) return;
    const res = await fetch(`/api/admin/curriculum/milestones/${entry.milestone.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError(await errorOf(res, 'Failed to delete milestone'));
  }

  return (
    <div>
      <h1>
        {track} — {level}
      </h1>
      <a href={`/admin/curriculum/${track}/${level}/new`}>+ New Lesson</a>
      <button type="button" onClick={() => setTab('tree')}>
        Tree
      </button>
      <button type="button" onClick={() => setTab('diagram')}>
        Diagram
      </button>

      {tab === 'diagram' && <DependencyDiagram track={track} level={level} />}

      {tab === 'tree' &&
        structure.map((entry) => {
          const isUnsorted = entry.milestone.id === unsortedId;
          return (
            <div key={entry.milestone.id}>
              <h2>
                {isUnsorted ? '' : `${entry.milestone.difficultyRank}. `}
                {entry.milestone.title}
              </h2>
              {!isUnsorted && (
                <>
                  <label>
                    Rank{' '}
                    <input
                      aria-label={`Rank of ${entry.milestone.title}`}
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={entry.milestone.difficultyRank ?? 1}
                      onBlur={(e) => {
                        const rank = Number(e.target.value);
                        if (rank !== entry.milestone.difficultyRank) saveMilestone(entry, { difficultyRank: rank });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const title = window.prompt('Rename milestone', entry.milestone.title);
                      if (title) saveMilestone(entry, { title });
                    }}
                  >
                    Rename milestone
                  </button>
                  <button type="button" onClick={() => deleteMilestone(entry)}>
                    Delete milestone
                  </button>
                </>
              )}
              <ul>
                {entry.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`}>{lesson.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

      <div>
        <input aria-label="New milestone title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New milestone title" />
        <input
          aria-label="New milestone rank"
          type="number"
          min={1}
          step={1}
          value={newRank}
          onChange={(e) => setNewRank(e.target.value)}
          placeholder="Rank"
        />
        <button type="button" onClick={createMilestone}>
          Add milestone
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

(h) In `components/tutoring/CurriculumTree.tsx`, replace the per-milestone body (the `milestone.sections.map(...)` block) with a single list, and change the `empty` check. This is interim; Task 6 replaces the component.

```tsx
  const empty = tree.milestones.every((m) => m.lessons.length === 0);
```

```tsx
        <section key={milestone.id}>
          <h3>{milestone.title}</h3>
          <ul>
            {milestone.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link href={`/lesson/${lesson.id}`}>{lesson.title}</Link> —{' '}
                <span>
                  {lesson.coveredVia ? t('coveredVia', { track: tTracks(lesson.coveredVia) }) : t(`status.${lesson.status}`)}
                </span>
                {lesson.missingPrerequisites.length > 0 && (
                  <p>{t('buildsOn', { lessons: lesson.missingPrerequisites.map((p) => p.title).join(', ') })}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
```

- [ ] **Step 7: Move the fixtures and tests onto milestones**

(a) In `test/tutoringFixtures.ts`, replace the first three statements of `seedTutoringCurriculum`, the milestone, section and placement inserts, with:

```sql
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
      ('g-a1-m1', 'generic', 'A1', 'Basics', 1),
      ('o-a1-m1', 'goethe', 'A1', 'Goethe basics', 1),
      ('g-a2-m1', 'generic', 'A2', 'Next steps', 1);
```

and, after the lessons insert:

```sql
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES
      ('a1-greet', 'g-a1-m1'),
      ('a1-sein', 'g-a1-m1'),
      ('a1-goethe-greet', 'o-a1-m1'),
      ('a2-past', 'g-a2-m1');
```

Update the doc comment's wording from "section" to "milestone".

(b) Mechanically update every other test file. The command `grep -rlE "sections|section_id|sectionId|order_index|orderIndex|lessonRefs" lib app components test` lists them. Apply these rules to each:

1. **SQL milestone inserts.**
   - Before: `INSERT INTO milestones (id, track, level, title, order_index) VALUES (…, N)`
   - After: `INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES (…, N + 1)`
   - The `description` column, where present, stays.
2. **SQL section inserts:** delete every `INSERT INTO sections …` statement.
3. **SQL placement inserts.**
   - Before: `INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('L', 'S', k)`
   - After: `INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('L', 'M')`, where `M` is the milestone that section `S` belonged to in the same fixture.
4. **Seed objects.**
   - Each `{ milestone: {…, orderIndex: n}, sections: [{ section: …, lessonRefs: [{ lessonId, orderIndex }…] }…] }` becomes `{ milestone: {…, difficultyRank: n + 1}, lessonIds: [every lessonId in order] }`.
   - Every seed object gets `formatVersion: 2`.
5. **Unsorted.**
   - `ensureUnsortedExists(...).sectionId` becomes `.milestoneId`, and placements into it use rule 3.
   - Assertions that expect an "Unsorted" section are deleted.
6. **Tree assertions.**
   - `m.sections.flatMap((s) => s.lessons)` becomes `m.lessons`.
   - `tree.milestones[0].sections…` assertions on section titles are deleted.
   - Fetch stubs returning `{ milestones: [{ …, sections: [{ id, title, lessons }] }] }` return `{ milestones: [{ id, title, lessons }] }` instead.
7. **Structure API stubs** used by admin component tests: `[{ milestone, sections: [{ section, lessons }] }]` becomes `[{ milestone: { …, description: null, difficultyRank: n }, lessons }]`.
8. **Removed behaviour.** Delete the test cases for section functions (create, rename, delete and reorder section) and milestone reorder:
   - in `lib/services/curriculumStructureService.test.ts`;
   - in `lib/curriculum-admin/unsortedBucket.test.ts`, the assertions about the Unsorted *section*.
   Replace the whole files `lib/curriculum-admin/placementResolver.test.ts`, `components/admin/PlacementPicker.test.tsx` and `components/admin/TrackLevelStructure.test.tsx` with the versions in (c)–(e).

(c) Replace `lib/curriculum-admin/placementResolver.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { resolvePlacement } from './placementResolver';
import { ensureUnsortedExists } from './unsortedBucket';

function setup() {
  const db = createDbClient(':memory:');
  db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
    ('g-a1-m1', 'generic', 'A1', 'Basics', 1), ('g-a2-m1', 'generic', 'A2', 'Next', 1)`);
  return db;
}

describe('resolvePlacement', () => {
  it('returns an existing milestone of the same track+level', () => {
    expect(resolvePlacement(setup(), 'generic', 'A1', { milestoneId: 'g-a1-m1' }, 'create')).toBe('g-a1-m1');
  });

  it('rejects a milestone of another track+level, or one that does not exist', () => {
    const db = setup();
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId: 'g-a2-m1' }, 'create')).toThrow(/belongs to generic\/A2/);
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId: 'nope' }, 'create')).toThrow(/not found/);
  });

  it('rejects creating directly into Unsorted but allows moving there on update', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    expect(() => resolvePlacement(db, 'generic', 'A1', { milestoneId }, 'create')).toThrow(/Unsorted/);
    expect(resolvePlacement(db, 'generic', 'A1', { milestoneId }, 'update')).toBe(milestoneId);
  });

  it('creates a new milestone with its rank', () => {
    const db = setup();
    const id = resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: 'Later', newMilestoneRank: 3 }, 'create');
    expect(db.prepare('SELECT title, difficulty_rank FROM milestones WHERE id = ?').get(id)).toEqual({ title: 'Later', difficulty_rank: 3 });
  });

  it('rejects an invalid rank or an empty title', () => {
    const db = setup();
    expect(() => resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: 'X', newMilestoneRank: 0 }, 'create')).toThrow(/rank/);
    expect(() => resolvePlacement(db, 'generic', 'A1', { newMilestoneTitle: ' ', newMilestoneRank: 2 }, 'create')).toThrow(/title/);
  });
});
```

(d) Replace `components/admin/PlacementPicker.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlacementPicker } from './PlacementPicker';

const MILESTONES = [
  { id: 'm1', title: 'Basics', difficultyRank: 1 },
  { id: 'm2', title: 'Past', difficultyRank: 2 },
];

describe('PlacementPicker', () => {
  it('emits the chosen milestone', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    expect(screen.getByRole('option', { name: '2. Past' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm2' } });
    expect(onChange).toHaveBeenLastCalledWith({ milestoneId: 'm2' });
  });

  it('emits a new milestone only once it has a title and a whole-number rank of 1 or more', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Later' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ newMilestoneTitle: 'Later', newMilestoneRank: 3 });
  });

  it('emits null when the choice is cleared', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={MILESTONES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
```

(e) Replace `components/admin/TrackLevelStructure.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { TrackLevelStructure } from './TrackLevelStructure';

vi.mock('./DependencyDiagram', () => ({ DependencyDiagram: () => <p>diagram</p> }));

const STRUCTURE = [
  { milestone: { id: 'm1', title: 'Basics', description: null, difficultyRank: 1 }, lessons: [{ id: 'a1-greet', title: 'Saying hello' }] },
  { milestone: { id: 'generic-a1-unsorted', title: 'Unsorted', description: null, difficultyRank: null }, lessons: [] },
];

function stub(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!routes[key]) throw new Error(`Unexpected fetch: ${key}`);
    return routes[key](init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TrackLevelStructure', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists milestones by rank with their lessons, and Unsorted without controls', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('heading', { name: '1. Basics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/admin/curriculum/lesson/a1-greet?track=generic');
    expect(screen.getByRole('heading', { name: 'Unsorted' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete milestone' })).toHaveLength(1);
  });

  it('creates a milestone with a rank', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'POST /api/admin/curriculum/milestones': () => delayedResponse({ id: 'm2' }, { status: 201 }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await screen.findByRole('heading', { name: '1. Basics' });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Past' } });
    fireEvent.change(screen.getByLabelText('New milestone rank'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Past', description: null, difficultyRank: 2 }),
      })
    );
  });

  it('saves a rank change and shows a server refusal', async () => {
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(STRUCTURE),
      'PATCH /api/admin/curriculum/milestones/m1': () =>
        delayedResponse({ error: 'Difficulty rank must be a whole number of 1 or more' }, { ok: false, status: 400 }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    const rank = await screen.findByLabelText('Rank of Basics');
    fireEvent.change(rank, { target: { value: '0' } });
    fireEvent.blur(rank);
    expect(await screen.findByRole('alert')).toHaveTextContent('Difficulty rank must be a whole number of 1 or more');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/milestones/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Basics', description: null, difficultyRank: 0 }),
    });
  });

  it('shows an error when the structure cannot load', async () => {
    stub({ 'GET /api/curriculum/tracks/generic/A1': () => delayedResponse({}, { ok: false, status: 500 }) });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load structure');
  });
});
```

(f) In `lib/services/curriculumStructureService.test.ts`, replace the deleted section, reorder and rename cases with:

```ts
  it('creates, updates and ranks milestones, and refuses bad ranks and Unsorted edits', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m = service.createMilestone('generic', 'A1', 'Basics', null, 2);
    expect(m).toMatchObject({ title: 'Basics', difficultyRank: 2 });
    expect(service.updateMilestone(m.id, { title: 'Start', description: 'd', difficultyRank: 1 })).toMatchObject({
      title: 'Start',
      description: 'd',
      difficultyRank: 1,
    });
    expect(() => service.createMilestone('generic', 'A1', 'X', null, 1.5)).toThrow(/whole number/);
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    expect(() => service.updateMilestone(milestoneId, { title: 'U', description: null, difficultyRank: 1 })).toThrow(/Unsorted/);
  });

  it('moves a deleted milestone’s lessons to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m = service.createMilestone('generic', 'A1', 'Basics', null, 1);
    db.exec(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('l1', '${m.id}');`);
    expect(service.previewMilestoneDelete(m.id)).toEqual({ lessons: [{ id: 'l1', title: 'L1' }] });
    service.deleteMilestone(m.id);
    expect(db.prepare('SELECT milestone_id FROM lesson_placements WHERE lesson_id = ?').get('l1')).toEqual({
      milestone_id: 'generic-a1-unsorted',
    });
  });
```

(add `import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';` if the file doesn't import it).

(g) Add seed-loader tests in `lib/services/curriculumSeedLoader.test.ts` (keep the file's existing `setup`/`writeSeed` helpers; if it has none, use these):

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function seedDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}

function v2(version: string, milestones: { id: string; rank: number; lessonIds: string[] }[], lessonIds: string[]) {
  return {
    seedVersion: version,
    formatVersion: 2,
    track: 'generic',
    level: 'A1',
    milestones: milestones.map((m) => ({
      milestone: { id: m.id, track: 'generic', level: 'A1', title: m.id, description: null, difficultyRank: m.rank },
      lessonIds: m.lessonIds,
    })),
    lessons: lessonIds.map((id) => ({ id, track: 'generic', sourceLevel: 'A1', skill: 'grammar', title: id, explanation: null, examples: null })),
    exercises: [],
    prerequisites: [],
  };
}

describe('loadSeedIfNeeded (format v2)', () => {
  it('replaces the track+level structure: moves lessons, shelves unlisted ones, never deletes Unsorted', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, seedDir({ 'a.json': v2('1', [{ id: 'm1', rank: 1, lessonIds: ['l1', 'l2'] }], ['l1', 'l2']) }));
    db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('admin-m', 'generic', 'A1', 'Mine', 5);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('mine', 'generic', 'A1', 'grammar', 'Mine');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('mine', 'admin-m');`);

    loadSeedIfNeeded(
      db,
      seedDir({ 'a.json': v2('2', [{ id: 'm1', rank: 1, lessonIds: ['l1'] }, { id: 'm2', rank: 2, lessonIds: ['l2'] }], ['l1', 'l2', 'l3']) })
    );

    expect(db.prepare('SELECT lesson_id, milestone_id FROM lesson_placements ORDER BY lesson_id').all()).toEqual([
      { lesson_id: 'l1', milestone_id: 'm1' },
      { lesson_id: 'l2', milestone_id: 'm2' },
      { lesson_id: 'l3', milestone_id: 'generic-a1-unsorted' },
      { lesson_id: 'mine', milestone_id: 'generic-a1-unsorted' },
    ]);
    expect(db.prepare("SELECT id FROM milestones WHERE id = 'admin-m'").get()).toBeUndefined();
    expect(db.prepare("SELECT id FROM milestones WHERE id = 'generic-a1-unsorted'").get()).toBeTruthy();
  });

  it('rejects a v1 file by name and changes nothing', () => {
    const db = createDbClient(':memory:');
    const v1 = { seedVersion: '9', track: 'generic', level: 'A1', milestones: [], lessons: [], exercises: [], prerequisites: [] };
    expect(() => loadSeedIfNeeded(db, seedDir({ 'old.json': v1 }))).toThrow(/old\.json/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM milestones').get()).toEqual({ n: 0 });
  });
});
```

(h) In `lib/services/curriculumExportService.test.ts`, add:

```ts
  it('exports format v2: ranked milestones with sorted lesson ids, Unsorted lessons as lessons only', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m2', 'generic', 'A1', 'Two', 2), ('m1', 'generic', 'A1', 'One', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('b', 'generic', 'A1', 'grammar', 'B'),
        ('a', 'generic', 'A1', 'grammar', 'A'), ('u', 'generic', 'A1', 'grammar', 'U');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('b', 'm1'), ('a', 'm1'), ('u', 'm2');
    `);
    ensureUnsortedExists(db, 'generic', 'A1');
    db.prepare("UPDATE lesson_placements SET milestone_id = 'generic-a1-unsorted' WHERE lesson_id = 'u'").run();

    const seed = createCurriculumExportService(db).exportTrackLevel('generic', 'A1');
    expect(seed.formatVersion).toBe(2);
    expect(seed.milestones.map((m) => [m.milestone.id, m.milestone.difficultyRank, m.lessonIds])).toEqual([
      ['m1', 1, ['a', 'b']],
      ['m2', 2, []],
    ]);
    expect(seed.lessons.map((l) => l.id)).toEqual(['a', 'b', 'u']);
  });
```

(add `import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';` if missing).

- [ ] **Step 8: Run everything**

Run: `grep -rnE "sections|section_id|sectionId|TreeSection|lessonRefs|order_index" lib app components test --include=*.ts --include=*.tsx`. Expect no output, except comments about the old shape inside `lib/db/schema.ts` (`migrateToMilestoneOnlyStructure`, `migrateConceptIdAndPlacementUniqueness`) and in `scripts/convert-seeds-v2.ts`.

Then: `npx tsc --noEmit && npm test`
Expected: PASS, with no type errors. Then `npm run build` succeeds.

Then start the app against a copy of a real `app.db` (`GAIT_DATA_DIR=$(mktemp -d) npm run dev`, copy `data/app.db` in if you have one). Check that the tree shows the same lessons as before, now without section headings.

- [ ] **Step 9: Commit**

```bash
git add -A lib app components test scripts data/curriculum-seed
git commit -m "refactor: remove sections; milestones carry a difficulty rank; seed format v2"
```

---

### Task 3: Admin — prerequisite scope, "Move to…", Unsorted flags, diagram bands

**Files:**
- Create:
  - `lib/curriculum-admin/prerequisiteScope.ts`, `lib/curriculum-admin/prerequisiteScope.test.ts`
  - `app/api/admin/curriculum/lessons/[id]/milestone/route.ts`, `app/api/admin/curriculum/lessons/[id]/milestone/route.test.ts`
- Modify:
  - `lib/services/lessonAdminService.ts`, `lib/services/lessonAdminService.test.ts`
  - `lib/services/curriculumStructureService.ts`, `lib/services/curriculumStructureService.test.ts`
  - `lib/services/curriculumService.ts`
  - `components/admin/TrackLevelStructure.tsx`, `components/admin/TrackLevelStructure.test.tsx`
  - `components/admin/DependencyDiagram.tsx`, `components/admin/DependencyDiagram.test.tsx`
- Delete: `lib/curriculum-admin/diagramLayout.ts`, `lib/curriculum-admin/diagramLayout.test.ts` (replaced by `computeBranchLayout`)

**Interfaces:**
- Consumes:
  - `prerequisiteScopeViolations`, `PlacementInfo`, `ScopeEdge` (Task 1);
  - `computeBranchLayout` (Task 1);
  - `curriculumStructureService` and `getTrackStructure` (Task 2).
- Produces:
  - `scopeViolationMessages(db, lessonIds: string[]): string[]`
  - `assertPrerequisiteScope(db, lessonIds: string[]): void`, which throws `Error` with the messages joined by `'; '`.
  - `curriculumStructureService.moveLesson(lessonId, milestoneId): void`
  - `getTrackStructure` entries gain `lessonsBuildingOnUnsorted: string[]`.
  - `PATCH /api/admin/curriculum/lessons/[id]/milestone` with body `{ milestoneId }` returns `{ ok: true }`, or 400 `{ error }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/curriculum-admin/prerequisiteScope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from './unsortedBucket';
import { assertPrerequisiteScope, scopeViolationMessages } from './prerequisiteScope';

function setup() {
  const db = createDbClient(':memory:');
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES
      ('m1', 'generic', 'A1', 'One', 1), ('m2a', 'generic', 'A1', 'Two A', 2), ('m2b', 'generic', 'A1', 'Two B', 2),
      ('x1', 'generic', 'A2', 'Other level', 1);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a', 'generic', 'A1', 'grammar', 'Alpha'), ('b', 'generic', 'A1', 'grammar', 'Beta'),
      ('c', 'generic', 'A1', 'grammar', 'Gamma'), ('d', 'generic', 'A1', 'grammar', 'Delta'),
      ('x', 'generic', 'A2', 'grammar', 'Other'), ('u', 'generic', 'A1', 'grammar', 'Shelved');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1'), ('b', 'm1'), ('c', 'm2a'), ('d', 'm2b'), ('x', 'x1');
  `);
  const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
  db.prepare("INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('u', ?)").run(milestoneId);
  return db;
}

function edge(db: ReturnType<typeof setup>, lesson: string, prerequisite: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(lesson, prerequisite);
}

describe('prerequisite scope', () => {
  it('accepts the same milestone, a lower rank, and edges touching Unsorted', () => {
    const db = setup();
    edge(db, 'b', 'a');
    edge(db, 'c', 'a');
    edge(db, 'a', 'u');
    expect(scopeViolationMessages(db, ['a', 'b', 'c'])).toEqual([]);
    expect(() => assertPrerequisiteScope(db, ['a', 'b', 'c'])).not.toThrow();
  });

  it('names a later or parallel milestone and another track or level', () => {
    const db = setup();
    edge(db, 'a', 'c');
    edge(db, 'c', 'd');
    edge(db, 'a', 'x');
    expect(scopeViolationMessages(db, ['a', 'c'])).toEqual([
      'Alpha builds on Gamma, which is in a later or parallel milestone',
      'Alpha builds on Other, which is in another track or level',
      'Gamma builds on Delta, which is in a later or parallel milestone',
    ]);
  });

  it('checks edges where the given lesson is the prerequisite too', () => {
    const db = setup();
    edge(db, 'a', 'c');
    expect(scopeViolationMessages(db, ['c'])).toEqual(['Alpha builds on Gamma, which is in a later or parallel milestone']);
  });
});
```

Add to `lib/services/curriculumStructureService.test.ts`:

```ts
describe('scope checks on structure edits', () => {
  function setup() {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'One', 1),
        ('m2', 'generic', 'A1', 'Two', 2), ('m9', 'generic', 'A2', 'Elsewhere', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a', 'generic', 'A1', 'grammar', 'Alpha'),
        ('b', 'generic', 'A1', 'grammar', 'Beta');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1'), ('b', 'm2');
      INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('b', 'a');
    `);
    return { db, service: createCurriculumStructureService(db) };
  }

  // Review Focus 5: lowering a rank below a milestone its lessons depend on is refused, and nothing changes.
  it('refuses a rank change that breaks the scope rule and keeps the old rank', () => {
    const { db, service } = setup();
    expect(() => service.updateMilestone('m2', { title: 'Two', description: null, difficultyRank: 1 })).toThrow(
      'Beta builds on Alpha, which is in a later or parallel milestone'
    );
    expect(db.prepare("SELECT difficulty_rank FROM milestones WHERE id = 'm2'").get()).toEqual({ difficulty_rank: 2 });
  });

  it('moves a lesson to another milestone of its track+level, checking scope', () => {
    const { db, service } = setup();
    service.moveLesson('a', 'm2'); // same milestone as its dependent: allowed
    expect(db.prepare("SELECT milestone_id FROM lesson_placements WHERE lesson_id = 'a'").get()).toEqual({ milestone_id: 'm2' });
    expect(() => service.moveLesson('b', 'm1')).toThrow(/later or parallel/);
    expect(() => service.moveLesson('a', 'm9')).toThrow(/belongs to generic\/A2/);
    expect(() => service.moveLesson('a', 'nope')).toThrow(/not found/);
  });
});
```

In `lib/services/lessonAdminService.test.ts`, add:

```ts
  it('rejects a prerequisite in a later milestone and rolls the whole create back', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'One', 1), ('m2', 'generic', 'A1', 'Two', 2);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-later', 'generic', 'A1', 'grammar', 'Later');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-later', 'm2');
    `);
    const service = createLessonAdminService(db);
    expect(() =>
      service.createLesson({
        slug: 'early',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Early',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-later'],
        placement: { milestoneId: 'm1' },
      })
    ).toThrow('Early builds on Later, which is in a later or parallel milestone');
    expect(db.prepare("SELECT 1 FROM lessons WHERE id = 'a1-early'").get()).toBeUndefined();
  });
```

Create `app/api/admin/curriculum/lessons/[id]/milestone/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { PATCH } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function patch(body: unknown) {
  return PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'a' }),
  });
}

describe('PATCH /api/admin/curriculum/lessons/[id]/milestone', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-move-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'One', 1), ('m2', 'generic', 'A1', 'Two', 2);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a', 'generic', 'A1', 'grammar', 'Alpha');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a', 'm1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await patch({ milestoneId: 'm2' })).status).toBe(401);
  });

  it('moves the lesson, and rejects a bad body or milestone with 400', async () => {
    expect(await (await patch({ milestoneId: 'm2' })).json()).toEqual({ ok: true });
    expect(getDb().prepare("SELECT milestone_id FROM lesson_placements WHERE lesson_id = 'a'").get()).toEqual({ milestone_id: 'm2' });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ milestoneId: 'nope' })).status).toBe(400);
  });
});
```

Add to `components/admin/TrackLevelStructure.test.tsx`:

```tsx
  it('moves a lesson with "Move to…" and flags lessons building on Unsorted', async () => {
    const withFlag = [
      { ...STRUCTURE[0], lessonsBuildingOnUnsorted: ['a1-greet'] },
      { milestone: { id: 'm2', title: 'Past', description: null, difficultyRank: 2 }, lessons: [], lessonsBuildingOnUnsorted: [] },
      { ...STRUCTURE[1], lessonsBuildingOnUnsorted: [] },
    ];
    const fetchMock = stub({
      'GET /api/curriculum/tracks/generic/A1': () => delayedResponse(withFlag),
      'PATCH /api/admin/curriculum/lessons/a1-greet/milestone': () => delayedResponse({ ok: true }),
    });
    render(<TrackLevelStructure track="generic" level="A1" />);
    expect(await screen.findByText('builds on a lesson in Unsorted')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Move Saying hello to'), { target: { value: 'm2' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/curriculum/lessons/a1-greet/milestone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId: 'm2' }),
      })
    );
  });
```

Replace `components/admin/DependencyDiagram.test.tsx`'s `structure` constant with the one below, and add a test for milestone bands:

```tsx
const structure = [
  {
    milestone: { id: 'm1', title: 'M1', description: null, difficultyRank: 1 },
    lessons: [
      { id: 'a1-basics', title: 'Basics', skill: 'grammar' },
      { id: 'a1-advanced', title: 'Advanced', skill: 'grammar' },
    ],
    lessonsBuildingOnUnsorted: [],
  },
  {
    milestone: { id: 'm2', title: 'M2', description: null, difficultyRank: 2 },
    lessons: [{ id: 'a1-later', title: 'Later', skill: 'reading' }],
    lessonsBuildingOnUnsorted: [],
  },
];
```

```tsx
  it('draws one band per milestone, headed by rank and title', async () => {
    render(<DependencyDiagram track="generic" level="A1" />);
    expect(await screen.findByRole('heading', { name: '1. M1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. M2' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
```

In the existing "draws one line per prerequisite edge" test, the expectation stays at 1 line.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/curriculum-admin/prerequisiteScope.test.ts lib/services/curriculumStructureService.test.ts lib/services/lessonAdminService.test.ts "app/api/admin/curriculum/lessons/[id]/milestone" components/admin/TrackLevelStructure.test.tsx components/admin/DependencyDiagram.test.tsx`
Expected: FAIL. `prerequisiteScope` and `moveLesson` don't exist.

- [ ] **Step 3: Implement**

Create `lib/curriculum-admin/prerequisiteScope.ts`:

```ts
import type Database from 'better-sqlite3';
import { prerequisiteScopeViolations, type PlacementInfo } from '../tutoring/gating';

interface PlacedLesson extends PlacementInfo {
  title: string;
  scope: string;
}

// Spec: Prerequisite scope. Checks every edge that touches the given lessons, as the dependent
// or as the prerequisite, and returns one readable message per violation.
export function scopeViolationMessages(db: Database.Database, lessonIds: string[]): string[] {
  if (lessonIds.length === 0) return [];
  const marks = lessonIds.map(() => '?').join(', ');
  const edges = db
    .prepare(
      `SELECT lesson_id AS lessonId, prerequisite_lesson_id AS prerequisiteId FROM lesson_prerequisites
       WHERE lesson_id IN (${marks}) OR prerequisite_lesson_id IN (${marks})
       ORDER BY lesson_id, prerequisite_lesson_id`
    )
    .all(...lessonIds, ...lessonIds) as { lessonId: string; prerequisiteId: string }[];

  const placementStmt = db.prepare(
    `SELECT l.title, p.milestone_id AS milestoneId, m.difficulty_rank AS rank, l.track || '/' || l.source_level AS scope
     FROM lessons l
     LEFT JOIN lesson_placements p ON p.lesson_id = l.id
     LEFT JOIN milestones m ON m.id = p.milestone_id
     WHERE l.id = ?`
  );
  const cache = new Map<string, PlacedLesson | undefined>();
  function placed(id: string): PlacedLesson | undefined {
    if (!cache.has(id)) {
      const row = placementStmt.get(id) as PlacedLesson | undefined;
      cache.set(id, row && row.milestoneId ? row : undefined);
    }
    return cache.get(id);
  }
  const title = (id: string) =>
    placed(id)?.title ?? (db.prepare('SELECT title FROM lessons WHERE id = ?').get(id) as { title: string } | undefined)?.title ?? id;

  const messages: string[] = [];
  const sameScope = edges.filter((e) => {
    const a = placed(e.lessonId);
    const b = placed(e.prerequisiteId);
    if (a && b && a.scope !== b.scope) {
      messages.push(`${title(e.lessonId)} builds on ${title(e.prerequisiteId)}, which is in another track or level`);
      return false;
    }
    return true;
  });
  for (const e of prerequisiteScopeViolations(sameScope, placed)) {
    messages.push(`${title(e.lessonId)} builds on ${title(e.prerequisiteId)}, which is in a later or parallel milestone`);
  }
  return messages.sort();
}

export function assertPrerequisiteScope(db: Database.Database, lessonIds: string[]): void {
  const messages = scopeViolationMessages(db, lessonIds);
  if (messages.length > 0) throw new Error(messages.join('; '));
}
```

In `lib/services/curriculumStructureService.ts`:
- add `import { assertPrerequisiteScope } from '../curriculum-admin/prerequisiteScope';`;
- wrap the body of `updateMilestone` after the validations in a transaction that re-checks scope;
- add `moveLesson`, and export it.

```ts
  function updateMilestone(
    id: string,
    input: { title: string; description: string | null; difficultyRank: unknown }
  ): Milestone {
    const milestone = getMilestone(id);
    assertNotUnsorted(milestone);
    const rank = assertValidRank(input.difficultyRank);
    if (!input.title?.trim()) throw new Error('A milestone needs a title');
    db.transaction(() => {
      db.prepare('UPDATE milestones SET title = ?, description = ?, difficulty_rank = ? WHERE id = ?').run(
        input.title.trim(),
        input.description,
        rank,
        id
      );
      const lessonIds = (db.prepare('SELECT lesson_id FROM lesson_placements WHERE milestone_id = ?').all(id) as { lesson_id: string }[]).map(
        (r) => r.lesson_id
      );
      assertPrerequisiteScope(db, lessonIds);
    })();
    return getMilestone(id);
  }

  // Spec: Admin, "Move to…". Same track+level only; the scope rule is re-checked for the lesson.
  function moveLesson(lessonId: string, milestoneId: string): void {
    const lesson = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(lessonId) as
      | { track: Track; source_level: CefrLevel }
      | undefined;
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    const target = getMilestone(milestoneId);
    if (target.track !== lesson.track || target.level !== lesson.source_level) {
      throw new Error(`Milestone ${milestoneId} belongs to ${target.track}/${target.level}, not ${lesson.track}/${lesson.source_level}`);
    }
    db.transaction(() => {
      db.prepare(
        `INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES (?, ?)
         ON CONFLICT(lesson_id) DO UPDATE SET milestone_id = excluded.milestone_id`
      ).run(lessonId, milestoneId);
      assertPrerequisiteScope(db, [lessonId]);
    })();
  }
```

The return becomes `{ getMilestone, createMilestone, updateMilestone, previewMilestoneDelete, deleteMilestone, moveLesson }`.

In `lib/services/lessonAdminService.ts`, add `import { assertPrerequisiteScope } from '../curriculum-admin/prerequisiteScope';`. In both `createLesson` and `updateLesson`, add this as the last statement inside the transaction, after the prerequisite writes:

```ts
      assertPrerequisiteScope(db, [id]);
```

In `lib/services/curriculumService.ts`, change `getTrackStructure`'s return type to `{ milestone: Milestone; lessons: Lesson[]; lessonsBuildingOnUnsorted: string[] }[]`. Add the flag to each entry:

```ts
    const buildsOnUnsorted = db.prepare(
      `SELECT DISTINCT lp.lesson_id FROM lesson_prerequisites lp
       JOIN lesson_placements pre ON pre.lesson_id = lp.prerequisite_lesson_id
       JOIN lesson_placements own ON own.lesson_id = lp.lesson_id
       WHERE pre.milestone_id = ? AND own.milestone_id = ?
       ORDER BY lp.lesson_id`
    );
    return milestoneRows.map((row) => ({
      milestone: rowToMilestone(row),
      lessons: (lessonsOf.all(row.id) as LessonRow[]).map(rowToLesson),
      lessonsBuildingOnUnsorted:
        row.id === unsortedId
          ? []
          : (buildsOnUnsorted.all(unsortedId, row.id) as { lesson_id: string }[]).map((r) => r.lesson_id),
    }));
```

Create `app/api/admin/curriculum/lessons/[id]/milestone/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.milestoneId !== 'string') return NextResponse.json({ error: 'milestoneId is required' }, { status: 400 });
  try {
    createCurriculumStructureService(getDb()).moveLesson(params.id, body.milestoneId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

In `components/admin/TrackLevelStructure.tsx`:
- Add `lessonsBuildingOnUnsorted: string[];` to `StructureEntry`.
- Add this function next to `deleteMilestone`:

```tsx
  async function moveLesson(lessonId: string, milestoneId: string) {
    const res = await fetch(`/api/admin/curriculum/lessons/${lessonId}/milestone`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId }),
    });
    if (res.ok) {
      setError(null);
      load();
    } else setError(await errorOf(res, 'Failed to move lesson'));
  }
```

- Replace each lesson `<li>` with:

```tsx
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`}>{lesson.title}</a>{' '}
                    {entry.lessonsBuildingOnUnsorted.includes(lesson.id) && <em>builds on a lesson in Unsorted</em>}{' '}
                    <select
                      aria-label={`Move ${lesson.title} to`}
                      value=""
                      onChange={(e) => e.target.value && moveLesson(lesson.id, e.target.value)}
                    >
                      <option value="">Move to…</option>
                      {structure
                        .filter((other) => other.milestone.id !== entry.milestone.id)
                        .map((other) => (
                          <option key={other.milestone.id} value={other.milestone.id}>
                            {other.milestone.difficultyRank === null ? '' : `${other.milestone.difficultyRank}. `}
                            {other.milestone.title}
                          </option>
                        ))}
                    </select>
                  </li>
```

Replace `components/admin/DependencyDiagram.tsx` with a banded version:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { computeBranchLayout } from '@/lib/tutoring/branchLayout';
import { unsortedMilestoneId } from '@/lib/curriculum-admin/unsortedBucket';

interface DiagramLesson {
  id: string;
  title: string;
  skill: string;
}

interface DiagramEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

interface DiagramEntry {
  milestone: { id: string; title: string; difficultyRank: number | null };
  lessons: DiagramLesson[];
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 80;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 40;

// Admin-only, English. Spec: one band per milestone, each laid out as prerequisite branches.
export function DependencyDiagram({ track, level }: { track: Track; level: CefrLevel }) {
  const [entries, setEntries] = useState<DiagramEntry[] | null>(null);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load dependency diagram');
        return r.json();
      })
      .then((structure: DiagramEntry[]) => {
        const ranked = structure.filter((e) => e.milestone.id !== unsortedMilestoneId(track, level));
        setEntries(ranked);
        return Promise.all(
          ranked.flatMap((e) => e.lessons).map((lesson) =>
            fetch(`/api/curriculum/lessons/${lesson.id}?track=${track}`)
              .then((r) => {
                if (!r.ok) throw new Error('Failed to load dependency diagram');
                return r.json();
              })
              .then((data) => (Array.isArray(data?.prerequisites) ? data.prerequisites : []) as DiagramEdge[])
          )
        );
      })
      .then((lists) => setEdges(lists.flat()))
      .catch(() => setError('Failed to load dependency diagram'));
  }, [track, level]);

  if (error) return <p role="alert">{error}</p>;
  if (!entries) return <p>Loading...</p>;

  return (
    <div>
      {entries.map((entry) => {
        const ids = entry.lessons.map((l) => l.id);
        const inside = edges
          .filter((e) => ids.includes(e.lessonId) && ids.includes(e.prerequisiteLessonId))
          .map((e) => ({ from: e.prerequisiteLessonId, to: e.lessonId }));
        const layout = computeBranchLayout(ids, inside);
        const at = new Map(layout.map((n) => [n.id, n]));
        const byId = new Map(entry.lessons.map((l) => [l.id, l]));
        const columns = Math.max(0, ...layout.map((n) => n.column)) + 1;
        const rows = Math.max(0, ...layout.map((n) => n.row)) + 1;
        return (
          <section key={entry.milestone.id}>
            <h3>
              {entry.milestone.difficultyRank}. {entry.milestone.title}
            </h3>
            <svg
              role="img"
              aria-label={`${entry.milestone.title} dependency diagram`}
              width={columns * COLUMN_WIDTH + 40}
              height={rows * ROW_HEIGHT + 40}
            >
              {inside.map((edge, i) => {
                const from = at.get(edge.from)!;
                const to = at.get(edge.to)!;
                return (
                  <line
                    key={i}
                    x1={from.column * COLUMN_WIDTH + 20 + CARD_WIDTH / 2}
                    y1={from.row * ROW_HEIGHT + 20 + CARD_HEIGHT}
                    x2={to.column * COLUMN_WIDTH + 20 + CARD_WIDTH / 2}
                    y2={to.row * ROW_HEIGHT + 20}
                    stroke="black"
                  />
                );
              })}
              {layout.map((node) => {
                const lesson = byId.get(node.id)!;
                return (
                  <a key={node.id} href={`/admin/curriculum/lesson/${lesson.id}/edit?track=${track}`}>
                    <g transform={`translate(${node.column * COLUMN_WIDTH + 20}, ${node.row * ROW_HEIGHT + 20})`}>
                      <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="white" stroke="black" />
                      <text x={8} y={16}>
                        {lesson.title}
                      </text>
                      <text x={8} y={32} fontSize={10}>
                        {lesson.skill}
                      </text>
                    </g>
                  </a>
                );
              })}
            </svg>
          </section>
        );
      })}
    </div>
  );
}
```

Delete `lib/curriculum-admin/diagramLayout.ts` and `lib/curriculum-admin/diagramLayout.test.ts`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/curriculum-admin lib/services components/admin app/api/admin`
Expected: PASS. Any existing admin test whose structure stub lacks `lessonsBuildingOnUnsorted` still passes: `TrackLevelStructure` only reads it with `.includes`. For stubs that omit the field, add `lessonsBuildingOnUnsorted: []` so the typed fixtures match. Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add -A lib/curriculum-admin lib/services app/api/admin components/admin
git commit -m "feat: enforce the prerequisite scope rule and add Move to and milestone bands in admin"
```

---

### Task 4: Server gating — lesson view, attempts, chat, complete, suggestion

**Files:**
- Create: `lib/services/levelGating.ts`, `lib/services/levelGating.test.ts`
- Modify:
  - `lib/services/progressService.ts`, `lib/services/progressService.test.ts`
  - `lib/services/attemptService.ts`, `lib/services/attemptService.test.ts`
  - `lib/services/lessonChatService.ts`, `lib/services/lessonChatService.test.ts`
  - `lib/tutoring/progressTypes.ts`, `lib/tutoring/queue.ts`, `lib/tutoring/queue.test.ts`
  - `lib/tutoring/errorCodes.ts`
  - `components/tutoring/LessonPage.tsx`, `components/tutoring/LessonPage.test.tsx`
  - `app/api/tutoring/routes.test.ts`, `app/api/tutoring/lessons/[id]/chat/route.test.ts`
  - `messages/en.json`, `messages/de.json`
  - `test/tutoringFixtures.ts`

**Interfaces:**
- Consumes: `milestoneStates`, `nextLockedRank`, `isLessonLocked`, `RankedMilestone`, `MilestoneState` and `computeBranchLayout` (Task 1). The milestone-based schema (Task 2).
- Produces:
  - `levelGating.ts`:
    - `interface DoneState { completed: Set<string>; coveredVia: Map<string, Track> }`
    - `loadDoneState(db): DoneState`
    - `loadPrerequisites(db): Map<string, { id: string; title: string }[]>`
    - `interface GatingMilestone { id: string; title: string; description: string | null; rank: number; lessonIds: string[] }`
    - `interface LevelGating { track; level; milestones: GatingMilestone[]; states: Map<string, MilestoneState>; nextLockedRank: number | null; done: DoneState; isDone(id): boolean; prerequisitesOf(id): {id,title}[]; unsortedIds: Set<string>; milestoneOf(id): GatingMilestone | undefined; isLessonLocked(id): boolean; lessonsInTreeOrder(): string[] }`
    - `loadLevelGating(db, track, level): LevelGating`
    - `type LessonLock = { locked: false } | { locked: true; reason: 'milestone' | 'prerequisites'; milestone: { id: string; title: string }; missingPrerequisites: { id: string; title: string }[] }`
    - `lessonLock(db, lessonId): LessonLock`
  - `LessonView` changes:
    - The level-locked variant becomes `{ locked: 'level'; id; title; level; unlocksAfter }`.
    - New variant `{ locked: 'lesson'; id; title; level; reason: 'milestone' | 'prerequisites'; milestone: { id; title }; missingPrerequisites: { id; title }[] }`.
    - The open variant keeps `locked: false`.
  - `ErrorCode` gains `'lesson_locked' | 'testout_unavailable' | 'testout_cooldown'`.
  - Test fixture `addSecondMilestone(db)`: milestone `g-a1-m2` (rank 2) with lesson `a1-late` and exercises `a1-late__ex1` (multiple choice, correct index 0) and `a1-late__ex2` (fill blank, `bin`).

- [ ] **Step 1: Add the fixture and write the failing tests**

Append to `test/tutoringFixtures.ts`:

```ts
/** Generic A1 gains a rank-2 milestone with one lesson (two exercises), locked until "Basics" is complete. */
export function addSecondMilestone(db: Database.Database): void {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('g-a1-m2', 'generic', 'A1', 'Later', 2);
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-late', 'generic', 'A1', 'grammar', 'A later lesson');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late', 'g-a1-m2');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late__ex1', 'a1-late', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late__ex2', 'a1-late', 'fill_blank', '{"textWithBlank":"Ich ___ hier.","correctAnswer":"bin"}');
  `);
}
```

Create `lib/services/levelGating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from '../curriculum-admin/unsortedBucket';
import { lessonLock, loadLevelGating } from './levelGating';
import { addSecondMilestone, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  addSecondMilestone(db);
  return db;
}

describe('loadLevelGating', () => {
  it('opens the first rank, locks the next, and orders lessons by rank then branch', () => {
    const gating = loadLevelGating(setup(), 'generic', 'A1');
    expect(gating.milestones.map((m) => [m.id, m.rank])).toEqual([
      ['g-a1-m1', 1],
      ['g-a1-m2', 2],
    ]);
    expect(Object.fromEntries(gating.states)).toEqual({ 'g-a1-m1': 'open', 'g-a1-m2': 'locked' });
    expect(gating.nextLockedRank).toBe(2);
    expect(gating.lessonsInTreeOrder()).toEqual(['a1-greet', 'a1-sein', 'a1-late']);
  });
});

describe('lessonLock', () => {
  it('locks a lesson until its prerequisites are done', () => {
    const db = setup();
    expect(lessonLock(db, 'a1-greet')).toEqual({ locked: false });
    expect(lessonLock(db, 'a1-sein')).toEqual({
      locked: true,
      reason: 'prerequisites',
      milestone: { id: 'g-a1-m1', title: 'Basics' },
      missingPrerequisites: [{ id: 'a1-greet', title: 'Saying hello' }],
    });
    markComplete(db, 'a1-greet');
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('counts a lesson covered through a concept link as done', () => {
    const db = setup();
    markComplete(db, 'a1-goethe-greet'); // concept-linked to a1-greet
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('locks every lesson of a locked milestone, but never a completed one', () => {
    const db = setup();
    expect(lessonLock(db, 'a1-late')).toMatchObject({ locked: true, reason: 'milestone', milestone: { id: 'g-a1-m1', title: 'Basics' } });
    markComplete(db, 'a1-late');
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });

  it('opens the next rank once every lesson of the first is done', () => {
    const db = setup();
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });

  // Review Focus 4: a prerequisite that sits in Unsorted never locks a lesson.
  it('ignores a prerequisite shelved in Unsorted', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.exec(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-shelf', 'generic', 'A1', 'grammar', 'Shelved');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-shelf', '${milestoneId}');
      DELETE FROM lesson_prerequisites WHERE lesson_id = 'a1-sein';
      INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-sein', 'a1-shelf');`);
    expect(lessonLock(db, 'a1-sein')).toEqual({ locked: false });
  });

  it('never locks a lesson in Unsorted or one without a placement', () => {
    const db = setup();
    const { milestoneId } = ensureUnsortedExists(db, 'generic', 'A1');
    db.prepare("UPDATE lesson_placements SET milestone_id = ? WHERE lesson_id = 'a1-late'").run(milestoneId);
    expect(lessonLock(db, 'a1-late')).toEqual({ locked: false });
  });
});
```

In `lib/services/progressService.test.ts`, add:

```ts
describe('progressService.getLessonView locks', () => {
  it('returns a lesson-locked view naming the reason, and the open view once unlocked', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    expect(progress.getLessonView('a1-late')).toEqual({
      locked: 'lesson',
      id: 'a1-late',
      title: 'A later lesson',
      level: 'A1',
      reason: 'milestone',
      milestone: { id: 'g-a1-m1', title: 'Basics' },
      missingPrerequisites: [],
    });
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(progress.getLessonView('a1-late')).toMatchObject({ locked: false, id: 'a1-late' });
  });

  it('suggests the first open lesson that is not done', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    markComplete(db, 'a1-greet');
    expect(progress.getDailyQueue('2026-09-29').suggestedLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
  });
});
```

(Add `addSecondMilestone` to that file's fixture import.) Every existing expectation of `locked: true` in this file becomes `locked: 'level'`.

In `app/api/tutoring/routes.test.ts`, add:

```ts
  it('refuses lesson answers and "mark as done" for a locked lesson, with the lesson_locked code', async () => {
    addSecondMilestone(getDb());
    const res = await attempt({ exerciseId: 'a1-late__ex1', answer: { type: 'multiple_choice', selectedIndex: 0 }, source: 'lesson' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'lesson_locked' });
    const done = await completeLesson(new Request('http://localhost', { method: 'POST' }), params('a1-late'));
    expect(done.status).toBe(403);
  });
```

(Add `addSecondMilestone` to the file's fixture import.)

In `app/api/tutoring/lessons/[id]/chat/route.test.ts`, change the fixture import to `import { addSecondMilestone, seedTutoringCurriculum } from '@/test/tutoringFixtures';` and add:

```ts
  it('POST refuses a locked lesson before calling the AI', async () => {
    addSecondMilestone(getDb());
    const res = await post('a1-late', { message: 'Hallo?' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'lesson_locked' });
    expect(generateWithActiveProvider).not.toHaveBeenCalled();
  });
```

In `lib/tutoring/queue.test.ts`, delete the `describe('suggestNextLesson', …)` block and remove `suggestNextLesson` from the import. The suggestion now comes from gating, and is covered above.

In `components/tutoring/LessonPage.test.tsx`, add:

```tsx
  it('explains why a lesson is locked and links the missing prerequisites', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () =>
        delayedResponse({
          locked: 'lesson',
          id: 'a1-greet',
          title: 'Saying hello',
          level: 'A1',
          reason: 'prerequisites',
          milestone: { id: 'g-a1-m1', title: 'Basics' },
          missingPrerequisites: [{ id: 'a1-basics', title: 'Basics of German' }],
        }),
    });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByText('Locked — first complete:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Basics of German' })).toHaveAttribute('href', '/lesson/a1-basics');
    expect(screen.queryByRole('button', { name: 'Start the exercises' })).not.toBeInTheDocument();
  });

  it('names the milestone to finish when the whole milestone is locked', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () =>
        delayedResponse({
          locked: 'lesson',
          id: 'a1-greet',
          title: 'Saying hello',
          level: 'A1',
          reason: 'milestone',
          milestone: { id: 'g-a1-m1', title: 'Basics' },
          missingPrerequisites: [],
        }),
    });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByText('Locked — finish “Basics” first.')).toBeInTheDocument();
  });
```

In the same file, the existing level-locked stub changes from `locked: true` to `locked: 'level'`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/levelGating.test.ts lib/services/progressService.test.ts app/api/tutoring components/tutoring/LessonPage.test.tsx`
Expected: FAIL. `levelGating` doesn't exist, and locked lessons are still accepted.

- [ ] **Step 3: Implement `levelGating.ts`**

Create `lib/services/levelGating.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import { unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { computeBranchLayout } from '../tutoring/branchLayout';
import { isLessonLocked, milestoneStates, nextLockedRank, type MilestoneState } from '../tutoring/gating';

export interface DoneState {
  completed: Set<string>;
  coveredVia: Map<string, Track>;
}

// Own completion is a stored row (any source). Shared completion: a concept-linked lesson
// (always in another track) with its own completion (spec: Completion).
export function loadDoneState(db: Database.Database): DoneState {
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

export function loadPrerequisites(db: Database.Database): Map<string, { id: string; title: string }[]> {
  const rows = db
    .prepare(
      `SELECT lp.lesson_id, l.id, l.title FROM lesson_prerequisites lp
       JOIN lessons l ON l.id = lp.prerequisite_lesson_id
       ORDER BY lp.lesson_id, l.title`
    )
    .all() as { lesson_id: string; id: string; title: string }[];
  const map = new Map<string, { id: string; title: string }[]>();
  for (const row of rows) map.set(row.lesson_id, [...(map.get(row.lesson_id) ?? []), { id: row.id, title: row.title }]);
  return map;
}

export interface GatingMilestone {
  id: string;
  title: string;
  description: string | null;
  rank: number;
  lessonIds: string[];
}

export interface LevelGating {
  track: Track;
  level: CefrLevel;
  milestones: GatingMilestone[];
  states: Map<string, MilestoneState>;
  nextLockedRank: number | null;
  done: DoneState;
  isDone(lessonId: string): boolean;
  prerequisitesOf(lessonId: string): { id: string; title: string }[];
  unsortedIds: Set<string>;
  milestoneOf(lessonId: string): GatingMilestone | undefined;
  isLessonLocked(lessonId: string): boolean;
  lessonsInTreeOrder(): string[];
}

// Spec: Rules. One track+level's gating, loaded in a few queries.
export function loadLevelGating(db: Database.Database, track: Track, level: CefrLevel): LevelGating {
  const unsortedId = unsortedMilestoneId(track, level);
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.difficulty_rank AS rank, p.lesson_id
       FROM milestones m LEFT JOIN lesson_placements p ON p.milestone_id = m.id
       WHERE m.track = ? AND m.level = ?
       ORDER BY m.difficulty_rank, m.id, p.lesson_id`
    )
    .all(track, level) as { id: string; title: string; description: string | null; rank: number | null; lesson_id: string | null }[];

  const milestones: GatingMilestone[] = [];
  const unsortedIds = new Set<string>();
  const byId = new Map<string, GatingMilestone>();
  for (const row of rows) {
    if (row.id === unsortedId || row.rank === null) {
      if (row.lesson_id) unsortedIds.add(row.lesson_id);
      continue;
    }
    let milestone = byId.get(row.id);
    if (!milestone) {
      milestone = { id: row.id, title: row.title, description: row.description, rank: row.rank, lessonIds: [] };
      byId.set(row.id, milestone);
      milestones.push(milestone);
    }
    if (row.lesson_id) milestone.lessonIds.push(row.lesson_id);
  }

  const done = loadDoneState(db);
  const isDone = (id: string) => done.completed.has(id) || done.coveredVia.has(id);
  const prerequisites = loadPrerequisites(db);
  const states = milestoneStates(milestones, isDone);
  const milestoneOfLesson = new Map<string, GatingMilestone>();
  for (const m of milestones) for (const id of m.lessonIds) milestoneOfLesson.set(id, m);

  return {
    track,
    level,
    milestones,
    states,
    nextLockedRank: nextLockedRank(milestones, isDone),
    done,
    isDone,
    prerequisitesOf: (id) => prerequisites.get(id) ?? [],
    unsortedIds,
    milestoneOf: (id) => milestoneOfLesson.get(id),
    isLessonLocked(id) {
      const milestone = milestoneOfLesson.get(id);
      if (!milestone) return false;
      return isLessonLocked(
        {
          lessonId: id,
          milestoneState: states.get(milestone.id)!,
          prerequisiteIds: (prerequisites.get(id) ?? []).map((p) => p.id),
          unsortedIds,
        },
        isDone
      );
    },
    lessonsInTreeOrder() {
      return milestones.flatMap((m) => {
        const inside = m.lessonIds.flatMap((id) =>
          (prerequisites.get(id) ?? []).filter((p) => m.lessonIds.includes(p.id)).map((p) => ({ from: p.id, to: id }))
        );
        return computeBranchLayout(m.lessonIds, inside)
          .sort((a, b) => a.row - b.row || a.column - b.column)
          .map((n) => n.id);
      });
    },
  };
}

export type LessonLock =
  | { locked: false }
  | {
      locked: true;
      reason: 'milestone' | 'prerequisites';
      milestone: { id: string; title: string };
      missingPrerequisites: { id: string; title: string }[];
    };

// Spec: Server Enforcement. A lesson in Unsorted, or in no milestone, is never locked.
export function lessonLock(db: Database.Database, lessonId: string): LessonLock {
  const placement = db
    .prepare(
      `SELECT m.track, m.level FROM lesson_placements p JOIN milestones m ON m.id = p.milestone_id
       WHERE p.lesson_id = ? AND m.difficulty_rank IS NOT NULL`
    )
    .get(lessonId) as { track: Track; level: CefrLevel } | undefined;
  if (!placement) return { locked: false };
  const gating = loadLevelGating(db, placement.track, placement.level);
  if (!gating.isLessonLocked(lessonId)) return { locked: false };
  const milestone = gating.milestoneOf(lessonId)!;
  if (gating.states.get(milestone.id) === 'locked') {
    const blocking = gating.milestones.find((m) => m.rank < milestone.rank && gating.states.get(m.id) !== 'complete') ?? milestone;
    return { locked: true, reason: 'milestone', milestone: { id: blocking.id, title: blocking.title }, missingPrerequisites: [] };
  }
  return {
    locked: true,
    reason: 'prerequisites',
    milestone: { id: milestone.id, title: milestone.title },
    missingPrerequisites: gating.prerequisitesOf(lessonId).filter((p) => !gating.unsortedIds.has(p.id) && !gating.isDone(p.id)),
  };
}
```

For a milestone lock, `milestone` names the first incomplete milestone of a lower rank, which is the one to finish. That's why the test expects `Basics` for `a1-late`.

- [ ] **Step 4: Use gating in the services**

(a) `lib/services/progressService.ts`:
- Delete the local `DoneState`, `loadDoneState`, `isDone` and `prerequisitesByLesson`, and import `loadDoneState`, `loadPrerequisites`, `lessonLock` and `loadLevelGating` from `./levelGating`. Keep a local `const isDone = (state: DoneState, id: string) => state.completed.has(id) || state.coveredVia.has(id);` for the existing callers, importing `DoneState` as a type.
- Replace every `prerequisitesByLesson()` call with `loadPrerequisites(db)`.
- In `getLessonView`:
  - the level-locked return becomes `locked: 'level' as const` with the same fields;
  - after it, add:

```ts
    const lock = lessonLock(db, lesson.id);
    if (lock.locked) {
      return {
        locked: 'lesson',
        id: lesson.id,
        title: lesson.title,
        level: lesson.sourceLevel,
        reason: lock.reason,
        milestone: lock.milestone,
        missingPrerequisites: lock.missingPrerequisites,
      };
    }
```

- In `getDailyQueue`, replace the suggestion block (from `const done = loadDoneState();` to `const suggested = …`) with:

```ts
    const gating = loadLevelGating(db, track, level);
    const suggestedId = gating.lessonsInTreeOrder().find((id) => !gating.isDone(id) && !gating.isLessonLocked(id));
    const suggested = suggestedId
      ? (db.prepare('SELECT id, title FROM lessons WHERE id = ?').get(suggestedId) as { id: string; title: string })
      : undefined;
```

  Remove `suggestNextLesson` from the `../tutoring/queue` import.

(b) `lib/tutoring/queue.ts`: delete `SuggestionCandidate` and `suggestNextLesson`.

(c) `lib/tutoring/progressTypes.ts`: replace `LessonView` with:

```ts
export type LessonView =
  | { locked: 'level'; id: string; title: string; level: CefrLevel; unlocksAfter: CefrLevel }
  | {
      locked: 'lesson';
      id: string;
      title: string;
      level: CefrLevel;
      reason: 'milestone' | 'prerequisites';
      milestone: { id: string; title: string };
      missingPrerequisites: { id: string; title: string }[];
    }
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
```

Keep any fields Phase 2 added to the open variant.

(d) `lib/tutoring/errorCodes.ts`: add `| 'lesson_locked' | 'testout_unavailable' | 'testout_cooldown'` to `ErrorCode`.

(e) `lib/services/attemptService.ts`: import `lessonLock` from `./levelGating`, and add inside `createAttemptService`:

```ts
  // Spec: Server Enforcement. Lesson work on a locked lesson is refused; reviews are not affected.
  function assertLessonOpen(lessonId: string): void {
    if (lessonLock(db, lessonId).locked) throw new AttemptError('This lesson is still locked', 'locked', 'lesson_locked');
  }
```

  - In `recordAttempt`, after `const lesson = getUnlockedLesson(exercise.lessonId);`, add `if (source === 'lesson') assertLessonOpen(lesson.id);`.
  - In `markLessonDone`, after `const lesson = getUnlockedLesson(lessonId);`, add `assertLessonOpen(lesson.id);`.

(f) `lib/services/lessonChatService.ts`: import `lessonLock` from `./levelGating`. In `send`, right after `const lesson = getUnlockedLesson(lessonId);`, add:

```ts
    if (lessonLock(db, lesson.id).locked) throw new ChatError('This lesson is still locked', 'locked', 'lesson_locked');
```

`getThread` stays readable.

(g) `messages/en.json`:
- `errors` namespace:

```json
    "lesson_locked": "This lesson is still locked",
    "testout_unavailable": "This test-out isn't available",
    "testout_cooldown": "You can try this test-out again later"
```

- `lesson` namespace, after `"locked"`:

```json
    "lockedMilestone": "Locked — finish “{milestone}” first.",
    "lockedPrerequisites": "Locked — first complete:"
```

`messages/de.json`:
- `errors`:

```json
    "lesson_locked": "Diese Lektion ist noch gesperrt",
    "testout_unavailable": "Dieser Test zum Überspringen ist nicht verfügbar",
    "testout_cooldown": "Du kannst diesen Test später noch einmal machen"
```

- `lesson`:

```json
    "lockedMilestone": "Gesperrt – schließ zuerst „{milestone}“ ab.",
    "lockedPrerequisites": "Gesperrt – schließ zuerst ab:"
```

(h) `components/tutoring/LessonPage.tsx`: replace the `if (view.locked) { … }` block with:

```tsx
  if (view.locked === 'level') {
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
  if (view.locked === 'lesson') {
    return (
      <div>
        <nav>
          <Link href="/">{t('backToTree')}</Link>
        </nav>
        <h1>{view.title}</h1>
        {view.reason === 'milestone' ? (
          <p>{t('lockedMilestone', { milestone: view.milestone.title })}</p>
        ) : (
          <>
            <p>{t('lockedPrerequisites')}</p>
            <ul>
              {view.missingPrerequisites.map((p) => (
                <li key={p.id}>
                  <Link href={`/lesson/${p.id}`}>{p.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }
```

The `current && !current.locked` check in the attempt callback still type-checks, because `false` is the only open value.

- [ ] **Step 5: Unblock existing tests that answer a locked lesson**

Run: `npx vitest run lib app components`. Existing tests that answer or chat about `a1-sein` without finishing `a1-greet` now get `lesson_locked`, because `a1-sein` builds on `a1-greet` in the fixture. For each failing test whose subject isn't locking, add `markComplete(db, 'a1-greet');` (or `markComplete(getDb(), 'a1-greet')` in route tests) at the start of that test, after the fixture seeding.

The level-finished tests already complete `a1-greet` first; don't change them. Don't change any assertion other than the `locked: true` → `locked: 'level'` rename.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib app components messages`
Expected: PASS. Then `npx tsc --noEmit && npm test`.

- [ ] **Step 7: Commit**

```bash
git add -A lib app components messages test
git commit -m "feat: lock lessons by milestone rank and prerequisites on the server"
```

---

### Task 5: Test-out service and routes

**Files:**
- Create:
  - `lib/tutoring/testOutViews.ts`
  - `lib/services/testOutStatus.ts`
  - `lib/services/testOutService.ts`, `lib/services/testOutService.test.ts`
  - `app/api/tutoring/milestones/[id]/testout/route.ts`, `app/api/tutoring/milestones/[id]/testout/answer/route.ts`, `app/api/tutoring/milestones/testout.routes.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `drawTestOut`, `scoreTestOut`, `cooldownEndsAt`, `isTestOutEligibleType`, `TestOutCandidate`.
  - Task 4: `loadLevelGating`, `LevelGating`, `ErrorCode` (including `testout_*`).
  - Phase 2: `gradeExerciseAnswer`.
  - Phase 1: `toExerciseView`, `correctAnswerFor`, `answerTextFor`, `parseLessonAnswer`, `INITIAL_EASE`, `addDays`, `localDate`, `isAiAvailable`, and `createUnlockService().checkLevelFinishedAfterCompletion`.
- Produces:
  - `testOutViews.ts`:
    - `TestOutStatus` (the five variants in the spec)
    - `TestOutReviewItem { exercise: ExerciseView; answerText: string; result: GradeResult; correctAnswer: string | null }`
    - `TestOutResult { passed: boolean; score: number; maxScore: number; review: TestOutReviewItem[] }`
    - `TestOutState { milestone: { id: string; title: string }; status: TestOutStatus; lastResult: TestOutResult | null }`
    - `TestOutRun { attemptId: number; questions: ExerciseView[]; answered: number }`
    - `TestOutAnswerOutcome = { finished: false; answered: number; total: number } | { finished: true; result: TestOutResult }`
  - `testOutStatus.ts`:
    - `eligibleCandidates(db, gating, milestoneId, aiAvailable): TestOutCandidate[]`
    - `testOutStatusFor(db, gating, milestoneId, opts: { now: Date; aiAvailable: boolean }): TestOutStatus`
  - `testOutService.ts`:
    - `TestOutError(message, kind, code?, params?)`, `toTestOutErrorResponse(err)`
    - `createTestOutService(db, deps?)` → `{ state(milestoneId): TestOutState; start(milestoneId): TestOutRun; answer(milestoneId, exerciseId, answer): Promise<TestOutAnswerOutcome> }`
  - Routes:
    - `GET /api/tutoring/milestones/[id]/testout` → `TestOutState`
    - `POST /api/tutoring/milestones/[id]/testout` → `TestOutRun`
    - `POST …/testout/answer` with body `{ exerciseId, answer }` → `TestOutAnswerOutcome`

"Too few questions" means **the draw would have fewer than 5 questions**. A milestone of 2 lessons with 5 exercises each still draws only 4.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/testOutService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createTestOutService, TestOutError, type TestOutDeps } from './testOutService';
import { addSecondMilestone, markComplete, scheduleReview, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import type { LessonAnswer } from '../tutoring/lessonAnswers';

// Generic A1: "Basics" (rank 1, open) and "Later" (rank 2, the next locked rank) with three
// lessons: 2 + 2 + 2 eligible exercises and one flashcard, so a test-out draws 6.
function setup(deps: Partial<TestOutDeps> = {}) {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  addSecondMilestone(db);
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a1-late2', 'generic', 'A1', 'grammar', 'Later two'), ('a1-late3', 'generic', 'A1', 'vocabulary', 'Later three');
    INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late2', 'g-a1-m2'), ('a1-late3', 'g-a1-m2');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late2__ex1', 'a1-late2', 'multiple_choice', '{"question":"Q2?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late2__ex2', 'a1-late2', 'fill_blank', '{"textWithBlank":"Du ___ hier.","correctAnswer":"bin"}'),
      ('a1-late3__ex1', 'a1-late3', 'multiple_choice', '{"question":"Q3?","options":["ja","nein"],"correctIndex":0}'),
      ('a1-late3__ex2', 'a1-late3', 'fill_blank', '{"textWithBlank":"Er ___ hier.","correctAnswer":"bin"}'),
      ('a1-late3__card', 'a1-late3', 'flashcard', '{"front":"das Haus","back":"the house"}');
  `);
  let now = new Date('2026-09-29T10:00:00.000Z');
  const service = createTestOutService(db, {
    now: () => now,
    random: () => 0.3,
    aiAvailable: () => false,
    ...deps,
  });
  return { db, service, advance: (hours: number) => (now = new Date(now.getTime() + hours * 3_600_000)) };
}

function exerciseType(db: ReturnType<typeof setup>['db'], id: string): string {
  return (db.prepare('SELECT type FROM exercises WHERE id = ?').get(id) as { type: string }).type;
}

function right(db: ReturnType<typeof setup>['db'], id: string): LessonAnswer {
  return exerciseType(db, id) === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 0 } : { type: 'fill_blank', text: 'bin' };
}

function wrong(db: ReturnType<typeof setup>['db'], id: string): LessonAnswer {
  return exerciseType(db, id) === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 1 } : { type: 'fill_blank', text: 'nope' };
}

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof TestOutError ? err.kind : 'other';
  }
  return undefined;
}

async function kindOfAsync(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return err instanceof TestOutError ? err.kind : 'other';
  }
  return undefined;
}

describe('testOutService.state', () => {
  it('offers a test-out only for the next locked rank', () => {
    const { service } = setup();
    expect(service.state('g-a1-m1').status).toEqual({ status: 'none' });
    expect(service.state('g-a1-m2')).toEqual({
      milestone: { id: 'g-a1-m2', title: 'Later' },
      status: { status: 'available' },
      lastResult: null,
    });
  });

  it('reports too few questions when the draw would have fewer than 5', () => {
    const { db, service } = setup();
    db.exec("DELETE FROM lessons WHERE id IN ('a1-late2', 'a1-late3')");
    expect(service.state('g-a1-m2').status).toEqual({ status: 'too_few_questions' });
  });

  it('answers 404 for an unknown or Unsorted milestone', () => {
    const { service } = setup();
    expect(kindOf(() => service.state('nope'))).toBe('not_found');
  });
});

describe('testOutService.start and answer', () => {
  it('draws eligible questions only, resumes the same attempt, and gives no feedback while answering', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    expect(run.questions).toHaveLength(6);
    expect(run.questions.some((q) => q.type === 'flashcard')).toBe(false);
    expect(run.answered).toBe(0);

    const outcome = await service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id));
    expect(outcome).toEqual({ finished: false, answered: 1, total: 6 });
    expect(service.start('g-a1-m2')).toEqual({ ...run, answered: 1 });
    expect(service.state('g-a1-m2').status).toEqual({ status: 'in_progress', answered: 1, total: 6 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_attempts').get()).toEqual({ n: 0 });
  });

  it('on a pass: completes every lesson, schedules what was not proven, keeps existing reviews, and reviews all answers', async () => {
    const { db, service } = setup();
    scheduleReview(db, 'a1-late3__card', '2026-12-01');
    const run = service.start('g-a1-m2');
    let outcome;
    for (const [i, q] of run.questions.entries()) {
      outcome = await service.answer('g-a1-m2', q.id, i === 5 ? wrong(db, q.id) : right(db, q.id));
    }
    expect(outcome).toMatchObject({ finished: true, result: { passed: true, score: 5, maxScore: 6 } });
    const result = (outcome as { result: { review: { exercise: { id: string }; result: string; correctAnswer: string | null }[] } }).result;
    expect(result.review).toHaveLength(6);
    expect(result.review[5]).toMatchObject({ exercise: { id: run.questions[5].id }, result: 'wrong' });

    expect(db.prepare("SELECT lesson_id, source FROM lesson_completions WHERE source = 'testout' ORDER BY lesson_id").all()).toEqual([
      { lesson_id: 'a1-late', source: 'testout' },
      { lesson_id: 'a1-late2', source: 'testout' },
      { lesson_id: 'a1-late3', source: 'testout' },
    ]);
    const scheduled = db.prepare('SELECT exercise_id, next_due_at FROM exercise_srs_state ORDER BY exercise_id').all() as {
      exercise_id: string;
      next_due_at: string;
    }[];
    // The wrong answer is due tomorrow; the flashcard keeps its existing review; right answers are not scheduled.
    expect(scheduled).toHaveLength(2);
    expect(scheduled).toEqual(
      expect.arrayContaining([
        { exercise_id: 'a1-late3__card', next_due_at: '2026-12-01' },
        { exercise_id: run.questions[5].id, next_due_at: '2026-09-30' },
      ])
    );
    expect(service.state('g-a1-m2').status).toEqual({ status: 'none' });
  });

  it('on a fail: starts a 24-hour cooldown, then offers a fresh attempt', async () => {
    const { db, service, advance } = setup();
    const run = service.start('g-a1-m2');
    for (const q of run.questions) await service.answer('g-a1-m2', q.id, wrong(db, q.id));
    expect(service.state('g-a1-m2')).toMatchObject({
      status: { status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' },
      lastResult: { passed: false, score: 0, maxScore: 6 },
    });
    expect(kindOf(() => service.start('g-a1-m2'))).toBe('cooldown');
    advance(24);
    expect(service.state('g-a1-m2').status).toEqual({ status: 'available' });
    expect(service.start('g-a1-m2').answered).toBe(0);
  });

  it('refuses a test-out that is not offered', () => {
    const { service } = setup();
    expect(kindOf(() => service.start('g-a1-m1'))).toBe('unavailable');
  });

  // Review Focus 2: a double-submitted answer is refused, not stored twice.
  it('refuses an answer that is not for the next question', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    await service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id));
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id)))).toBe('bad_request');
    expect(service.start('g-a1-m2').answered).toBe(1);
  });

  // Review Focus 1: the milestone opened normally while an attempt was open.
  it('refuses answers to a stale attempt once the milestone is open', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    markComplete(db, 'a1-greet');
    markComplete(db, 'a1-sein');
    expect(service.state('g-a1-m2').status).toEqual({ status: 'none' });
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[0].id)))).toBe('unavailable');
  });

  // Review Focus 3: an exercise deleted mid-attempt is dropped; the attempt still finishes.
  it('drops a deleted question: answering it is not_found, and resuming skips it', async () => {
    const { db, service } = setup();
    const run = service.start('g-a1-m2');
    db.prepare('DELETE FROM exercises WHERE id = ?').run(run.questions[0].id);
    expect(await kindOfAsync(service.answer('g-a1-m2', run.questions[0].id, right(db, run.questions[1].id)))).toBe('not_found');
    const resumed = service.start('g-a1-m2');
    expect(resumed.questions.map((q) => q.id)).toEqual(run.questions.slice(1).map((q) => q.id));
    let outcome;
    for (const q of resumed.questions) outcome = await service.answer('g-a1-m2', q.id, right(db, q.id));
    expect(outcome).toMatchObject({ finished: true, result: { passed: true, maxScore: 5 } });
  });

  it('draws free text only with a working AI provider, and keeps the question when grading fails', async () => {
    const gradeFreeText = vi.fn(async () => ({ ok: false as const, error: 'No AI provider is set up', code: 'no_provider' as const }));
    const { db, service } = setup({ aiAvailable: () => true, gradeFreeText });
    db.exec(`
      DELETE FROM exercises WHERE id IN ('a1-late3__ex1', 'a1-late3__ex2');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late3__free', 'a1-late3', 'free_text', '{"prompt":"Sag hallo.","modelAnswer":"Hallo!"}');
    `);
    const run = service.start('g-a1-m2');
    const freeIndex = run.questions.findIndex((q) => q.type === 'free_text');
    expect(freeIndex).toBeGreaterThanOrEqual(0);
    for (const q of run.questions.slice(0, freeIndex)) await service.answer('g-a1-m2', q.id, right(db, q.id));
    expect(await kindOfAsync(service.answer('g-a1-m2', 'a1-late3__free', { type: 'free_text', text: 'Hallo' }))).toBe('grading_failed');
    expect(service.start('g-a1-m2').answered).toBe(freeIndex);

    const { db: db2, service: noAi } = setup({ aiAvailable: () => false });
    db2.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-late3__free', 'a1-late3', 'free_text', '{"prompt":"Sag hallo.","modelAnswer":"Hallo!"}')`);
    expect(noAi.start('g-a1-m2').questions.some((q) => q.type === 'free_text')).toBe(false);
  });
});
```

Create `app/api/tutoring/milestones/testout.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { addSecondMilestone, seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { GET, POST } from './[id]/testout/route';
import { POST as ANSWER } from './[id]/testout/answer/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/tutoring/milestones/[id]/testout', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-testout-'));
    const db = getDb();
    seedTutoringCurriculum(db);
    addSecondMilestone(db);
    db.exec(`
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late__ex3', 'a1-late', 'multiple_choice', '{"question":"Q3?","options":["ja","nein"],"correctIndex":0}');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-late2', 'generic', 'A1', 'grammar', 'Later two'),
        ('a1-late3', 'generic', 'A1', 'grammar', 'Later three');
      INSERT INTO lesson_placements (lesson_id, milestone_id) VALUES ('a1-late2', 'g-a1-m2'), ('a1-late3', 'g-a1-m2');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-late2__ex1', 'a1-late2', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
        ('a1-late2__ex2', 'a1-late2', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}'),
        ('a1-late3__ex1', 'a1-late3', 'multiple_choice', '{"question":"Q?","options":["ja","nein"],"correctIndex":0}');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('reports state, starts, and takes answers', async () => {
    expect(await (await GET(new Request('http://localhost'), ctx('g-a1-m2'))).json()).toMatchObject({ status: { status: 'available' } });
    const run = await (await POST(new Request('http://localhost', { method: 'POST' }), ctx('g-a1-m2'))).json();
    expect(run.questions.length).toBeGreaterThanOrEqual(5);
    const first = run.questions[0];
    const answer = first.type === 'multiple_choice' ? { type: 'multiple_choice', selectedIndex: 0 } : { type: 'fill_blank', text: 'bin' };
    const res = await ANSWER(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ exerciseId: first.id, answer }) }),
      ctx('g-a1-m2')
    );
    expect(await res.json()).toEqual({ finished: false, answered: 1, total: run.questions.length });
  });

  it('maps errors to status codes and codes', async () => {
    const unavailable = await POST(new Request('http://localhost', { method: 'POST' }), ctx('g-a1-m1'));
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({ code: 'testout_unavailable' });
    expect((await GET(new Request('http://localhost'), ctx('nope'))).status).toBe(404);
    const bad = await ANSWER(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ exerciseId: 7 }) }), ctx('g-a1-m2'));
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/testOutService.test.ts app/api/tutoring/milestones`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Implement**

Create `lib/tutoring/testOutViews.ts`:

```ts
import type { ExerciseView } from './exerciseView';
import type { GradeResult } from './grading';

export type TestOutStatus =
  | { status: 'none' }
  | { status: 'available' }
  | { status: 'in_progress'; answered: number; total: number }
  | { status: 'cooldown'; retryAt: string }
  | { status: 'too_few_questions' };

export interface TestOutReviewItem {
  exercise: ExerciseView;
  answerText: string;
  result: GradeResult;
  correctAnswer: string | null;
}

export interface TestOutResult {
  passed: boolean;
  score: number;
  maxScore: number;
  review: TestOutReviewItem[];
}

export interface TestOutState {
  milestone: { id: string; title: string };
  status: TestOutStatus;
  lastResult: TestOutResult | null;
}

export interface TestOutRun {
  attemptId: number;
  questions: ExerciseView[];
  answered: number;
}

export type TestOutAnswerOutcome =
  | { finished: false; answered: number; total: number }
  | { finished: true; result: TestOutResult };
```

Create `lib/services/testOutStatus.ts`:

```ts
import type Database from 'better-sqlite3';
import type { ExerciseType } from '../curriculum/types';
import { cooldownEndsAt, drawTestOut, isTestOutEligibleType, TESTOUT_MIN_QUESTIONS, type TestOutCandidate } from '../tutoring/testOut';
import type { TestOutStatus } from '../tutoring/testOutViews';
import type { LevelGating } from './levelGating';

// The milestone's not-done lessons with their eligible exercises, in authored order.
export function eligibleCandidates(
  db: Database.Database,
  gating: LevelGating,
  milestoneId: string,
  aiAvailable: boolean
): TestOutCandidate[] {
  const milestone = gating.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return [];
  const exercisesOf = db.prepare('SELECT id, type FROM exercises WHERE lesson_id = ? ORDER BY rowid');
  return milestone.lessonIds
    .filter((lessonId) => !gating.isDone(lessonId))
    .map((lessonId) => ({
      lessonId,
      exerciseIds: (exercisesOf.all(lessonId) as { id: string; type: ExerciseType }[])
        .filter((e) => isTestOutEligibleType(e.type, aiAvailable))
        .map((e) => e.id),
    }));
}

// Spec: Test-out, Availability. Only a locked milestone at the next locked rank is offered.
export function testOutStatusFor(
  db: Database.Database,
  gating: LevelGating,
  milestoneId: string,
  opts: { now: Date; aiAvailable: boolean }
): TestOutStatus {
  const milestone = gating.milestones.find((m) => m.id === milestoneId);
  if (!milestone || gating.states.get(milestoneId) !== 'locked' || milestone.rank !== gating.nextLockedRank) {
    return { status: 'none' };
  }
  const open = db
    .prepare("SELECT exercise_ids, answers FROM milestone_testouts WHERE milestone_id = ? AND status = 'in_progress'")
    .get(milestoneId) as { exercise_ids: string; answers: string } | undefined;
  if (open) {
    return { status: 'in_progress', answered: JSON.parse(open.answers).length, total: JSON.parse(open.exercise_ids).length };
  }
  const lastFail = db
    .prepare("SELECT finished_at FROM milestone_testouts WHERE milestone_id = ? AND status = 'failed' ORDER BY finished_at DESC LIMIT 1")
    .get(milestoneId) as { finished_at: string } | undefined;
  if (lastFail) {
    const retryAt = cooldownEndsAt(lastFail.finished_at);
    if (retryAt > opts.now.toISOString()) return { status: 'cooldown', retryAt };
  }
  // The draw's size doesn't depend on the random order.
  const size = drawTestOut(eligibleCandidates(db, gating, milestoneId, opts.aiAvailable), () => 0).length;
  return size < TESTOUT_MIN_QUESTIONS ? { status: 'too_few_questions' } : { status: 'available' };
}
```

Create `lib/services/testOutService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel, Track } from '../types';
import type { Exercise } from '../curriculum/types';
import { addDays, localDate } from '../tutoring/dates';
import { errorBody, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';
import { toExerciseView } from '../tutoring/exerciseView';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import type { GradeResult } from '../tutoring/grading';
import { answerTextFor, correctAnswerFor, type LessonAnswer } from '../tutoring/lessonAnswers';
import { INITIAL_EASE } from '../tutoring/srs';
import { drawTestOut, scoreTestOut } from '../tutoring/testOut';
import type { TestOutAnswerOutcome, TestOutResult, TestOutRun, TestOutState } from '../tutoring/testOutViews';
import { isAiAvailable } from './aiService';
import { gradeExerciseAnswer } from './exerciseGrading';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { loadLevelGating } from './levelGating';
import { createProfileService } from './profileService';
import { eligibleCandidates, testOutStatusFor } from './testOutStatus';
import { createUnlockService } from './unlockService';

export type TestOutErrorKind = 'not_found' | 'unavailable' | 'cooldown' | 'bad_request' | 'grading_failed';

const DEFAULT_CODE: Record<TestOutErrorKind, ErrorCode> = {
  not_found: 'not_found',
  unavailable: 'testout_unavailable',
  cooldown: 'testout_cooldown',
  bad_request: 'bad_request',
  grading_failed: 'ai_failed',
};

const STATUS_FOR: Record<TestOutErrorKind, number> = {
  not_found: 404,
  unavailable: 409,
  cooldown: 409,
  bad_request: 400,
  grading_failed: 502,
};

export class TestOutError extends Error {
  readonly code: ErrorCode;
  constructor(
    message: string,
    readonly kind: TestOutErrorKind,
    code?: ErrorCode,
    readonly params?: ErrorParams
  ) {
    super(message);
    this.code = code ?? DEFAULT_CODE[kind];
  }
}

export function toTestOutErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof TestOutError)) return null;
  return { status: STATUS_FOR[err.kind], body: errorBody(err.message, err.code, err.params) };
}

export interface TestOutDeps {
  gradeFreeText?: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
  now?: () => Date;
  random?: () => number;
  aiAvailable?: () => boolean;
}

interface StoredAnswer {
  exerciseId: string;
  answerText: string;
  result: GradeResult;
  correctAnswer: string | null;
}

interface AttemptRow {
  id: number;
  exercise_ids: string;
  answers: string;
  score: number | null;
  max_score: number | null;
  status: 'in_progress' | 'passed' | 'failed';
}

export function createTestOutService(db: Database.Database, deps: TestOutDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  const aiAvailable = deps.aiAvailable ?? (() => isAiAvailable(db));
  const gradeFree = deps.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const profiles = createProfileService(db);
  const unlocks = createUnlockService(db);

  function context(milestoneId: string) {
    const milestone = db
      .prepare('SELECT id, title, track, level, difficulty_rank AS rank FROM milestones WHERE id = ?')
      .get(milestoneId) as { id: string; title: string; track: Track; level: CefrLevel; rank: number | null } | undefined;
    if (!milestone || milestone.rank === null) throw new TestOutError(`Milestone not found: ${milestoneId}`, 'not_found');
    return { milestone, gating: loadLevelGating(db, milestone.track, milestone.level) };
  }

  function getExercise(id: string): Exercise | null {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as
      | { id: string; lesson_id: string; track: Exercise['track']; type: Exercise['type']; content: string }
      | undefined;
    return row ? { id: row.id, lessonId: row.lesson_id, track: row.track, type: row.type, content: JSON.parse(row.content) } : null;
  }

  function openAttempt(milestoneId: string): AttemptRow | undefined {
    return db
      .prepare("SELECT * FROM milestone_testouts WHERE milestone_id = ? AND status = 'in_progress'")
      .get(milestoneId) as AttemptRow | undefined;
  }

  // Review Focus 3: unanswered questions whose exercise was deleted are dropped from the attempt.
  function pruned(row: AttemptRow): { ids: string[]; answers: StoredAnswer[] } {
    const ids = JSON.parse(row.exercise_ids) as string[];
    const answers = JSON.parse(row.answers) as StoredAnswer[];
    const exists = db.prepare('SELECT 1 FROM exercises WHERE id = ?');
    const kept = [...ids.slice(0, answers.length), ...ids.slice(answers.length).filter((id) => exists.get(id))];
    if (kept.length !== ids.length) {
      db.prepare('UPDATE milestone_testouts SET exercise_ids = ? WHERE id = ?').run(JSON.stringify(kept), row.id);
    }
    return { ids: kept, answers };
  }

  function toResult(answers: StoredAnswer[], score: number, maxScore: number, passed: boolean): TestOutResult {
    return {
      passed,
      score,
      maxScore,
      review: answers.flatMap((a) => {
        const exercise = getExercise(a.exerciseId);
        return exercise ? [{ exercise: toExerciseView(exercise), answerText: a.answerText, result: a.result, correctAnswer: a.correctAnswer }] : [];
      }),
    };
  }

  function state(milestoneId: string): TestOutState {
    const { milestone, gating } = context(milestoneId);
    const last = db
      .prepare(
        "SELECT * FROM milestone_testouts WHERE milestone_id = ? AND status != 'in_progress' ORDER BY finished_at DESC, id DESC LIMIT 1"
      )
      .get(milestoneId) as AttemptRow | undefined;
    return {
      milestone: { id: milestone.id, title: milestone.title },
      status: testOutStatusFor(db, gating, milestoneId, { now: now(), aiAvailable: aiAvailable() }),
      lastResult: last ? toResult(JSON.parse(last.answers), last.score ?? 0, last.max_score ?? 0, last.status === 'passed') : null,
    };
  }

  function start(milestoneId: string): TestOutRun {
    const { gating } = context(milestoneId);
    const status = testOutStatusFor(db, gating, milestoneId, { now: now(), aiAvailable: aiAvailable() });
    if (status.status === 'cooldown') {
      throw new TestOutError('You can try this test-out again later', 'cooldown', undefined, { retryAt: status.retryAt });
    }
    if (status.status === 'available') {
      const ids = drawTestOut(eligibleCandidates(db, gating, milestoneId, aiAvailable()), random);
      db.prepare(
        "INSERT INTO milestone_testouts (milestone_id, status, exercise_ids, started_at) VALUES (?, 'in_progress', ?, ?)"
      ).run(milestoneId, JSON.stringify(ids), now().toISOString());
    } else if (status.status !== 'in_progress') {
      throw new TestOutError("This test-out isn't available", 'unavailable');
    }
    const row = openAttempt(milestoneId)!;
    const { ids, answers } = pruned(row);
    return {
      attemptId: row.id,
      questions: ids.map((id) => getExercise(id)).filter((e): e is Exercise => e !== null).map(toExerciseView),
      answered: answers.length,
    };
  }

  function finish(row: AttemptRow, milestoneId: string, answers: StoredAnswer[]): TestOutResult {
    const { milestone, gating } = context(milestoneId);
    const { score, maxScore, passed } = scoreTestOut(answers.map((a) => a.result));
    const at = now().toISOString();
    db.prepare('UPDATE milestone_testouts SET status = ?, score = ?, max_score = ?, finished_at = ? WHERE id = ?').run(
      passed ? 'passed' : 'failed',
      score,
      maxScore,
      at,
      row.id
    );
    if (passed) {
      const tomorrow = addDays(localDate(now()), 1);
      const proven = new Set(answers.filter((a) => a.result === 'correct').map((a) => a.exerciseId));
      const lessonIds = gating.milestones.find((m) => m.id === milestoneId)!.lessonIds.filter((id) => !gating.isDone(id));
      const complete = db.prepare(
        "INSERT INTO lesson_completions (lesson_id, completed_at, source) VALUES (?, ?, 'testout') ON CONFLICT(lesson_id) DO NOTHING"
      );
      const schedule = db.prepare(
        `INSERT INTO exercise_srs_state (exercise_id, repetitions, ease_factor, interval_days, next_due_at, updated_at)
         VALUES (?, 0, ?, 1, ?, ?) ON CONFLICT(exercise_id) DO NOTHING`
      );
      const exercisesOf = db.prepare('SELECT id FROM exercises WHERE lesson_id = ? ORDER BY rowid');
      for (const lessonId of lessonIds) {
        complete.run(lessonId, at);
        for (const { id } of exercisesOf.all(lessonId) as { id: string }[]) {
          if (!proven.has(id)) schedule.run(id, INITIAL_EASE, tomorrow, at);
        }
      }
      unlocks.checkLevelFinishedAfterCompletion(milestone.level);
    }
    return toResult(answers, score, maxScore, passed);
  }

  async function answer(milestoneId: string, exerciseId: string, given: LessonAnswer): Promise<TestOutAnswerOutcome> {
    const { milestone, gating } = context(milestoneId);
    const status = testOutStatusFor(db, gating, milestoneId, { now: now(), aiAvailable: aiAvailable() });
    const row = openAttempt(milestoneId);
    if (status.status !== 'in_progress' || !row) throw new TestOutError("This test-out isn't available", 'unavailable');
    const { ids, answers } = pruned(row);
    const exercise = getExercise(exerciseId);
    if (!exercise) throw new TestOutError(`Exercise not found: ${exerciseId}`, 'not_found');
    if (ids[answers.length] !== exerciseId) throw new TestOutError('That is not the next question', 'bad_request');

    const graded = await gradeExerciseAnswer(exercise, given, milestone.level, {
      gradeFreeText: gradeFree,
      uiLanguage: profiles.getProfile().uiLanguage,
    });
    if (!graded.ok) {
      if (graded.reason === 'bad_request') throw new TestOutError(graded.message, 'bad_request');
      throw new TestOutError(graded.message, 'grading_failed', graded.code, graded.params);
    }

    return db.transaction((): TestOutAnswerOutcome => {
      // Re-read inside the transaction: a concurrent submit may have answered this question already.
      const current = openAttempt(milestoneId);
      if (!current || current.id !== row.id) throw new TestOutError("This test-out isn't available", 'unavailable');
      const fresh = pruned(current);
      if (fresh.ids[fresh.answers.length] !== exerciseId) throw new TestOutError('That is not the next question', 'bad_request');
      const stored = [
        ...fresh.answers,
        { exerciseId, answerText: answerTextFor(exercise, given), result: graded.result, correctAnswer: correctAnswerFor(exercise) },
      ];
      db.prepare('UPDATE milestone_testouts SET answers = ? WHERE id = ?').run(JSON.stringify(stored), current.id);
      if (stored.length < fresh.ids.length) return { finished: false, answered: stored.length, total: fresh.ids.length };
      return { finished: true, result: finish(current, milestoneId, stored) };
    })();
  }

  return { state, start, answer };
}

export type TestOutService = ReturnType<typeof createTestOutService>;
```

Create `app/api/tutoring/milestones/[id]/testout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createTestOutService, toTestOutErrorResponse } from '@/lib/services/testOutService';

export const dynamic = 'force-dynamic';

function mapError(err: unknown) {
  const mapped = toTestOutErrorResponse(err);
  if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
  throw err;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createTestOutService(getDb()).state(params.id));
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createTestOutService(getDb()).start(params.id));
  } catch (err) {
    return mapError(err);
  }
}
```

Create `app/api/tutoring/milestones/[id]/testout/answer/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { parseLessonAnswer } from '@/lib/tutoring/lessonAnswers';
import { createTestOutService, toTestOutErrorResponse } from '@/lib/services/testOutService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  const answer = parseLessonAnswer(body?.answer);
  if (typeof body?.exerciseId !== 'string' || !answer) {
    return NextResponse.json(errorBody('exerciseId and a valid answer are required', 'bad_request'), { status: 400 });
  }
  try {
    return NextResponse.json(await createTestOutService(getDb()).answer(params.id, body.exerciseId, answer));
  } catch (err) {
    const mapped = toTestOutErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/testOutService.test.ts app/api/tutoring/milestones`
Expected: PASS.
- If the pass test's scheduled list differs, check that the flashcard's existing review was kept (`ON CONFLICT DO NOTHING`), and that the correct answers weren't scheduled.
- If the free-text test finds no free-text question, it's because the draw only takes 2 per lesson and `a1-late3` has one eligible exercise. The draw always includes it.

Then run `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/testOutViews.ts lib/services/testOutStatus.ts lib/services/testOutService.ts lib/services/testOutService.test.ts app/api/tutoring/milestones
git commit -m "feat: add milestone test-outs with resume, cooldown, completion, and review scheduling"
```

---

### Task 6: Tree API and tree UI

**Files:**
- Modify:
  - `lib/tutoring/progressTypes.ts`
  - `lib/services/progressService.ts`, `lib/services/progressService.test.ts`
  - `components/tutoring/CurriculumTree.tsx`, `components/tutoring/CurriculumTree.test.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes:
  - Task 4: `loadLevelGating`, `LevelGating`.
  - Task 1: `computeBranchLayout`.
  - Task 5: `testOutStatusFor`, `TestOutStatus`.
  - `isAiAvailable`.
- Produces:
  - `TreeLesson { id; title; skill; status: LessonStatus; coveredVia: Track | null; locked: boolean; earlierPrerequisites: { id: string; title: string; done: boolean }[]; branch: number; column: number; row: number }`.
  - `TreeMilestone { id; title; description: string | null; rank: number; state: MilestoneState; lessons: TreeLesson[]; edges: { from: string; to: string }[]; testOut: TestOutStatus }`.
  - `missingPrerequisites` is removed from the tree.

- [ ] **Step 1: Write the failing tests**

In `lib/services/progressService.test.ts`:
- replace the test "warns about unfinished prerequisites, counting shared completion as done" with the two tests below;
- add `addSecondMilestone` to the fixture import.

```ts
  it('locks a lesson until its prerequisites are done, counting shared completion, and lays out branches', () => {
    const { db, progress } = setup();
    const lesson = (id: string) => progress.getTree().milestones.flatMap((m) => m.lessons).find((l) => l.id === id)!;
    expect(lesson('a1-greet')).toMatchObject({ locked: false, branch: 0, column: 0, row: 0 });
    expect(lesson('a1-sein')).toMatchObject({ locked: true, branch: 0, column: 0, row: 1 });
    expect(progress.getTree().milestones[0].edges).toEqual([{ from: 'a1-greet', to: 'a1-sein' }]);
    markComplete(db, 'a1-goethe-greet');
    expect(lesson('a1-sein').locked).toBe(false);
  });

  it('ranks milestones, gates the next rank, shows earlier prerequisites as chips, and reports the test-out', () => {
    const { db, progress } = setup();
    addSecondMilestone(db);
    db.exec("INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES ('a1-late', 'a1-greet')");
    const tree = progress.getTree();
    expect(tree.milestones.map((m) => [m.id, m.rank, m.state])).toEqual([
      ['g-a1-m1', 1, 'open'],
      ['g-a1-m2', 2, 'locked'],
    ]);
    expect(tree.milestones[1].lessons[0]).toMatchObject({
      id: 'a1-late',
      locked: true,
      earlierPrerequisites: [{ id: 'a1-greet', title: 'Saying hello', done: false }],
    });
    // a1-late has only two eligible exercises, so the draw would be too small.
    expect(tree.milestones[1].testOut).toEqual({ status: 'too_few_questions' });
    expect(tree.milestones[0].testOut).toEqual({ status: 'none' });
  });
```

In the same file, rewrite the helper `lessonsOf` as `tree.milestones.flatMap((m) => m.lessons)` if Task 2 didn't already.

Replace `components/tutoring/CurriculumTree.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { CurriculumTree } from './CurriculumTree';

const lesson = (over: Record<string, unknown>) => ({
  skill: 'grammar',
  status: 'not_started',
  coveredVia: null,
  locked: false,
  earlierPrerequisites: [],
  branch: 0,
  column: 0,
  row: 0,
  ...over,
});

const TREE = {
  track: 'generic',
  level: 'A1',
  milestones: [
    {
      id: 'm1',
      title: 'Basics',
      description: 'Everyday essentials.',
      rank: 1,
      state: 'open',
      edges: [{ from: 'a1-greet', to: 'a1-sein' }],
      testOut: { status: 'none' },
      lessons: [
        lesson({ id: 'a1-greet', title: 'Saying hello', status: 'complete' }),
        lesson({ id: 'a1-sein', title: 'The verb sein', status: 'in_progress', row: 1 }),
        lesson({ id: 'a1-bye', title: 'Saying goodbye', status: 'covered', coveredVia: 'goethe', branch: 1, column: 1 }),
      ],
    },
    {
      id: 'm2',
      title: 'Talking about the past',
      description: null,
      rank: 2,
      state: 'locked',
      edges: [],
      testOut: { status: 'available' },
      lessons: [
        lesson({
          id: 'a2-perfekt',
          title: 'Perfekt',
          locked: true,
          earlierPrerequisites: [{ id: 'a1-sein', title: 'The verb sein', done: false }],
        }),
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
  it('shows ranked milestones with their state, progress, lessons, and branches', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);

    expect(await screen.findByRole('heading', { name: 'Generic A1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 · Open · 2 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('Step 2 · Locked · 0 of 1 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saying hello' })).toHaveAttribute('href', '/lesson/a1-greet');
    expect(screen.getByText('Covered via Goethe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The verb sein' }).closest('li')).toHaveStyle({ gridRow: '2', gridColumn: '1' });
  });

  it('renders a locked lesson without a link, with its earlier prerequisite as a chip', async () => {
    stubTree(() => delayedResponse(TREE));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('Perfekt')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Perfekt' })).not.toBeInTheDocument();
    expect(screen.getByText('Builds on: The verb sein')).toBeInTheDocument();
  });

  it('offers the test-out in each of its states', async () => {
    const withStatus = (testOut: unknown) => ({ ...TREE, milestones: [TREE.milestones[0], { ...TREE.milestones[1], testOut }] });
    stubTree(() => delayedResponse(TREE));
    const { unmount } = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('link', { name: 'Test out' })).toHaveAttribute('href', '/milestone/m2/test-out');
    unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'in_progress', answered: 3, total: 16 })));
    const second = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByRole('link', { name: 'Resume the test-out (3 of 16)' })).toBeInTheDocument();
    second.unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' })));
    const third = renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText(/Try the test-out again after/)).toBeInTheDocument();
    third.unmount();

    stubTree(() => delayedResponse(withStatus({ status: 'too_few_questions' })));
    renderWithIntl(<CurriculumTree reloadKey={0} />);
    expect(await screen.findByText('Not enough questions to test out')).toBeInTheDocument();
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
    expect(screen.getByText('Stufe 2 · Gesperrt · 0 von 1 erledigt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Per Test überspringen' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/progressService.test.ts components/tutoring/CurriculumTree.test.tsx`
Expected: FAIL. The tree has no ranks, states, or layout yet.

- [ ] **Step 3: Implement**

(a) `lib/tutoring/progressTypes.ts`:
- Add `import type { MilestoneState } from './gating';` and `import type { TestOutStatus } from './testOutViews';`.
- Replace `TreeLesson` and `TreeMilestone` with:

```ts
export interface TreeLesson {
  id: string;
  title: string;
  skill: Skill;
  status: LessonStatus;
  coveredVia: Track | null;
  locked: boolean;
  // prerequisites that sit in a lower-rank milestone: shown as "builds on" chips
  earlierPrerequisites: { id: string; title: string; done: boolean }[];
  branch: number;
  column: number;
  row: number;
}

export interface TreeMilestone {
  id: string;
  title: string;
  description: string | null;
  rank: number;
  state: MilestoneState;
  lessons: TreeLesson[];
  // prerequisite → dependent, inside this milestone
  edges: { from: string; to: string }[];
  testOut: TestOutStatus;
}
```

(b) `lib/services/progressService.ts`:
- Add imports: `import { computeBranchLayout } from '../tutoring/branchLayout';`, `import { isAiAvailable } from './aiService';`, `import { testOutStatusFor } from './testOutStatus';`.
- Replace `getTree` with:

```ts
  function getTree(): CurriculumTree {
    const { activeTrack: track, activeLevel: level } = profiles.getProfile();
    const gating = loadLevelGating(db, track, level);
    const info = new Map(visibleLessons(track, level).map((row) => [row.id, row]));
    const attempted = new Set(
      (db.prepare('SELECT DISTINCT lesson_id FROM lesson_attempts').all() as { lesson_id: string }[]).map((r) => r.lesson_id)
    );
    const statusOpts = { now: new Date(), aiAvailable: isAiAvailable(db) };

    return {
      track,
      level,
      milestones: gating.milestones.map((milestone) => {
        const ids = milestone.lessonIds;
        const edges = ids.flatMap((id) =>
          gating
            .prerequisitesOf(id)
            .filter((p) => ids.includes(p.id))
            .map((p) => ({ from: p.id, to: id }))
        );
        const layout = new Map(computeBranchLayout(ids, edges).map((n) => [n.id, n]));
        return {
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          rank: milestone.rank,
          state: gating.states.get(milestone.id)!,
          edges,
          testOut: testOutStatusFor(db, gating, milestone.id, statusOpts),
          lessons: ids.map((id) => {
            const row = info.get(id)!;
            const at = layout.get(id)!;
            return {
              id,
              title: row.title,
              skill: row.skill,
              status: lessonStatus({
                completed: gating.done.completed.has(id),
                covered: gating.done.coveredVia.has(id),
                attempted: attempted.has(id),
              }),
              coveredVia: gating.done.coveredVia.get(id) ?? null,
              locked: gating.isLessonLocked(id),
              earlierPrerequisites: gating
                .prerequisitesOf(id)
                .filter((p) => {
                  const home = gating.milestoneOf(p.id);
                  return home !== undefined && home.id !== milestone.id;
                })
                .map((p) => ({ ...p, done: gating.isDone(p.id) })),
              branch: at.branch,
              column: at.column,
              row: at.row,
            };
          }),
        };
      }),
    };
  }
```

Remove any imports this leaves unused.

(c) Replace `components/tutoring/CurriculumTree.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { CurriculumTree as CurriculumTreeData, TreeMilestone } from '@/lib/tutoring/progressTypes';

// Spec: Student UI. Milestones in rank order; inside each, lessons sit on a grid by their
// branch layout (the design pass draws the connecting lines). Locked lessons aren't links.
export function CurriculumTree({ reloadKey }: { reloadKey: number }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const format = useFormatter();
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

  function testOut(milestone: TreeMilestone) {
    const s = milestone.testOut;
    const href = `/milestone/${milestone.id}/test-out`;
    switch (s.status) {
      case 'available':
        return <Link href={href}>{t('testOutStart')}</Link>;
      case 'in_progress':
        return <Link href={href}>{t('testOutResume', { answered: s.answered, total: s.total })}</Link>;
      case 'cooldown':
        return <p>{t('testOutCooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>;
      case 'too_few_questions':
        return <p>{t('testOutTooFew')}</p>;
      case 'none':
        return null;
    }
  }

  const empty = tree.milestones.every((m) => m.lessons.length === 0);
  return (
    <div>
      <h2>{t('heading', { track: tTracks(tree.track), level: tree.level })}</h2>
      {empty && <p>{t('empty')}</p>}
      {tree.milestones.map((milestone) => {
        const done = milestone.lessons.filter((l) => l.status === 'complete' || l.status === 'covered').length;
        return (
          <section key={milestone.id}>
            <h3>{milestone.title}</h3>
            <p>
              {t('milestoneLine', {
                rank: milestone.rank,
                state: t(`milestoneState.${milestone.state}`),
                done,
                total: milestone.lessons.length,
              })}
            </p>
            {milestone.description && <p>{milestone.description}</p>}
            {testOut(milestone)}
            <ol style={{ display: 'grid', listStyle: 'none', padding: 0 }}>
              {milestone.lessons.map((lesson) => (
                <li key={lesson.id} style={{ gridColumn: String(lesson.column + 1), gridRow: String(lesson.row + 1) }}>
                  {lesson.locked ? (
                    <span>{lesson.title}</span>
                  ) : (
                    <Link href={`/lesson/${lesson.id}`}>{lesson.title}</Link>
                  )}{' '}
                  —{' '}
                  <span>
                    {lesson.locked
                      ? t('lockedLesson')
                      : lesson.coveredVia
                        ? t('coveredVia', { track: tTracks(lesson.coveredVia) })
                        : t(`status.${lesson.status}`)}
                  </span>
                  {lesson.earlierPrerequisites.map((p) => (
                    <p key={p.id}>{t('buildsOnChip', { title: p.title })}</p>
                  ))}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
```

(d) Catalogs. In `messages/en.json`'s `tree` namespace:
- delete `"buildsOn"`;
- add:

```json
    "milestoneLine": "Step {rank} · {state} · {done} of {total} done",
    "milestoneState": { "locked": "Locked", "open": "Open", "complete": "Complete" },
    "lockedLesson": "Locked",
    "buildsOnChip": "Builds on: {title}",
    "testOutStart": "Test out",
    "testOutResume": "Resume the test-out ({answered} of {total})",
    "testOutCooldown": "Try the test-out again after {time}",
    "testOutTooFew": "Not enough questions to test out"
```

In `messages/de.json`'s `tree` namespace:
- delete `"buildsOn"`;
- add:

```json
    "milestoneLine": "Stufe {rank} · {state} · {done} von {total} erledigt",
    "milestoneState": { "locked": "Gesperrt", "open": "Offen", "complete": "Abgeschlossen" },
    "lockedLesson": "Gesperrt",
    "buildsOnChip": "Baut auf: {title}",
    "testOutStart": "Per Test überspringen",
    "testOutResume": "Test fortsetzen ({answered} von {total})",
    "testOutCooldown": "Test wieder möglich ab {time}",
    "testOutTooFew": "Zu wenige Fragen für einen Test"
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/progressService.test.ts components/tutoring messages/catalogs.test.ts app/api/tutoring`
Expected: PASS. If `toHaveStyle({ gridRow: '2' })` fails because jsdom expands the shorthand, assert `expect(li.style.gridRow).toBe('2')` instead. Then `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/progressTypes.ts lib/services/progressService.ts lib/services/progressService.test.ts components/tutoring/CurriculumTree.tsx components/tutoring/CurriculumTree.test.tsx messages/en.json messages/de.json
git commit -m "feat: show ranked, gated milestones with lesson branches and test-out entry in the tree"
```

---

### Task 7: Test-out page

**Files:**
- Create: `components/tutoring/TestOutPage.tsx`, `components/tutoring/TestOutPage.test.tsx`, `app/milestone/[id]/test-out/page.tsx`
- Modify: `components/tutoring/ExerciseCard.tsx`, `components/tutoring/ExerciseCard.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes:
  - Task 5: the test-out routes and `TestOutState`, `TestOutRun`, `TestOutAnswerOutcome`, `TestOutResult`.
  - Phase 2: `ExerciseCard`'s `mode` prop and `useApiErrorText`.
- Produces:
  - `ExerciseCard` gains `mode: 'test'`, with props `testMilestoneId?: string`, `onTestAnswered?: (outcome: TestOutAnswerOutcome) => void` and `onTestStale?: () => void`.
  - `ExerciseCard` exports `taskText(exercise: ExerciseView): string`.
  - `TestOutPage({ milestoneId })`.
  - Page route `/milestone/[id]/test-out`.

- [ ] **Step 1: Add the catalog text**

`messages/en.json`, new top-level namespace:

```json
  "testOut": {
    "title": "Test out: {milestone}",
    "intro": "Answer up to 20 questions from this milestone. With 80% or more, all its lessons count as done. You'll see your results at the end.",
    "start": "Start the test",
    "resume": "Resume the test",
    "progress": "Question {current} of {total}",
    "passed": "Passed! This milestone is complete.",
    "failed": "Not passed this time. You can try again in 24 hours.",
    "score": "{score} of {maxScore} points",
    "yourAnswer": "Your answer: {answer}",
    "correctAnswer": "Correct answer: {answer}",
    "result": { "correct": "Right", "almost": "Almost", "wrong": "Wrong" },
    "unavailable": "This test-out isn't available right now.",
    "cooldown": "You can try again after {time}.",
    "tooFew": "This milestone doesn't have enough questions for a test-out.",
    "backToTree": "Back to your lessons",
    "loadFailed": "Could not load the test-out. Please reload the page.",
    "genericError": "Something went wrong: {error}"
  },
```

`messages/de.json`:

```json
  "testOut": {
    "title": "Per Test überspringen: {milestone}",
    "intro": "Beantworte bis zu 20 Fragen aus dieser Stufe. Mit mindestens 80 % gelten alle ihre Lektionen als erledigt. Deine Ergebnisse siehst du am Ende.",
    "start": "Test starten",
    "resume": "Test fortsetzen",
    "progress": "Frage {current} von {total}",
    "passed": "Bestanden! Diese Stufe ist abgeschlossen.",
    "failed": "Diesmal nicht bestanden. Du kannst es in 24 Stunden noch einmal versuchen.",
    "score": "{score} von {maxScore} Punkten",
    "yourAnswer": "Deine Antwort: {answer}",
    "correctAnswer": "Richtige Antwort: {answer}",
    "result": { "correct": "Richtig", "almost": "Fast richtig", "wrong": "Falsch" },
    "unavailable": "Dieser Test ist gerade nicht verfügbar.",
    "cooldown": "Du kannst es ab {time} noch einmal versuchen.",
    "tooFew": "Diese Stufe hat nicht genug Fragen für einen Test.",
    "backToTree": "Zurück zu deinen Lektionen",
    "loadFailed": "Der Test konnte nicht geladen werden. Bitte lade die Seite neu.",
    "genericError": "Etwas ist schiefgelaufen: {error}"
  },
```

- [ ] **Step 2: Write the failing tests**

Append inside `describe('ExerciseCard', …)` in `components/tutoring/ExerciseCard.test.tsx`:

```tsx
  it('in test mode posts to the test-out route and shows no result', async () => {
    const fetchMock = stubAttempts(() => delayedResponse({ finished: false, answered: 1, total: 6 }));
    const onTestAnswered = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="test" testMilestoneId="m2" onTestAnswered={onTestAnswered} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Tschüss'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(onTestAnswered).toHaveBeenCalledWith({ finished: false, answered: 1, total: 6 }));
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/milestones/m2/testout/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'ex1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
    expect(screen.queryByText('Wrong')).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });

  it('in test mode reports a stale question and never offers Skip', async () => {
    stubAttempts(() => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 }));
    const onTestStale = vi.fn();
    renderWithIntl(
      <ExerciseCard exercise={MC} source="lesson" mode="test" testMilestoneId="m2" onTestStale={onTestStale} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Hallo'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(onTestStale).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });
```

(Import `waitFor` from `@testing-library/react` if the file doesn't already.)

Create `components/tutoring/TestOutPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { TestOutPage } from './TestOutPage';

const BASE = '/api/tutoring/milestones/m2/testout';
const Q1 = { id: 'q1', type: 'multiple_choice', question: 'First?', options: ['ja', 'nein'] };
const Q2 = { id: 'q2', type: 'fill_blank', textWithBlank: 'Ich ___ hier.' };
const STATE = (status: unknown, lastResult: unknown = null) => ({ milestone: { id: 'm2', title: 'Later' }, status, lastResult });
const RESULT = {
  passed: true,
  score: 1.5,
  maxScore: 2,
  review: [
    { exercise: Q1, answerText: 'ja', result: 'correct', correctAnswer: 'ja' },
    { exercise: Q2, answerText: 'ist', result: 'wrong', correctAnswer: 'bin' },
  ],
};

function stub(routes: Record<string, (() => Promise<unknown>)[]>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const queue = routes[key];
    if (!queue || queue.length === 0) throw new Error(`Unexpected fetch: ${key}`);
    return (queue.length > 1 ? queue.shift()! : queue[0])();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TestOutPage', () => {
  it('starts, asks one question at a time without feedback, then shows the result and review', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'available' }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 0 })],
      [`POST ${BASE}/answer`]: [
        () => delayedResponse({ finished: false, answered: 1, total: 2 }),
        () => delayedResponse({ finished: true, result: RESULT }),
      ],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByRole('heading', { name: 'Test out: Later' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));

    expect(await screen.findByText('Question 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Right')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'ist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Passed! This milestone is complete.')).toBeInTheDocument();
    expect(screen.getByText('1.5 of 2 points')).toBeInTheDocument();
    expect(screen.getByText('Your answer: ist')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: bin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your lessons' })).toHaveAttribute('href', '/');
  });

  it('resumes an attempt at the next unanswered question', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'in_progress', answered: 1, total: 2 }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 1 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume the test' }));
    expect(await screen.findByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Ich ___ hier.')).toBeInTheDocument();
  });

  it('reloads the attempt when a question went stale', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'in_progress', answered: 0, total: 2 }))],
      [`POST ${BASE}`]: [
        () => delayedResponse({ attemptId: 1, questions: [Q1, Q2], answered: 0 }),
        () => delayedResponse({ attemptId: 1, questions: [Q2], answered: 0 }),
      ],
      [`POST ${BASE}/answer`]: [() => delayedResponse({ error: 'gone', code: 'not_found' }, { ok: false, status: 404 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume the test' }));
    fireEvent.click(await screen.findByLabelText('ja'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument();
  });

  it('explains a cooldown, a missing test-out, and a load failure', async () => {
    stub({ [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'cooldown', retryAt: '2026-09-30T10:00:00.000Z' }))] });
    const first = renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText(/You can try again after/)).toBeInTheDocument();
    first.unmount();

    stub({ [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'none' }))] });
    const second = renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByText("This test-out isn't available right now.")).toBeInTheDocument();
    second.unmount();

    stub({ [`GET ${BASE}`]: [() => delayedResponse({}, { ok: false, status: 500 })] });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the test-out. Please reload the page.');
  });

  it('disables the start button while the attempt is being created', async () => {
    stub({
      [`GET ${BASE}`]: [() => delayedResponse(STATE({ status: 'available' }))],
      [`POST ${BASE}`]: [() => delayedResponse({ attemptId: 1, questions: [Q1], answered: 0 }, { ms: 50 })],
    });
    renderWithIntl(<TestOutPage milestoneId="m2" />);
    const button = await screen.findByRole('button', { name: 'Start the test' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByText('Question 1 of 1')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/tutoring/ExerciseCard.test.tsx components/tutoring/TestOutPage.test.tsx`
Expected: FAIL. Test mode and `./TestOutPage` don't exist.

- [ ] **Step 4: Implement**

In `components/tutoring/ExerciseCard.tsx`:

(a) Export the helper: change `function taskText(` to `export function taskText(`.

(b) Add `import type { TestOutAnswerOutcome } from '@/lib/tutoring/testOutViews';`. Extend the props:

```tsx
  mode?: 'lesson' | 'practice' | 'test';
  testMilestoneId?: string;
  onTestAnswered?: (outcome: TestOutAnswerOutcome) => void;
  onTestStale?: () => void;
```

and destructure `testMilestoneId`, `onTestAnswered` and `onTestStale` in the component signature.

(c) In `submit`, choose the request by mode. Replace the `fetch(...)` call's URL and body with:

```tsx
      const test = mode === 'test';
      const url = test
        ? `/api/tutoring/milestones/${testMilestoneId}/testout/answer`
        : practice
          ? '/api/tutoring/practice/answer'
          : '/api/tutoring/attempts';
      const payload = test
        ? { exerciseId: exercise.id, answer }
        : practice
          ? { practiceExerciseId: exercise.id, answer }
          : { exerciseId: exercise.id, answer, source };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
```

Directly after `if (res.ok) {`, add:

```tsx
        if (test) {
          // Spec: no feedback during a test-out; the page moves on to the next question.
          onTestAnswered?.(data as TestOutAnswerOutcome);
          return;
        }
```

Before `const detail = errorText(data, String(res.status));`, add:

```tsx
      if (test && (res.status === 404 || res.status === 409)) {
        onTestStale?.();
        return;
      }
```

(d) The Skip condition stays `(gradingError || ((source === 'queue' || mode === 'practice') && error))`, but add `mode !== 'test' &&` at its front. A test-out has no skipping, and a 502 lets the student press Check again.

Create `components/tutoring/TestOutPage.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { TestOutAnswerOutcome, TestOutResult, TestOutRun, TestOutState } from '@/lib/tutoring/testOutViews';
import { ExerciseCard, taskText } from './ExerciseCard';

// Spec: Student UI, test-out page. One question at a time, no feedback until the end.
export function TestOutPage({ milestoneId }: { milestoneId: string }) {
  const t = useTranslations('testOut');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const errorText = useApiErrorText();
  const base = `/api/tutoring/milestones/${milestoneId}/testout`;
  const [state, setState] = useState<TestOutState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [questions, setQuestions] = useState<ExerciseView[] | null>(null);
  const [answered, setAnswered] = useState(0);
  const [result, setResult] = useState<TestOutResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadState() {
    fetch(base)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState((await res.json()) as TestOutState);
      })
      .catch(() => setLoadFailed(true));
  }

  useEffect(loadState, [base]);

  async function startOrResume() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(base, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t('genericError', { error: errorText(data, String(res.status)) }));
        setQuestions(null);
        loadState();
        return;
      }
      const run = data as TestOutRun;
      setQuestions(run.questions);
      setAnswered(run.answered);
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setStarting(false);
    }
  }

  function onAnswered(outcome: TestOutAnswerOutcome) {
    if (outcome.finished) setResult(outcome.result);
    else setAnswered(outcome.answered);
  }

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (!state) return <p>{tCommon('loading')}</p>;

  const back = <Link href="/">{t('backToTree')}</Link>;
  const heading = <h1>{t('title', { milestone: state.milestone.title })}</h1>;

  if (result) {
    return (
      <div>
        {heading}
        <p>{result.passed ? t('passed') : t('failed')}</p>
        <p>{t('score', { score: result.score, maxScore: result.maxScore })}</p>
        <ol>
          {result.review.map((item) => (
            <li key={item.exercise.id}>
              <p>{taskText(item.exercise)}</p>
              <p>{t(`result.${item.result}`)}</p>
              <p>{t('yourAnswer', { answer: item.answerText })}</p>
              {item.result !== 'correct' && item.correctAnswer && <p>{t('correctAnswer', { answer: item.correctAnswer })}</p>}
            </li>
          ))}
        </ol>
        {back}
      </div>
    );
  }

  const current = questions?.[answered];
  if (questions && current) {
    return (
      <div>
        {heading}
        <p>{t('progress', { current: answered + 1, total: questions.length })}</p>
        <ExerciseCard
          key={current.id}
          exercise={current}
          source="lesson"
          mode="test"
          testMilestoneId={milestoneId}
          onTestAnswered={onAnswered}
          onTestStale={startOrResume}
          onNext={() => undefined}
          onSkip={() => undefined}
        />
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  const s = state.status;
  return (
    <div>
      {heading}
      {(s.status === 'available' || s.status === 'in_progress') && (
        <>
          <p>{t('intro')}</p>
          <button type="button" disabled={starting} onClick={startOrResume}>
            {s.status === 'available' ? t('start') : t('resume')}
          </button>
        </>
      )}
      {s.status === 'cooldown' && (
        <p>{t('cooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
      )}
      {s.status === 'too_few_questions' && <p>{t('tooFew')}</p>}
      {s.status === 'none' && <p>{t('unavailable')}</p>}
      {error && <p role="alert">{error}</p>}
      <p>{back}</p>
    </div>
  );
}
```

Create `app/milestone/[id]/test-out/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { TestOutPage } from '@/components/tutoring/TestOutPage';

export const dynamic = 'force-dynamic';

export default async function MilestoneTestOut(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!createProfileService(getDb()).getProfile().onboardingComplete) redirect('/onboarding');
  return <TestOutPage milestoneId={params.id} />;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/tutoring messages/catalogs.test.ts`
Expected: PASS with no warnings. Every existing ExerciseCard, LessonPage, QueuePage and PracticeRun test still passes. Then `npx tsc --noEmit && npm test && npm run build`.

- [ ] **Step 6: Commit**

```bash
git add components/tutoring/ExerciseCard.tsx components/tutoring/ExerciseCard.test.tsx components/tutoring/TestOutPage.tsx components/tutoring/TestOutPage.test.tsx "app/milestone/[id]/test-out/page.tsx" messages/en.json messages/de.json
git commit -m "feat: add the milestone test-out page"
```

---

### Task 8: Content — regroup all 15 seed files into difficulty milestones

This is a content task: an implementer with judgment regroups the lessons. A validation test pins the rules, so every grouping that passes is structurally valid; the user then spot-checks the grouping itself.

**Files:**
- Create:
  - `scripts/seed-report.ts`
  - `lib/services/bundledSeedStructure.test.ts`
  - `docs/superpowers/content/2026-09-29-milestone-regrouping.md` (the review summary for the user)
- Modify: `data/curriculum-seed/*.json` (all 15)
- Delete: `scripts/convert-seeds-v2.ts` (its one-off job is done)

**Interfaces:**
- Consumes: seed format v2 (Task 2), and the scope rule `prerequisiteScopeViolations` (Task 1).
- Produces: bundled seeds at `seedVersion: "4"`, each with 3–5 ranked difficulty milestones.

- [ ] **Step 1: Write the validation test**

Create `lib/services/bundledSeedStructure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDbClient } from '../db/client';
import { prerequisiteScopeViolations } from '../tutoring/gating';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';
import { loadLevelGating } from './levelGating';

const DIR = join(process.cwd(), 'data', 'curriculum-seed');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const seeds = files.map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as SeedFile] as const);

describe('bundled curriculum seeds', () => {
  it('has all 15 track+level files at seed version 4, format 2', () => {
    expect(files).toHaveLength(15);
    for (const [, seed] of seeds) {
      expect(seed.formatVersion).toBe(2);
      expect(seed.seedVersion).toBe('4');
    }
  });

  it.each(seeds)('%s: 3–5 difficulty milestones with titles, descriptions, ids, and ranks', (_file, seed) => {
    expect(seed.milestones.length).toBeGreaterThanOrEqual(3);
    expect(seed.milestones.length).toBeLessThanOrEqual(5);
    const prefix = `${seed.track}-${seed.level.toLowerCase()}-m`;
    for (const { milestone, lessonIds } of seed.milestones) {
      expect(milestone.id.startsWith(`${prefix}${milestone.difficultyRank}-`)).toBe(true);
      expect(Number.isInteger(milestone.difficultyRank) && milestone.difficultyRank >= 1).toBe(true);
      expect(milestone.title.trim()).not.toBe('');
      expect((milestone.description ?? '').trim()).not.toBe('');
      expect(milestone.track).toBe(seed.track);
      expect(milestone.level).toBe(seed.level);
      expect(lessonIds.length).toBeGreaterThan(0);
    }
    const ranks = seed.milestones.map((m) => m.milestone.difficultyRank);
    expect(Math.min(...ranks)).toBe(1);
  });

  it.each(seeds)('%s: places every lesson exactly once', (_file, seed) => {
    const placed = seed.milestones.flatMap((m) => m.lessonIds);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(seed.lessons.map((l) => l.id).sort());
  });

  it.each(seeds)('%s: keeps every prerequisite in the same milestone or a lower rank', (_file, seed) => {
    const placement = new Map<string, { milestoneId: string; rank: number }>();
    for (const { milestone, lessonIds } of seed.milestones) {
      for (const id of lessonIds) placement.set(id, { milestoneId: milestone.id, rank: milestone.difficultyRank });
    }
    const edges = seed.prerequisites.map((p) => ({ lessonId: p.lessonId, prerequisiteId: p.prerequisiteLessonId }));
    expect(prerequisiteScopeViolations(edges, (id) => placement.get(id))).toEqual([]);
  });

  it('loads into a fresh database with the first rank open in every track+level', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, DIR);
    for (const [, seed] of seeds) {
      const gating = loadLevelGating(db, seed.track, seed.level);
      const first = gating.milestones.filter((m) => m.rank === 1);
      expect(first.length).toBeGreaterThan(0);
      for (const m of first) expect(gating.states.get(m.id)).toBe('open');
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/services/bundledSeedStructure.test.ts`
Expected: FAIL. The converted seeds are at version 3, with six skill milestones whose ids don't match `…-m{rank}-…`.

- [ ] **Step 3: Add the report script**

Create `scripts/seed-report.ts`:

```ts
// Prints each seed file's lessons with skill, prerequisite depth and prerequisites, to help
// group them by difficulty. Run: npx tsx scripts/seed-report.ts [track-level ...]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
const wanted = process.argv.slice(2);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  if (wanted.length > 0 && !wanted.includes(file.replace('.json', ''))) continue;
  const seed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const prereqs = new Map<string, string[]>();
  for (const p of seed.prerequisites) prereqs.set(p.lessonId, [...(prereqs.get(p.lessonId) ?? []), p.prerequisiteLessonId]);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (!depth.has(id)) depth.set(id, Math.max(-1, ...(prereqs.get(id) ?? []).map(depthOf)) + 1);
    return depth.get(id)!;
  };
  const rows = seed.lessons
    .map((l: { id: string; skill: string; title: string; exercises?: unknown }) => ({
      depth: depthOf(l.id),
      skill: l.skill,
      id: l.id,
      title: l.title,
      exercises: seed.exercises.filter((e: { lessonId: string }) => e.lessonId === l.id).length,
      prereqs: (prereqs.get(l.id) ?? []).join(', '),
    }))
    .sort((a: { depth: number; id: string }, b: { depth: number; id: string }) => a.depth - b.depth || a.id.localeCompare(b.id));
  console.log(`\n=== ${file} (${rows.length} lessons)`);
  console.table(rows);
}
```

Run: `npx tsx scripts/seed-report.ts`. Keep the output open while drafting.

- [ ] **Step 4: Draft the regrouping, one file at a time**

For each of the 15 files, replace its `milestones` array and set `"seedVersion": "4"`. Don't touch `lessons`, `exercises`, `prerequisites`, `conceptLinks` or `practice`.

Grouping rules, from the spec's "Content: the Regrouping Draft":
1. **Count:** 3–5 milestones per file, with ranks starting at 1. Use distinct ranks 1..n unless two groups are genuinely equally difficult and independent; equal ranks make them parallel. Use that sparingly, at most once per file.
2. **Difficulty order:**
   - Earlier ranks hold the simpler material of the level: basic structures, short texts, everyday topics, low prerequisite depth.
   - Later ranks hold more complex grammar, longer texts, and exam-format (Teil/Aufgabe) lessons.
   - Read each lesson's title and explanation; don't rely on depth alone.
3. **Prerequisite scope:** every prerequisite must be in the same milestone or a strictly lower rank. The report's depth column is the first guide: a lesson never sits in a lower rank than any of its prerequisites.
4. **Mixed skills:** a milestone mixes skills where the content allows. A milestone that is only grammar or only exam formats is fine if that's truly its difficulty band.
5. **Sizes:** roughly 3–9 lessons per milestone. No empty milestones.
6. **Ids:** `{track}-{level}-m{rank}-{slug}`, e.g. `telc-b1-m2-talking-about-the-past`. The slug comes from the English title, lowercased and hyphenated.
7. **Titles:** short, descriptive English (2–5 words), e.g. "Everyday basics", "Talking about the past", "Exam formats". **Descriptions:** one sentence saying what the milestone covers. German versions come in the Bilingual content sub-project.
8. **Milestone fields:** each milestone object is `{ "milestone": { "id", "track", "level", "title", "description", "difficultyRank" }, "lessonIds": [ … ] }`, and `lessonIds` is sorted by id.

After each file, run `npx vitest run lib/services/bundledSeedStructure.test.ts -t "<file name>"` and fix what it reports before moving on.

- [ ] **Step 5: Write the review summary**

Create `docs/superpowers/content/2026-09-29-milestone-regrouping.md`. It has one section per track+level: the milestones in rank order, each with its title, its description, and its lessons as `title (skill)`. It's for the user's spot-check, so keep it plain and scannable. It must list every lesson.

- [ ] **Step 6: Run everything**

Run: `npx vitest run lib/services/bundledSeedStructure.test.ts && npx tsc --noEmit && npm test && npm run build`
Expected: PASS.

Then check with a fresh data dir: `GAIT_DATA_DIR=$(mktemp -d) npm run dev`. After onboarding, open `/`, and the tree shows 3–5 milestones for the active track+level, with rank 1 open.

- [ ] **Step 7: Commit, one commit per track so the review can go track by track**

```bash
git rm scripts/convert-seeds-v2.ts
git add scripts/seed-report.ts lib/services/bundledSeedStructure.test.ts
git add data/curriculum-seed/generic-*.json && git commit -m "content: regroup the Generic track into difficulty milestones"
git add data/curriculum-seed/goethe-*.json && git commit -m "content: regroup the Goethe track into difficulty milestones"
git add data/curriculum-seed/telc-*.json docs/superpowers/content/2026-09-29-milestone-regrouping.md && git commit -m "content: regroup the telc track into difficulty milestones, and the review summary"
```

The script, test and deletion are staged before the first `git add` of seeds, so they go in the Generic commit. The suite is green only once all three commits land, so run `npm test` after the third.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Data model and migration: Task 2.
  - Rules: Task 1, wired in by Task 4.
  - Server enforcement and error codes: Task 4.
  - Tree data: Task 6.
  - Test-out rules and routes: Tasks 1 and 5.
  - Seed v2, loader and export: Task 2.
  - Admin: Tasks 2 and 3.
  - Student UI: tree (Task 6), test-out page (Task 7), lesson locked view (Task 4).
  - Content draft: Task 8.
  - Error handling and testing: in each task.
- **One interpretation fixed here and in the spec:** "fewer than 5 gradable exercises" means the **draw** would have fewer than 5 questions (Task 5). The German test-out wording is "Test zum Überspringen", not "Einstufungstest", which is the placement test.
