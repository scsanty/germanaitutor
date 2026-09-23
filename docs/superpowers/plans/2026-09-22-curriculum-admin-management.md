# Curriculum Admin Management (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin full CRUD over the curriculum (lessons, milestones, sections) with automatic prerequisite-dependency repair on delete, cross-track concept linking, and a read-only dependency diagram — replacing the now-retired YAML import path as the permanent, DB-authoritative way curriculum content is authored.

**Architecture:** New pure-logic modules under `lib/curriculum-admin/` (cycle detection, dependency repair, exercise reconciliation, placement resolution, the Unsorted bucket, diagram layout) are composed by three new write-capable services under `lib/services/` (lesson CRUD, milestone/section structure, concept links), exposed through new `/api/admin/curriculum/*` routes (gated by the existing `requireAdminSession()`/`isAdminSessionValid()` pattern), and surfaced by extending the existing (currently browse-only) `/admin/curriculum` UI with editing, a delete wizard, structure management, and a diagram tab.

**Tech Stack:** Same as the rest of the app — Next.js 14.2 App Router, TypeScript, better-sqlite3, Vitest + Testing Library. No new runtime dependencies (the dependency diagram is hand-rolled SVG).

**Spec:** `docs/superpowers/specs/2026-09-22-curriculum-admin-management-design.md`

## Global Constraints

- All DB access happens server-side only; the frontend never touches the DB directly (existing project-wide rule).
- Every new `/api/admin/curriculum/*` route is gated by `isAdminSessionValid()` from `lib/auth/adminSession.ts`, returning `401` with `{ error: string }` when not authenticated — same pattern as existing `/admin/*` pages, adapted from redirect (pages) to a JSON 401 (API routes).
- Every new DB-touching route/page includes `export const dynamic = 'force-dynamic'` (existing project rule, avoids the `next build` static-generation SQLite concurrency bug documented in the CEFR frameworks plan).
- The `lessons.id` is immutable after creation; `track`/`source_level` are editable but rejected by the API while the lesson has any prerequisite edges (as dependent or predecessor) or any concept-links.
- Exercises have no order within a lesson. Ids are minted once (non-positional, random suffix) and never recomputed; editing content in place keeps the id.
- Any schema change to a curriculum table in this plan must be **data-preserving** (in-place `ALTER`, or rebuild-with-copy) — never drop-and-recreate-empty. See spec "Migration Note."
- The dependency-repair, cycle-detection, and exercise-reconciliation logic are pure enough to unit-test directly against an in-memory DB without going through HTTP — write them that way.
- Concept-links only ever connect two different tracks at the same level; same-track or cross-level pairs are rejected server-side.
- "Unsorted" (one per track+level, id `{track}-{level}-unsorted`) is never a selectable Add-lesson destination, never appears in milestone reorder, and always renders last.

---

### Task 1: Schema migration — drop `lessons.concept_id`, add `lesson_placements` uniqueness, add `lesson_concept_links`

**Files:**
- Modify: `lib/db/schema.ts`
- Test: `lib/db/curriculumSchema.test.ts`

**Interfaces:**
- Produces: `lesson_concept_links` table (`id`, `lesson_a_id`, `lesson_b_id`, `created_at`), `lesson_placements.lesson_id` now `UNIQUE`, `lessons` table no longer has a `concept_id` column.

This task also **removes now-obsolete tests** in `curriculumSchema.test.ts` that assert `lessons.concept_id` behavior (added in the prior spec cycle, before this plan replaces it with `lesson_concept_links`).

- [ ] **Step 1: Remove the obsolete `concept_id` tests**

Open `lib/db/curriculumSchema.test.ts` and delete these two `it` blocks entirely (they assert behavior of the column this task removes):
- `'allows lessons in different tracks to share a concept_id'`
- `'defaults concept_id to null for a lesson with no cross-track equivalent'`

Also change the still-relevant `'allows a lesson to be inserted without explanation/examples (Phase 1 state)'` test's INSERT statement — it currently doesn't reference `concept_id` so it needs no change. Leave `'creates all nine new tables'` and `'requires a track on every lesson'` as-is.

- [ ] **Step 2: Write the failing tests for the new schema**

Append to `lib/db/curriculumSchema.test.ts`:

```ts
describe('lesson_concept_links', () => {
  it('creates the table with the expected columns', () => {
    const db = createDbClient(':memory:');
    const columns = db.prepare('PRAGMA table_info(lesson_concept_links)').all() as { name: string }[];
    const names = columns.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'lesson_a_id', 'lesson_b_id', 'created_at']));
    db.close();
  });

  it('drops lessons.concept_id entirely', () => {
    const db = createDbClient(':memory:');
    const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'concept_id')).toBe(false);
    db.close();
  });

  it('rejects a link where lesson_a_id is not less than lesson_b_id', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    expect(() =>
      db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-b', 'a1-a')
    ).toThrow();
    db.close();
  });

  it('rejects a duplicate pair', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b');
    expect(() =>
      db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b')
    ).toThrow();
    db.close();
  });

  it('cascade-deletes a link row when either linked lesson is deleted', () => {
    const db = createDbClient(':memory:');
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', 'L')`).run(
      'a1-a'
    );
    db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'telc', 'A1', 'grammar', 'L')`).run(
      'a1-b'
    );
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run('a1-a', 'a1-b');
    db.prepare('DELETE FROM lessons WHERE id = ?').run('a1-a');
    const remaining = db.prepare('SELECT count(*) as c FROM lesson_concept_links').get() as { c: number };
    expect(remaining.c).toBe(0);
    db.close();
  });
});

describe('lesson_placements uniqueness', () => {
  it('rejects a second placement for the same lesson', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm1', 'S2', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
    `);
    expect(() =>
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run('l1', 's2', 0)
    ).toThrow();
    db.close();
  });
});

describe('legacy schema migration to this plan’s shape', () => {
  it('drops concept_id and adds the placements uniqueness constraint without losing existing rows', () => {
    const db = createDbClient(':memory:');
    // Simulate a DB frozen at the pre-this-plan shape (concept_id column present,
    // lesson_placements uniqueness only on the (lesson_id, section_id) pair), then
    // re-run migrations and confirm both the shape and the data come out right.
    db.exec(`
      ALTER TABLE lessons ADD COLUMN concept_id TEXT;
      DROP TABLE lesson_placements;
      CREATE TABLE lesson_placements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(lesson_id, section_id)
      );
    `);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
    `);

    runMigrations(db);

    const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'concept_id')).toBe(false);

    const placement = db.prepare('SELECT lesson_id, section_id FROM lesson_placements WHERE lesson_id = ?').get('l1') as {
      lesson_id: string;
      section_id: string;
    };
    expect(placement.section_id).toBe('s1');

    expect(() =>
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run('l1', 's1', 1)
    ).toThrow();

    db.close();
  });
});
```

This test file needs `runMigrations` imported — check the top of `lib/db/curriculumSchema.test.ts`; if it only imports `createDbClient`, add:

```ts
import { runMigrations } from './schema';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/db/curriculumSchema.test.ts`
Expected: FAIL — `lesson_concept_links` table doesn't exist yet, `concept_id` column still present, no uniqueness constraint on `lesson_placements.lesson_id`.

- [ ] **Step 3: Implement the migration**

In `lib/db/schema.ts`, add a new migration function above `runMigrations`, and call it inside the existing transaction:

```ts
/**
 * Removes the `lessons.concept_id` column (replaced by `lesson_concept_links` — see
 * docs/superpowers/specs/2026-09-22-curriculum-admin-management-design.md) and adds a
 * UNIQUE constraint on `lesson_placements.lesson_id` (a lesson now belongs to exactly one
 * section). Both changes are data-preserving: the column drop is a plain in-place
 * `ALTER TABLE`, and the placements table is rebuilt via the standard SQLite
 * create-copy-drop-rename pattern rather than dropped and recreated empty — curriculum
 * tables hold irreplaceable admin-authored content now, not YAML-re-importable content.
 */
function migrateConceptIdAndPlacementUniqueness(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
  const hasConceptIdColumn = columns.some((c) => c.name === 'concept_id');
  if (!hasConceptIdColumn) return;

  db.exec(`
    DROP INDEX IF EXISTS idx_lessons_concept_id;
    ALTER TABLE lessons DROP COLUMN concept_id;

    CREATE TABLE lesson_placements_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id)
    );
    INSERT INTO lesson_placements_new (id, lesson_id, section_id, order_index, created_at)
      SELECT id, lesson_id, section_id, order_index, created_at FROM lesson_placements;
    DROP TABLE lesson_placements;
    ALTER TABLE lesson_placements_new RENAME TO lesson_placements;
  `);
}
```

Update `runMigrations` to call it inside the existing transaction, alongside the legacy one:

```ts
export function runMigrations(db: Database.Database): void {
  // Wrapped in one transaction so a concurrent connection (e.g. a parallel `next build`
  // static-page-data worker also calling getDb()) never observes the mid-migration state
  // where the legacy curriculum tables have been dropped but not yet recreated.
  const migrate = db.transaction(() => {
    migrateLegacyCurriculumSchema(db);
    createTablesIfMissing(db);
    migrateConceptIdAndPlacementUniqueness(db);
  });
  migrate();
}
```

`migrateConceptIdAndPlacementUniqueness` runs *after* `createTablesIfMissing` so it always sees a `lessons`/`lesson_placements` table that exists (either freshly created this call, or pre-existing from a prior run).

Remove `concept_id TEXT,` and `CREATE INDEX IF NOT EXISTS idx_lessons_concept_id ON lessons(concept_id);` from the `lessons` table definition inside `createTablesIfMissing`'s `db.exec` block (a *freshly created* `lessons` table should never have had the column in the first place — only pre-existing DBs need the migration function above to remove it).

Change the `lesson_placements` table definition inside `createTablesIfMissing` to include the new constraint directly (so a brand-new DB gets it immediately, without needing the migration path):

```sql
    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id)
    );
```

Add the new table, after `lesson_prerequisites` in the same `db.exec` block:

```sql
    CREATE TABLE IF NOT EXISTS lesson_concept_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_a_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      lesson_b_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_a_id, lesson_b_id),
      CHECK (lesson_a_id < lesson_b_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_concept_links_a ON lesson_concept_links(lesson_a_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_concept_links_b ON lesson_concept_links(lesson_b_id);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/db/curriculumSchema.test.ts`
Expected: PASS (all tests, including the two now-removed obsolete ones being gone).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS. If `lib/services/curriculumService.test.ts` or `lib/services/curriculumSeedLoader.test.ts` reference `concept_id`/`conceptId`, they'll fail here — that's Task 2's job to fix, not this one's; if this step fails only on those two files for that reason, proceed to Task 2 without trying to fix it in this task.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/curriculumSchema.test.ts
git commit -m "feat: drop lessons.concept_id, add lesson_placements uniqueness, add lesson_concept_links"
```

---

### Task 2: Update types and the read-only service for the schema change

**Files:**
- Modify: `lib/curriculum/types.ts`
- Modify: `lib/services/curriculumService.ts`
- Modify: `lib/services/curriculumService.test.ts`
- Modify: `lib/services/curriculumSeedLoader.ts`
- Modify: `lib/services/curriculumSeedLoader.test.ts`

**Interfaces:**
- Produces: `Lesson` (no `conceptId` field), `LessonConceptLink { lessonAId: string; lessonBId: string; createdAt: string }` — both exported from `lib/curriculum/types.ts`, used by every later task in this plan that touches a lesson or a concept-link.

- [ ] **Step 1: Update `Lesson` and add `LessonConceptLink` in types.ts**

In `lib/curriculum/types.ts`, remove the `conceptId` field and its doc comment from `Lesson`:

```ts
export interface Lesson {
  id: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  createdAt: string;
}
```

Add, after `LessonPrerequisite` at the end of the file:

```ts
export interface LessonConceptLink {
  lessonAId: string;
  lessonBId: string;
  createdAt: string;
}
```

- [ ] **Step 2: Fix `curriculumService.ts` for the dropped column**

In `lib/services/curriculumService.ts`, remove `concept_id: string | null;` from `LessonRow` and `conceptId: row.concept_id,` from `rowToLesson`.

- [ ] **Step 3: Fix the now-broken test in `curriculumService.test.ts`**

Remove the `'exposes a shared concept_id when the lesson has a cross-track equivalent'` test (it sets `lessons.concept_id`, which no longer exists) from `lib/services/curriculumService.test.ts`. Also remove `expect(lesson?.conceptId).toBeNull();` from the `'returns a lesson with its own track and concept_id'` test and rename that test to `'returns a lesson with its own track'`.

- [ ] **Step 4: Fix the seed loader for the dropped column**

In `lib/services/curriculumSeedLoader.ts`, the `SeedFile['lessons']` entries and the `upsertLesson` prepared statement currently include `conceptId`/`concept_id`. Remove `conceptId: string | null;` from the `lessons` array's type in the `SeedFile` interface, and change:

```ts
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, track, concept_id, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       concept_id = excluded.concept_id, title = excluded.title,
       explanation = excluded.explanation, examples = excluded.examples`
  );
```

to:

```ts
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, explanation = excluded.explanation, examples = excluded.examples`
  );
```

and the `upsertLesson.run(...)` call (inside the `for (const lesson of seed.lessons)` loop) from:

```ts
    upsertLesson.run(
      lesson.id,
      lesson.track,
      lesson.conceptId,
      lesson.sourceLevel,
      lesson.skill,
      lesson.title,
      lesson.explanation,
      lesson.examples ? JSON.stringify(lesson.examples) : null
    );
```

to:

```ts
    upsertLesson.run(
      lesson.id,
      lesson.track,
      lesson.sourceLevel,
      lesson.skill,
      lesson.title,
      lesson.explanation,
      lesson.examples ? JSON.stringify(lesson.examples) : null
    );
```

- [ ] **Step 5: Fix the now-broken tests in `curriculumSeedLoader.test.ts`**

`lib/services/curriculumSeedLoader.test.ts`'s `writeSeedFile` helper and its lesson fixtures include `conceptId`. Remove `conceptId: string | null;` from the helper's type signature and every `conceptId: ...` field from its default lessons array and the two tests that override `lessons` (`'loads lessons from different tracks independently...'` and `'links lessons across tracks that share a concept_id'`). The second of those two tests is specifically about `concept_id` grouping behavior that no longer exists — delete it entirely rather than trying to adapt it (Task 8 adds its replacement, testing `lesson_concept_links` directly at the service level instead of through the seed loader).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: succeeds (confirms no other file references the removed `conceptId`/`concept_id`).

- [ ] **Step 8: Commit**

```bash
git add lib/curriculum/types.ts lib/services/curriculumService.ts lib/services/curriculumService.test.ts lib/services/curriculumSeedLoader.ts lib/services/curriculumSeedLoader.test.ts
git commit -m "refactor: remove concept_id from types and read-only services"
```

---

### Task 3: Cycle detection

**Files:**
- Create: `lib/curriculum-admin/cycleDetection.ts`
- Test: `lib/curriculum-admin/cycleDetection.test.ts`

**Interfaces:**
- Produces: `wouldCreateCycle(db: Database.Database, lessonId: string, newPrerequisiteId: string): boolean` — true if adding the edge "`lessonId` requires `newPrerequisiteId`" would create a cycle in `lesson_prerequisites`. Used by Task 9 (create) and Task 10 (update) whenever a prerequisite edge is added.

- [ ] **Step 1: Write the failing tests**

Create `lib/curriculum-admin/cycleDetection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { wouldCreateCycle } from './cycleDetection';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
}

function addPrereq(db: ReturnType<typeof createDbClient>, lessonId: string, prerequisiteId: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
    lessonId,
    prerequisiteId
  );
}

describe('wouldCreateCycle', () => {
  it('detects a direct 2-cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a'); // b requires a
    expect(wouldCreateCycle(db, 'a', 'b')).toBe(true); // adding "a requires b" would close the loop
  });

  it('detects a transitive 3-cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a'); // b requires a
    addPrereq(db, 'c', 'b'); // c requires b
    expect(wouldCreateCycle(db, 'a', 'c')).toBe(true); // "a requires c" would close a-c-b-a
  });

  it('allows a lesson to require two unrelated lessons', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'd');
    addPrereq(db, 'b', 'a'); // b requires a
    expect(wouldCreateCycle(db, 'b', 'd')).toBe(false); // b also requiring d is unrelated to a
  });

  it('treats a lesson requiring itself as a cycle', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    expect(wouldCreateCycle(db, 'a', 'a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/curriculum-admin/cycleDetection.test.ts`
Expected: FAIL — `./cycleDetection` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `lib/curriculum-admin/cycleDetection.ts`:

```ts
import type Database from 'better-sqlite3';

/**
 * True if adding the edge "lessonId requires newPrerequisiteId" to lesson_prerequisites
 * would create a cycle — i.e. newPrerequisiteId can already (directly or transitively)
 * reach lessonId by following existing "requires" edges forward.
 */
export function wouldCreateCycle(db: Database.Database, lessonId: string, newPrerequisiteId: string): boolean {
  if (lessonId === newPrerequisiteId) return true;

  const visited = new Set<string>();
  const stack = [newPrerequisiteId];
  const getPrereqs = db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?');

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === lessonId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = getPrereqs.all(current) as { prerequisite_lesson_id: string }[];
    for (const row of rows) stack.push(row.prerequisite_lesson_id);
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/curriculum-admin/cycleDetection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum-admin/cycleDetection.ts lib/curriculum-admin/cycleDetection.test.ts
git commit -m "feat: add prerequisite cycle detection"
```

---

### Task 4: The "Unsorted" bucket, and pinning it last in track structure queries

**Files:**
- Create: `lib/curriculum-admin/unsortedBucket.ts`
- Modify: `lib/services/curriculumService.ts`
- Test: `lib/curriculum-admin/unsortedBucket.test.ts`
- Test: `lib/services/curriculumService.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `ensureUnsortedExists(db: Database.Database, track: Track, level: CefrLevel): { milestoneId: string; sectionId: string }`. Used by Task 12 (milestone/section delete relocation) and called from `getTrackStructure` so it's always present when a track+level's structure is fetched.

- [ ] **Step 1: Write the failing tests for the helper**

Create `lib/curriculum-admin/unsortedBucket.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ensureUnsortedExists } from './unsortedBucket';

describe('ensureUnsortedExists', () => {
  it('creates the milestone and section on first call', () => {
    const db = createDbClient(':memory:');
    const result = ensureUnsortedExists(db, 'generic', 'A1');
    expect(result.milestoneId).toBe('generic-a1-unsorted');
    const milestone = db.prepare('SELECT title FROM milestones WHERE id = ?').get(result.milestoneId) as {
      title: string;
    };
    expect(milestone.title).toBe('Unsorted');
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(result.sectionId) as {
      milestone_id: string;
    };
    expect(section.milestone_id).toBe(result.milestoneId);
  });

  it('is idempotent — a second call does not create duplicates', () => {
    const db = createDbClient(':memory:');
    ensureUnsortedExists(db, 'generic', 'A1');
    ensureUnsortedExists(db, 'generic', 'A1');
    const count = db.prepare('SELECT count(*) as c FROM milestones WHERE id = ?').get('generic-a1-unsorted') as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it('creates independent buckets per track+level', () => {
    const db = createDbClient(':memory:');
    const a = ensureUnsortedExists(db, 'generic', 'A1');
    const b = ensureUnsortedExists(db, 'telc', 'B1');
    expect(a.milestoneId).not.toBe(b.milestoneId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/curriculum-admin/unsortedBucket.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `lib/curriculum-admin/unsortedBucket.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

export function unsortedMilestoneId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}-unsorted`;
}

/**
 * Ensures the reserved, non-deletable "Unsorted" milestone+section exist for this
 * track+level — the safety bucket lessons are relocated to when their milestone/section
 * is deleted. Idempotent; safe to call on every structure load (see getTrackStructure).
 */
export function ensureUnsortedExists(
  db: Database.Database,
  track: Track,
  level: CefrLevel
): { milestoneId: string; sectionId: string } {
  const milestoneId = unsortedMilestoneId(track, level);
  const sectionId = `${milestoneId}-section`;

  const existing = db.prepare('SELECT id FROM milestones WHERE id = ?').get(milestoneId);
  if (!existing) {
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, NULL, 0)'
    ).run(milestoneId, track, level, 'Unsorted');
    db.prepare(
      'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, NULL, 0)'
    ).run(sectionId, milestoneId, 'Unsorted');
  }
  return { milestoneId, sectionId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/curriculum-admin/unsortedBucket.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for pinning Unsorted last in `getTrackStructure`**

Add to `lib/services/curriculumService.test.ts`:

```ts
it('ensures Unsorted exists and always sorts it last, regardless of order_index', () => {
  const db = createDbClient(':memory:');
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-late', 'generic', 'A1', 'Late', 99);
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-early', 'generic', 'A1', 'Early', 0);
  `);
  const service = createCurriculumService(db);
  const structure = service.getTrackStructure('generic', 'A1');
  const titles = structure.map((s) => s.milestone.title);
  expect(titles).toEqual(['Early', 'Late', 'Unsorted']);
});
```

Add the import this test needs at the top of the file if not already present: `import { createDbClient } from '../db/client';` (already present per Task 1/2's existing test file).

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run lib/services/curriculumService.test.ts`
Expected: FAIL — `getTrackStructure` doesn't create or pin Unsorted yet.

- [ ] **Step 7: Wire `ensureUnsortedExists` into `getTrackStructure`**

In `lib/services/curriculumService.ts`, add the import:

```ts
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
```

Change `getTrackStructure` from:

```ts
  function getTrackStructure(
    track: Track,
    level: CefrLevel
  ): { milestone: Milestone; sections: { section: Section; lessons: Lesson[] }[] }[] {
    const milestoneRows = db
      .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY order_index')
      .all(track, level) as MilestoneRow[];
```

to:

```ts
  function getTrackStructure(
    track: Track,
    level: CefrLevel
  ): { milestone: Milestone; sections: { section: Section; lessons: Lesson[] }[] }[] {
    ensureUnsortedExists(db, track, level);
    const unsortedId = unsortedMilestoneId(track, level);
    const milestoneRows = db
      .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY (id = ?) ASC, order_index ASC')
      .all(track, level, unsortedId) as MilestoneRow[];
```

(`(id = ?)` evaluates to `0`/`1` in SQLite, so every non-Unsorted row sorts before the Unsorted row regardless of its `order_index` value.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/services/curriculumService.test.ts lib/curriculum-admin/unsortedBucket.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (check that no existing test asserted an exact milestone count/order that this change now invalidates — if `'returns a track structure with nested sections and lessons'` in `curriculumService.test.ts` asserts `structure` has length 1, it will now be length 2 since Unsorted is always added; update that assertion to `toHaveLength(2)` and adjust the index it reads from `structure[0]` if needed — the seeded "Basics" milestone still sorts first since Unsorted always sorts last).

- [ ] **Step 10: Commit**

```bash
git add lib/curriculum-admin/unsortedBucket.ts lib/curriculum-admin/unsortedBucket.test.ts lib/services/curriculumService.ts lib/services/curriculumService.test.ts
git commit -m "feat: add the Unsorted safety bucket, pinned last in track structure"
```

---

### Task 5: Placement resolver

**Files:**
- Create: `lib/curriculum-admin/randomId.ts`
- Create: `lib/curriculum-admin/placementResolver.ts`
- Test: `lib/curriculum-admin/placementResolver.test.ts`

**Interfaces:**
- Produces: `randomSuffix(length?: number): string` (shared by this task and Task 6). `PlacementInput = {sectionId: string} | {milestoneId: string; newSectionTitle: string} | {newMilestoneTitle: string; newSectionTitle: string}` and `resolvePlacement(db: Database.Database, track: Track, level: CefrLevel, input: PlacementInput): string` (returns the resolved `sectionId`, creating milestone/section rows as needed). Used by Task 9 (create) and Task 10 (update).

- [ ] **Step 1: Write the failing test for `randomSuffix`**

Create `lib/curriculum-admin/randomId.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { randomSuffix } from './randomId';

describe('randomSuffix', () => {
  it('returns a 6-character hex string by default', () => {
    expect(randomSuffix()).toMatch(/^[0-9a-f]{6}$/);
  });

  it('produces different values on successive calls', () => {
    expect(randomSuffix()).not.toBe(randomSuffix());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/curriculum-admin/randomId.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `randomSuffix`**

Create `lib/curriculum-admin/randomId.ts`:

```ts
import { randomBytes } from 'node:crypto';

export function randomSuffix(length = 6): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/curriculum-admin/randomId.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the placement resolver**

Create `lib/curriculum-admin/placementResolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { resolvePlacement } from './placementResolver';

describe('resolvePlacement', () => {
  it('returns the given sectionId unchanged when it exists', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
    `);
    const result = resolvePlacement(db, 'generic', 'A1', { sectionId: 's1' });
    expect(result).toBe('s1');
  });

  it('throws when the given sectionId does not exist', () => {
    const db = createDbClient(':memory:');
    expect(() => resolvePlacement(db, 'generic', 'A1', { sectionId: 'nope' })).toThrow();
  });

  it('creates a new section under an existing milestone', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);`);
    const sectionId = resolvePlacement(db, 'generic', 'A1', { milestoneId: 'm1', newSectionTitle: 'New Section' });
    const section = db.prepare('SELECT milestone_id, title FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
      title: string;
    };
    expect(section.milestone_id).toBe('m1');
    expect(section.title).toBe('New Section');
  });

  it('throws when the given milestoneId does not exist', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      resolvePlacement(db, 'generic', 'A1', { milestoneId: 'nope', newSectionTitle: 'X' })
    ).toThrow();
  });

  it('creates a brand-new milestone and its first section', () => {
    const db = createDbClient(':memory:');
    const sectionId = resolvePlacement(db, 'generic', 'A1', {
      newMilestoneTitle: 'New Milestone',
      newSectionTitle: 'First Section',
    });
    const section = db.prepare('SELECT milestone_id, title FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
      title: string;
    };
    expect(section.title).toBe('First Section');
    const milestone = db.prepare('SELECT track, level, title FROM milestones WHERE id = ?').get(
      section.milestone_id
    ) as { track: string; level: string; title: string };
    expect(milestone).toEqual({ track: 'generic', level: 'A1', title: 'New Milestone' });
  });

  it('appends new milestones after existing ones by order_index', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 5);`);
    const sectionId = resolvePlacement(db, 'generic', 'A1', {
      newMilestoneTitle: 'New',
      newSectionTitle: 'S',
    });
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(sectionId) as {
      milestone_id: string;
    };
    const milestone = db.prepare('SELECT order_index FROM milestones WHERE id = ?').get(section.milestone_id) as {
      order_index: number;
    };
    expect(milestone.order_index).toBe(6);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run lib/curriculum-admin/placementResolver.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement the placement resolver**

Create `lib/curriculum-admin/placementResolver.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { randomSuffix } from './randomId';

export type PlacementInput =
  | { sectionId: string }
  | { milestoneId: string; newSectionTitle: string }
  | { newMilestoneTitle: string; newSectionTitle: string };

/**
 * Resolves an Add/Edit form's placement choice into a concrete sectionId, creating a new
 * milestone and/or section inline if requested. Caller is expected to run this inside the
 * same transaction as the lesson write it's for, so a failure elsewhere in that write
 * rolls back any milestone/section this created too (see Task 9).
 */
export function resolvePlacement(db: Database.Database, track: Track, level: CefrLevel, input: PlacementInput): string {
  if ('sectionId' in input) {
    const section = db.prepare('SELECT id FROM sections WHERE id = ?').get(input.sectionId);
    if (!section) throw new Error(`Section not found: ${input.sectionId}`);
    return input.sectionId;
  }

  let milestoneId: string;
  if ('milestoneId' in input) {
    const milestone = db.prepare('SELECT id FROM milestones WHERE id = ?').get(input.milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${input.milestoneId}`);
    milestoneId = input.milestoneId;
  } else {
    milestoneId = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM milestones WHERE track = ? AND level = ?')
      .get(track, level) as { m: number };
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, NULL, ?)'
    ).run(milestoneId, track, level, input.newMilestoneTitle, maxOrder.m + 1);
  }

  const sectionId = `${milestoneId}-${randomSuffix()}`;
  const maxSectionOrder = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM sections WHERE milestone_id = ?')
    .get(milestoneId) as { m: number };
  db.prepare(
    'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, NULL, ?)'
  ).run(sectionId, milestoneId, input.newSectionTitle, maxSectionOrder.m + 1);
  return sectionId;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/curriculum-admin/placementResolver.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/curriculum-admin/randomId.ts lib/curriculum-admin/randomId.test.ts lib/curriculum-admin/placementResolver.ts lib/curriculum-admin/placementResolver.test.ts
git commit -m "feat: add random id helper and the three-shape placement resolver"
```

---

### Task 6: Exercise reconciliation

**Files:**
- Create: `lib/curriculum-admin/exerciseReconciliation.ts`
- Test: `lib/curriculum-admin/exerciseReconciliation.test.ts`

**Interfaces:**
- Consumes: `randomSuffix` from Task 5's `lib/curriculum-admin/randomId.ts`.
- Produces: `ExerciseInput = { id?: string; type: ExerciseType; content: ExerciseContent; track?: Track | null }` and `reconcileExercises(db: Database.Database, lessonId: string, incoming: ExerciseInput[]): void`. Used by Task 9 (create) and Task 10 (update) as the single entry point for an Add/Edit form's exercise list — entries with an `id` are updated in place, entries without one are created with a freshly minted non-positional id, and any existing exercise not present in `incoming` is deleted. No ordering is read, stored, or implied.

- [ ] **Step 1: Write the failing tests**

Create `lib/curriculum-admin/exerciseReconciliation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { reconcileExercises } from './exerciseReconciliation';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
}

describe('reconcileExercises', () => {
  it('creates new exercises with minted, non-positional ids', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [
      { type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Katze', back: 'cat' } },
    ]);
    const rows = db.prepare('SELECT id, content FROM exercises WHERE lesson_id = ?').all('l1') as {
      id: string;
      content: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.every((r) => r.id.startsWith('l1__ex-'))).toBe(true);
  });

  it('updates an existing exercise in place, keeping its id', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [{ type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);
    const [existing] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [{ id: existing.id, type: 'flashcard', content: { front: 'Hund', back: 'DOG' } }]);

    const rows = db.prepare('SELECT id, content FROM exercises WHERE lesson_id = ?').all('l1') as {
      id: string;
      content: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existing.id);
    expect(JSON.parse(rows[0].content)).toEqual({ front: 'Hund', back: 'DOG' });
  });

  it('deletes an exercise omitted from the incoming list, leaving others untouched', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [
      { type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Katze', back: 'cat' } },
    ]);
    const [keep, drop] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [{ id: keep.id, type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];
    expect(rows).toEqual([{ id: keep.id }]);
    const dropped = db.prepare('SELECT id FROM exercises WHERE id = ?').get(drop.id);
    expect(dropped).toBeUndefined();
  });

  it('adds a new exercise alongside an unrelated update in the same call', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    reconcileExercises(db, 'l1', [{ type: 'flashcard', content: { front: 'Hund', back: 'dog' } }]);
    const [existing] = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];

    reconcileExercises(db, 'l1', [
      { id: existing.id, type: 'flashcard', content: { front: 'Hund', back: 'dog' } },
      { type: 'flashcard', content: { front: 'Maus', back: 'mouse' } },
    ]);

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('l1') as { id: string }[];
    expect(rows).toHaveLength(2);
  });

  it('throws when an incoming id does not belong to this lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'l1');
    expect(() =>
      reconcileExercises(db, 'l1', [{ id: 'nope', type: 'flashcard', content: { front: 'a', back: 'b' } }])
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/curriculum-admin/exerciseReconciliation.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/curriculum-admin/exerciseReconciliation.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, ExerciseType, ExerciseContent } from '../curriculum/types';
import { randomSuffix } from './randomId';

export interface ExerciseInput {
  id?: string;
  type: ExerciseType;
  content: ExerciseContent;
  track?: Track | null;
}

/**
 * Applies an Add/Edit form's full exercise list in one call: entries with an id are
 * updated in place (id preserved), entries without one are created with a freshly minted
 * id, and any existing exercise not present in `incoming` is deleted. Exercises have no
 * order, so nothing here reads or derives a position.
 */
export function reconcileExercises(db: Database.Database, lessonId: string, incoming: ExerciseInput[]): void {
  const existingIds = new Set(
    (db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all(lessonId) as { id: string }[]).map((r) => r.id)
  );
  const keepIds = new Set<string>();

  const update = db.prepare('UPDATE exercises SET type = ?, content = ?, track = ? WHERE id = ?');
  const insert = db.prepare('INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)');

  for (const ex of incoming) {
    if (ex.id) {
      if (!existingIds.has(ex.id)) throw new Error(`Exercise not found on lesson ${lessonId}: ${ex.id}`);
      update.run(ex.type, JSON.stringify(ex.content), ex.track ?? null, ex.id);
      keepIds.add(ex.id);
    } else {
      const id = `${lessonId}__ex-${randomSuffix()}`;
      insert.run(id, lessonId, ex.track ?? null, ex.type, JSON.stringify(ex.content));
      keepIds.add(id);
    }
  }

  const drop = db.prepare('DELETE FROM exercises WHERE id = ?');
  for (const id of existingIds) {
    if (!keepIds.has(id)) drop.run(id);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/curriculum-admin/exerciseReconciliation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum-admin/exerciseReconciliation.ts lib/curriculum-admin/exerciseReconciliation.test.ts
git commit -m "feat: add non-positional exercise list reconciliation"
```

---

### Task 7: Dependency repair algorithm (single-lesson delete)

**Files:**
- Create: `lib/curriculum-admin/dependencyRepair.ts`
- Test: `lib/curriculum-admin/dependencyRepair.test.ts`

**Interfaces:**
- Produces: `RepairEdge = { lessonId: string; prerequisiteLessonId: string }`, `RepairPreview = { edgesToAdd: RepairEdge[]; edgesToRemove: RepairEdge[] }`, `computeRepairPreview(db: Database.Database, lessonId: string): RepairPreview` (read-only), and `applyRepairAndDelete(db: Database.Database, lessonId: string): void` (recomputes the preview against live state, applies the edge changes, then deletes the `lessons` row itself — placement/exercises/concept-links follow via existing `ON DELETE CASCADE`). Used by Task 11's delete-preview endpoint (calls `computeRepairPreview` per wizard step) and batch-delete endpoint (calls `applyRepairAndDelete` once per accepted lesson, in id order, inside one enclosing transaction — recomputing per lesson is what makes multi-lesson batches self-correcting, per spec "Dependency Repair Algorithm").

- [ ] **Step 1: Write the failing tests**

Create `lib/curriculum-admin/dependencyRepair.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { computeRepairPreview, applyRepairAndDelete } from './dependencyRepair';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
}

function addPrereq(db: ReturnType<typeof createDbClient>, lessonId: string, prerequisiteId: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
    lessonId,
    prerequisiteId
  );
}

function edges(db: ReturnType<typeof createDbClient>) {
  return (
    db.prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites ORDER BY lesson_id, prerequisite_lesson_id').all() as {
      lesson_id: string;
      prerequisite_lesson_id: string;
    }[]
  ).map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
}

describe('computeRepairPreview', () => {
  it('is read-only — does not mutate the graph', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    const before = edges(db);
    computeRepairPreview(db, 'b');
    expect(edges(db)).toEqual(before);
  });

  it('with no dependents, only removes B\'s own prerequisite edges', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]);
    expect(preview.edgesToRemove).toEqual([{ lessonId: 'b', prerequisiteLessonId: 'a' }]);
  });

  it('with no prerequisites, dependents just lose the edge to B, nothing to reconnect', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'c', 'b');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]);
    expect(preview.edgesToRemove).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'b' }]);
  });

  it('fans out every prerequisite to every dependent', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a1');
    insertLesson(db, 'a2');
    insertLesson(db, 'b');
    insertLesson(db, 'c1');
    insertLesson(db, 'c2');
    addPrereq(db, 'b', 'a1');
    addPrereq(db, 'b', 'a2');
    addPrereq(db, 'c1', 'b');
    addPrereq(db, 'c2', 'b');
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd.sort((x, y) => (x.lessonId + x.prerequisiteLessonId).localeCompare(y.lessonId + y.prerequisiteLessonId))).toEqual(
      [
        { lessonId: 'c1', prerequisiteLessonId: 'a1' },
        { lessonId: 'c1', prerequisiteLessonId: 'a2' },
        { lessonId: 'c2', prerequisiteLessonId: 'a1' },
        { lessonId: 'c2', prerequisiteLessonId: 'a2' },
      ].sort((x, y) => (x.lessonId + x.prerequisiteLessonId).localeCompare(y.lessonId + y.prerequisiteLessonId))
    );
    expect(preview.edgesToRemove.sort((x, y) => x.lessonId.localeCompare(y.lessonId))).toEqual(
      [
        { lessonId: 'b', prerequisiteLessonId: 'a1' },
        { lessonId: 'b', prerequisiteLessonId: 'a2' },
        { lessonId: 'c1', prerequisiteLessonId: 'b' },
        { lessonId: 'c2', prerequisiteLessonId: 'b' },
      ].sort((x, y) => x.lessonId.localeCompare(y.lessonId))
    );
  });

  it('dedupes an edge that already exists directly, independent of B', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    addPrereq(db, 'c', 'a'); // c already requires a directly, regardless of b
    const preview = computeRepairPreview(db, 'b');
    expect(preview.edgesToAdd).toEqual([]); // c-requires-a already exists, not re-added
  });

  it('is a no-op for an isolated lesson with neither prerequisites nor dependents', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    const preview = computeRepairPreview(db, 'a');
    expect(preview).toEqual({ edgesToAdd: [], edgesToRemove: [] });
  });
});

describe('applyRepairAndDelete', () => {
  it('reconnects fan-out/fan-in edges and removes the lesson row', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');

    applyRepairAndDelete(db, 'b');

    expect(edges(db)).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'a' }]);
    const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get('b');
    expect(lesson).toBeUndefined();
  });

  it('cascades placement, exercises, and concept-links via existing ON DELETE CASCADE', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
    `);
    db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, 0)').run('b', 's1');
    db.prepare("INSERT INTO exercises (id, lesson_id, type, content) VALUES ('ex1', 'b', 'flashcard', '{}')").run();
    insertLesson(db, 'linked');
    db.prepare("INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('linked-telc', 'telc', 'A1', 'grammar', 'x')").run();
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(
      ...['b', 'linked-telc'].sort()
    );

    applyRepairAndDelete(db, 'b');

    expect(db.prepare('SELECT * FROM lesson_placements WHERE lesson_id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT * FROM exercises WHERE lesson_id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT * FROM lesson_concept_links').all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/curriculum-admin/dependencyRepair.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/curriculum-admin/dependencyRepair.ts`:

```ts
import type Database from 'better-sqlite3';

export interface RepairEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

export interface RepairPreview {
  edgesToAdd: RepairEdge[];
  edgesToRemove: RepairEdge[];
}

/**
 * Read-only. Computes the fan-out/fan-in reconnection for deleting `lessonId`: every
 * dependent of it gets a direct edge to every one of its own prerequisites (deduped
 * against edges that already exist independently), and all edges touching it are queued
 * for removal. See spec "Dependency Repair Algorithm".
 */
export function computeRepairPreview(db: Database.Database, lessonId: string): RepairPreview {
  const pre = (
    db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(lessonId) as {
      prerequisite_lesson_id: string;
    }[]
  ).map((r) => r.prerequisite_lesson_id);

  const dep = (
    db.prepare('SELECT lesson_id FROM lesson_prerequisites WHERE prerequisite_lesson_id = ?').all(lessonId) as {
      lesson_id: string;
    }[]
  ).map((r) => r.lesson_id);

  const edgeExists = db.prepare(
    'SELECT 1 FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?'
  );

  const edgesToAdd: RepairEdge[] = [];
  const edgesToRemove: RepairEdge[] = [];

  for (const c of dep) {
    edgesToRemove.push({ lessonId: c, prerequisiteLessonId: lessonId });
    for (const a of pre) {
      if (c === a) continue;
      if (!edgeExists.get(c, a)) {
        edgesToAdd.push({ lessonId: c, prerequisiteLessonId: a });
      }
    }
  }

  for (const a of pre) {
    edgesToRemove.push({ lessonId, prerequisiteLessonId: a });
  }

  return { edgesToAdd, edgesToRemove };
}

/**
 * Recomputes the repair preview against live state (so a caller applying this across
 * several lessons in one transaction sees each prior lesson's repair reflected), applies
 * the edge changes, then deletes the lesson row itself. Placement, exercises, and
 * concept-links follow via their existing ON DELETE CASCADE.
 */
export function applyRepairAndDelete(db: Database.Database, lessonId: string): void {
  const { edgesToAdd, edgesToRemove } = computeRepairPreview(db, lessonId);

  const removeEdge = db.prepare(
    'DELETE FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?'
  );
  const addEdge = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );

  for (const e of edgesToRemove) removeEdge.run(e.lessonId, e.prerequisiteLessonId);
  for (const e of edgesToAdd) addEdge.run(e.lessonId, e.prerequisiteLessonId);

  db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/curriculum-admin/dependencyRepair.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum-admin/dependencyRepair.ts lib/curriculum-admin/dependencyRepair.test.ts
git commit -m "feat: add fan-out/fan-in dependency repair for lesson delete"
```

---

### Task 8: Concept-link service

**Files:**
- Create: `lib/services/conceptLinkService.ts`
- Test: `lib/services/conceptLinkService.test.ts`

**Interfaces:**
- Consumes: `LessonConceptLink` (Task 2, `lib/curriculum/types.ts`).
- Produces: `createConceptLinkService(db: Database.Database)` returning `{ getLinksForLesson(lessonId: string): LessonConceptLink[]; addLink(lessonId1: string, lessonId2: string): void; removeLink(lessonId1: string, lessonId2: string): void }`. `addLink` validates different track + same level + no duplicate, and stores canonically (`lesson_a_id < lesson_b_id`) regardless of argument order. Used by Task 14's concept-link API routes (add/remove) and Task 11's lesson delete service (to list a lesson's directly-linked lessons for the wizard).

- [ ] **Step 1: Write the failing tests**

Create `lib/services/conceptLinkService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createConceptLinkService } from './conceptLinkService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, track: string, level = 'A1') {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, 'grammar', ?)`).run(
    id,
    track,
    level,
    id
  );
}

describe('conceptLinkService', () => {
  it('links two lessons in different tracks at the same level', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);

    service.addLink('g1', 't1');

    const links = service.getLinksForLesson('g1');
    expect(links).toHaveLength(1);
    expect([links[0].lessonAId, links[0].lessonBId].sort()).toEqual(['g1', 't1']);
  });

  it('stores the pair canonically regardless of argument order', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);

    service.addLink('t1', 'g1');

    const row = db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links').get() as {
      lesson_a_id: string;
      lesson_b_id: string;
    };
    expect(row).toEqual({ lesson_a_id: 'g1', lesson_b_id: 't1' });
  });

  it('rejects linking two lessons in the same track', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 'g2', 'generic');
    const service = createConceptLinkService(db);
    expect(() => service.addLink('g1', 'g2')).toThrow();
  });

  it('rejects linking lessons at different levels', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic', 'A1');
    insertLesson(db, 't1', 'telc', 'A2');
    const service = createConceptLinkService(db);
    expect(() => service.addLink('g1', 't1')).toThrow();
  });

  it('rejects a duplicate link', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');
    expect(() => service.addLink('t1', 'g1')).toThrow();
  });

  it('removeLink deletes the pair regardless of argument order', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');

    service.removeLink('t1', 'g1');

    expect(service.getLinksForLesson('g1')).toEqual([]);
  });

  it('getLinksForLesson only returns links directly touching that lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'g1', 'generic');
    insertLesson(db, 't1', 'telc');
    insertLesson(db, 'go1', 'goethe');
    const service = createConceptLinkService(db);
    service.addLink('g1', 't1');
    service.addLink('g1', 'go1');

    expect(service.getLinksForLesson('t1')).toHaveLength(1);
    expect(service.getLinksForLesson('g1')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/conceptLinkService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/conceptLinkService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { LessonConceptLink } from '../curriculum/types';

interface LessonRow {
  track: string;
  source_level: string;
}

function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function createConceptLinkService(db: Database.Database) {
  function getLinksForLesson(lessonId: string): LessonConceptLink[] {
    const rows = db
      .prepare('SELECT lesson_a_id, lesson_b_id, created_at FROM lesson_concept_links WHERE lesson_a_id = ? OR lesson_b_id = ?')
      .all(lessonId, lessonId) as { lesson_a_id: string; lesson_b_id: string; created_at: string }[];
    return rows.map((r) => ({ lessonAId: r.lesson_a_id, lessonBId: r.lesson_b_id, createdAt: r.created_at }));
  }

  function addLink(lessonId1: string, lessonId2: string): void {
    if (lessonId1 === lessonId2) throw new Error('Cannot link a lesson to itself');

    const l1 = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(lessonId1) as
      | LessonRow
      | undefined;
    const l2 = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(lessonId2) as
      | LessonRow
      | undefined;
    if (!l1) throw new Error(`Lesson not found: ${lessonId1}`);
    if (!l2) throw new Error(`Lesson not found: ${lessonId2}`);
    if (l1.track === l2.track) throw new Error('Concept links must connect different tracks');
    if (l1.source_level !== l2.source_level) throw new Error('Concept links must connect the same level');

    const [a, b] = canonicalPair(lessonId1, lessonId2);
    const existing = db
      .prepare('SELECT 1 FROM lesson_concept_links WHERE lesson_a_id = ? AND lesson_b_id = ?')
      .get(a, b);
    if (existing) throw new Error('This link already exists');

    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(a, b);
  }

  function removeLink(lessonId1: string, lessonId2: string): void {
    const [a, b] = canonicalPair(lessonId1, lessonId2);
    db.prepare('DELETE FROM lesson_concept_links WHERE lesson_a_id = ? AND lesson_b_id = ?').run(a, b);
  }

  return { getLinksForLesson, addLink, removeLink };
}

export type ConceptLinkService = ReturnType<typeof createConceptLinkService>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/conceptLinkService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/conceptLinkService.ts lib/services/conceptLinkService.test.ts
git commit -m "feat: add concept-link service"
```

---

### Task 9: Lesson admin service — create

**Files:**
- Create: `lib/services/lessonAdminService.ts`
- Test: `lib/services/lessonAdminService.test.ts`

**Interfaces:**
- Consumes: `wouldCreateCycle` (Task 3), `resolvePlacement`/`PlacementInput` (Task 5), `reconcileExercises`/`ExerciseInput` (Task 6), `createCurriculumService` (existing, for the read-back).
- Produces: `CreateLessonInput = { slug: string; track: Track; sourceLevel: CefrLevel; skill: Skill; title: string; explanation: string | null; examples: string[] | null; exercises: ExerciseInput[]; prerequisiteIds: string[]; placement: PlacementInput }` and `createLessonAdminService(db: Database.Database)` returning `{ createLesson(input: CreateLessonInput): Lesson }`. Used by Task 13's `POST /api/admin/curriculum/lessons`.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/lessonAdminService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createLessonAdminService } from './lessonAdminService';

function seedMilestoneAndSection(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
  `);
}

describe('lessonAdminService.createLesson', () => {
  it('creates a lesson with the {level}-{slug} id and returns it', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    const lesson = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: 'Explanation text',
      examples: ['Ich kann schwimmen.'],
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    expect(lesson.id).toBe('a1-modal-verbs');
    expect(lesson.title).toBe('Modal Verbs');
  });

  it('rejects a duplicate id, checked globally across tracks', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m2', 'telc', 'A1', 'M2', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm2', 'S2', 0);
    `);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-modal-verbs', 'telc', 'A1', 'grammar', 'x')`
    ).run();
    const service = createLessonAdminService(db);

    expect(() =>
      service.createLesson({
        slug: 'modal-verbs',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Modal Verbs',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('creates prerequisite edges', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    const service = createLessonAdminService(db);

    service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { sectionId: 's1' },
    });

    const edge = db
      .prepare('SELECT * FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?')
      .get('a1-modal-verbs', 'a1-basics');
    expect(edge).toBeDefined();
  });

  it('creates exercises via reconciliation, minting fresh ids', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [{ type: 'flashcard', content: { front: 'können', back: 'can' } }],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    const rows = db.prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('a1-modal-verbs') as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id.startsWith('a1-modal-verbs__ex-')).toBe(true);
  });

  it('places the lesson via the placement resolver, including inline creation', () => {
    const db = createDbClient(':memory:');
    const service = createLessonAdminService(db);

    const lesson = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { newMilestoneTitle: 'New Milestone', newSectionTitle: 'New Section' },
    });

    const placement = db.prepare('SELECT section_id FROM lesson_placements WHERE lesson_id = ?').get(lesson.id) as {
      section_id: string;
    };
    const section = db.prepare('SELECT title FROM sections WHERE id = ?').get(placement.section_id) as {
      title: string;
    };
    expect(section.title).toBe('New Section');
  });

  it('rolls back the whole insert if a prerequisite id would create a cycle', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);

    // A lesson listing itself as its own prerequisite is the simplest way to trigger the
    // cycle guard deterministically (wouldCreateCycle treats self-reference as a cycle).
    expect(() =>
      service.createLesson({
        slug: 'self-ref',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Self Ref',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-self-ref'],
        placement: { sectionId: 's1' },
      })
    ).toThrow();

    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref');
    expect(lesson).toBeUndefined();
  });

  it('rolls back an inline-created milestone and section too, on a failure later in the same create', () => {
    const db = createDbClient(':memory:');
    const service = createLessonAdminService(db);

    expect(() =>
      service.createLesson({
        slug: 'self-ref',
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'Self Ref',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-self-ref'],
        placement: { newMilestoneTitle: 'New Milestone', newSectionTitle: 'New Section' },
      })
    ).toThrow();

    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-self-ref')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM milestones WHERE title = ?').get('New Milestone')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM sections WHERE title = ?').get('New Section')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/lessonAdminService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Skill, Lesson } from '../curriculum/types';
import { createCurriculumService } from './curriculumService';
import { wouldCreateCycle } from '../curriculum-admin/cycleDetection';
import { resolvePlacement, type PlacementInput } from '../curriculum-admin/placementResolver';
import { reconcileExercises, type ExerciseInput } from '../curriculum-admin/exerciseReconciliation';

export interface CreateLessonInput {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  exercises: ExerciseInput[];
  prerequisiteIds: string[];
  placement: PlacementInput;
}

export function createLessonAdminService(db: Database.Database) {
  const reads = createCurriculumService(db);

  function createLesson(input: CreateLessonInput): Lesson {
    const id = `${input.sourceLevel.toLowerCase()}-${input.slug}`;

    const run = db.transaction(() => {
      const existing = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(id);
      if (existing) throw new Error(`Lesson id already exists: ${id}`);

      db.prepare(
        'INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.explanation,
        input.examples ? JSON.stringify(input.examples) : null
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone/section resolvePlacement just created too — the whole
      // create is one atomic unit, and no inline-created structure is ever left orphaned.
      const sectionId = resolvePlacement(db, input.track, input.sourceLevel, input.placement);
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
        .get(sectionId) as { m: number };
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run(
        id,
        sectionId,
        maxOrder.m + 1
      );

      for (const prerequisiteId of input.prerequisiteIds) {
        if (wouldCreateCycle(db, id, prerequisiteId)) {
          throw new Error(`Adding prerequisite ${prerequisiteId} would create a cycle`);
        }
        db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
          id,
          prerequisiteId
        );
      }
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  return { createLesson };
}

export type LessonAdminService = ReturnType<typeof createLessonAdminService>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/lessonAdminService.ts lib/services/lessonAdminService.test.ts
git commit -m "feat: add lesson admin service — create"
```

---

### Task 10: Lesson admin service — update

**Files:**
- Modify: `lib/services/lessonAdminService.ts`
- Modify: `lib/services/lessonAdminService.test.ts`

**Interfaces:**
- Consumes: same as Task 9, plus reads `lesson_prerequisites` and `lesson_concept_links` directly for the track/level change gate.
- Produces: `UpdateLessonInput = { track: Track; sourceLevel: CefrLevel; skill: Skill; title: string; explanation: string | null; examples: string[] | null; exercises: ExerciseInput[]; prerequisiteIds: string[]; placement: PlacementInput }` and adds `updateLesson(id: string, input: UpdateLessonInput): Lesson` to the service returned by `createLessonAdminService`. Used by Task 13's `PATCH /api/admin/curriculum/lessons/:id`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/lessonAdminService.test.ts`, inside a new `describe('lessonAdminService.updateLesson', ...)` block alongside the existing `createLesson` one:

```ts
describe('lessonAdminService.updateLesson', () => {
  it('updates freely-editable fields without touching track/level', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    const updated = service.updateLesson(created.id, {
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs (Updated)',
      explanation: 'Now with an explanation',
      examples: ['Ich kann.'],
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    expect(updated.title).toBe('Modal Verbs (Updated)');
    expect(updated.explanation).toBe('Now with an explanation');
  });

  it('throws when updating a lesson that does not exist', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    expect(() =>
      service.updateLesson('a1-nope', {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: 'X',
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('rejects a track change while the lesson has a prerequisite edge as dependent', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { sectionId: 's1' },
    });

    expect(() =>
      service.updateLesson(created.id, {
        track: 'telc',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: ['a1-basics'],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('rejects a level change while another lesson depends on it', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'basics',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Basics',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-advanced', 'generic', 'A1', 'grammar', 'Advanced')`
    ).run();
    db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
      'a1-advanced',
      created.id
    );

    expect(() =>
      service.updateLesson(created.id, {
        track: 'generic',
        sourceLevel: 'A2',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('rejects a track change while the lesson has a concept link', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-modal-verbs-telc', 'telc', 'A1', 'grammar', 'x')`
    ).run();
    db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(
      ...[created.id, 'a1-modal-verbs-telc'].sort()
    );

    expect(() =>
      service.updateLesson(created.id, {
        track: 'goethe',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: created.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('allows a track change with no blocking edges, placing it into the new track+level structure', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m2', 'telc', 'A1', 'M2', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm2', 'S2', 0);
    `);
    const service = createLessonAdminService(db);
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });

    const updated = service.updateLesson(created.id, {
      track: 'telc',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: created.title,
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's2' },
    });

    expect(updated.track).toBe('telc');
    const placement = db.prepare('SELECT section_id FROM lesson_placements WHERE lesson_id = ?').get(created.id) as {
      section_id: string;
    };
    expect(placement.section_id).toBe('s2');
  });

  it('reconciles prerequisites — adds newly-selected ones and removes deselected ones', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-basics', 'generic', 'A1', 'grammar', 'Basics')`
    ).run();
    db.prepare(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-extra', 'generic', 'A1', 'grammar', 'Extra')`
    ).run();
    const created = service.createLesson({
      slug: 'modal-verbs',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'Modal Verbs',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-basics'],
      placement: { sectionId: 's1' },
    });

    service.updateLesson(created.id, {
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: created.title,
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: ['a1-extra'],
      placement: { sectionId: 's1' },
    });

    const rows = db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(
      created.id
    ) as { prerequisite_lesson_id: string }[];
    expect(rows).toEqual([{ prerequisite_lesson_id: 'a1-extra' }]);
  });

  it('rejects a new prerequisite that would create a cycle', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    const a = service.createLesson({
      slug: 'a',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'A',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });
    const b = service.createLesson({
      slug: 'b',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'B',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [a.id],
      placement: { sectionId: 's1' },
    });

    expect(() =>
      service.updateLesson(a.id, {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: a.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [b.id],
        placement: { sectionId: 's1' },
      })
    ).toThrow();
  });

  it('rolls back an inline-created milestone and section too, on a cycle failure later in the same update', () => {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    const service = createLessonAdminService(db);
    const a = service.createLesson({
      slug: 'a',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'A',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    });
    const b = service.createLesson({
      slug: 'b',
      track: 'generic',
      sourceLevel: 'A1',
      skill: 'grammar',
      title: 'B',
      explanation: null,
      examples: null,
      exercises: [],
      prerequisiteIds: [a.id],
      placement: { sectionId: 's1' },
    });

    expect(() =>
      service.updateLesson(a.id, {
        track: 'generic',
        sourceLevel: 'A1',
        skill: 'grammar',
        title: a.title,
        explanation: null,
        examples: null,
        exercises: [],
        prerequisiteIds: [b.id],
        placement: { newMilestoneTitle: 'New Milestone', newSectionTitle: 'New Section' },
      })
    ).toThrow();

    expect(db.prepare('SELECT 1 FROM milestones WHERE title = ?').get('New Milestone')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM sections WHERE title = ?').get('New Section')).toBeUndefined();
    // a's placement is unchanged — still in the original section, not the (rolled-back) new one
    const placement = db.prepare('SELECT section_id FROM lesson_placements WHERE lesson_id = ?').get(a.id) as {
      section_id: string;
    };
    expect(placement.section_id).toBe('s1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: FAIL — `updateLesson` doesn't exist yet.

- [ ] **Step 3: Implement**

In `lib/services/lessonAdminService.ts`, add the new input type and extend the returned object. Change the `createLessonAdminService` function body from:

```ts
export function createLessonAdminService(db: Database.Database) {
  const reads = createCurriculumService(db);

  function createLesson(input: CreateLessonInput): Lesson {
    // ...unchanged from Task 9...
  }

  return { createLesson };
}
```

to:

```ts
export interface UpdateLessonInput {
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  exercises: ExerciseInput[];
  prerequisiteIds: string[];
  placement: PlacementInput;
}

export function createLessonAdminService(db: Database.Database) {
  const reads = createCurriculumService(db);

  function createLesson(input: CreateLessonInput): Lesson {
    // ...unchanged from Task 9...
  }

  function updateLesson(id: string, input: UpdateLessonInput): Lesson {
    const run = db.transaction(() => {
      const current = db.prepare('SELECT track, source_level FROM lessons WHERE id = ?').get(id) as
        | { track: Track; source_level: CefrLevel }
        | undefined;
      if (!current) throw new Error(`Lesson not found: ${id}`);

      const trackOrLevelChanged = current.track !== input.track || current.source_level !== input.sourceLevel;
      if (trackOrLevelChanged) {
        const hasPrereqEdge = db
          .prepare('SELECT 1 FROM lesson_prerequisites WHERE lesson_id = ? OR prerequisite_lesson_id = ?')
          .get(id, id);
        if (hasPrereqEdge) {
          throw new Error('Cannot change track/level while this lesson has prerequisite relationships');
        }
        const hasConceptLink = db
          .prepare('SELECT 1 FROM lesson_concept_links WHERE lesson_a_id = ? OR lesson_b_id = ?')
          .get(id, id);
        if (hasConceptLink) {
          throw new Error('Cannot change track/level while this lesson has concept links');
        }
      }

      db.prepare(
        'UPDATE lessons SET track = ?, source_level = ?, skill = ?, title = ?, explanation = ?, examples = ? WHERE id = ?'
      ).run(
        input.track,
        input.sourceLevel,
        input.skill,
        input.title,
        input.explanation,
        input.examples ? JSON.stringify(input.examples) : null,
        id
      );

      reconcileExercises(db, id, input.exercises);

      // Placement is resolved before prerequisites so that a cycle-check failure below
      // rolls back any milestone/section resolvePlacement just created too — the whole
      // update is one atomic unit, and no inline-created structure is ever left orphaned.
      const sectionId = resolvePlacement(db, input.track, input.sourceLevel, input.placement);
      db.prepare('DELETE FROM lesson_placements WHERE lesson_id = ?').run(id);
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
        .get(sectionId) as { m: number };
      db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)').run(
        id,
        sectionId,
        maxOrder.m + 1
      );

      const currentPrereqs = new Set(
        (
          db.prepare('SELECT prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?').all(id) as {
            prerequisite_lesson_id: string;
          }[]
        ).map((r) => r.prerequisite_lesson_id)
      );
      const desiredPrereqs = new Set(input.prerequisiteIds);

      for (const prerequisiteId of currentPrereqs) {
        if (!desiredPrereqs.has(prerequisiteId)) {
          db.prepare('DELETE FROM lesson_prerequisites WHERE lesson_id = ? AND prerequisite_lesson_id = ?').run(
            id,
            prerequisiteId
          );
        }
      }
      for (const prerequisiteId of desiredPrereqs) {
        if (!currentPrereqs.has(prerequisiteId)) {
          if (wouldCreateCycle(db, id, prerequisiteId)) {
            throw new Error(`Adding prerequisite ${prerequisiteId} would create a cycle`);
          }
          db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
            id,
            prerequisiteId
          );
        }
      }
    });

    run();
    return reads.getLesson(id, input.track)!;
  }

  return { createLesson, updateLesson };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/lessonAdminService.ts lib/services/lessonAdminService.test.ts
git commit -m "feat: add lesson admin service — update, with track/level change gating"
```

---

### Task 11: Lesson delete service — per-step preview and batch delete

**Files:**
- Create: `lib/services/lessonDeleteService.ts`
- Test: `lib/services/lessonDeleteService.test.ts`

**Interfaces:**
- Consumes: `computeRepairPreview`/`applyRepairAndDelete`/`RepairPreview` (Task 7), `createConceptLinkService` (Task 8).
- Produces: `LinkedLessonSummary = { id: string; title: string; track: Track }`, `DeletePreview = { lessonId: string; repair: RepairPreview; linkedLessons: LinkedLessonSummary[] }`, and `createLessonDeleteService(db: Database.Database)` returning `{ getDeletePreview(lessonId: string): DeletePreview; batchDelete(lessonIds: string[]): void }`. `getDeletePreview` is read-only and returns only lessons *directly* linked to `lessonId` (never a transitive walk — the wizard recurses client-side, one step at a time, per spec "Dependency Repair Algorithm"). `batchDelete` validates every id exists, then applies each one's repair-and-delete inside one transaction. Used by Task 13's `GET .../delete-preview` and `DELETE .../lessons` routes.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/lessonDeleteService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createLessonDeleteService } from './lessonDeleteService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, track = 'generic', level = 'A1') {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, ?, ?, 'grammar', ?)`).run(
    id,
    track,
    level,
    id
  );
}

function addPrereq(db: ReturnType<typeof createDbClient>, lessonId: string, prerequisiteId: string) {
  db.prepare('INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)').run(
    lessonId,
    prerequisiteId
  );
}

function addLink(db: ReturnType<typeof createDbClient>, x: string, y: string) {
  db.prepare('INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)').run(...[x, y].sort());
}

describe('lessonDeleteService.getDeletePreview', () => {
  it('returns the repair effects for this lesson', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    const service = createLessonDeleteService(db);

    const preview = service.getDeletePreview('b');

    expect(preview.repair.edgesToAdd).toEqual([{ lessonId: 'c', prerequisiteLessonId: 'a' }]);
    expect(preview.repair.edgesToRemove).toHaveLength(2);
  });

  it('returns only the lessons directly concept-linked to this one, not their own links', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'b', 'generic');
    insertLesson(db, 'd', 'telc');
    insertLesson(db, 'f', 'goethe');
    addLink(db, 'b', 'd');
    addLink(db, 'd', 'f'); // linked to d, not directly to b — must not appear in b's preview
    const service = createLessonDeleteService(db);

    const preview = service.getDeletePreview('b');

    expect(preview.linkedLessons).toEqual([{ id: 'd', title: 'd', track: 'telc' }]);
  });

  it('is read-only — a preview call does not mutate anything', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    addPrereq(db, 'b', 'a');
    const service = createLessonDeleteService(db);

    service.getDeletePreview('b');

    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('b');
    expect(lesson).toBeDefined();
  });

  it('throws for a lesson that does not exist', () => {
    const db = createDbClient(':memory:');
    const service = createLessonDeleteService(db);
    expect(() => service.getDeletePreview('nope')).toThrow();
  });
});

describe('lessonDeleteService.batchDelete', () => {
  it('deletes every lesson in the set and repairs each one against live state', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    insertLesson(db, 'b');
    insertLesson(db, 'c');
    insertLesson(db, 'd');
    addPrereq(db, 'b', 'a');
    addPrereq(db, 'c', 'b');
    addPrereq(db, 'd', 'c');
    const service = createLessonDeleteService(db);

    // Deleting b and c together should leave d requiring a directly, as if both
    // intermediate lessons were never there — each repair recomputed against the
    // other's already-applied repair within the same transaction.
    service.batchDelete(['b', 'c']);

    const edges = db
      .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites')
      .all() as { lesson_id: string; prerequisite_lesson_id: string }[];
    expect(edges).toEqual([{ lesson_id: 'd', prerequisite_lesson_id: 'a' }]);
    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('b')).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('c')).toBeUndefined();
  });

  it('rejects the whole batch, unchanged, if any id does not exist', () => {
    const db = createDbClient(':memory:');
    insertLesson(db, 'a');
    const service = createLessonDeleteService(db);

    expect(() => service.batchDelete(['a', 'nope'])).toThrow();

    expect(db.prepare('SELECT 1 FROM lessons WHERE id = ?').get('a')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/lessonDeleteService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/lessonDeleteService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track } from '../types';
import { computeRepairPreview, applyRepairAndDelete, type RepairPreview } from '../curriculum-admin/dependencyRepair';
import { createConceptLinkService } from './conceptLinkService';

export interface LinkedLessonSummary {
  id: string;
  title: string;
  track: Track;
}

export interface DeletePreview {
  lessonId: string;
  repair: RepairPreview;
  linkedLessons: LinkedLessonSummary[];
}

export function createLessonDeleteService(db: Database.Database) {
  const conceptLinks = createConceptLinkService(db);

  function getDeletePreview(lessonId: string): DeletePreview {
    const lesson = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);

    const repair = computeRepairPreview(db, lessonId);

    const links = conceptLinks.getLinksForLesson(lessonId);
    const linkedLessons: LinkedLessonSummary[] = links.map((link) => {
      const otherId = link.lessonAId === lessonId ? link.lessonBId : link.lessonAId;
      const row = db.prepare('SELECT title, track FROM lessons WHERE id = ?').get(otherId) as {
        title: string;
        track: Track;
      };
      return { id: otherId, title: row.title, track: row.track };
    });

    return { lessonId, repair, linkedLessons };
  }

  function batchDelete(lessonIds: string[]): void {
    const run = db.transaction(() => {
      for (const lessonId of lessonIds) {
        const exists = db.prepare('SELECT 1 FROM lessons WHERE id = ?').get(lessonId);
        if (!exists) throw new Error(`Lesson not found: ${lessonId}`);
      }
      for (const lessonId of lessonIds) {
        applyRepairAndDelete(db, lessonId);
      }
    });
    run();
  }

  return { getDeletePreview, batchDelete };
}

export type LessonDeleteService = ReturnType<typeof createLessonDeleteService>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/lessonDeleteService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/lessonDeleteService.ts lib/services/lessonDeleteService.test.ts
git commit -m "feat: add lesson delete service — per-step preview and transactional batch delete"
```

---

### Task 12: Milestone/section structure service

**Files:**
- Create: `lib/services/curriculumStructureService.ts`
- Test: `lib/services/curriculumStructureService.test.ts`

**Interfaces:**
- Consumes: `ensureUnsortedExists`/`unsortedMilestoneId` (Task 4).
- Produces: `DisplacedLesson = { id: string; title: string }`, `DeleteContainerPreview = { sections?: { id: string; title: string; lessons: DisplacedLesson[] }[]; lessons?: DisplacedLesson[] }` (milestone preview carries `sections`, section preview carries `lessons` directly), and `createCurriculumStructureService(db: Database.Database)` returning `{ createMilestone, renameMilestone, previewMilestoneDelete, deleteMilestone, reorderMilestones, createSection, renameSection, previewSectionDelete, deleteSection, reorderSections }`. Used by Task 15/16's milestone/section API routes.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/curriculumStructureService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumStructureService } from './curriculumStructureService';

function insertLesson(db: ReturnType<typeof createDbClient>, id: string, sectionId: string) {
  db.prepare(`INSERT INTO lessons (id, track, source_level, skill, title) VALUES (?, 'generic', 'A1', 'grammar', ?)`).run(
    id,
    id
  );
  db.prepare('INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, 0)').run(id, sectionId);
}

describe('curriculumStructureService — milestones', () => {
  it('creates and renames a milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const created = service.createMilestone('generic', 'A1', 'Basics', null);
    expect(created.title).toBe('Basics');

    const renamed = service.renameMilestone(created.id, 'Fundamentals', 'desc');
    expect(renamed.title).toBe('Fundamentals');
    expect(renamed.description).toBe('desc');
  });

  it('previewMilestoneDelete lists every section and lesson that would move to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const section = service.createSection(milestone.id, 'Section 1', null);
    insertLesson(db, 'a1-lesson-one', section.id);

    const preview = service.previewMilestoneDelete(milestone.id);

    expect(preview.sections).toEqual([
      { id: section.id, title: 'Section 1', lessons: [{ id: 'a1-lesson-one', title: 'a1-lesson-one' }] },
    ]);
  });

  it('deleteMilestone relocates lessons across multiple sections to Unsorted, then removes it', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const s1 = service.createSection(milestone.id, 'S1', null);
    const s2 = service.createSection(milestone.id, 'S2', null);
    insertLesson(db, 'a1-l1', s1.id);
    insertLesson(db, 'a1-l2', s2.id);

    service.deleteMilestone(milestone.id);

    const placements = db
      .prepare(
        `SELECT lp.lesson_id, m.title as milestone_title FROM lesson_placements lp
         JOIN sections s ON s.id = lp.section_id
         JOIN milestones m ON m.id = s.milestone_id
         ORDER BY lp.lesson_id`
      )
      .all() as { lesson_id: string; milestone_title: string }[];
    expect(placements).toEqual([
      { lesson_id: 'a1-l1', milestone_title: 'Unsorted' },
      { lesson_id: 'a1-l2', milestone_title: 'Unsorted' },
    ]);
    expect(db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(milestone.id)).toBeUndefined();
  });

  it('rejects deleting the Unsorted milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    service.createMilestone('generic', 'A1', 'Basics', null); // forces getTrackStructure-independent creation path unnecessary; ensure Unsorted exists directly instead
    const unsortedId = 'generic-a1-unsorted';
    db.prepare(
      "INSERT INTO milestones (id, track, level, title, order_index) VALUES (?, 'generic', 'A1', 'Unsorted', 0)"
    ).run(unsortedId);
    db.prepare(
      "INSERT INTO sections (id, milestone_id, title, order_index) VALUES (?, ?, 'Unsorted', 0)"
    ).run(`${unsortedId}-section`, unsortedId);

    expect(() => service.deleteMilestone(unsortedId)).toThrow();
  });

  it('reorderMilestones rejects a payload that includes Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m1 = service.createMilestone('generic', 'A1', 'M1', null);
    expect(() => service.reorderMilestones('generic', 'A1', [m1.id, 'generic-a1-unsorted'])).toThrow();
  });

  it('reorderMilestones rejects a payload that omits an existing milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    service.createMilestone('generic', 'A1', 'M1', null);
    const m2 = service.createMilestone('generic', 'A1', 'M2', null);
    expect(() => service.reorderMilestones('generic', 'A1', [m2.id])).toThrow();
  });

  it('reorderMilestones applies the given order', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const m1 = service.createMilestone('generic', 'A1', 'M1', null);
    const m2 = service.createMilestone('generic', 'A1', 'M2', null);

    service.reorderMilestones('generic', 'A1', [m2.id, m1.id]);

    const rows = db
      .prepare('SELECT id FROM milestones WHERE track = ? AND level = ? AND id != ? ORDER BY order_index')
      .all('generic', 'A1', 'generic-a1-unsorted') as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([m2.id, m1.id]);
  });
});

describe('curriculumStructureService — sections', () => {
  it('creates and renames a section', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const created = service.createSection(milestone.id, 'Section 1', null);
    expect(created.title).toBe('Section 1');

    const renamed = service.renameSection(created.id, 'Section One', 'desc');
    expect(renamed.title).toBe('Section One');
  });

  it('deleteSection relocates its lessons to Unsorted', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const section = service.createSection(milestone.id, 'S1', null);
    insertLesson(db, 'a1-l1', section.id);

    service.deleteSection(section.id);

    const placement = db
      .prepare(
        `SELECT m.title as milestone_title FROM lesson_placements lp
         JOIN sections s ON s.id = lp.section_id
         JOIN milestones m ON m.id = s.milestone_id
         WHERE lp.lesson_id = ?`
      )
      .get('a1-l1') as { milestone_title: string };
    expect(placement.milestone_title).toBe('Unsorted');
    expect(db.prepare('SELECT 1 FROM sections WHERE id = ?').get(section.id)).toBeUndefined();
  });

  it('reorderSections applies the given order within one milestone', () => {
    const db = createDbClient(':memory:');
    const service = createCurriculumStructureService(db);
    const milestone = service.createMilestone('generic', 'A1', 'Basics', null);
    const s1 = service.createSection(milestone.id, 'S1', null);
    const s2 = service.createSection(milestone.id, 'S2', null);

    service.reorderSections(milestone.id, [s2.id, s1.id]);

    const rows = db
      .prepare('SELECT id FROM sections WHERE milestone_id = ? ORDER BY order_index')
      .all(milestone.id) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([s2.id, s1.id]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/curriculumStructureService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/curriculumStructureService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone, Section } from '../curriculum/types';
import { ensureUnsortedExists, unsortedMilestoneId } from '../curriculum-admin/unsortedBucket';
import { randomSuffix } from '../curriculum-admin/randomId';

export interface DisplacedLesson {
  id: string;
  title: string;
}

export interface MilestoneDeletePreview {
  sections: { id: string; title: string; lessons: DisplacedLesson[] }[];
}

export interface SectionDeletePreview {
  lessons: DisplacedLesson[];
}

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  order_index: number;
}

interface SectionRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  order_index: number;
}

function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToSection(row: SectionRow): Section {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function lessonsInSection(db: Database.Database, sectionId: string): DisplacedLesson[] {
  return db
    .prepare(
      `SELECT l.id, l.title FROM lesson_placements lp JOIN lessons l ON l.id = lp.lesson_id WHERE lp.section_id = ?`
    )
    .all(sectionId) as DisplacedLesson[];
}

function relocateSectionLessonsToUnsorted(db: Database.Database, sectionId: string, unsortedSectionId: string): void {
  const lessonIds = (
    db.prepare('SELECT lesson_id FROM lesson_placements WHERE section_id = ?').all(sectionId) as {
      lesson_id: string;
    }[]
  ).map((r) => r.lesson_id);
  for (const lessonId of lessonIds) {
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM lesson_placements WHERE section_id = ?')
      .get(unsortedSectionId) as { m: number };
    db.prepare('UPDATE lesson_placements SET section_id = ?, order_index = ? WHERE lesson_id = ?').run(
      unsortedSectionId,
      maxOrder.m + 1,
      lessonId
    );
  }
}

export function createCurriculumStructureService(db: Database.Database) {
  function createMilestone(track: Track, level: CefrLevel, title: string, description: string | null): Milestone {
    const id = `${track}-${level.toLowerCase()}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM milestones WHERE track = ? AND level = ?')
      .get(track, level) as { m: number };
    db.prepare(
      'INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, track, level, title, description, maxOrder.m + 1);
    return rowToMilestone(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow);
  }

  function renameMilestone(id: string, title: string, description: string | null): Milestone {
    const existing = db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(id);
    if (!existing) throw new Error(`Milestone not found: ${id}`);
    db.prepare('UPDATE milestones SET title = ?, description = ? WHERE id = ?').run(title, description, id);
    return rowToMilestone(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as MilestoneRow);
  }

  function previewMilestoneDelete(id: string): MilestoneDeletePreview {
    const sections = db.prepare('SELECT id, title FROM sections WHERE milestone_id = ?').all(id) as {
      id: string;
      title: string;
    }[];
    return { sections: sections.map((s) => ({ id: s.id, title: s.title, lessons: lessonsInSection(db, s.id) })) };
  }

  function deleteMilestone(id: string): void {
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(id) as
      | { track: Track; level: CefrLevel }
      | undefined;
    if (!milestone) throw new Error(`Milestone not found: ${id}`);
    if (id === unsortedMilestoneId(milestone.track, milestone.level)) {
      throw new Error('Cannot delete the Unsorted milestone');
    }

    const run = db.transaction(() => {
      const { sectionId: unsortedSectionId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      const sectionIds = (db.prepare('SELECT id FROM sections WHERE milestone_id = ?').all(id) as { id: string }[]).map(
        (r) => r.id
      );
      for (const sectionId of sectionIds) {
        relocateSectionLessonsToUnsorted(db, sectionId, unsortedSectionId);
      }
      db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    });
    run();
  }

  function reorderMilestones(track: Track, level: CefrLevel, orderedIds: string[]): void {
    const unsortedId = unsortedMilestoneId(track, level);
    if (orderedIds.includes(unsortedId)) {
      throw new Error('Cannot include Unsorted in a reorder');
    }
    const real = (
      db.prepare('SELECT id FROM milestones WHERE track = ? AND level = ? AND id != ?').all(track, level, unsortedId) as {
        id: string;
      }[]
    ).map((r) => r.id);
    const givenSet = new Set(orderedIds);
    const matches = real.length === orderedIds.length && real.every((id) => givenSet.has(id));
    if (!matches) {
      throw new Error('Reorder payload must include exactly the current set of milestones for this track+level');
    }

    const run = db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare('UPDATE milestones SET order_index = ? WHERE id = ?').run(index, id);
      });
    });
    run();
  }

  function createSection(milestoneId: string, title: string, description: string | null): Section {
    const milestone = db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);
    const id = `${milestoneId}-${randomSuffix()}`;
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM sections WHERE milestone_id = ?')
      .get(milestoneId) as { m: number };
    db.prepare(
      'INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, ?, ?)'
    ).run(id, milestoneId, title, description, maxOrder.m + 1);
    return rowToSection(db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow);
  }

  function renameSection(id: string, title: string, description: string | null): Section {
    const existing = db.prepare('SELECT 1 FROM sections WHERE id = ?').get(id);
    if (!existing) throw new Error(`Section not found: ${id}`);
    db.prepare('UPDATE sections SET title = ?, description = ? WHERE id = ?').run(title, description, id);
    return rowToSection(db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as SectionRow);
  }

  function previewSectionDelete(id: string): SectionDeletePreview {
    return { lessons: lessonsInSection(db, id) };
  }

  function deleteSection(id: string): void {
    const section = db.prepare('SELECT milestone_id FROM sections WHERE id = ?').get(id) as
      | { milestone_id: string }
      | undefined;
    if (!section) throw new Error(`Section not found: ${id}`);
    const milestone = db.prepare('SELECT track, level FROM milestones WHERE id = ?').get(section.milestone_id) as {
      track: Track;
      level: CefrLevel;
    };

    const run = db.transaction(() => {
      const { sectionId: unsortedSectionId } = ensureUnsortedExists(db, milestone.track, milestone.level);
      if (id === unsortedSectionId) throw new Error('Cannot delete the Unsorted section');
      relocateSectionLessonsToUnsorted(db, id, unsortedSectionId);
      db.prepare('DELETE FROM sections WHERE id = ?').run(id);
    });
    run();
  }

  function reorderSections(milestoneId: string, orderedIds: string[]): void {
    const real = (db.prepare('SELECT id FROM sections WHERE milestone_id = ?').all(milestoneId) as { id: string }[]).map(
      (r) => r.id
    );
    const givenSet = new Set(orderedIds);
    const matches = real.length === orderedIds.length && real.every((id) => givenSet.has(id));
    if (!matches) {
      throw new Error('Reorder payload must include exactly the current set of sections for this milestone');
    }

    const run = db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare('UPDATE sections SET order_index = ? WHERE id = ?').run(index, id);
      });
    });
    run();
  }

  return {
    createMilestone,
    renameMilestone,
    previewMilestoneDelete,
    deleteMilestone,
    reorderMilestones,
    createSection,
    renameSection,
    previewSectionDelete,
    deleteSection,
    reorderSections,
  };
}

export type CurriculumStructureService = ReturnType<typeof createCurriculumStructureService>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/curriculumStructureService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/curriculumStructureService.ts lib/services/curriculumStructureService.test.ts
git commit -m "feat: add milestone/section structure service with Unsorted relocation"
```

---

### Task 13: Lesson API routes — create, update, delete-preview, batch delete

**Files:**
- Create: `app/api/admin/curriculum/lessons/route.ts` (POST, DELETE)
- Create: `app/api/admin/curriculum/lessons/[id]/route.ts` (PATCH)
- Create: `app/api/admin/curriculum/lessons/[id]/delete-preview/route.ts` (GET)
- Test: `app/api/admin/curriculum/lessons/route.test.ts`
- Test: `app/api/admin/curriculum/lessons/[id]/route.test.ts`
- Test: `app/api/admin/curriculum/lessons/[id]/delete-preview/route.test.ts`

**Interfaces:**
- Consumes: `isAdminSessionValid` (`lib/auth/adminSession.ts`), `getDb` (`lib/db/client.ts`), `createLessonAdminService` (Task 9/10), `createLessonDeleteService` (Task 11).
- Produces: the four HTTP endpoints spec'd in "API Routes" — `POST /api/admin/curriculum/lessons`, `PATCH /api/admin/curriculum/lessons/:id`, `GET /api/admin/curriculum/lessons/:id/delete-preview`, `DELETE /api/admin/curriculum/lessons`. Used by Task 21's lesson editor form and Task 23's delete wizard.

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/curriculum/lessons/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST, DELETE } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function seedMilestoneAndSection() {
  getDb().exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
  `);
}

describe('/api/admin/curriculum/lessons', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-lessons-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(401);
  });

  it('creates a lesson', async () => {
    seedMilestoneAndSection();
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'modal-verbs',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Modal Verbs',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('a1-modal-verbs');
  });

  it('returns 400 with an error message when creation fails', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'modal-verbs',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Modal Verbs',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 'nonexistent-section' },
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('batch deletes a set of lessons', async () => {
    seedMilestoneAndSection();
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l2', 'generic', 'A1', 'grammar', 'L2');
    `);
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({ lessonIds: ['a1-l1', 'a1-l2'] }) })
    );
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM lessons WHERE id = ?').get('a1-l1')).toBeUndefined();
  });

  it('returns 400 when a batch delete id does not exist', async () => {
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({ lessonIds: ['nope'] }) })
    );
    expect(res.status).toBe(400);
  });
});
```

Create `app/api/admin/curriculum/lessons/[id]/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { PATCH } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-lesson-id-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-l1', 's1', 0);
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }), {
      params: { id: 'a1-l1' },
    });
    expect(res.status).toBe(401);
  });

  it('updates a lesson', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'L1 Updated',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      }),
      { params: { id: 'a1-l1' } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('L1 Updated');
  });

  it('returns 404 for an unknown lesson id', async () => {
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'X',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
          placement: { sectionId: 's1' },
        }),
      }),
      { params: { id: 'nope' } }
    );
    expect(res.status).toBe(404);
  });
});
```

Create `app/api/admin/curriculum/lessons/[id]/delete-preview/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]/delete-preview', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-delete-preview-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-l1', 'generic', 'A1', 'grammar', 'L1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await GET(new Request('http://localhost'), { params: { id: 'a1-l1' } });
    expect(res.status).toBe(401);
  });

  it('returns the repair preview and linked lessons', async () => {
    const res = await GET(new Request('http://localhost'), { params: { id: 'a1-l1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repair.edgesToAdd).toEqual([]);
    expect(body.linkedLessons).toEqual([]);
  });

  it('returns 404 for an unknown lesson', async () => {
    const res = await GET(new Request('http://localhost'), { params: { id: 'nope' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/curriculum/lessons`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement**

Create `app/api/admin/curriculum/lessons/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonAdminService } from '@/lib/services/lessonAdminService';
import { createLessonDeleteService } from '@/lib/services/lessonDeleteService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await request.json();
  const service = createLessonAdminService(getDb());
  try {
    const lesson = service.createLesson(input);
    return NextResponse.json(lesson, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonIds } = await request.json();
  const service = createLessonDeleteService(getDb());
  try {
    service.batchDelete(lessonIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/lessons/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonAdminService } from '@/lib/services/lessonAdminService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await request.json();
  const service = createLessonAdminService(getDb());
  try {
    const lesson = service.updateLesson(params.id, input);
    return NextResponse.json(lesson);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

Create `app/api/admin/curriculum/lessons/[id]/delete-preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createLessonDeleteService } from '@/lib/services/lessonDeleteService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createLessonDeleteService(getDb());
  try {
    const preview = service.getDeletePreview(params.id);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/curriculum/lessons`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/curriculum/lessons
git commit -m "feat: add lesson create/update/delete-preview/batch-delete API routes"
```

---

### Task 14: Concept-link API routes

**Files:**
- Create: `app/api/admin/curriculum/lessons/[id]/links/route.ts` (POST)
- Create: `app/api/admin/curriculum/lessons/[id]/links/[otherId]/route.ts` (DELETE)
- Test: `app/api/admin/curriculum/lessons/[id]/links/route.test.ts`

**Interfaces:**
- Consumes: `createConceptLinkService` (Task 8).
- Produces: `POST /api/admin/curriculum/lessons/:id/links` (body `{ otherLessonId: string }`) and `DELETE /api/admin/curriculum/lessons/:id/links/:otherId`. Used by Task 22's `ConceptLinkSection` component.

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/curriculum/lessons/[id]/links/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { DELETE } from './[otherId]/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/lessons/[id]/links', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-links-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g1', 'generic', 'A1', 'grammar', 'G1');
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-t1', 'telc', 'A1', 'grammar', 'T1');
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }),
      { params: { id: 'a1-g1' } }
    );
    expect(res.status).toBe(401);
  });

  it('creates a link', async () => {
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }),
      { params: { id: 'a1-g1' } }
    );
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT 1 FROM lesson_concept_links').get();
    expect(row).toBeDefined();
  });

  it('returns 400 when the link is invalid (same track)', async () => {
    getDb().exec(
      `INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g2', 'generic', 'A1', 'grammar', 'G2')`
    );
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-g2' }) }),
      { params: { id: 'a1-g1' } }
    );
    expect(res.status).toBe(400);
  });

  it('removes a link', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ otherLessonId: 'a1-t1' }) }), {
      params: { id: 'a1-g1' },
    });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: { id: 'a1-g1', otherId: 'a1-t1' },
    });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM lesson_concept_links').get()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/admin/curriculum/lessons/[id]/links"`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement**

Create `app/api/admin/curriculum/lessons/[id]/links/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createConceptLinkService } from '@/lib/services/conceptLinkService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { otherLessonId } = await request.json();
  const service = createConceptLinkService(getDb());
  try {
    service.addLink(params.id, otherLessonId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/lessons/[id]/links/[otherId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createConceptLinkService } from '@/lib/services/conceptLinkService';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: { id: string; otherId: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createConceptLinkService(getDb());
  service.removeLink(params.id, params.otherId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/admin/curriculum/lessons/[id]/links"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/curriculum/lessons/[id]/links"
git commit -m "feat: add concept-link add/remove API routes"
```

---

### Task 15: Milestone API routes

**Files:**
- Create: `app/api/admin/curriculum/milestones/route.ts` (POST)
- Create: `app/api/admin/curriculum/milestones/[id]/route.ts` (PATCH, DELETE)
- Create: `app/api/admin/curriculum/milestones/reorder/route.ts` (PATCH)
- Test: `app/api/admin/curriculum/milestones/route.test.ts`

**Interfaces:**
- Consumes: `createCurriculumStructureService` (Task 12).
- Produces: `POST /api/admin/curriculum/milestones` (body `{ track, level, title, description }`), `PATCH /api/admin/curriculum/milestones/:id` (body `{ title, description }`), `DELETE /api/admin/curriculum/milestones/:id`, `PATCH /api/admin/curriculum/milestones/reorder` (body `{ track, level, orderedIds }`). The confirmation UI (naming what moves to Unsorted before a delete) reads this from the track structure the admin UI already has loaded — see spec "Data Model Changes" → `milestones`/`sections" — so no separate preview route is needed here, unlike lesson delete. Used by Task 24's structure-management UI.

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/curriculum/milestones/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { PATCH as reorder } from './reorder/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/milestones', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-milestones-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('creates a milestone', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Basics');
  });

  it('renames a milestone', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
        })
      )
    ).json();

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Fundamentals', description: null }) }),
      { params: { id: created.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Fundamentals');
  });

  it('deletes a milestone', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'Basics', description: null }),
        })
      )
    ).json();

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: created.id } });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM milestones WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('reorders milestones, rejecting a payload that includes Unsorted', async () => {
    const m1 = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ track: 'generic', level: 'A1', title: 'M1', description: null }),
        })
      )
    ).json();

    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ track: 'generic', level: 'A1', orderedIds: [m1.id, 'generic-a1-unsorted'] }),
      })
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/curriculum/milestones`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement**

Create `app/api/admin/curriculum/milestones/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { track, level, title, description } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    const milestone = service.createMilestone(track, level, title, description);
    return NextResponse.json(milestone, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/milestones/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, description } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    const milestone = service.renameMilestone(params.id, title, description);
    return NextResponse.json(milestone);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createCurriculumStructureService(getDb());
  try {
    service.deleteMilestone(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/milestones/reorder/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { track, level, orderedIds } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    service.reorderMilestones(track, level, orderedIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/curriculum/milestones`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/curriculum/milestones
git commit -m "feat: add milestone create/rename/delete/reorder API routes"
```

---

### Task 16: Section API routes

**Files:**
- Create: `app/api/admin/curriculum/sections/route.ts` (POST)
- Create: `app/api/admin/curriculum/sections/[id]/route.ts` (PATCH, DELETE)
- Create: `app/api/admin/curriculum/sections/reorder/route.ts` (PATCH)
- Test: `app/api/admin/curriculum/sections/route.test.ts`

**Interfaces:**
- Consumes: `createCurriculumStructureService` (Task 12).
- Produces: `POST /api/admin/curriculum/sections` (body `{ milestoneId, title, description }`), `PATCH /api/admin/curriculum/sections/:id` (body `{ title, description }`), `DELETE /api/admin/curriculum/sections/:id`, `PATCH /api/admin/curriculum/sections/reorder` (body `{ milestoneId, orderedIds }`). Used by Task 24's structure-management UI.

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/curriculum/sections/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { PATCH as reorder } from './reorder/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/sections', () => {
  let milestoneId: string;

  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-sections-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    milestoneId = 'm1';
    getDb().exec(
      `INSERT INTO milestones (id, track, level, title, order_index) VALUES ('${milestoneId}', 'generic', 'A1', 'M1', 0)`
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  it('creates a section', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).title).toBe('S1');
  });

  it('renames a section', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
        })
      )
    ).json();

    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: 'Section One', description: null }) }),
      { params: { id: created.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Section One');
  });

  it('deletes a section', async () => {
    const created = await (
      await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ milestoneId, title: 'S1', description: null }),
        })
      )
    ).json();

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: created.id } });
    expect(res.status).toBe(200);
    expect(getDb().prepare('SELECT 1 FROM sections WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it('reorders sections within a milestone', async () => {
    const s1 = await (
      await POST(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({ milestoneId, title: 'S1', description: null }) })
      )
    ).json();
    const s2 = await (
      await POST(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({ milestoneId, title: 'S2', description: null }) })
      )
    ).json();

    const res = await reorder(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ milestoneId, orderedIds: [s2.id, s1.id] }),
      })
    );
    expect(res.status).toBe(200);
    const rows = getDb()
      .prepare('SELECT id FROM sections WHERE milestone_id = ? ORDER BY order_index')
      .all(milestoneId) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([s2.id, s1.id]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/admin/curriculum/sections`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement**

Create `app/api/admin/curriculum/sections/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { milestoneId, title, description } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    const section = service.createSection(milestoneId, title, description);
    return NextResponse.json(section, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/sections/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, description } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    const section = service.renameSection(params.id, title, description);
    return NextResponse.json(section);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createCurriculumStructureService(getDb());
  try {
    service.deleteSection(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

Create `app/api/admin/curriculum/sections/reorder/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumStructureService } from '@/lib/services/curriculumStructureService';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { milestoneId, orderedIds } = await request.json();
  const service = createCurriculumStructureService(getDb());
  try {
    service.reorderSections(milestoneId, orderedIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/admin/curriculum/sections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/curriculum/sections
git commit -m "feat: add section create/rename/delete/reorder API routes"
```

---

### Task 17: Dependency diagram layout (pure function)

**Files:**
- Create: `lib/curriculum-admin/diagramLayout.ts`
- Test: `lib/curriculum-admin/diagramLayout.test.ts`

**Interfaces:**
- Produces: `DiagramNode = { id: string; column: number; row: number }` and `computeDiagramLayout(lessonIds: string[], prerequisites: { lessonId: string; prerequisiteLessonId: string }[]): DiagramNode[]`. Topological layering per spec "Dependency Diagram": a lesson's column is `1 + max(column of its prerequisites)`, or `0` if it has none; lessons sharing a column stack into distinct rows (sorted by id for a stable layout). Used by Task 25's diagram UI component.

- [ ] **Step 1: Write the failing tests**

Create `lib/curriculum-admin/diagramLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDiagramLayout } from './diagramLayout';

describe('computeDiagramLayout', () => {
  it('places lessons with no prerequisites in column 0', () => {
    const layout = computeDiagramLayout(['a', 'b'], []);
    expect(layout.every((n) => n.column === 0)).toBe(true);
  });

  it('stacks lessons sharing a column into distinct rows, sorted by id', () => {
    const layout = computeDiagramLayout(['b', 'a'], []);
    const sorted = [...layout].sort((x, y) => x.row - y.row);
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b']);
    expect(sorted.map((n) => n.row)).toEqual([0, 1]);
  });

  it('assigns column = 1 + max(prerequisite column) along a simple chain', () => {
    const layout = computeDiagramLayout(
      ['a', 'b', 'c'],
      [
        { lessonId: 'b', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'b' },
      ]
    );
    const byId = Object.fromEntries(layout.map((n) => [n.id, n.column]));
    expect(byId).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('takes the max column across multiple prerequisites (fan-in)', () => {
    const layout = computeDiagramLayout(
      ['a', 'b', 'c'],
      [
        { lessonId: 'b', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'a' },
        { lessonId: 'c', prerequisiteLessonId: 'b' },
      ]
    );
    const byId = Object.fromEntries(layout.map((n) => [n.id, n.column]));
    expect(byId).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('throws on a cycle rather than looping forever', () => {
    expect(() =>
      computeDiagramLayout(
        ['a', 'b'],
        [
          { lessonId: 'a', prerequisiteLessonId: 'b' },
          { lessonId: 'b', prerequisiteLessonId: 'a' },
        ]
      )
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/curriculum-admin/diagramLayout.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/curriculum-admin/diagramLayout.ts`:

```ts
export interface DiagramNode {
  id: string;
  column: number;
  row: number;
}

/**
 * Pure topological-layering layout for the read-only dependency diagram (spec
 * "Dependency Diagram"). A lesson's column is 1 + the max column among its
 * prerequisites, or 0 if it has none; lessons sharing a column stack into
 * distinct rows in id order for a stable, deterministic layout.
 */
export function computeDiagramLayout(
  lessonIds: string[],
  prerequisites: { lessonId: string; prerequisiteLessonId: string }[]
): DiagramNode[] {
  const prereqsOf = new Map<string, string[]>();
  for (const id of lessonIds) prereqsOf.set(id, []);
  for (const p of prerequisites) {
    if (prereqsOf.has(p.lessonId)) prereqsOf.get(p.lessonId)!.push(p.prerequisiteLessonId);
  }

  const columnCache = new Map<string, number>();
  const visiting = new Set<string>();

  function columnOf(id: string): number {
    if (columnCache.has(id)) return columnCache.get(id)!;
    if (visiting.has(id)) throw new Error(`Cycle detected involving lesson ${id}`);
    visiting.add(id);
    const prereqs = prereqsOf.get(id) ?? [];
    const column = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(columnOf));
    visiting.delete(id);
    columnCache.set(id, column);
    return column;
  }

  const byColumn = new Map<number, string[]>();
  for (const id of lessonIds) {
    const column = columnOf(id);
    if (!byColumn.has(column)) byColumn.set(column, []);
    byColumn.get(column)!.push(id);
  }

  const result: DiagramNode[] = [];
  for (const [column, ids] of byColumn) {
    const sortedIds = [...ids].sort();
    sortedIds.forEach((id, row) => result.push({ id, column, row }));
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/curriculum-admin/diagramLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum-admin/diagramLayout.ts lib/curriculum-admin/diagramLayout.test.ts
git commit -m "feat: add topological-layering diagram layout function"
```

---

### Task 18: Structured exercise editor component

**Files:**
- Create: `components/admin/ExerciseEditor.tsx`
- Test: `components/admin/ExerciseEditor.test.tsx`

**Interfaces:**
- Produces: `ExerciseFormEntry = { id?: string; type: ExerciseType; content: ExerciseContent }` and `<ExerciseEditor exercises={ExerciseFormEntry[]} onChange={(exercises: ExerciseFormEntry[]) => void} />` — a controlled component (parent owns state), add/remove freely, no order, a type selector per exercise revealing that type's fields. Used by Task 21's lesson editor form.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/ExerciseEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';

describe('ExerciseEditor', () => {
  it('renders zero exercises with an Add button', () => {
    render(<ExerciseEditor exercises={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Exercises (0)')).toBeInTheDocument();
    expect(screen.getByText('Add exercise')).toBeInTheDocument();
  });

  it('adds a new flashcard exercise', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([{ type: 'flashcard', content: { front: '', back: '' } }]);
  });

  it('edits a flashcard field without touching its id', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [{ id: 'ex1', type: 'flashcard', content: { front: '', back: '' } }];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 front'), { target: { value: 'Hund' } });
    expect(onChange).toHaveBeenCalledWith([{ id: 'ex1', type: 'flashcard', content: { front: 'Hund', back: '' } }]);
  });

  it('switching type resets content to that type\'s blank shape', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [{ id: 'ex1', type: 'flashcard', content: { front: 'x', back: 'y' } }];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 type'), { target: { value: 'fill_blank' } });
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'fill_blank', content: { textWithBlank: '', correctAnswer: '' } },
    ]);
  });

  it('adds and removes a multiple-choice option', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add option'));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'ex1', type: 'multiple_choice', content: { question: 'Q', options: ['a', 'b', ''], correctIndex: 0 } },
    ]);
  });

  it('removes an exercise entirely', () => {
    const onChange = vi.fn();
    const exercises: ExerciseFormEntry[] = [
      { id: 'ex1', type: 'flashcard', content: { front: 'a', back: 'b' } },
      { id: 'ex2', type: 'flashcard', content: { front: 'c', back: 'd' } },
    ];
    render(<ExerciseEditor exercises={exercises} onChange={onChange} />);
    fireEvent.click(screen.getByText('Remove exercise 1'));
    expect(onChange).toHaveBeenCalledWith([{ id: 'ex2', type: 'flashcard', content: { front: 'c', back: 'd' } }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/ExerciseEditor.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `components/admin/ExerciseEditor.tsx`:

```tsx
'use client';

import type {
  ExerciseType,
  ExerciseContent,
  MultipleChoiceContent,
  FillBlankContent,
  FlashcardContent,
  FreeTextContent,
} from '@/lib/curriculum/types';

export interface ExerciseFormEntry {
  id?: string;
  type: ExerciseType;
  content: ExerciseContent;
}

function blankContentFor(type: ExerciseType): ExerciseContent {
  switch (type) {
    case 'multiple_choice':
      return { question: '', options: ['', ''], correctIndex: 0 };
    case 'fill_blank':
      return { textWithBlank: '', correctAnswer: '' };
    case 'flashcard':
      return { front: '', back: '' };
    case 'free_text':
      return { prompt: '', modelAnswer: '' };
  }
}

export function ExerciseEditor({
  exercises,
  onChange,
}: {
  exercises: ExerciseFormEntry[];
  onChange: (exercises: ExerciseFormEntry[]) => void;
}) {
  function updateAt(index: number, entry: ExerciseFormEntry) {
    const next = [...exercises];
    next[index] = entry;
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(exercises.filter((_, i) => i !== index));
  }

  function addExercise() {
    onChange([...exercises, { type: 'flashcard', content: blankContentFor('flashcard') }]);
  }

  return (
    <div>
      <h3>Exercises ({exercises.length})</h3>
      {exercises.map((exercise, index) => (
        <div key={exercise.id ?? `new-${index}`}>
          <select
            aria-label={`Exercise ${index + 1} type`}
            value={exercise.type}
            onChange={(e) => {
              const type = e.target.value as ExerciseType;
              updateAt(index, { ...exercise, type, content: blankContentFor(type) });
            }}
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="fill_blank">Fill in the blank</option>
            <option value="flashcard">Flashcard</option>
            <option value="free_text">Free text</option>
          </select>

          {exercise.type === 'multiple_choice' && (
            <MultipleChoiceFields
              content={exercise.content as MultipleChoiceContent}
              index={index}
              onChange={(content) => updateAt(index, { ...exercise, content })}
            />
          )}
          {exercise.type === 'fill_blank' && (
            <FillBlankFields
              content={exercise.content as FillBlankContent}
              index={index}
              onChange={(content) => updateAt(index, { ...exercise, content })}
            />
          )}
          {exercise.type === 'flashcard' && (
            <FlashcardFields
              content={exercise.content as FlashcardContent}
              index={index}
              onChange={(content) => updateAt(index, { ...exercise, content })}
            />
          )}
          {exercise.type === 'free_text' && (
            <FreeTextFields
              content={exercise.content as FreeTextContent}
              index={index}
              onChange={(content) => updateAt(index, { ...exercise, content })}
            />
          )}

          <button type="button" onClick={() => removeAt(index)}>
            Remove exercise {index + 1}
          </button>
        </div>
      ))}
      <button type="button" onClick={addExercise}>
        Add exercise
      </button>
    </div>
  );
}

function MultipleChoiceFields({
  content,
  index,
  onChange,
}: {
  content: MultipleChoiceContent;
  index: number;
  onChange: (content: MultipleChoiceContent) => void;
}) {
  function updateOption(optionIndex: number, value: string) {
    const options = [...content.options];
    options[optionIndex] = value;
    onChange({ ...content, options });
  }

  function removeOption(optionIndex: number) {
    const options = content.options.filter((_, i) => i !== optionIndex);
    const correctIndex = content.correctIndex >= options.length ? 0 : content.correctIndex;
    onChange({ ...content, options, correctIndex });
  }

  return (
    <div>
      <input
        aria-label={`Exercise ${index + 1} question`}
        value={content.question}
        onChange={(e) => onChange({ ...content, question: e.target.value })}
        placeholder="Question"
      />
      {content.options.map((option, optionIndex) => (
        <div key={optionIndex}>
          <input
            aria-label={`Exercise ${index + 1} option ${optionIndex + 1}`}
            value={option}
            onChange={(e) => updateOption(optionIndex, e.target.value)}
            placeholder={`Option ${optionIndex + 1}`}
          />
          <input
            type="radio"
            aria-label={`Exercise ${index + 1} option ${optionIndex + 1} is correct`}
            checked={content.correctIndex === optionIndex}
            onChange={() => onChange({ ...content, correctIndex: optionIndex })}
          />
          <button type="button" onClick={() => removeOption(optionIndex)}>
            Remove option
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...content, options: [...content.options, ''] })}>
        Add option
      </button>
    </div>
  );
}

function FillBlankFields({
  content,
  index,
  onChange,
}: {
  content: FillBlankContent;
  index: number;
  onChange: (content: FillBlankContent) => void;
}) {
  return (
    <div>
      <input
        aria-label={`Exercise ${index + 1} text with blank`}
        value={content.textWithBlank}
        onChange={(e) => onChange({ ...content, textWithBlank: e.target.value })}
        placeholder="Text with blank"
      />
      <input
        aria-label={`Exercise ${index + 1} correct answer`}
        value={content.correctAnswer}
        onChange={(e) => onChange({ ...content, correctAnswer: e.target.value })}
        placeholder="Correct answer"
      />
    </div>
  );
}

function FlashcardFields({
  content,
  index,
  onChange,
}: {
  content: FlashcardContent;
  index: number;
  onChange: (content: FlashcardContent) => void;
}) {
  return (
    <div>
      <input
        aria-label={`Exercise ${index + 1} front`}
        value={content.front}
        onChange={(e) => onChange({ ...content, front: e.target.value })}
        placeholder="Front"
      />
      <input
        aria-label={`Exercise ${index + 1} back`}
        value={content.back}
        onChange={(e) => onChange({ ...content, back: e.target.value })}
        placeholder="Back"
      />
    </div>
  );
}

function FreeTextFields({
  content,
  index,
  onChange,
}: {
  content: FreeTextContent;
  index: number;
  onChange: (content: FreeTextContent) => void;
}) {
  return (
    <div>
      <input
        aria-label={`Exercise ${index + 1} prompt`}
        value={content.prompt}
        onChange={(e) => onChange({ ...content, prompt: e.target.value })}
        placeholder="Prompt"
      />
      <input
        aria-label={`Exercise ${index + 1} model answer`}
        value={content.modelAnswer}
        onChange={(e) => onChange({ ...content, modelAnswer: e.target.value })}
        placeholder="Model answer"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/ExerciseEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ExerciseEditor.tsx components/admin/ExerciseEditor.test.tsx
git commit -m "feat: add structured exercise editor component"
```

---

### Task 19: Prerequisite picker component

**Files:**
- Create: `components/admin/PrerequisitePicker.tsx`
- Test: `components/admin/PrerequisitePicker.test.tsx`

**Interfaces:**
- Produces: `PickableLesson = { id: string; title: string }` and `<PrerequisitePicker candidates={PickableLesson[]} selectedIds={string[]} onChange={(ids: string[]) => void} />` — a controlled multi-select checkbox list. The caller is responsible for restricting `candidates` to other lessons already in the same track+level (per spec "Lesson CRUD" → Add), and for excluding the lesson being edited itself. Used by Task 21's lesson editor form.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/PrerequisitePicker.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PrerequisitePicker } from './PrerequisitePicker';

describe('PrerequisitePicker', () => {
  it('shows a message when there are no candidates', () => {
    render(<PrerequisitePicker candidates={[]} selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByText('No other lessons in this track/level yet.')).toBeInTheDocument();
  });

  it('renders a checkbox per candidate, checked for already-selected ids', () => {
    render(
      <PrerequisitePicker
        candidates={[
          { id: 'a1-basics', title: 'Basics' },
          { id: 'a1-advanced', title: 'Advanced' },
        ]}
        selectedIds={['a1-basics']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Basics')).toBeChecked();
    expect(screen.getByLabelText('Advanced')).not.toBeChecked();
  });

  it('checking a box adds its id', () => {
    const onChange = vi.fn();
    render(
      <PrerequisitePicker candidates={[{ id: 'a1-basics', title: 'Basics' }]} selectedIds={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Basics'));
    expect(onChange).toHaveBeenCalledWith(['a1-basics']);
  });

  it('unchecking a box removes its id', () => {
    const onChange = vi.fn();
    render(
      <PrerequisitePicker
        candidates={[{ id: 'a1-basics', title: 'Basics' }]}
        selectedIds={['a1-basics']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Basics'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/PrerequisitePicker.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `components/admin/PrerequisitePicker.tsx`:

```tsx
'use client';

export interface PickableLesson {
  id: string;
  title: string;
}

export function PrerequisitePicker({
  candidates,
  selectedIds,
  onChange,
}: {
  candidates: PickableLesson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div>
      <h3>Prerequisites</h3>
      {candidates.length === 0 && <p>No other lessons in this track/level yet.</p>}
      {candidates.map((lesson) => (
        <label key={lesson.id}>
          <input type="checkbox" checked={selectedIds.includes(lesson.id)} onChange={() => toggle(lesson.id)} />
          {lesson.title}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/PrerequisitePicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PrerequisitePicker.tsx components/admin/PrerequisitePicker.test.tsx
git commit -m "feat: add prerequisite picker component"
```

---

### Task 20: Placement picker component

**Files:**
- Create: `components/admin/PlacementPicker.tsx`
- Test: `components/admin/PlacementPicker.test.tsx`

**Interfaces:**
- Produces: `PlacementSectionOption = { id: string; title: string }`, `PlacementMilestoneOption = { id: string; title: string; sections: PlacementSectionOption[] }`, `PlacementValue = { sectionId: string } | { milestoneId: string; newSectionTitle: string } | { newMilestoneTitle: string; newSectionTitle: string }`, and `<PlacementPicker milestones={PlacementMilestoneOption[]} onChange={(value: PlacementValue | null) => void} />`. Emits `null` whenever the current in-progress selection doesn't yet resolve to a complete placement (the lesson editor form, Task 21, disables Submit while the value is `null`). The caller excludes the Unsorted milestone from `milestones` entirely — this component never offers it, per spec "Data Model Changes" → `lesson_placements`. The emitted shape matches `PlacementInput` from Task 5's `resolvePlacement`, so it can be sent straight through as the API request's `placement` field. Used by Task 21's lesson editor form.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/PlacementPicker.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlacementPicker, type PlacementMilestoneOption } from './PlacementPicker';

const milestones: PlacementMilestoneOption[] = [
  { id: 'm1', title: 'Milestone 1', sections: [{ id: 's1', title: 'Section 1' }] },
];

describe('PlacementPicker', () => {
  it('emits null before any milestone is chosen', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalledWith(expect.anything());
  });

  it('selecting an existing section emits {sectionId}', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    expect(onChange).toHaveBeenLastCalledWith({ sectionId: 's1' });
  });

  it('emits null while an existing milestone is chosen but no section yet', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('a new section under an existing milestone emits {milestoneId, newSectionTitle} once titled', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: '__new__' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New section title'), { target: { value: 'Fresh Section' } });
    expect(onChange).toHaveBeenLastCalledWith({ milestoneId: 'm1', newSectionTitle: 'Fresh Section' });
  });

  it('a new milestone emits {newMilestoneTitle, newSectionTitle} once both are titled', () => {
    const onChange = vi.fn();
    render(<PlacementPicker milestones={milestones} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Fresh Milestone' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('New section title'), { target: { value: 'Fresh Section' } });
    expect(onChange).toHaveBeenLastCalledWith({ newMilestoneTitle: 'Fresh Milestone', newSectionTitle: 'Fresh Section' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/PlacementPicker.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `components/admin/PlacementPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';

export interface PlacementSectionOption {
  id: string;
  title: string;
}

export interface PlacementMilestoneOption {
  id: string;
  title: string;
  sections: PlacementSectionOption[];
}

export type PlacementValue =
  | { sectionId: string }
  | { milestoneId: string; newSectionTitle: string }
  | { newMilestoneTitle: string; newSectionTitle: string };

const NEW_OPTION = '__new__';

export function PlacementPicker({
  milestones,
  onChange,
}: {
  milestones: PlacementMilestoneOption[];
  onChange: (value: PlacementValue | null) => void;
}) {
  const [milestoneChoice, setMilestoneChoice] = useState('');
  const [sectionChoice, setSectionChoice] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const selectedMilestone = milestones.find((m) => m.id === milestoneChoice);

  function emit(next: {
    milestoneChoice: string;
    sectionChoice: string;
    newMilestoneTitle: string;
    newSectionTitle: string;
  }) {
    if (next.milestoneChoice === NEW_OPTION) {
      if (next.newMilestoneTitle && next.newSectionTitle) {
        onChange({ newMilestoneTitle: next.newMilestoneTitle, newSectionTitle: next.newSectionTitle });
      } else {
        onChange(null);
      }
      return;
    }
    if (!next.milestoneChoice) {
      onChange(null);
      return;
    }
    if (next.sectionChoice === NEW_OPTION) {
      onChange(next.newSectionTitle ? { milestoneId: next.milestoneChoice, newSectionTitle: next.newSectionTitle } : null);
      return;
    }
    onChange(next.sectionChoice ? { sectionId: next.sectionChoice } : null);
  }

  function handleMilestoneChange(id: string) {
    setMilestoneChoice(id);
    setSectionChoice('');
    setNewSectionTitle('');
    const keepNewMilestoneTitle = id === NEW_OPTION ? newMilestoneTitle : '';
    setNewMilestoneTitle(keepNewMilestoneTitle);
    emit({ milestoneChoice: id, sectionChoice: '', newMilestoneTitle: keepNewMilestoneTitle, newSectionTitle: '' });
  }

  function handleSectionChange(id: string) {
    setSectionChoice(id);
    emit({ milestoneChoice, sectionChoice: id, newMilestoneTitle, newSectionTitle });
  }

  function handleNewMilestoneTitleChange(title: string) {
    setNewMilestoneTitle(title);
    emit({ milestoneChoice, sectionChoice, newMilestoneTitle: title, newSectionTitle });
  }

  function handleNewSectionTitleChange(title: string) {
    setNewSectionTitle(title);
    emit({ milestoneChoice, sectionChoice, newMilestoneTitle, newSectionTitle: title });
  }

  return (
    <div>
      <h3>Placement</h3>
      <label>
        Milestone
        <select aria-label="Milestone" value={milestoneChoice} onChange={(e) => handleMilestoneChange(e.target.value)}>
          <option value="">Select a milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Create new milestone</option>
        </select>
      </label>

      {milestoneChoice === NEW_OPTION && (
        <input
          aria-label="New milestone title"
          placeholder="New milestone title"
          value={newMilestoneTitle}
          onChange={(e) => handleNewMilestoneTitleChange(e.target.value)}
        />
      )}

      {milestoneChoice && milestoneChoice !== NEW_OPTION && (
        <label>
          Section
          <select aria-label="Section" value={sectionChoice} onChange={(e) => handleSectionChange(e.target.value)}>
            <option value="">Select a section</option>
            {(selectedMilestone?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Create new section</option>
          </select>
        </label>
      )}

      {(sectionChoice === NEW_OPTION || milestoneChoice === NEW_OPTION) && (
        <input
          aria-label="New section title"
          placeholder="New section title"
          value={newSectionTitle}
          onChange={(e) => handleNewSectionTitleChange(e.target.value)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/PlacementPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PlacementPicker.tsx components/admin/PlacementPicker.test.tsx
git commit -m "feat: add placement picker component with inline milestone/section creation"
```

---

### Task 21: Shared lesson editor form, and the Add-lesson page

**Files:**
- Create: `components/admin/LessonEditorForm.tsx`
- Create: `app/admin/curriculum/[track]/[level]/new/page.tsx`
- Modify: `app/admin/curriculum/[track]/[level]/page.tsx`
- Test: `components/admin/LessonEditorForm.test.tsx`

**Interfaces:**
- Consumes: `ExerciseEditor`/`ExerciseFormEntry` (Task 18), `PrerequisitePicker`/`PickableLesson` (Task 19), `PlacementPicker`/`PlacementMilestoneOption`/`PlacementValue` (Task 20), the existing read-only `GET /api/curriculum/tracks/:track/:level`, and the create/update routes from Task 13.
- Produces: `<LessonEditorForm mode="create" initialTrack={Track} initialSourceLevel={CefrLevel} onSaved={(lesson) => void} />` and `<LessonEditorForm mode="edit" lessonId={string} initial={LessonEditorInitialValues} onSaved={(lesson) => void} />`. Used directly by the new Add page here, and by Task 22's Edit wiring on the lesson detail page.

This task does **not** add a dedicated test for `app/admin/curriculum/[track]/[level]/new/page.tsx` — following this codebase's existing convention where only the top-level `/admin/curriculum` page has a redirect-gate test (`app/admin/curriculum/page.test.tsx`); the nested `[track]/[level]/page.tsx` and `lesson/[id]/page.tsx` pages have none. The new page is the same shape (auth-gate + render), and its rendered content (`LessonEditorForm`) is fully covered by this task's component test.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/LessonEditorForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonEditorForm } from './LessonEditorForm';

const trackStructureResponse = [
  {
    milestone: { id: 'm1', title: 'Milestone 1' },
    sections: [{ section: { id: 's1', title: 'Section 1' }, lessons: [{ id: 'a1-other', title: 'Other Lesson' }] }],
  },
  {
    milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' },
    sections: [{ section: { id: 'generic-a1-unsorted-section', title: 'Unsorted' }, lessons: [] }],
  },
];

describe('LessonEditorForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockResolvedValue({ ok: true, json: async () => trackStructureResponse });
  });

  it('fetches the track structure and excludes Unsorted from the milestone picker', async () => {
    render(
      <LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByLabelText('Milestone')).toBeInTheDocument());
    expect(screen.queryByText('Unsorted')).not.toBeInTheDocument();
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
  });

  it('excludes the lesson being edited from its own prerequisite candidates', async () => {
    render(
      <LessonEditorForm
        mode="edit"
        lessonId="a1-other"
        initial={{
          slug: 'other',
          track: 'generic',
          sourceLevel: 'A1',
          skill: 'grammar',
          title: 'Other Lesson',
          explanation: null,
          examples: null,
          exercises: [],
          prerequisiteIds: [],
        }}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText('Prerequisites')).toBeInTheDocument());
    expect(screen.queryByLabelText('Other Lesson')).not.toBeInTheDocument();
  });

  it('submits a create request with the form body and calls onSaved', async () => {
    const onSaved = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: true, json: async () => ({ id: 'a1-new-lesson', title: 'New Lesson' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByLabelText('Milestone')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'a1-new-lesson', title: 'New Lesson' }));
    const createCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(createCall[1].method).toBe('POST');
    const body = JSON.parse(createCall[1].body);
    expect(body).toMatchObject({ slug: 'new-lesson', title: 'New Lesson', placement: { sectionId: 's1' } });
  });

  it('shows an error and does not call onSaved when the save request fails', async () => {
    const onSaved = vi.fn();
    (fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/curriculum/tracks')) return Promise.resolve({ ok: true, json: async () => trackStructureResponse });
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Duplicate id' }) });
    });
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByLabelText('Milestone')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Slug'), { target: { value: 'new-lesson' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'New Lesson' } });
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Duplicate id'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables Save while no placement is chosen', async () => {
    render(<LessonEditorForm mode="create" initialTrack="generic" initialSourceLevel="A1" onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Milestone')).toBeInTheDocument());
    expect(screen.getByText('Save')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/LessonEditorForm.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `components/admin/LessonEditorForm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import type { Skill } from '@/lib/curriculum/types';
import { ExerciseEditor, type ExerciseFormEntry } from './ExerciseEditor';
import { PrerequisitePicker, type PickableLesson } from './PrerequisitePicker';
import { PlacementPicker, type PlacementMilestoneOption, type PlacementValue } from './PlacementPicker';

export interface LessonEditorInitialValues {
  slug: string;
  track: Track;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  exercises: ExerciseFormEntry[];
  prerequisiteIds: string[];
}

const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

type TrackStructureResponse = {
  milestone: { id: string; title: string };
  sections: { section: { id: string; title: string }; lessons: { id: string; title: string }[] }[];
}[];

function unsortedIdFor(track: Track, sourceLevel: CefrLevel): string {
  return `${track}-${sourceLevel.toLowerCase()}-unsorted`;
}

export function LessonEditorForm(
  props:
    | { mode: 'create'; initialTrack: Track; initialSourceLevel: CefrLevel; onSaved: (lesson: { id: string }) => void }
    | { mode: 'edit'; lessonId: string; initial: LessonEditorInitialValues; onSaved: (lesson: { id: string }) => void }
) {
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const lessonId = props.mode === 'edit' ? props.lessonId : undefined;

  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [track, setTrack] = useState<Track>(props.mode === 'create' ? props.initialTrack : initial!.track);
  const [sourceLevel, setSourceLevel] = useState<CefrLevel>(
    props.mode === 'create' ? props.initialSourceLevel : initial!.sourceLevel
  );
  const [skill, setSkill] = useState<Skill>(initial?.skill ?? 'grammar');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [examples, setExamples] = useState<string[]>(initial?.examples ?? []);
  const [exercises, setExercises] = useState<ExerciseFormEntry[]>(initial?.exercises ?? []);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(initial?.prerequisiteIds ?? []);
  const [placement, setPlacement] = useState<PlacementValue | null>(null);
  const [candidates, setCandidates] = useState<PickableLesson[]>([]);
  const [milestones, setMilestones] = useState<PlacementMilestoneOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${sourceLevel}`)
      .then((r) => r.json())
      .then((structure: TrackStructureResponse) => {
        const unsortedId = unsortedIdFor(track, sourceLevel);
        const realEntries = structure.filter((entry) => entry.milestone.id !== unsortedId);
        setMilestones(
          realEntries.map((entry) => ({
            id: entry.milestone.id,
            title: entry.milestone.title,
            sections: entry.sections.map((s) => ({ id: s.section.id, title: s.section.title })),
          }))
        );
        const allLessons = structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons));
        setCandidates(allLessons.filter((lesson) => lesson.id !== lessonId));
      });
  }, [track, sourceLevel, lessonId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placement) return;
    setSaving(true);
    setError(null);
    const body = {
      ...(props.mode === 'create' ? { slug } : {}),
      track,
      sourceLevel,
      skill,
      title,
      explanation: explanation || null,
      examples: examples.length > 0 ? examples : null,
      exercises,
      prerequisiteIds,
      placement,
    };
    const url = props.mode === 'create' ? '/api/admin/curriculum/lessons' : `/api/admin/curriculum/lessons/${lessonId}`;
    const method = props.mode === 'create' ? 'POST' : 'PATCH';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      props.onSaved(await res.json());
    } else {
      const data = await res.json();
      setError(data.error ?? 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {props.mode === 'create' && (
        <input placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
      )}
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label>
        Track
        <select aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value as Track)}>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        Level
        <select aria-label="Level" value={sourceLevel} onChange={(e) => setSourceLevel(e.target.value as CefrLevel)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label>
        Skill
        <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
          {SKILLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <textarea
        placeholder="Explanation"
        value={explanation ?? ''}
        onChange={(e) => setExplanation(e.target.value)}
      />

      <div>
        <h3>Examples</h3>
        {examples.map((example, index) => (
          <div key={index}>
            <input
              aria-label={`Example ${index + 1}`}
              value={example}
              onChange={(e) => setExamples(examples.map((ex, i) => (i === index ? e.target.value : ex)))}
            />
            <button type="button" onClick={() => setExamples(examples.filter((_, i) => i !== index))}>
              Remove example {index + 1}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setExamples([...examples, ''])}>
          Add example
        </button>
      </div>

      <ExerciseEditor exercises={exercises} onChange={setExercises} />

      <PrerequisitePicker candidates={candidates} selectedIds={prerequisiteIds} onChange={setPrerequisiteIds} />

      <PlacementPicker milestones={milestones} onChange={setPlacement} />

      <button type="submit" disabled={!placement || saving}>
        Save
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

Create `app/admin/curriculum/[track]/[level]/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LessonEditorForm } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage({ params }: { params: { track: string; level: string } }) {
  const router = useRouter();
  return (
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
  );
}
```

(This page is a client component, so the server-side `isAdminSessionValid()` redirect-gate used by its sibling pages doesn't apply here directly; the create API route itself is still auth-gated per Task 13, so an unauthenticated visitor sees the form but every save attempt 401s. This matches the existing precedent of `components/admin/AdminLogin.tsx` and `CurriculumBrowser.tsx`'s `LessonDetail`, which are also client components with no page-level gate of their own beyond their API calls.)

Modify `app/admin/curriculum/[track]/[level]/page.tsx` — add a link to the new Add page, changing the header from:

```tsx
      <h1>
        {params.track} — {params.level}
      </h1>
```

to:

```tsx
      <h1>
        {params.track} — {params.level}
      </h1>
      <a href={`/admin/curriculum/${params.track}/${params.level}/new`}>+ New Lesson</a>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/LessonEditorForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/LessonEditorForm.tsx components/admin/LessonEditorForm.test.tsx "app/admin/curriculum/[track]/[level]/new" "app/admin/curriculum/[track]/[level]/page.tsx"
git commit -m "feat: add shared lesson editor form and the Add-lesson page"
```

---

### Task 22: Concept-link section, Edit/Clone wiring, and the Edit page

**Files:**
- Modify: `app/api/curriculum/lessons/[id]/route.ts` (add `conceptLinks` to the response)
- Modify: `app/api/curriculum/route.test.ts` (extend the existing lesson-read test)
- Create: `components/admin/ConceptLinkSection.tsx`
- Test: `components/admin/ConceptLinkSection.test.tsx`
- Modify: `components/admin/CurriculumBrowser.tsx` (Edit/Clone links, render `ConceptLinkSection`)
- Test: `components/admin/CurriculumBrowser.test.tsx` (new file)
- Modify: `components/admin/LessonEditorForm.tsx` (optional `initialContent` for create mode)
- Modify: `app/admin/curriculum/[track]/[level]/new/page.tsx` (read `cloneFrom`, prefill)
- Create: `app/admin/curriculum/lesson/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createConceptLinkService` (Task 8), `LessonEditorForm`/`LessonEditorInitialValues` (Task 21).
- Produces: `ConceptLinkEntry = { id: string; title: string; track: Track }` and `<ConceptLinkSection lessonId track sourceLevel links={ConceptLinkEntry[]} onLinksChange={(links) => void} />`. Extends `LessonEditorForm`'s create-mode props with an optional `initialContent` for Clone prefill. Used directly by `CurriculumBrowser.tsx`'s `LessonDetail` and the Add/Edit pages.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/curriculum/route.test.ts`, inside the existing `it('returns a lesson with exercises and prerequisites', ...)` test, one more assertion after the existing ones:

```ts
    expect(body.conceptLinks).toEqual([]);
```

Create `components/admin/ConceptLinkSection.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConceptLinkSection } from './ConceptLinkSection';

const telcStructure = [
  { sections: [{ lessons: [{ id: 't1', title: 'T1', track: 'telc' }] }] },
];
const goetheStructure = [{ sections: [{ lessons: [] }] }];

describe('ConceptLinkSection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/telc/')) return Promise.resolve({ json: async () => telcStructure });
      if (url.includes('/tracks/goethe/')) return Promise.resolve({ json: async () => goetheStructure });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
  });

  it('fetches candidates from the other two tracks at the same level', async () => {
    render(
      <ConceptLinkSection lessonId="g1" track="generic" sourceLevel="A1" links={[]} onLinksChange={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('telc: T1')).toBeInTheDocument());
  });

  it('excludes already-linked lessons from the candidate list but still shows them as a current link', async () => {
    render(
      <ConceptLinkSection
        lessonId="g1"
        track="generic"
        sourceLevel="A1"
        links={[{ id: 't1', title: 'T1', track: 'telc' }]}
        onLinksChange={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent('telc: T1'));
    expect(screen.queryByRole('option', { name: 'telc: T1' })).not.toBeInTheDocument();
  });

  it('adding a link posts to the API and calls onLinksChange', async () => {
    const onLinksChange = vi.fn();
    render(
      <ConceptLinkSection lessonId="g1" track="generic" sourceLevel="A1" links={[]} onLinksChange={onLinksChange} />
    );
    await waitFor(() => expect(screen.getByText('telc: T1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Add link'), { target: { value: 't1' } });
    fireEvent.click(screen.getByText('Add link', { selector: 'button' }));
    await waitFor(() =>
      expect(onLinksChange).toHaveBeenCalledWith([{ id: 't1', title: 'T1', track: 'telc' }])
    );
    const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons/g1/links');
    expect(JSON.parse(postCall[1].body)).toEqual({ otherLessonId: 't1' });
  });

  it('removing a link calls DELETE and calls onLinksChange', async () => {
    const onLinksChange = vi.fn();
    render(
      <ConceptLinkSection
        lessonId="g1"
        track="generic"
        sourceLevel="A1"
        links={[{ id: 't1', title: 'T1', track: 'telc' }]}
        onLinksChange={onLinksChange}
      />
    );
    fireEvent.click(screen.getByText('Unlink'));
    await waitFor(() => expect(onLinksChange).toHaveBeenCalledWith([]));
    const deleteCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0] === '/api/admin/curriculum/lessons/g1/links/t1'
    );
    expect(deleteCall[1].method).toBe('DELETE');
  });
});
```

Create `components/admin/CurriculumBrowser.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonDetail } from './CurriculumBrowser';

describe('LessonDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders Edit and Clone links pointing at the right destinations', async () => {
    (fetch as any).mockResolvedValue({
      json: async () => ({
        lesson: { id: 'a1-l1', track: 'generic', sourceLevel: 'A1', title: 'L1', explanation: null, examples: null },
        exercises: [],
        prerequisites: [],
        conceptLinks: [],
      }),
    });
    render(<LessonDetail lessonId="a1-l1" track="generic" />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());
    expect(screen.getByText('Edit')).toHaveAttribute('href', '/admin/curriculum/lesson/a1-l1/edit?track=generic');
    expect(screen.getByText('Clone')).toHaveAttribute(
      'href',
      '/admin/curriculum/generic/A1/new?cloneFrom=a1-l1'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/ConceptLinkSection.test.tsx components/admin/CurriculumBrowser.test.tsx app/api/curriculum/route.test.ts`
Expected: FAIL — `ConceptLinkSection` doesn't exist, `conceptLinks` isn't in the lesson response, `CurriculumBrowser` has no Edit/Clone links yet.

- [ ] **Step 3: Implement**

Modify `app/api/curriculum/lessons/[id]/route.ts` from:

```ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') ?? 'generic') as Track;
  const service = createCurriculumService(getDb());
  const lesson = service.getLesson(params.id, track);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    lesson,
    exercises: service.getExercises(params.id, track),
    prerequisites: service.getPrerequisites(params.id),
  });
}
```

to:

```ts
import { createConceptLinkService } from '@/lib/services/conceptLinkService';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') ?? 'generic') as Track;
  const db = getDb();
  const service = createCurriculumService(db);
  const lesson = service.getLesson(params.id, track);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const conceptLinkService = createConceptLinkService(db);
  const conceptLinks = conceptLinkService.getLinksForLesson(params.id).map((link) => {
    const otherId = link.lessonAId === params.id ? link.lessonBId : link.lessonAId;
    const other = service.getLesson(otherId, track);
    return { id: otherId, title: other?.title ?? otherId, track: other?.track ?? track };
  });

  return NextResponse.json({
    lesson,
    exercises: service.getExercises(params.id, track),
    prerequisites: service.getPrerequisites(params.id),
    conceptLinks,
  });
}
```

(Move the `import { createConceptLinkService } ...` line up to the top of the file alongside the other imports — it's shown inline above only to mark where it's new.)

Create `components/admin/ConceptLinkSection.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';

export interface ConceptLinkEntry {
  id: string;
  title: string;
  track: Track;
}

const ALL_TRACKS: Track[] = ['generic', 'telc', 'goethe'];

export function ConceptLinkSection({
  lessonId,
  track,
  sourceLevel,
  links,
  onLinksChange,
}: {
  lessonId: string;
  track: Track;
  sourceLevel: CefrLevel;
  links: ConceptLinkEntry[];
  onLinksChange: (links: ConceptLinkEntry[]) => void;
}) {
  const [candidates, setCandidates] = useState<ConceptLinkEntry[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const otherTracks = ALL_TRACKS.filter((t) => t !== track);
    Promise.all(
      otherTracks.map((t) =>
        fetch(`/api/curriculum/tracks/${t}/${sourceLevel}`)
          .then((r) => r.json())
          .then((structure: { sections: { lessons: ConceptLinkEntry[] }[] }[]) =>
            structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons))
          )
      )
    ).then((lists) => setCandidates(lists.flat()));
  }, [track, sourceLevel]);

  const linkedIds = new Set(links.map((l) => l.id));
  const unlinkedCandidates = candidates.filter((c) => !linkedIds.has(c.id));

  async function addLink() {
    if (!selectedCandidateId) return;
    setError(null);
    const res = await fetch(`/api/admin/curriculum/lessons/${lessonId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherLessonId: selectedCandidateId }),
    });
    if (res.ok) {
      const added = candidates.find((c) => c.id === selectedCandidateId);
      if (added) onLinksChange([...links, added]);
      setSelectedCandidateId('');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Failed to add link');
    }
  }

  async function removeLink(otherId: string) {
    await fetch(`/api/admin/curriculum/lessons/${lessonId}/links/${otherId}`, { method: 'DELETE' });
    onLinksChange(links.filter((l) => l.id !== otherId));
  }

  return (
    <div>
      <h3>Concept Links</h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            {link.track}: {link.title}
            <button type="button" onClick={() => removeLink(link.id)}>
              Unlink
            </button>
          </li>
        ))}
      </ul>
      <label>
        Add link
        <select
          aria-label="Add link"
          value={selectedCandidateId}
          onChange={(e) => setSelectedCandidateId(e.target.value)}
        >
          <option value="">Select a lesson to link</option>
          {unlinkedCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.track}: {c.title}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={addLink}>
        Add link
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

Modify `components/admin/CurriculumBrowser.tsx` from:

```tsx
export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [data, setData] = useState<{ lesson: Lesson; exercises: Exercise[]; prerequisites: LessonPrerequisite[] } | null>(
    null
  );

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${lessonId}?track=${track}`)
      .then((r) => r.json())
      .then(setData);
  }, [lessonId, track]);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h1>{data.lesson.title}</h1>
      <p>{data.lesson.explanation}</p>
      <h2>Examples</h2>
      <ul>{(data.lesson.examples ?? []).map((ex, i) => <li key={i}>{ex}</li>)}</ul>
      <h2>Exercises ({data.exercises.length})</h2>
      <ul>
        {data.exercises.map((ex) => (
          <li key={ex.id}>
            {ex.type}: {JSON.stringify(ex.content)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

to:

```tsx
import { ConceptLinkSection, type ConceptLinkEntry } from './ConceptLinkSection';

export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [data, setData] = useState<{
    lesson: Lesson;
    exercises: Exercise[];
    prerequisites: LessonPrerequisite[];
    conceptLinks: ConceptLinkEntry[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${lessonId}?track=${track}`)
      .then((r) => r.json())
      .then(setData);
  }, [lessonId, track]);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h1>{data.lesson.title}</h1>
      <a href={`/admin/curriculum/lesson/${lessonId}/edit?track=${track}`}>Edit</a>
      <a href={`/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}/new?cloneFrom=${lessonId}`}>Clone</a>
      <p>{data.lesson.explanation}</p>
      <h2>Examples</h2>
      <ul>{(data.lesson.examples ?? []).map((ex, i) => <li key={i}>{ex}</li>)}</ul>
      <h2>Exercises ({data.exercises.length})</h2>
      <ul>
        {data.exercises.map((ex) => (
          <li key={ex.id}>
            {ex.type}: {JSON.stringify(ex.content)}
          </li>
        ))}
      </ul>
      <ConceptLinkSection
        lessonId={lessonId}
        track={data.lesson.track}
        sourceLevel={data.lesson.sourceLevel}
        links={data.conceptLinks}
        onLinksChange={(conceptLinks) => setData({ ...data, conceptLinks })}
      />
    </div>
  );
}
```

Modify `components/admin/LessonEditorForm.tsx`'s exported function signature from:

```tsx
export function LessonEditorForm(
  props:
    | { mode: 'create'; initialTrack: Track; initialSourceLevel: CefrLevel; onSaved: (lesson: { id: string }) => void }
    | { mode: 'edit'; lessonId: string; initial: LessonEditorInitialValues; onSaved: (lesson: { id: string }) => void }
) {
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const lessonId = props.mode === 'edit' ? props.lessonId : undefined;
```

to:

```tsx
export type LessonCloneContent = Pick<
  LessonEditorInitialValues,
  'slug' | 'skill' | 'title' | 'explanation' | 'examples' | 'exercises'
>;

export function LessonEditorForm(
  props:
    | {
        mode: 'create';
        initialTrack: Track;
        initialSourceLevel: CefrLevel;
        initialContent?: LessonCloneContent;
        onSaved: (lesson: { id: string }) => void;
      }
    | { mode: 'edit'; lessonId: string; initial: LessonEditorInitialValues; onSaved: (lesson: { id: string }) => void }
) {
  const initial = props.mode === 'edit' ? props.initial : props.initialContent;
  const lessonId = props.mode === 'edit' ? props.lessonId : undefined;
```

(Every other line of the component that reads from `initial` already works unchanged — `slug`/`skill`/`title`/`explanation`/`examples`/`exercises` are all optional-chained off `initial` already, and `prerequisiteIds` simply stays `[]` since `LessonCloneContent` has no such field, matching the spec's "prerequisites... are not copied" rule for Clone.)

Modify `app/admin/curriculum/[track]/[level]/new/page.tsx` from:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LessonEditorForm } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage({ params }: { params: { track: string; level: string } }) {
  const router = useRouter();
  return (
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
  );
}
```

to:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LessonEditorForm, type LessonCloneContent } from '@/components/admin/LessonEditorForm';
import type { Track, CefrLevel } from '@/lib/types';

export default function NewLessonPage({ params }: { params: { track: string; level: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFrom = searchParams.get('cloneFrom');
  const [initialContent, setInitialContent] = useState<LessonCloneContent | null>(null);
  const [loading, setLoading] = useState(!!cloneFrom);

  useEffect(() => {
    if (!cloneFrom) return;
    fetch(`/api/curriculum/lessons/${cloneFrom}?track=${params.track}`)
      .then((r) => r.json())
      .then((data) => {
        const sourceSlug = data.lesson.id.slice(data.lesson.sourceLevel.toLowerCase().length + 1);
        setInitialContent({
          slug: `${sourceSlug}-copy`,
          skill: data.lesson.skill,
          title: data.lesson.title,
          explanation: data.lesson.explanation,
          examples: data.lesson.examples,
          exercises: data.exercises.map((ex: { type: string; content: unknown }) => ({
            type: ex.type,
            content: ex.content,
          })),
        });
        setLoading(false);
      });
  }, [cloneFrom, params.track]);

  if (loading) return <p>Loading...</p>;

  return (
    <LessonEditorForm
      mode="create"
      initialTrack={params.track as Track}
      initialSourceLevel={params.level as CefrLevel}
      initialContent={initialContent ?? undefined}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`)}
    />
  );
}
```

Create `app/admin/curriculum/lesson/[id]/edit/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LessonEditorForm, type LessonEditorInitialValues } from '@/components/admin/LessonEditorForm';

export default function EditLessonPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { track?: string };
}) {
  const router = useRouter();
  const track = searchParams.track ?? 'generic';
  const [initial, setInitial] = useState<LessonEditorInitialValues | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${params.id}?track=${track}`)
      .then((r) => r.json())
      .then((data) => {
        const slug = data.lesson.id.slice(data.lesson.sourceLevel.toLowerCase().length + 1);
        setInitial({
          slug,
          track: data.lesson.track,
          sourceLevel: data.lesson.sourceLevel,
          skill: data.lesson.skill,
          title: data.lesson.title,
          explanation: data.lesson.explanation,
          examples: data.lesson.examples,
          exercises: data.exercises.map((ex: { id: string; type: string; content: unknown }) => ({
            id: ex.id,
            type: ex.type,
            content: ex.content,
          })),
          prerequisiteIds: data.prerequisites.map((p: { prerequisiteLessonId: string }) => p.prerequisiteLessonId),
        });
      });
  }, [params.id, track]);

  if (!initial) return <p>Loading...</p>;

  return (
    <LessonEditorForm
      mode="edit"
      lessonId={params.id}
      initial={initial}
      onSaved={(lesson) => router.push(`/admin/curriculum/lesson/${lesson.id}?track=${initial.track}`)}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/ConceptLinkSection.test.tsx components/admin/CurriculumBrowser.test.tsx app/api/curriculum/route.test.ts components/admin/LessonEditorForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/curriculum/lessons/\[id\]/route.ts app/api/curriculum/route.test.ts components/admin/ConceptLinkSection.tsx components/admin/ConceptLinkSection.test.tsx components/admin/CurriculumBrowser.tsx components/admin/CurriculumBrowser.test.tsx components/admin/LessonEditorForm.tsx "app/admin/curriculum/[track]/[level]/new/page.tsx" "app/admin/curriculum/lesson/[id]/edit"
git commit -m "feat: add concept-link section, Edit/Clone wiring, and the Edit page"
```

---

### Task 23: Delete wizard UI, and wiring the Delete button

**Files:**
- Create: `components/admin/DeleteLessonWizard.tsx`
- Test: `components/admin/DeleteLessonWizard.test.tsx`
- Modify: `components/admin/CurriculumBrowser.tsx` (add the Delete button, toggling the wizard)
- Modify: `components/admin/CurriculumBrowser.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/curriculum/lessons/:id/delete-preview` and `DELETE /api/admin/curriculum/lessons` (Task 13).
- Produces: `<DeleteLessonWizard rootLessonId={string} onCancel={() => void} onDeleted={() => void} />` implementing the spec's step-by-step preview/accept/decline flow with client-side "already decided" dedup (spec "Dependency Repair Algorithm" → "Concept-link cascade and the shape of the delete flow"). Used by `CurriculumBrowser.tsx`'s `LessonDetail`, wired here.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/DeleteLessonWizard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteLessonWizard } from './DeleteLessonWizard';

function previewFor(id: string, linkedLessons: { id: string; title: string; track: string }[]) {
  return { lessonId: id, repair: { edgesToAdd: [], edgesToRemove: [] }, linkedLessons };
}

describe('DeleteLessonWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the root lesson repair preview and its directly-linked lessons as offers', async () => {
    (fetch as any).mockResolvedValue({
      json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]),
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
  });

  it('accepting an offer adds it to the set and fetches its own preview next', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.endsWith('/lessons/b/delete-preview'))
        return Promise.resolve({ json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]) });
      if (url.endsWith('/lessons/d/delete-preview'))
        return Promise.resolve({ json: async () => previewFor('d', []) });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete'));
    await waitFor(() => expect(screen.getByText('Ready to delete 2 lesson(s)')).toBeInTheDocument());
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
  });

  it('declining an offer leaves it out of the set entirely', async () => {
    (fetch as any).mockResolvedValue({
      json: async () => previewFor('b', [{ id: 'd', title: 'D', track: 'telc' }]),
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Leave it'));
    await waitFor(() => expect(screen.getByText('Ready to delete 1 lesson(s)')).toBeInTheDocument());
    expect(screen.queryByText('d')).not.toBeInTheDocument();
  });

  it('never re-offers a lesson already decided, walking a B↔D, D↔F, F↔B triangle exactly once each', async () => {
    (fetch as any).mockImplementation((url: string) => {
      if (url.endsWith('/lessons/b/delete-preview'))
        return Promise.resolve({
          json: async () =>
            previewFor('b', [
              { id: 'd', title: 'D', track: 'telc' },
              { id: 'f', title: 'F', track: 'goethe' },
            ]),
        });
      if (url.endsWith('/lessons/d/delete-preview'))
        return Promise.resolve({
          json: async () =>
            previewFor('d', [
              { id: 'b', title: 'B', track: 'generic' },
              { id: 'f', title: 'F', track: 'goethe' },
            ]),
        });
      if (url.endsWith('/lessons/f/delete-preview'))
        return Promise.resolve({
          json: async () =>
            previewFor('f', [
              { id: 'd', title: 'D', track: 'telc' },
              { id: 'b', title: 'B', track: 'generic' },
            ]),
        });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('telc: D')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept D
    await waitFor(() => expect(screen.getByText('goethe: F')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Also delete')); // accept F

    await waitFor(() => expect(screen.getByText('Ready to delete 3 lesson(s)')).toBeInTheDocument());
    const previewCalls = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('delete-preview'));
    expect(previewCalls).toHaveLength(3); // b, d, f — each fetched exactly once, never re-offered
  });

  it('Delete All sends the accumulated set and calls onDeleted', async () => {
    const onDeleted = vi.fn();
    (fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/lessons/b/delete-preview')) return Promise.resolve({ json: async () => previewFor('b', []) });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    render(<DeleteLessonWizard rootLessonId="b" onCancel={vi.fn()} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByText('Ready to delete 1 lesson(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete All'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/lessons');
    expect(deleteCall[1].method).toBe('DELETE');
    expect(JSON.parse(deleteCall[1].body)).toEqual({ lessonIds: ['b'] });
  });
});
```

Add to `components/admin/CurriculumBrowser.test.tsx`:

```tsx
it('opens the delete wizard when Delete is clicked', async () => {
  (fetch as any).mockResolvedValue({
    json: async () => ({
      lesson: { id: 'a1-l1', track: 'generic', sourceLevel: 'A1', title: 'L1', explanation: null, examples: null },
      exercises: [],
      prerequisites: [],
      conceptLinks: [],
    }),
  });
  render(<LessonDetail lessonId="a1-l1" track="generic" />);
  await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Delete'));
  await waitFor(() => expect(screen.getByText('Deleting a1-l1')).toBeInTheDocument());
});
```

Add `fireEvent` to that file's existing `@testing-library/react` import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/DeleteLessonWizard.test.tsx components/admin/CurriculumBrowser.test.tsx`
Expected: FAIL — `DeleteLessonWizard` doesn't exist, no Delete button yet.

- [ ] **Step 3: Implement**

Create `components/admin/DeleteLessonWizard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track } from '@/lib/types';

export interface RepairEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

export interface LinkedLessonOffer {
  id: string;
  title: string;
  track: Track;
}

export interface DeletePreviewResponse {
  lessonId: string;
  repair: { edgesToAdd: RepairEdge[]; edgesToRemove: RepairEdge[] };
  linkedLessons: LinkedLessonOffer[];
}

export function DeleteLessonWizard({
  rootLessonId,
  onCancel,
  onDeleted,
}: {
  rootLessonId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [toDeleteSet, setToDeleteSet] = useState<string[]>([rootLessonId]);
  const [decided, setDecided] = useState<Set<string>>(new Set([rootLessonId]));
  const [queue, setQueue] = useState<string[]>([rootLessonId]);
  const [currentPreview, setCurrentPreview] = useState<DeletePreviewResponse | null>(null);
  const [pendingOffers, setPendingOffers] = useState<LinkedLessonOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch the next queued lesson's own preview once nothing is currently being shown.
  useEffect(() => {
    if (currentPreview !== null || queue.length === 0) return;
    const [nextId, ...rest] = queue;
    setQueue(rest);
    fetch(`/api/admin/curriculum/lessons/${nextId}/delete-preview`)
      .then((r) => r.json())
      .then((preview: DeletePreviewResponse) => {
        setCurrentPreview(preview);
        setPendingOffers(preview.linkedLessons.filter((l) => !decided.has(l.id)));
      });
  }, [queue, currentPreview, decided]);

  // Once every offer on the current preview is resolved, clear it so the effect above
  // advances to the next queued lesson (or finishes, if the queue is also empty).
  useEffect(() => {
    if (currentPreview && pendingOffers.length === 0) {
      setCurrentPreview(null);
    }
  }, [pendingOffers, currentPreview]);

  function decide(linkedId: string, accept: boolean) {
    setDecided((prev) => new Set(prev).add(linkedId));
    if (accept) {
      setToDeleteSet((prev) => [...prev, linkedId]);
      setQueue((prev) => [...prev, linkedId]);
    }
    setPendingOffers((prev) => prev.filter((l) => l.id !== linkedId));
  }

  async function handleDeleteAll() {
    setDeleting(true);
    setError(null);
    const res = await fetch('/api/admin/curriculum/lessons', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonIds: toDeleteSet }),
    });
    setDeleting(false);
    if (res.ok) {
      onDeleted();
    } else {
      const data = await res.json();
      setError(data.error ?? 'Delete failed');
    }
  }

  const isDone = currentPreview === null && queue.length === 0;

  if (!isDone) {
    if (!currentPreview) return <p>Loading...</p>;
    return (
      <div>
        <h2>Deleting {currentPreview.lessonId}</h2>
        <h3>Repair effects</h3>
        <ul>
          {currentPreview.repair.edgesToRemove.map((e, i) => (
            <li key={`remove-${i}`}>
              Remove: {e.lessonId} no longer requires {e.prerequisiteLessonId}
            </li>
          ))}
          {currentPreview.repair.edgesToAdd.map((e, i) => (
            <li key={`add-${i}`}>
              Add: {e.lessonId} now requires {e.prerequisiteLessonId}
            </li>
          ))}
        </ul>
        {pendingOffers.length > 0 && (
          <div>
            <h3>Also linked to this lesson</h3>
            {pendingOffers.map((offer) => (
              <div key={offer.id}>
                <span>
                  {offer.track}: {offer.title}
                </span>
                <button type="button" onClick={() => decide(offer.id, true)}>
                  Also delete
                </button>
                <button type="button" onClick={() => decide(offer.id, false)}>
                  Leave it
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2>Ready to delete {toDeleteSet.length} lesson(s)</h2>
      <ul>
        {toDeleteSet.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      <button type="button" onClick={handleDeleteAll} disabled={deleting}>
        Delete All
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

Modify `components/admin/CurriculumBrowser.tsx` — add the wizard toggle. Change the imports line from:

```tsx
import { ConceptLinkSection, type ConceptLinkEntry } from './ConceptLinkSection';
```

to:

```tsx
import { ConceptLinkSection, type ConceptLinkEntry } from './ConceptLinkSection';
import { DeleteLessonWizard } from './DeleteLessonWizard';
```

Add a `showDeleteWizard` state and the Delete button, changing:

```tsx
export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [data, setData] = useState<{
```

to:

```tsx
export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [data, setData] = useState<{
```

and change the Edit/Clone links block from:

```tsx
      <a href={`/admin/curriculum/lesson/${lessonId}/edit?track=${track}`}>Edit</a>
      <a href={`/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}/new?cloneFrom=${lessonId}`}>Clone</a>
```

to:

```tsx
      <a href={`/admin/curriculum/lesson/${lessonId}/edit?track=${track}`}>Edit</a>
      <a href={`/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}/new?cloneFrom=${lessonId}`}>Clone</a>
      <button type="button" onClick={() => setShowDeleteWizard(true)}>
        Delete
      </button>
      {showDeleteWizard && (
        <DeleteLessonWizard
          rootLessonId={lessonId}
          onCancel={() => setShowDeleteWizard(false)}
          onDeleted={() => {
            window.location.href = `/admin/curriculum/${data.lesson.track}/${data.lesson.sourceLevel}`;
          }}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/DeleteLessonWizard.test.tsx components/admin/CurriculumBrowser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/DeleteLessonWizard.tsx components/admin/DeleteLessonWizard.test.tsx components/admin/CurriculumBrowser.tsx components/admin/CurriculumBrowser.test.tsx
git commit -m "feat: add delete wizard with client-side dedup, wired to the Delete button"
```

---

### Task 24: Structure management UI (milestone/section create/rename/delete/reorder)

**Files:**
- Create: `components/admin/TrackLevelStructure.tsx`
- Test: `components/admin/TrackLevelStructure.test.tsx`
- Modify: `app/admin/curriculum/[track]/[level]/page.tsx` (replace with a thin auth-gated wrapper)

**Interfaces:**
- Consumes: the existing read-only `GET /api/curriculum/tracks/:track/:level`, and Task 15/16's milestone/section API routes.
- Produces: `<TrackLevelStructure track={Track} level={CefrLevel} />` — fetches and renders the track+level structure with full milestone/section create/rename/delete/reorder controls, excluding Unsorted from all of them (per spec "Data Model Changes" → `milestones`/`sections`: "Unsorted is excluded from normal reordering... left out of both the reorder UI... and the reorder API's accepted id list"). Delete confirms first, naming every section/lesson (milestone) or lesson (section) that will move to Unsorted, using data already in hand from the loaded structure (no extra network round-trip — see spec's "single static list, not a wizard" framing). Used directly by the rewritten `[track]/[level]/page.tsx`.

This task **replaces** `app/admin/curriculum/[track]/[level]/page.tsx` entirely (superseding the "+ New Lesson" link Task 21 added to it — that link now lives inside `TrackLevelStructure` instead) with a thin server wrapper, following the same split already used for `AdminLessonPage` → `LessonDetail`: the page does only the `isAdminSessionValid()` redirect-gate, and a client component owns data-fetching and interactivity. No dedicated test is added for the page wrapper itself, matching that existing precedent.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/TrackLevelStructure.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackLevelStructure } from './TrackLevelStructure';

const structure = [
  {
    milestone: { id: 'm1', title: 'Milestone 1' },
    sections: [{ section: { id: 's1', title: 'Section 1' }, lessons: [{ id: 'a1-l1', title: 'Lesson 1' }] }],
  },
  {
    milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' },
    sections: [{ section: { id: 'generic-a1-unsorted-section', title: 'Unsorted' }, lessons: [] }],
  },
];

describe('TrackLevelStructure', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockResolvedValue({ ok: true, json: async () => structure });
  });

  it('renders milestones and sections, excluding management controls on Unsorted', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    expect(screen.getByText('Delete milestone')).toBeInTheDocument();
    // Unsorted's own heading renders, but with no management controls next to it —
    // only one "Delete milestone" button exists (for the real milestone).
    expect(screen.getAllByText('Delete milestone')).toHaveLength(1);
  });

  it('creates a milestone', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New milestone title'), { target: { value: 'Milestone 2' } });
    fireEvent.click(screen.getByText('Add milestone'));
    await waitFor(() => {
      const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones');
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall[1].body)).toEqual({ track: 'generic', level: 'A1', title: 'Milestone 2', description: null });
    });
  });

  it('confirms with the affected lesson names before deleting a milestone', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete milestone'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Lesson 1'));
    await waitFor(() => {
      const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/m1');
      expect(deleteCall[1].method).toBe('DELETE');
    });
  });

  it('does not delete when the confirm is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete milestone'));
    const deleteCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/m1');
    expect(deleteCall).toBeUndefined();
  });

  it('moving a milestone down sends the swapped order to the reorder endpoint', async () => {
    const twoMilestones = [
      { milestone: { id: 'm1', title: 'M1' }, sections: [] },
      { milestone: { id: 'm2', title: 'M2' }, sections: [] },
      { milestone: { id: 'generic-a1-unsorted', title: 'Unsorted' }, sections: [] },
    ];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => twoMilestones });
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('M1')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Move milestone down')[0]);
    await waitFor(() => {
      const reorderCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/milestones/reorder');
      expect(JSON.parse(reorderCall[1].body)).toEqual({ track: 'generic', level: 'A1', orderedIds: ['m2', 'm1'] });
    });
  });

  it('creates a section under a milestone', async () => {
    render(<TrackLevelStructure track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New section title in Milestone 1'), { target: { value: 'Section 2' } });
    fireEvent.click(screen.getByText('Add section'));
    await waitFor(() => {
      const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0] === '/api/admin/curriculum/sections');
      expect(JSON.parse(postCall[1].body)).toEqual({ milestoneId: 'm1', title: 'Section 2', description: null });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/TrackLevelStructure.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `components/admin/TrackLevelStructure.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';

interface StructureLesson {
  id: string;
  title: string;
}
interface StructureSection {
  section: { id: string; title: string };
  lessons: StructureLesson[];
}
interface StructureEntry {
  milestone: { id: string; title: string };
  sections: StructureSection[];
}

function unsortedMilestoneId(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}-unsorted`;
}

export function TrackLevelStructure({ track, level }: { track: Track; level: CefrLevel }) {
  const [structure, setStructure] = useState<StructureEntry[] | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newSectionTitleFor, setNewSectionTitleFor] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => r.json())
      .then(setStructure);
  }

  useEffect(load, [track, level]);

  if (!structure) return <p>Loading...</p>;

  const unsortedId = unsortedMilestoneId(track, level);
  const realMilestoneIds = structure.filter((entry) => entry.milestone.id !== unsortedId).map((e) => e.milestone.id);

  async function createMilestone() {
    if (!newMilestoneTitle) return;
    const res = await fetch('/api/admin/curriculum/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, title: newMilestoneTitle, description: null }),
    });
    if (res.ok) {
      setNewMilestoneTitle('');
      load();
    } else {
      setError((await res.json()).error ?? 'Failed to create milestone');
    }
  }

  async function renameMilestone(id: string, currentTitle: string) {
    const title = window.prompt('Rename milestone', currentTitle);
    if (!title) return;
    await fetch(`/api/admin/curriculum/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: null }),
    });
    load();
  }

  async function deleteMilestone(id: string) {
    const entry = structure!.find((e) => e.milestone.id === id)!;
    const lessonTitles = entry.sections.flatMap((s) => s.lessons.map((l) => l.title));
    const message =
      lessonTitles.length > 0
        ? `Delete "${entry.milestone.title}"? ${lessonTitles.length} lesson(s) will move to Unsorted: ${lessonTitles.join(', ')}`
        : `Delete "${entry.milestone.title}"?`;
    if (!window.confirm(message)) return;
    const res = await fetch(`/api/admin/curriculum/milestones/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to delete milestone');
  }

  async function moveMilestone(id: string, direction: -1 | 1) {
    const ids = [...realMilestoneIds];
    const index = ids.indexOf(id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await fetch('/api/admin/curriculum/milestones/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, level, orderedIds: ids }),
    });
    load();
  }

  async function createSection(milestoneId: string) {
    const title = newSectionTitleFor[milestoneId];
    if (!title) return;
    const res = await fetch('/api/admin/curriculum/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, title, description: null }),
    });
    if (res.ok) {
      setNewSectionTitleFor((prev) => ({ ...prev, [milestoneId]: '' }));
      load();
    } else {
      setError((await res.json()).error ?? 'Failed to create section');
    }
  }

  async function renameSection(id: string, currentTitle: string) {
    const title = window.prompt('Rename section', currentTitle);
    if (!title) return;
    await fetch(`/api/admin/curriculum/sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: null }),
    });
    load();
  }

  async function deleteSection(milestoneId: string, id: string) {
    const entry = structure!.find((e) => e.milestone.id === milestoneId)!;
    const section = entry.sections.find((s) => s.section.id === id)!;
    const lessonTitles = section.lessons.map((l) => l.title);
    const message =
      lessonTitles.length > 0
        ? `Delete "${section.section.title}"? ${lessonTitles.length} lesson(s) will move to Unsorted: ${lessonTitles.join(', ')}`
        : `Delete "${section.section.title}"?`;
    if (!window.confirm(message)) return;
    const res = await fetch(`/api/admin/curriculum/sections/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError((await res.json()).error ?? 'Failed to delete section');
  }

  async function moveSection(milestoneId: string, id: string, direction: -1 | 1) {
    const entry = structure!.find((e) => e.milestone.id === milestoneId)!;
    const ids = entry.sections.map((s) => s.section.id);
    const index = ids.indexOf(id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await fetch('/api/admin/curriculum/sections/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, orderedIds: ids }),
    });
    load();
  }

  return (
    <div>
      <h1>
        {track} — {level}
      </h1>
      <a href={`/admin/curriculum/${track}/${level}/new`}>+ New Lesson</a>

      {structure.map((entry) => {
        const isUnsorted = entry.milestone.id === unsortedId;
        return (
          <div key={entry.milestone.id}>
            <h2>{entry.milestone.title}</h2>
            {!isUnsorted && (
              <>
                <button type="button" onClick={() => moveMilestone(entry.milestone.id, -1)}>
                  Move milestone up
                </button>
                <button type="button" onClick={() => moveMilestone(entry.milestone.id, 1)}>
                  Move milestone down
                </button>
                <button type="button" onClick={() => renameMilestone(entry.milestone.id, entry.milestone.title)}>
                  Rename milestone
                </button>
                <button type="button" onClick={() => deleteMilestone(entry.milestone.id)}>
                  Delete milestone
                </button>
              </>
            )}
            {entry.sections.map(({ section, lessons }) => (
              <div key={section.id}>
                <h3>{section.title}</h3>
                {!isUnsorted && (
                  <>
                    <button type="button" onClick={() => moveSection(entry.milestone.id, section.id, -1)}>
                      Move section up
                    </button>
                    <button type="button" onClick={() => moveSection(entry.milestone.id, section.id, 1)}>
                      Move section down
                    </button>
                    <button type="button" onClick={() => renameSection(section.id, section.title)}>
                      Rename section
                    </button>
                    <button type="button" onClick={() => deleteSection(entry.milestone.id, section.id)}>
                      Delete section
                    </button>
                  </>
                )}
                <ul>
                  {lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <a href={`/admin/curriculum/lesson/${lesson.id}?track=${track}`}>{lesson.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!isUnsorted && (
              <div>
                <input
                  aria-label={`New section title in ${entry.milestone.title}`}
                  value={newSectionTitleFor[entry.milestone.id] ?? ''}
                  onChange={(e) => setNewSectionTitleFor((prev) => ({ ...prev, [entry.milestone.id]: e.target.value }))}
                  placeholder="New section title"
                />
                <button type="button" onClick={() => createSection(entry.milestone.id)}>
                  Add section
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div>
        <input
          aria-label="New milestone title"
          value={newMilestoneTitle}
          onChange={(e) => setNewMilestoneTitle(e.target.value)}
          placeholder="New milestone title"
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

Replace `app/admin/curriculum/[track]/[level]/page.tsx` in full, from:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function AdminTrackLevelPage({ params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const structure = createCurriculumService(getDb()).getTrackStructure(
    params.track as Track,
    params.level as CefrLevel
  );
  return (
    <div>
      <h1>
        {params.track} — {params.level}
      </h1>
      <a href={`/admin/curriculum/${params.track}/${params.level}/new`}>+ New Lesson</a>
      {structure.map(({ milestone, sections }) => (
        <div key={milestone.id}>
          <h2>{milestone.title}</h2>
          {sections.map(({ section, lessons }) => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              <ul>
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`}>{lesson.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

to:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { TrackLevelStructure } from '@/components/admin/TrackLevelStructure';
import type { Track, CefrLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function AdminTrackLevelPage({ params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <TrackLevelStructure track={params.track as Track} level={params.level as CefrLevel} />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/TrackLevelStructure.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/TrackLevelStructure.tsx components/admin/TrackLevelStructure.test.tsx "app/admin/curriculum/[track]/[level]/page.tsx"
git commit -m "feat: add milestone/section structure management UI"
```

---

### Task 25: Dependency diagram component and its tab

**Files:**
- Create: `components/admin/DependencyDiagram.tsx`
- Test: `components/admin/DependencyDiagram.test.tsx`
- Modify: `components/admin/TrackLevelStructure.tsx` (add a Tree/Diagram tab switcher)
- Modify: `components/admin/TrackLevelStructure.test.tsx`

**Interfaces:**
- Consumes: `computeDiagramLayout` (Task 17), the existing read-only `GET /api/curriculum/tracks/:track/:level` and `GET /api/curriculum/lessons/:id`.
- Produces: `<DependencyDiagram track={Track} level={CefrLevel} />` — a read-only custom-SVG diagram of every lesson in that track+level (including ones placed in Unsorted, since prerequisite edges aren't scoped to a milestone/section — per spec "Dependency Diagram"). Each node links to that lesson's edit form. **Simplification, disclosed here rather than silently applied:** the spec describes a hover-reveal "Edit" button overlay; this codebase has no CSS file or styling framework anywhere (confirmed across every existing component), so true `:hover` behavior isn't available within its established conventions. This task instead makes the whole node a permanently-visible link to Edit — same end capability (one click to the lesson's editor, otherwise the diagram is fully read-only), simpler to implement and test, consistent with the plain-HTML style used everywhere else in this admin UI.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/DependencyDiagram.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DependencyDiagram } from './DependencyDiagram';

const structure = [
  {
    milestone: { id: 'm1', title: 'M1' },
    sections: [
      {
        section: { id: 's1', title: 'S1' },
        lessons: [
          { id: 'a1-basics', title: 'Basics', skill: 'grammar' },
          { id: 'a1-advanced', title: 'Advanced', skill: 'grammar' },
        ],
      },
    ],
  },
];

describe('DependencyDiagram', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as any).mockImplementation((url: string) => {
      if (url.includes('/tracks/')) return Promise.resolve({ json: async () => structure });
      if (url.includes('/lessons/a1-advanced'))
        return Promise.resolve({
          json: async () => ({ prerequisites: [{ lessonId: 'a1-advanced', prerequisiteLessonId: 'a1-basics' }] }),
        });
      return Promise.resolve({ json: async () => ({ prerequisites: [] }) });
    });
  });

  it('renders a card for every lesson, each linking to its edit form', async () => {
    render(<DependencyDiagram track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Basics')).toBeInTheDocument());
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    const basicsLink = screen.getByText('Basics').closest('a');
    expect(basicsLink).toHaveAttribute('href', '/admin/curriculum/lesson/a1-basics/edit?track=generic');
  });

  it('draws one line per prerequisite edge', async () => {
    const { container } = render(<DependencyDiagram track="generic" level="A1" />);
    await waitFor(() => expect(screen.getByText('Advanced')).toBeInTheDocument());
    expect(container.querySelectorAll('line')).toHaveLength(1);
  });
});
```

Add to `components/admin/TrackLevelStructure.test.tsx`:

```tsx
it('switches to the Diagram tab', async () => {
  render(<TrackLevelStructure track="generic" level="A1" />);
  await waitFor(() => expect(screen.getByText('Milestone 1')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Diagram'));
  await waitFor(() => expect(screen.getByRole('img', { name: 'generic A1 dependency diagram' })).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/DependencyDiagram.test.tsx components/admin/TrackLevelStructure.test.tsx`
Expected: FAIL — `DependencyDiagram` doesn't exist, no tab switcher yet.

- [ ] **Step 3: Implement**

Create `components/admin/DependencyDiagram.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Track, CefrLevel } from '@/lib/types';
import { computeDiagramLayout } from '@/lib/curriculum-admin/diagramLayout';

interface DiagramLesson {
  id: string;
  title: string;
  skill: string;
}

interface DiagramEdge {
  lessonId: string;
  prerequisiteLessonId: string;
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 80;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 40;

export function DependencyDiagram({ track, level }: { track: Track; level: CefrLevel }) {
  const [lessons, setLessons] = useState<DiagramLesson[] | null>(null);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);

  useEffect(() => {
    fetch(`/api/curriculum/tracks/${track}/${level}`)
      .then((r) => r.json())
      .then((structure: { sections: { lessons: DiagramLesson[] }[] }[]) => {
        const allLessons = structure.flatMap((entry) => entry.sections.flatMap((s) => s.lessons));
        setLessons(allLessons);
        return Promise.all(
          allLessons.map((lesson) =>
            fetch(`/api/curriculum/lessons/${lesson.id}?track=${track}`)
              .then((r) => r.json())
              .then((data) => data.prerequisites as DiagramEdge[])
          )
        );
      })
      .then((prereqLists) => setEdges(prereqLists.flat()));
  }, [track, level]);

  if (!lessons) return <p>Loading...</p>;

  const layout = computeDiagramLayout(
    lessons.map((l) => l.id),
    edges
  );
  const positionById = new Map(layout.map((n) => [n.id, n]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const maxColumn = Math.max(0, ...layout.map((n) => n.column));
  const maxRow = Math.max(0, ...layout.map((n) => n.row));

  return (
    <svg
      role="img"
      aria-label={`${track} ${level} dependency diagram`}
      width={(maxColumn + 1) * COLUMN_WIDTH + 40}
      height={(maxRow + 1) * ROW_HEIGHT + 40}
    >
      <defs>
        <marker id="diagram-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="black" />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const from = positionById.get(edge.prerequisiteLessonId);
        const to = positionById.get(edge.lessonId);
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from.column * COLUMN_WIDTH + 20 + CARD_WIDTH}
            y1={from.row * ROW_HEIGHT + 20 + CARD_HEIGHT / 2}
            x2={to.column * COLUMN_WIDTH + 20}
            y2={to.row * ROW_HEIGHT + 20 + CARD_HEIGHT / 2}
            stroke="black"
            markerEnd="url(#diagram-arrow)"
          />
        );
      })}
      {layout.map((node) => {
        const lesson = lessonById.get(node.id)!;
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
  );
}
```

Modify `components/admin/TrackLevelStructure.tsx` — add the tab switcher. Change the import line from:

```tsx
import type { Track, CefrLevel } from '@/lib/types';
```

to:

```tsx
import type { Track, CefrLevel } from '@/lib/types';
import { DependencyDiagram } from './DependencyDiagram';
```

Add `const [tab, setTab] = useState<'tree' | 'diagram'>('tree');` alongside the component's other `useState` calls, and change the return statement's opening from:

```tsx
  return (
    <div>
      <h1>
        {track} — {level}
      </h1>
      <a href={`/admin/curriculum/${track}/${level}/new`}>+ New Lesson</a>

      {structure.map((entry) => {
```

to:

```tsx
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
```

and close the added conditional right after the existing `.map()`'s closing — change the end of that block from:

```tsx
      })}

      <div>
        <input
          aria-label="New milestone title"
```

to:

```tsx
        })}

      <div>
        <input
          aria-label="New milestone title"
```

(the extra two-space indent reflects the new `tab === 'tree' &&` wrapping the existing `.map()` call — the JSX body itself is otherwise unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/DependencyDiagram.test.tsx components/admin/TrackLevelStructure.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/DependencyDiagram.tsx components/admin/DependencyDiagram.test.tsx components/admin/TrackLevelStructure.tsx components/admin/TrackLevelStructure.test.tsx
git commit -m "feat: add dependency diagram and its tab in the structure view"
```

---

### Task 26: Cleanup — retire the YAML import path

**Files:**
- Delete: `curricula/*.yaml` (15 files)
- Delete: `scripts/build-curriculum-seed.ts`
- Modify: `package.json` (remove the `build-curriculum-seed` script entry)

**Interfaces:** none — this task removes code, it doesn't add any.

Per spec "Cleanup (in scope for this phase)": the YAML files and their one-time converter script already did their job (bootstrapping the 303 imported lessons into the DB, per the CEFR frameworks plan); the DB is now the permanent source of truth, edited exclusively through the admin UI this plan just built. The spec's pointer note in `docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md`'s "Cross-Track Concept Linking" section (marking its `concept_id` design as superseded by `lesson_concept_links`) was already added during that spec's own amendment pass — nothing further to do there. `data/curriculum-seed/*.json` and `loadSeedIfNeeded` are **not** touched by this task — they're outside the spec's explicit cleanup list, and still serve as the app's fresh-install bootstrap path.

- [ ] **Step 1: Delete the YAML source files**

```bash
git rm curricula/*.yaml
```

- [ ] **Step 2: Delete the converter script**

```bash
git rm scripts/build-curriculum-seed.ts
```

- [ ] **Step 3: Remove the npm script entry**

In `package.json`, remove the `build-curriculum-seed` line from `scripts`, changing:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "build-curriculum-seed": "tsx scripts/build-curriculum-seed.ts"
  },
```

to:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Run the full test suite and the build**

Run: `npm test && npm run build`
Expected: PASS — nothing references the deleted files (the converter script was never imported by app code, only invoked via the now-removed npm script).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: retire the curricula/*.yaml import path now that the DB is authoritative"
```

---

---

---

---
