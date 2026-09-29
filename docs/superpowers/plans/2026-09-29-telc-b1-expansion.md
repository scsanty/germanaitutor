# Curriculum Expansion: telc B1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 2–4 are content tasks: the implementer writes German teaching content, and validation tests pin the mechanics.

**Goal:** Cover every item of a fixed B1 inventory with telc B1 lessons, writing new bilingual lessons for every gap.

**Architecture:**
- Data files hold the inventory (`data/inventory/b1.json`) and a coverage map (`data/inventory/telc-b1-coverage.json`).
- Tests make "every item covered" and "every new lesson well-formed" machine-checked.
- The lessons themselves are content written in batches (grammar, themes, exam and communication), each keeping the existing structure and language tests green.

**Tech Stack:** JSON seed files (format v3), vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-telc-b1-expansion-design.md`

**Precondition:** the Curriculum Restructure, Bilingual Content and the Design pass are merged. The seeds are format v3 at `seedVersion` "6".

## Global Constraints

- **Ids:** new lesson ids are `b1-telc-<slug>`, and each has `track: "telc"` and `sourceLevel: "B1"`.
- **Language:**
  - each lesson has `title`, `titleDe`, `explanation` (3–8 sentences), `explanationDe` (simplified to B1), 2–4 `examples` with `examplesDe` (German passages identical), and 4–8 exercises;
  - English framing goes into `instruction` (with `de`); the tested German stays in the stimulus field.
- **Exercise types:**
  - grammar: `multiple_choice` and `fill_blank`;
  - vocabulary: plus `flashcard` (flashcards only in vocabulary lessons);
  - reading and listening: `multiple_choice` (the text written in the task);
  - writing and speaking: `free_text`.
- **Coverage:** at least two exercises practise each item a lesson covers.
- **Placement:**
  - every new lesson goes into a telc B1 milestone, and the file keeps 3–5 milestones;
  - prerequisites point to telc B1 lessons in the same or a lower milestone.
- **Seed version:** every seed file is at `"7"`.
- **Existing lessons:** their content is unchanged. They may only gain `conceptLinks`.

## Review Focus

1. **Unused lessons:** a new lesson mapped to no item fails the coverage test (Task 1).
2. **Inaccurate German:** an exercise whose German is wrong makes the app teach mistakes. Each batch's report lists every multiple-choice item with its correct option for the reviewer (Tasks 2–4).
3. **More than one correct answer:** a fill-blank with a second valid answer missing from `acceptableVariants` gets marked wrong. Each batch checks every gap for alternatives (Tasks 2–4).
4. **Prerequisite placed later:** a new lesson whose prerequisite sits in a later milestone fails the structure test (Tasks 2–4).
5. **Concept links:** a concept link to a Goethe or Generic B1 lesson must be listed in both files, or it's only half-applied (Task 5).

---

### Task 1: Inventory, coverage map of the existing lessons, and the validation test

**Files:**
- Create: `data/inventory/b1.json`, `data/inventory/telc-b1-coverage.json`, `lib/services/telcB1Coverage.test.ts`
- Modify: every `data/curriculum-seed/*.json` (`seedVersion` → "7"), `lib/services/bundledSeedStructure.test.ts`, `lib/services/bundledSeedLanguages.test.ts` (expected version "7")

- [ ] **Step 1: Write the inventory**

Create `data/inventory/b1.json`: an array of the spec's 61 items, each `{ "id", "kind", "label", "labelDe" }`, in the spec's order. For example:

```json
[
  { "id": "g-praeteritum", "kind": "grammar", "label": "Präteritum (regular, irregular, modal verbs)", "labelDe": "Präteritum (regelmäßig, unregelmäßig, Modalverben)" },
  { "id": "g-plusquamperfekt", "kind": "grammar", "label": "Plusquamperfekt", "labelDe": "Plusquamperfekt" }
]
```

Continue for all 23 grammar, 15 theme, 13 exam and 10 communication items. Copy the ids exactly from the spec.

- [ ] **Step 2: Write the validation test**

Create `lib/services/telcB1Coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from './curriculumSeedLoader';

const read = (...p: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...p), 'utf8'));
const inventory = read('data', 'inventory', 'b1.json') as { id: string; kind: string; label: string; labelDe: string }[];
const coverage = read('data', 'inventory', 'telc-b1-coverage.json') as Record<string, string[]> & { _new?: string[] };
const seed = read('data', 'curriculum-seed', 'telc-b1.json') as SeedFile;
const lessonIds = new Set(seed.lessons.map((l) => l.id));
const newIds = coverage._new ?? [];

describe('telc B1 coverage', () => {
  it('has the 61 inventory items with unique ids and both labels', () => {
    expect(inventory).toHaveLength(61);
    expect(new Set(inventory.map((i) => i.id)).size).toBe(61);
    for (const item of inventory) {
      expect(item.label.trim()).not.toBe('');
      expect(item.labelDe.trim()).not.toBe('');
    }
  });

  it('maps only real telc B1 lessons, and every telc B1 lesson to at least one item', () => {
    const mapped = new Set(Object.entries(coverage).filter(([k]) => k !== '_new').flatMap(([, ids]) => ids));
    for (const id of mapped) expect(lessonIds.has(id), id).toBe(true);
    for (const id of lessonIds) expect(mapped.has(id), `${id} is not mapped to any item`).toBe(true);
  });

  it('keeps new lessons well-formed', () => {
    for (const id of newIds) {
      const lesson = seed.lessons.find((l) => l.id === id);
      expect(lesson, id).toBeDefined();
      expect(id.startsWith('b1-telc-')).toBe(true);
      const exercises = seed.exercises.filter((e) => e.lessonId === id);
      expect(exercises.length, `${id} exercise count`).toBeGreaterThanOrEqual(4);
      expect(exercises.length, `${id} exercise count`).toBeLessThanOrEqual(8);
      if (lesson!.skill !== 'vocabulary') expect(exercises.some((e) => e.type === 'flashcard'), `${id} flashcards`).toBe(false);
      for (const e of exercises.filter((x) => x.type === 'multiple_choice')) {
        const c = e.content as { options: string[]; correctIndex: number };
        expect(c.correctIndex >= 0 && c.correctIndex < c.options.length, e.id).toBe(true);
      }
    }
  });

  // Enabled in Task 5, once every gap is filled.
  it.skip('covers every inventory item', () => {
    for (const item of inventory) expect(coverage[item.id]?.length ?? 0, item.id).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Map the existing 20 lessons**

Create `data/inventory/telc-b1-coverage.json`. For each inventory item, list the existing telc B1 lessons that **teach it**: the explanation covers it and at least two exercises practise it. Leave an empty array for gaps, and add `"_new": []`.

Read every telc B1 lesson's explanation and exercises in `data/curriculum-seed/telc-b1.json` before deciding.

Every existing lesson must appear under at least one item. Put a lesson that covers nothing in the inventory under the closest item, and say so in your report.

- [ ] **Step 4: Bump the seed version and run**

Set `"seedVersion": "7"` in all 15 seed files, and update the expected version in `bundledSeedStructure.test.ts` and `bundledSeedLanguages.test.ts`.

Run: `npx vitest run lib/services/telcB1Coverage.test.ts lib/services/bundledSeed*.test.ts`
Expected: PASS (the full-coverage case is skipped).

In your report, list the gaps: every item with an empty array.

- [ ] **Step 5: Commit**

```bash
git add data/inventory lib/services/telcB1Coverage.test.ts lib/services/bundledSeed*.test.ts data/curriculum-seed
git commit -m "content: add the B1 inventory and map the existing telc B1 lessons"
```

---

### Task 2: Content — fill the grammar gaps

**Files:** modify `data/curriculum-seed/telc-b1.json` and `data/inventory/telc-b1-coverage.json`.

- [ ] **Step 1: Write one lesson per uncovered grammar item**

Closely related items may share one lesson if it teaches both properly, e.g. `g-kausal-konzessiv` with `g-final`. Follow the Global Constraints.
- **Explanation:** the English explanation states the rule, gives the forms (a small table as lines is fine), and names the common mistake.
- **German version:** `explanationDe` says the same in B1-level German.
- **Exercises:** 4–8 grammar exercises that test the rule in B1 contexts. Where possible, use telc B1 themes: work, housing, offices, health.

For each new lesson:
- **Placement:** add it to `lessons`, add its exercises to `exercises` (ids `<lessonId>__ex1`, `__ex2`, …), and add its id to the right milestone's `lessonIds`, sorted.
- **Prerequisites:** add prerequisites where one grammar point builds on another. For example, `g-relativsaetze` with prepositions builds on `g-verben-praepositionen`, and Konjunktiv II builds on Präteritum.
- **Coverage map:** add its id under its items, and to `_new`.

- [ ] **Step 2: Check for alternative answers**

For every `fill_blank`, list all answers a B1 teacher would accept. Put the ones other than `correctAnswer` into `acceptableVariants`: capitalisation variants aren't needed, because grading ignores case, but word-order or synonym alternatives are.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/services/telcB1Coverage.test.ts lib/services/bundledSeed*.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add data/curriculum-seed/telc-b1.json data/inventory/telc-b1-coverage.json
git commit -m "content: telc B1 grammar lessons for the uncovered B1 grammar"
```

In the report, list every new multiple-choice exercise as "question → correct option" (Review Focus 2), and every fill-blank as "sentence → answers".

---

### Task 3: Content — fill the theme (vocabulary) gaps

**Files:** modify `data/curriculum-seed/telc-b1.json` and `data/inventory/telc-b1-coverage.json`.

- [ ] **Step 1: Write one vocabulary lesson per uncovered theme**
  - **Explanation:** the core words and chunks of the theme at B1: 12–20 items with articles and plurals, listed in the explanation.
  - **Examples:** 2–4 sentences.
  - **Exercises:** 4–8, mixing `flashcard` (German front with article, English back), `multiple_choice` (the right word in context) and `fill_blank` (a gap in a realistic sentence).
  - **Placement:** themes that everyday life needs early (housing, health, shopping) go in lower milestones; abstract themes (media, environment) go higher.
  - **Map:** update the map and `_new`, as in Task 2.
- [ ] **Step 2: Check for alternative answers**, as in Task 2.
- [ ] **Step 3: Run the tests**, as in Task 2. Expected: PASS.
- [ ] **Step 4: Commit:** `git commit -am "content: telc B1 vocabulary lessons for the uncovered themes"` (after `git add` of the two files). The report lists the new flashcards and multiple-choice answers.

---

### Task 4: Content — fill the exam-part and communication gaps

**Files:** modify `data/curriculum-seed/telc-b1.json` and `data/inventory/telc-b1-coverage.json`.

- [ ] **Step 1: Write the remaining lessons**
  - **Exam parts** with no strategy lesson. `e-sprechen-vorbereitung` and the **personal or semi-formal letter** form of `e-schreiben` are likely gaps: the existing writing lessons are formal letters.
    - The explanation covers the format: what you get, how long it takes, the points, what the examiners assess, and step-by-step strategy.
    - Exercises practise the format: `multiple_choice` about the format and strategy, and `free_text` tasks in the real task form, with model answers at B1.
  - **Communication functions:** each lesson gives the chunks for the function, with register notes (du/Sie). Exercises are `multiple_choice` (the fitting reaction), `fill_blank` (a missing chunk) and `free_text` (produce the function in a situation).
  - **Placement:** exam strategy lessons go in the highest milestone; communication functions go by difficulty.
  - **Map:** update the map and `_new`.
- [ ] **Step 2: Check for alternative answers**, as in Task 2.
- [ ] **Step 3: Run the tests**, as in Task 2. Expected: PASS.
- [ ] **Step 4: Commit:** `git commit -am "content: telc B1 exam-strategy and communication lessons"` (after adding the two files).

---

### Task 5: Full coverage, concept links, and the review summary

**Files:**
- Modify:
  - `lib/services/telcB1Coverage.test.ts`
  - `data/curriculum-seed/telc-b1.json`, `data/curriculum-seed/goethe-b1.json`, `data/curriculum-seed/generic-b1.json` (`conceptLinks` only)
- Create: `docs/superpowers/content/2026-09-29-telc-b1-expansion.md`

- [ ] **Step 1: Enable full coverage**

In `lib/services/telcB1Coverage.test.ts`, change `it.skip('covers every inventory item'` to `it('covers every inventory item'`.

Run: `npx vitest run lib/services/telcB1Coverage.test.ts`
Expected: PASS. If an item is still uncovered, write its lesson, following the Task 2–4 rules for its kind.

- [ ] **Step 2: Concept links**

For each new telc B1 lesson, check whether `goethe-b1.json` or `generic-b1.json` has a lesson teaching the same concept (same grammar point or same theme). For each match, add `{ "lessonAId": "<smaller id>", "lessonBId": "<larger id>" }` to `conceptLinks` in **both** files (Review Focus 5).

Add this test to `lib/services/telcB1Coverage.test.ts`:

```ts
  it('lists every concept link in both files it touches', () => {
    const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'curriculum-seed', f), 'utf8')) as SeedFile;
    const files = ['telc-b1.json', 'goethe-b1.json', 'generic-b1.json'].map(read);
    const owner = new Map<string, number>();
    files.forEach((f, i) => f.lessons.forEach((l) => owner.set(l.id, i)));
    files.forEach((f, i) => {
      for (const link of f.conceptLinks ?? []) {
        for (const end of [link.lessonAId, link.lessonBId]) {
          const other = owner.get(end);
          if (other === undefined || other === i) continue;
          const listed = (files[other].conceptLinks ?? []).some((x) => x.lessonAId === link.lessonAId && x.lessonBId === link.lessonBId);
          expect(listed, `${link.lessonAId} ↔ ${link.lessonBId} missing in the other file`).toBe(true);
        }
      }
    });
  });
```

- [ ] **Step 3: Review summary**

Create `docs/superpowers/content/2026-09-29-telc-b1-expansion.md` with:
1. The coverage matrix, as a table: item (en) → lessons, with new ones in **bold**.
2. Per new lesson: title (en / de), milestone, skill, exercise count, and one line on what it teaches.
3. The list of concept links added.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: PASS. Start the app with a fresh data dir and set telc B1 active (after placement or skipping). The tree then shows the new lessons in their milestones.

- [ ] **Step 5: Commit**

```bash
git add lib/services/telcB1Coverage.test.ts data/curriculum-seed docs/superpowers/content/2026-09-29-telc-b1-expansion.md
git commit -m "content: complete telc B1 coverage, add concept links, and the review summary"
```
