# Curriculum Expansion: the Other 14 Track+Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 3–16 are content tasks.

**Goal:** Cover every level inventory item and every exam part in all 15 track+levels with lessons, writing new lessons (all exercise types, bilingual, placed, gated) for the gaps, and adding Sprachbausteine-style practice in every track.

**Architecture:** Inventory JSON per level, plus exam-part items derived from the format files, coverage maps per track+level, and one generalized coverage test. The lessons are content written track+level by track+level, each with its own green test run and commit.

**Tech Stack:** JSON seed files (format v3), vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-curriculum-expansion-design.md`

**Precondition:** everything up to and including Speaking is merged.

## Global Constraints

- **Coverage:** a lesson covers an item when its explanation teaches it and at least 2 of its exercises practise it.
- **Exercise types by skill:**
  - grammar: `multiple_choice`, `fill_blank`, `cloze`;
  - vocabulary: plus `flashcard`;
  - reading: `passage_questions`, `matching`, `cloze`;
  - listening: `audio_questions`;
  - writing: `free_text`, `letter`;
  - speaking: `free_text`, `spoken_response`.
- **Lesson shape:** new lessons have 4–8 exercises, bilingual fields, `instruction` for English framing, and are placed within 3–5 milestones with prerequisites in the same or a lower rank.
- **Existing lessons:** unchanged, except for concept links, which must be listed in both files.
- **Seed version:** equal across all files, and bumped with each track commit.

## Review Focus

1. **Duplicate lessons:** a new lesson duplicating an existing lesson in the same file is caught by the "every lesson mapped" rule only if mapping is honest. The review summary lists new lessons next to existing ones for the same item (Task 16).
2. **Level drift:** a B2 lesson that teaches A2 material. The report per track+level states each new lesson's inventory item, so level fit can be checked (Tasks 3–15).
3. **Transcript quality:** a new listening lesson whose evidence doesn't appear in its transcript fails validation (Tasks 3–15).
4. **Letter tasks without word targets** fail validation (Tasks 3–15).
5. **Concept links:** a concept link listed in only one file fails the symmetry test (Task 16).

---

### Task 1: Level inventories A1, A2, B2, C1

**Files:** create `data/inventory/a1.json`, `a2.json`, `b2.json`, `c1.json`; modify `lib/services/telcB1Coverage.test.ts` (it moves in Task 2).

- [ ] **Step 1: Draft the inventories.** Use the B1 file's shape (`{ id, kind: 'grammar' | 'theme' | 'communication', label, labelDe }`), with ids prefixed `g-`, `t-` and `k-`. Size them as the spec says, grounded in the Goethe and telc level descriptions. An item appears only at the level where it's first taught; review items don't repeat.
- [ ] **Step 2: Check** the ids are unique within each file, and both labels are non-empty. Task 2's test enforces this.
- [ ] **Step 3: Commit:** `git add data/inventory && git commit -m "content: level inventories for A1, A2, B2, and C1"`.

---

### Task 2: One coverage test for all 15 track+levels

**Files:**
- Create: `lib/services/curriculumCoverage.test.ts`, and `data/inventory/<track>-<level>-coverage.json` for the 14 new track+levels (each starting as an empty map with `"_new": []`)
- Delete: `lib/services/telcB1Coverage.test.ts`, whose checks move into the new test
- Modify: `data/inventory/b1.json`, removing its `e-*` items (exam items are now derived from the formats), and `data/inventory/telc-b1-coverage.json`, renaming exam keys to `e-<partId>` and adding `e-sprachbausteine-practice`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from './curriculumSeedLoader';
import { readFormat } from '../exam/formats';
import { LEVELS, TRACKS } from '../tutoring/levels';

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), 'utf8'));
const TYPES_BY_SKILL: Record<string, string[]> = {
  grammar: ['multiple_choice', 'fill_blank', 'cloze'],
  vocabulary: ['multiple_choice', 'fill_blank', 'cloze', 'flashcard'],
  reading: ['passage_questions', 'matching', 'cloze', 'multiple_choice', 'free_text'],
  listening: ['audio_questions', 'multiple_choice', 'free_text'],
  writing: ['free_text', 'letter', 'multiple_choice', 'fill_blank'],
  speaking: ['free_text', 'spoken_response', 'multiple_choice', 'fill_blank'],
};

const cases = TRACKS.flatMap((track) => LEVELS.map((level) => [track, level] as const));

describe.each(cases)('coverage %s %s', (track, level) => {
  const key = `${track}-${level.toLowerCase()}`;
  const inventory = read('data', 'inventory', `${level.toLowerCase()}.json`) as { id: string }[];
  const format = readFormat(key)!;
  const examItems = [...format.parts.map((p) => `e-${p.id}`), 'e-sprachbausteine-practice'];
  const coverage = read('data', 'inventory', `${key}-coverage.json`) as Record<string, string[]> & { _new?: string[] };
  const seed = read('data', 'curriculum-seed', `${key}.json`) as SeedFile;
  const lessonIds = new Set(seed.lessons.map((l) => l.id));

  it('covers every inventory item and exam part', () => {
    for (const id of [...inventory.map((i) => i.id), ...examItems]) expect(coverage[id]?.length ?? 0, id).toBeGreaterThan(0);
  });

  it('maps only real lessons, and every lesson', () => {
    const mapped = new Set(Object.entries(coverage).filter(([k]) => k !== '_new').flatMap(([, ids]) => ids));
    for (const id of mapped) expect(lessonIds.has(id), id).toBe(true);
    for (const id of lessonIds) expect(mapped.has(id), `${id} is not mapped`).toBe(true);
  });

  it('keeps new lessons well-formed', () => {
    for (const id of coverage._new ?? []) {
      const lesson = seed.lessons.find((l) => l.id === id)!;
      expect(lesson, id).toBeDefined();
      const exercises = seed.exercises.filter((e) => e.lessonId === id);
      expect(exercises.length, id).toBeGreaterThanOrEqual(4);
      expect(exercises.length, id).toBeLessThanOrEqual(8);
      for (const e of exercises) expect(TYPES_BY_SKILL[lesson.skill], `${e.id} ${e.type}`).toContain(e.type);
    }
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/services/curriculumCoverage.test.ts`. Expected: only telc B1 passes. The other 14 fail on coverage.

  Mark the failing 14 as expected to fail for now: add `const DONE = new Set(['telc-b1']);`, and run the first case with `it.skipIf(!DONE.has(key))`. Each content task adds its key to `DONE`, so the suite stays green between commits.
- [ ] **Step 3: Commit:** `git add -A data/inventory lib/services && git commit -m "test: one coverage test for every track and level"`.

---

### Tasks 3–15: Content — one track+level each

There is one task per track+level, in this order:

| Task | Track+level | Task | Track+level |
|---|---|---|---|
| 3 | telc A1 | 10 | goethe A2 |
| 4 | telc A2 | 11 | goethe B1 |
| 5 | telc B2 | 12 | goethe B2 |
| 6 | telc C1 | 13 | goethe C1 |
| 7 | generic A1 | 14 | generic B2 |
| 8 | generic A2 | 15 | generic C1 |
| 9 | goethe A1 | | |

(generic B1 goes last, in Task 15b, with the same steps; it's listed separately so each task stays one file.)

Each task has the same steps, applied to `data/curriculum-seed/<key>.json` and `data/inventory/<key>-coverage.json`:

- [ ] **Step 1: Map the existing lessons** to the items they cover (the coverage rule), exam parts included. Note the gaps in your report.
- [ ] **Step 2: Write lessons for every gap,** following the Global Constraints and the spec's content rules. That includes one Sprachbausteine-style grammar lesson (`cloze` in `select` and `bank` modes) if `e-sprachbausteine-practice` isn't covered. Add each new lesson to its milestone (the lowest rank that satisfies its prerequisites and its difficulty), to the coverage map, and to `_new`.
- [ ] **Step 3: Add the key to `DONE`** in the coverage test, and bump `seedVersion` in all 15 seed files (and in the version expectations).
- [ ] **Step 4: Run** `npx vitest run lib/services data && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add data lib/services && git commit -m "content: complete coverage for <key>"`. In the report, list each new lesson with its item, milestone, skill and exercise types.

### Task 15b: Content — generic B1

The same steps as Tasks 3–15, for `generic-b1`.

---

### Task 16: Concept links, the review summaries, and finishing

**Files:**
- Modify: all seed files (`conceptLinks` only), and `lib/services/curriculumCoverage.test.ts` (remove the `DONE` gate)
- Create: `lib/services/conceptLinks.test.ts`, `docs/superpowers/content/2026-09-29-curriculum-expansion.md`

- [ ] **Step 1:** Remove the `DONE` gate. Every case must pass.
- [ ] **Step 2: Concept links.** For each new lesson, link it to lessons in the other two tracks at the same level that teach the same concept (the same inventory item and skill). List each link in both files.

  Add `lib/services/conceptLinks.test.ts`: the symmetry check from the telc B1 expansion's link test, generalized to all 15 files.
- [ ] **Step 3: Review summary.** Write `docs/superpowers/content/2026-09-29-curriculum-expansion.md` with, per track+level:
  - the number of new lessons;
  - a coverage table: item → lessons, new ones in bold;
  - each new lesson's title (en / de), milestone and exercise types.
- [ ] **Step 4:** Run `npx tsc --noEmit && npm test && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `content: concept links across tracks, and the expansion review summary`.
