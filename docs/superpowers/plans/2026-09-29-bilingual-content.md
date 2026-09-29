# Bilingual Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every text around the German being learned available in English and German. That covers titles, explanations, example notes, instructions and grading feedback, with a per-lesson en↔de toggle. The tested German is never translated.

**Architecture:**
- `LocalizedText { en, de }` is the domain type. The database stores it as the existing English column plus a `_de` column, and exercise content JSON gains an optional `instruction`.
- The server resolves to the UI language wherever there's no toggle (tree, queue, locked views, test-out). It sends both languages wherever there is one (lesson page, placement, feedback).
- Seed format v3 carries the German fields, and the loader validates them.
- A content task drafts all the German.

**Tech Stack:** Next.js 16 App Router, React 18.3, TypeScript, better-sqlite3, next-intl 4, vitest 5 with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-bilingual-content-design.md`

**Precondition:** Tutoring Phase 2 and the Curriculum Restructure (`docs/superpowers/plans/2026-09-29-curriculum-restructure.md`) are merged. The bundled seeds are format v2 at `seedVersion` "4". Re-check the line references before each task.

## Global Constraints

- **Never translated:** German stimulus text, `options`, `textWithBlank`, flashcard `front`/`back`, `correctAnswer`, `acceptableVariants` and `modelAnswer`.
- **Translated:** milestone title and description, lesson title and explanation, examples, exercise and placement `instruction`, and free-text grading feedback.
- **Fallback:** a German display falls back to English when the German text is empty (`pickText`).
- **Toggles:**
  - the lesson toggle starts in the UI language and resets whenever another lesson opens;
  - the feedback toggle and the placement toggle start in the UI language;
  - the tree, queue and test-out have no toggle and use the UI language.
- **German register:** German explanations and feedback are simplified to the lesson's CEFR level. A1 uses short main clauses, present tense and the most common words. A2 adds simple subordinate clauses and the Perfekt. B1 and above use clear, natural German.
- **Chat language:** the lesson chat replies in the language of the student's latest message.
- **German-only content:** the practice pool and level exams stay German-only, with no `instruction` field.
- **Instruction rule:** an instruction has both languages or neither. Flashcards never have one. A multiple-choice `question` or free-text `prompt` may be empty only when an instruction is present.
- **Admin saves** require a German title (lesson and milestone), both explanation versions or neither, both versions of every example, and both description versions or neither.
- **Seed files** are `formatVersion: 3`. The loader validates the German fields and instructions of every file before writing anything.
- **Existing rules:** every client fetch checks `res.ok` and shows `role="alert"`. Client tests use `delayedResponse`. Admin UI stays English.

## Review Focus

1. **Legacy feedback:** an attempt stored before this change has plain-text `ai_feedback`, and the lesson chat's exercise context must still read it (Task 3).
2. **Same component across lessons:** navigating from one lesson to another keeps the same `LessonPage` component. The toggle must still reset to the UI language (Task 4).
3. **Mixed-language chat:** a student who writes German in the chat on an English UI gets a German reply. The prompt must not also say "answer in English" (Task 3).
4. **Emptied instruction:** an admin clears both instruction fields on an exercise that had one. The content then has no `instruction` key, not `{ en: '', de: '' }` (Task 5).
5. **Legacy placement answers:** a placement session started before this change has `feedback` strings in its stored answers. The result page must still render (Task 3).

## File Structure

| File | Responsibility |
|---|---|
| `lib/i18n/localizedText.ts` (new) | `LocalizedText`, `pickText`, `localized`, feedback storage helpers |
| `lib/curriculum/bilingualValidation.ts` (new) | Lesson and milestone text rules |
| `lib/curriculum/exerciseContentValidation.ts` | Instruction rule and empty-stimulus exception |
| `lib/services/contentText.ts` (new) | Resolves lesson and milestone titles to a language |
| `lib/db/schema.ts`, `lib/curriculum/types.ts` | `_de` columns and domain fields |
| `lib/services/curriculumSeedLoader.ts`, `curriculumExportService.ts`, `curriculumService.ts` | Seed v3 |
| `lib/tutoring/freeTextGrading.ts`, `lib/services/freeTextGradingService.ts`, `exerciseGrading.ts`, `attemptService.ts`, `placementService.ts`, `lessonChatService.ts`, `lib/tutoring/lessonChat.ts` | Bilingual feedback, reply-language rule |
| `lib/tutoring/exerciseView.ts`, `progressTypes.ts`, `placementTypes.ts`, `lessonAnswers.ts`, `lib/services/progressService.ts`, `testOutService.ts` | Views |
| `components/LanguageToggle.tsx` (new), `components/tutoring/LessonPage.tsx`, `ExerciseCard.tsx`, `components/placement/PlacementTest.tsx` | Toggles and instruction line |
| `components/admin/LessonEditorForm.tsx`, `ExerciseEditor.tsx`, `TrackLevelStructure.tsx`, `PlacementPicker.tsx`, `lib/services/lessonAdminService.ts`, `curriculumStructureService.ts`, `lib/curriculum-admin/placementResolver.ts` | Admin |
| `scripts/convert-seeds-v3.ts` (new, one-off), `data/curriculum-seed/*.json`, `data/placement-exam.json` | Seeds |

## Task Order

1. Pure helpers and validation
2. Schema, domain types, seed v3 (loader, export, mechanical conversion)
3. Server: views resolve or carry both languages; bilingual grading; chat reply language
4. Client: language toggle, lesson page, exercise card, placement test
5. Admin: bilingual editors and save validation
6. Content: the German draft for all seeds and the placement exam

---

### Task 1: Pure helpers and validation

**Files:**
- Create:
  - `lib/i18n/localizedText.ts`, `lib/i18n/localizedText.test.ts`
  - `lib/curriculum/bilingualValidation.ts`, `lib/curriculum/bilingualValidation.test.ts`
- Modify: `lib/curriculum/exerciseContentValidation.ts`, `lib/curriculum/exerciseContentValidation.test.ts`

**Interfaces:**
- Produces:
  - `localizedText.ts`:
    - `LocalizedText { en: string; de: string }`
    - `ContentLanguage = 'en' | 'de'`
    - `pickText(text, language): string`
    - `localized(en: string, de: string | null | undefined): LocalizedText`
    - `isLocalizedText(value): value is LocalizedText`
    - `storeFeedback(f: LocalizedText): string`
    - `readFeedback(stored: unknown): LocalizedText | null`
  - `bilingualValidation.ts`:
    - `LessonTexts { title; titleDe; explanation: string | null; explanationDe: string | null; examples: string[] | null; examplesDe: string[] | null }` and `lessonTextProblems(t): string[]`
    - `MilestoneTexts { title; titleDe; description: string | null; descriptionDe: string | null }` and `milestoneTextProblems(t): string[]`
  - `exerciseContentValidation.ts`: exports `instructionProblems(type: unknown, content: unknown): string[]`, which `validateExerciseContent` also applies.

- [ ] **Step 1: Write the failing tests**

Create `lib/i18n/localizedText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isLocalizedText, localized, pickText, readFeedback, storeFeedback } from './localizedText';

describe('localizedText', () => {
  it('picks the language and falls back to English when German is empty', () => {
    expect(pickText({ en: 'Hello', de: 'Hallo' }, 'de')).toBe('Hallo');
    expect(pickText({ en: 'Hello', de: '  ' }, 'de')).toBe('Hello');
    expect(pickText({ en: 'Hello', de: 'Hallo' }, 'en')).toBe('Hello');
  });

  it('builds from columns, treating a missing German value as empty', () => {
    expect(localized('Hello', null)).toEqual({ en: 'Hello', de: '' });
  });

  it('recognises the shape', () => {
    expect(isLocalizedText({ en: 'a', de: 'b' })).toBe(true);
    expect(isLocalizedText({ en: 'a' })).toBe(false);
    expect(isLocalizedText('a')).toBe(false);
  });

  it('stores feedback as JSON and reads legacy plain text as both languages', () => {
    expect(readFeedback(storeFeedback({ en: 'Good.', de: 'Gut.' }))).toEqual({ en: 'Good.', de: 'Gut.' });
    expect(readFeedback('Watch the article.')).toEqual({ en: 'Watch the article.', de: 'Watch the article.' });
    expect(readFeedback({ en: 'x', de: 'y' })).toEqual({ en: 'x', de: 'y' });
    expect(readFeedback(null)).toBeNull();
    expect(readFeedback('')).toBeNull();
  });
});
```

Create `lib/curriculum/bilingualValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lessonTextProblems, milestoneTextProblems } from './bilingualValidation';

const ok = { title: 'Hello', titleDe: 'Hallo', explanation: null, explanationDe: null, examples: null, examplesDe: null };

describe('lessonTextProblems', () => {
  it('accepts a complete lesson', () => {
    expect(lessonTextProblems({ ...ok, explanation: 'E', explanationDe: 'D', examples: ['a'], examplesDe: ['b'] })).toEqual([]);
  });

  it('requires a German title, both explanations or neither, and both versions of every example', () => {
    expect(lessonTextProblems({ ...ok, titleDe: ' ' })).toEqual(['German title is required']);
    expect(lessonTextProblems({ ...ok, explanation: 'E' })).toEqual(['The explanation needs both English and German']);
    expect(lessonTextProblems({ ...ok, examples: ['a', 'b'], examplesDe: ['x'] })).toEqual([
      'Every example needs both English and German',
    ]);
    expect(lessonTextProblems({ ...ok, examples: ['a'], examplesDe: [''] })).toEqual(['Every example needs both English and German']);
  });
});

describe('milestoneTextProblems', () => {
  it('requires a German title and both descriptions or neither', () => {
    expect(milestoneTextProblems({ title: 'A', titleDe: 'B', description: null, descriptionDe: null })).toEqual([]);
    expect(milestoneTextProblems({ title: 'A', titleDe: '', description: 'd', descriptionDe: null })).toEqual([
      'German title is required',
      'The description needs both English and German',
    ]);
  });
});
```

Append to `lib/curriculum/exerciseContentValidation.test.ts`:

```ts
describe('instructions', () => {
  it('accepts an instruction with both languages, and an empty question or prompt only then', () => {
    const instruction = { en: 'Choose the right greeting.', de: 'Wähle die richtige Begrüßung.' };
    expect(validateExerciseContent('multiple_choice', { question: '', options: ['Hallo', 'Tschüss'], correctIndex: 0, instruction })).toEqual([]);
    expect(validateExerciseContent('free_text', { prompt: '', modelAnswer: 'Hallo!', instruction })).toEqual([]);
    expect(validateExerciseContent('multiple_choice', { question: '', options: ['Hallo', 'Tschüss'], correctIndex: 0 })).toEqual([
      'question must be a non-empty string',
    ]);
  });

  it('rejects a half-filled instruction and any instruction on a flashcard', () => {
    expect(instructionProblems('fill_blank', { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: '' } })).toEqual([
      'instruction needs both English and German',
    ]);
    expect(instructionProblems('flashcard', { front: 'a', back: 'b', instruction: { en: 'x', de: 'y' } })).toEqual([
      'flashcards have no instruction',
    ]);
    expect(instructionProblems('fill_blank', { textWithBlank: 'Ich ___.', correctAnswer: 'bin' })).toEqual([]);
  });
});
```

(Add `instructionProblems` to the file's import from `./exerciseContentValidation`.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/i18n lib/curriculum/bilingualValidation.test.ts lib/curriculum/exerciseContentValidation.test.ts`
Expected: FAIL. The modules and `instructionProblems` don't exist.

- [ ] **Step 3: Implement**

Create `lib/i18n/localizedText.ts`:

```ts
// Spec: Bilingual Content. The English text is authoritative; German falls back to it when empty.
export interface LocalizedText {
  en: string;
  de: string;
}

export type ContentLanguage = 'en' | 'de';

export function pickText(text: LocalizedText, language: ContentLanguage): string {
  return language === 'de' && text.de.trim() ? text.de : text.en;
}

export function localized(en: string, de: string | null | undefined): LocalizedText {
  return { en, de: de ?? '' };
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as LocalizedText).en === 'string' &&
    typeof (value as LocalizedText).de === 'string'
  );
}

export function storeFeedback(feedback: LocalizedText): string {
  return JSON.stringify({ en: feedback.en, de: feedback.de });
}

// Stored feedback is JSON {en, de}; rows written before this change hold plain text.
export function readFeedback(stored: unknown): LocalizedText | null {
  if (isLocalizedText(stored)) return stored;
  if (typeof stored !== 'string' || stored.trim() === '') return null;
  try {
    const parsed = JSON.parse(stored);
    if (isLocalizedText(parsed)) return parsed;
  } catch {
    // legacy plain text
  }
  return { en: stored, de: stored };
}
```

Create `lib/curriculum/bilingualValidation.ts`:

```ts
// Spec: Admin, validation on save; Seed Format v3. English is the authored text; German is required alongside it.

export interface LessonTexts {
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
}

export interface MilestoneTexts {
  title: string;
  titleDe: string;
  description: string | null;
  descriptionDe: string | null;
}

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

export function lessonTextProblems(t: LessonTexts): string[] {
  const problems: string[] = [];
  if (!filled(t.titleDe)) problems.push('German title is required');
  if (filled(t.explanation) !== filled(t.explanationDe)) problems.push('The explanation needs both English and German');
  const en = t.examples ?? [];
  const de = t.examplesDe ?? [];
  if (en.length !== de.length || en.some((example, i) => !filled(example) || !filled(de[i]))) {
    problems.push('Every example needs both English and German');
  }
  return problems;
}

export function milestoneTextProblems(t: MilestoneTexts): string[] {
  const problems: string[] = [];
  if (!filled(t.titleDe)) problems.push('German title is required');
  if (filled(t.description) !== filled(t.descriptionDe)) problems.push('The description needs both English and German');
  return problems;
}
```

In `lib/curriculum/exerciseContentValidation.ts`:
- Add after `isNonEmptyString`:

```ts
function hasInstruction(c: Record<string, unknown>): boolean {
  return c.instruction !== undefined;
}

// Spec: an instruction has both languages or neither; flashcards never have one.
export function instructionProblems(type: unknown, content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const instruction = (content as Record<string, unknown>).instruction;
  if (instruction === undefined) return [];
  if (type === 'flashcard') return ['flashcards have no instruction'];
  const i = instruction as Record<string, unknown> | null;
  if (!i || typeof i !== 'object' || !isNonEmptyString(i.en) || !isNonEmptyString(i.de)) {
    return ['instruction needs both English and German'];
  }
  return [];
}
```

- In `validateExerciseContent`, change the multiple-choice question check to:

```ts
      if (hasInstruction(c) ? typeof c.question !== 'string' : !isNonEmptyString(c.question)) {
        errors.push('question must be a non-empty string');
      }
```

- Change the free-text prompt check to:

```ts
      if (hasInstruction(c) ? typeof c.prompt !== 'string' : !isNonEmptyString(c.prompt)) {
        errors.push('prompt must be a non-empty string');
      }
```

- Before `return errors;`, add `errors.push(...instructionProblems(type, content));`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/i18n lib/curriculum lib/tutoring/placementExamFormat.test.ts`
Expected: PASS. Placement-exam validation still passes, because it calls `validateExerciseContent`.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n lib/curriculum/bilingualValidation.ts lib/curriculum/bilingualValidation.test.ts lib/curriculum/exerciseContentValidation.ts lib/curriculum/exerciseContentValidation.test.ts
git commit -m "feat: add localized text helpers and bilingual validation rules"
```

---

### Task 2: Schema, domain types, and seed format v3

**Files:**
- Create: `scripts/convert-seeds-v3.ts`, `lib/db/bilingualMigration.test.ts`
- Modify:
  - `lib/db/schema.ts`, `lib/curriculum/types.ts`
  - `lib/services/curriculumService.ts`
  - `lib/services/curriculumSeedLoader.ts`, `lib/services/curriculumSeedLoader.test.ts`
  - `lib/services/curriculumExportService.ts`, `lib/services/curriculumExportService.test.ts`
  - `lib/services/bundledSeedStructure.test.ts`
  - `data/curriculum-seed/*.json`
  - every test that builds a v2 seed object (`grep -rln "formatVersion: 2" lib app`)

**Interfaces:**
- Consumes: `lessonTextProblems`, `milestoneTextProblems`, `instructionProblems` (Task 1).
- Produces:
  - `Lesson` gains `titleDe: string; explanationDe: string | null; examplesDe: string[] | null`.
  - `Milestone` gains `titleDe: string; descriptionDe: string | null`.
  - `MultipleChoiceContent`, `FillBlankContent` and `FreeTextContent` gain `instruction?: LocalizedText`.
  - `SEED_FORMAT_VERSION = 3`. `SeedMilestone` gains `titleDe: string; descriptionDe: string | null`. Each seed lesson gains `titleDe: string; explanationDe: string | null; examplesDe: string[] | null`.
  - `validateSeedFile(seed: SeedFile, name: string): string[]` (exported).

- [ ] **Step 1: Write the failing tests**

Create `lib/db/bilingualMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

describe('bilingual columns', () => {
  it('adds German columns with empty defaults', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m', 'generic', 'A1', 'Basics', 1);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('l', 'generic', 'A1', 'grammar', 'Hello');`);
    expect(db.prepare('SELECT title_de, description_de FROM milestones').get()).toEqual({ title_de: '', description_de: null });
    expect(db.prepare('SELECT title_de, explanation_de, examples_de FROM lessons').get()).toEqual({
      title_de: '',
      explanation_de: null,
      examples_de: null,
    });
  });
});
```

In `lib/services/curriculumSeedLoader.test.ts`:
- Change the `v2(...)` helper so it builds format 3. Rename it to `v3`. Set `formatVersion: 3`, add `titleDe: m.id + ' (de)', descriptionDe: null` to each milestone and `titleDe: id + ' (de)', explanationDe: null, examplesDe: null` to each lesson, and update its call sites.
- Add:

```ts
  it('rejects a file whose German fields or instructions are incomplete, naming the file and the item', () => {
    const db = createDbClient(':memory:');
    const seed = v3('1', [{ id: 'm1', rank: 1, lessonIds: ['l1'] }], ['l1']);
    seed.lessons[0].titleDe = '';
    expect(() => loadSeedIfNeeded(db, seedDir({ 'bad.json': seed }))).toThrow('bad.json: lesson l1: German title is required');

    const withExercise = v3('1', [{ id: 'm1', rank: 1, lessonIds: ['l1'] }], ['l1']);
    withExercise.exercises = [
      { id: 'l1__ex1', lessonId: 'l1', track: null, type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: '' } } },
    ];
    expect(() => loadSeedIfNeeded(db, seedDir({ 'bad2.json': withExercise }))).toThrow(
      'bad2.json: exercise l1__ex1: instruction needs both English and German'
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM lessons').get()).toEqual({ n: 0 });
  });

  it('stores the German fields', () => {
    const db = createDbClient(':memory:');
    const seed = v3('1', [{ id: 'm1', rank: 1, lessonIds: ['l1'] }], ['l1']);
    seed.lessons[0] = { ...seed.lessons[0], explanation: 'E', explanationDe: 'D', examples: ['a'], examplesDe: ['b'] };
    loadSeedIfNeeded(db, seedDir({ 'a.json': seed }));
    expect(db.prepare("SELECT title_de, explanation_de, examples_de FROM lessons WHERE id = 'l1'").get()).toEqual({
      title_de: 'l1 (de)',
      explanation_de: 'D',
      examples_de: '["b"]',
    });
    expect(db.prepare("SELECT title_de FROM milestones WHERE id = 'm1'").get()).toEqual({ title_de: 'm1 (de)' });
  });
```

The v1-rejection test from the restructure still passes (a v1 file isn't format 3). Update its expected message only if it quotes the version number.

In `lib/services/curriculumExportService.test.ts`, extend the v2 export test (rename it "exports format v3 …"):
- set German values in its fixture (`UPDATE lessons SET title_de = 'B-de' WHERE id = 'b'` and `UPDATE milestones SET title_de = 'One-de' WHERE id = 'm1'`);
- assert `seed.formatVersion === 3`, `seed.milestones[0].milestone.titleDe === 'One-de'`, and `seed.lessons.find((l) => l.id === 'b')?.titleDe === 'B-de'`.

In `lib/services/bundledSeedStructure.test.ts`, change the first test to expect `formatVersion` 3 and `seedVersion` '5'.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/db/bilingualMigration.test.ts lib/services/curriculumSeedLoader.test.ts lib/services/curriculumExportService.test.ts`
Expected: FAIL. The columns don't exist.

- [ ] **Step 3: Implement the schema and types**

In `lib/db/schema.ts`:
- Add `title_de TEXT NOT NULL DEFAULT ''` and `description_de TEXT` to the `milestones` definition in `createTablesIfMissing`.
- Add `title_de TEXT NOT NULL DEFAULT ''`, `explanation_de TEXT` and `examples_de TEXT` to `lessons`.
- Add this migration and call it last in `runMigrations`:

```ts
// Spec: Bilingual Content, Data Model. German columns beside the English ones; empty until seeded.
function migrateBilingualColumns(db: Database.Database): void {
  const has = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!has('milestones', 'title_de')) {
    db.exec("ALTER TABLE milestones ADD COLUMN title_de TEXT NOT NULL DEFAULT ''; ALTER TABLE milestones ADD COLUMN description_de TEXT;");
  }
  if (!has('lessons', 'title_de')) {
    db.exec(
      "ALTER TABLE lessons ADD COLUMN title_de TEXT NOT NULL DEFAULT ''; ALTER TABLE lessons ADD COLUMN explanation_de TEXT; ALTER TABLE lessons ADD COLUMN examples_de TEXT;"
    );
  }
}
```

In `lib/curriculum/types.ts`:
- add `import type { LocalizedText } from '../i18n/localizedText';`;
- add `titleDe: string; descriptionDe: string | null;` to `Milestone`;
- add `titleDe: string; explanationDe: string | null; examplesDe: string[] | null;` to `Lesson`;
- add `instruction?: LocalizedText;` to `MultipleChoiceContent`, `FillBlankContent` and `FreeTextContent`.

In `lib/services/curriculumService.ts`:
- `MilestoneRow` gains `title_de: string; description_de: string | null`, and `LessonRow` gains `title_de: string; explanation_de: string | null; examples_de: string | null`.
- `rowToMilestone` adds `titleDe: row.title_de, descriptionDe: row.description_de`.
- `rowToLesson` adds `titleDe: row.title_de, explanationDe: row.explanation_de, examplesDe: row.examples_de ? JSON.parse(row.examples_de) : null`.

In `lib/services/curriculumStructureService.ts`, make the same two additions to its own `MilestoneRow` and `rowToMilestone`.

- [ ] **Step 4: Seed v3 loader and export**

In `lib/services/curriculumSeedLoader.ts`:
- Set `export const SEED_FORMAT_VERSION = 3;`, and change `formatVersion: 2` in `SeedFile` to `formatVersion: 3`.
- Add `titleDe: string; descriptionDe: string | null;` to `SeedMilestone`, and `titleDe: string; explanationDe: string | null; examplesDe: string[] | null;` to the lesson element type.
- Add imports: `import { lessonTextProblems, milestoneTextProblems } from '../curriculum/bilingualValidation';` and `import { instructionProblems } from '../curriculum/exerciseContentValidation';`.
- Add:

```ts
// Spec: Seed Format v3. Every file is checked before anything is written.
export function validateSeedFile(seed: SeedFile, name: string): string[] {
  const problems: string[] = [];
  for (const { milestone } of seed.milestones) {
    for (const p of milestoneTextProblems(milestone)) problems.push(`${name}: milestone ${milestone.id}: ${p}`);
  }
  for (const lesson of seed.lessons) {
    for (const p of lessonTextProblems(lesson)) problems.push(`${name}: lesson ${lesson.id}: ${p}`);
  }
  for (const exercise of seed.exercises) {
    for (const p of instructionProblems(exercise.type, exercise.content)) problems.push(`${name}: exercise ${exercise.id}: ${p}`);
  }
  return problems;
}
```

- In `readSeedFile`, after the format check, add:

```ts
  const problems = validateSeedFile(seed, name);
  if (problems.length > 0) throw new Error(problems.slice(0, 10).join('\n'));
```

- In `replaceStructure`, change the milestone upsert to:

```ts
  const upsertMilestone = db.prepare(
    `INSERT INTO milestones (id, track, level, title, description, difficulty_rank, title_de, description_de) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description,
       difficulty_rank = excluded.difficulty_rank, title_de = excluded.title_de, description_de = excluded.description_de`
  );
```

  and its `.run(...)` to add `milestone.titleDe, milestone.descriptionDe`.
- In `upsertSeedFile`, change the lesson upsert to:

```ts
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, track, source_level, skill, title, explanation, examples, title_de, explanation_de, examples_de)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, explanation = excluded.explanation, examples = excluded.examples,
       title_de = excluded.title_de, explanation_de = excluded.explanation_de, examples_de = excluded.examples_de`
  );
```

  and its `.run(...)` to append `lesson.titleDe, lesson.explanationDe, lesson.examplesDe ? JSON.stringify(lesson.examplesDe) : null`.

In `lib/services/curriculumExportService.ts`:
- `MilestoneRow` and `LessonRow` gain the `_de` columns.
- Each exported milestone adds `titleDe: m.title_de, descriptionDe: m.description_de`.
- Each exported lesson adds `titleDe: l.title_de, explanationDe: l.explanation_de, examplesDe: l.examples_de ? (JSON.parse(l.examples_de) as string[]) : null`.
- The returned `formatVersion` becomes `3 as const`.

- [ ] **Step 5: Convert the bundled seeds mechanically**

Create `scripts/convert-seeds-v3.ts`. Like the restructure's v2 script, it's a one-off. It copies the English text into the German fields as a placeholder so the loader accepts the files; Task 6 replaces every placeholder with real German.

```ts
// One-off (Bilingual Content, Task 2): seed format v2 → v3. German fields start as copies of the
// English so the app keeps loading; Task 6 replaces them with the real German draft.
// Run: npx tsx scripts/convert-seeds-v3.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'data', 'curriculum-seed');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file);
  const seed = JSON.parse(readFileSync(path, 'utf8'));
  if (seed.formatVersion === 3) continue;
  seed.formatVersion = 3;
  seed.seedVersion = '5';
  for (const entry of seed.milestones) {
    entry.milestone.titleDe = entry.milestone.title;
    entry.milestone.descriptionDe = entry.milestone.description;
  }
  for (const lesson of seed.lessons) {
    lesson.titleDe = lesson.title;
    lesson.explanationDe = lesson.explanation;
    lesson.examplesDe = lesson.examples;
  }
  writeFileSync(path, JSON.stringify(seed, null, 2) + '\n');
  console.log(`converted ${file}`);
}
```

Run `npx tsx scripts/convert-seeds-v3.ts`. Expect 15 "converted" lines.

Then update every test that builds a v2 seed object: `grep -rln "formatVersion: 2" lib app`. Set `formatVersion: 3`, and give each milestone `titleDe` and `descriptionDe` (copy `title` and `description`) and each lesson `titleDe`, `explanationDe` and `examplesDe` (copies).

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A lib scripts data/curriculum-seed
git commit -m "feat: store German texts beside English; seed format v3"
```

---

### Task 3: Server — views, bilingual grading, chat reply language

**Files:**
- Create: `lib/services/contentText.ts`, `lib/services/contentText.test.ts`
- Modify:
  - `lib/tutoring/exerciseView.ts`, `lib/tutoring/exerciseView.test.ts`
  - `lib/tutoring/progressTypes.ts`
  - `lib/services/progressService.ts`, `lib/services/progressService.test.ts`
  - `lib/services/testOutService.ts`
  - `lib/tutoring/freeTextGrading.ts`, `lib/tutoring/freeTextGrading.test.ts`
  - `lib/services/freeTextGradingService.ts`, `lib/services/exerciseGrading.ts`, `lib/services/attemptService.ts`, `lib/services/attemptService.test.ts`
  - `lib/tutoring/lessonAnswers.ts`
  - `lib/tutoring/lessonChat.ts`, `lib/tutoring/lessonChat.test.ts`, `lib/services/lessonChatService.ts`
  - `lib/tutoring/placementTypes.ts`, `lib/services/placementService.ts`, `lib/services/placementService.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `createContentText(db)` → `{ lessonTitle(id, lang): string; milestoneTitle(id, lang): string; milestoneDescription(id, lang): string | null }`.
  - `ExerciseView`'s multiple-choice, fill-blank and free-text variants gain `instruction?: LocalizedText`.
  - The open `LessonView` has `title: LocalizedText; explanation: LocalizedText | null; examples: LocalizedText[] | null`. The locked views and the tree, queue and test-out titles are strings in the UI language.
  - `FreeTextGradingInput` loses `uiLanguage`, and its `prompt` is now the full task text (instruction plus prompt).
  - `FreeTextGradeOutcome` ok: `{ ok: true; result; feedback: LocalizedText }`.
  - `ExerciseGradeOutcome` ok: `feedback: LocalizedText | null`, and `ExerciseGradingDeps` loses `uiLanguage`.
  - `AttemptOutcome.feedback: LocalizedText | null`, and `PlacementAnswerRecord.feedback: LocalizedText | null`.
  - `LessonChatPromptInput` loses `uiLanguage`.
  - `taskTextOf(content, type): string` in `lessonAnswers.ts` gives the English task text (instruction, then stimulus) for AI prompts.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/contentText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createContentText } from './contentText';

describe('contentText', () => {
  it('resolves titles and descriptions to a language, falling back to English', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO milestones (id, track, level, title, description, difficulty_rank, title_de, description_de)
        VALUES ('m', 'generic', 'A1', 'Basics', 'The start.', 1, 'Grundlagen', 'Der Anfang.');
      INSERT INTO lessons (id, track, source_level, skill, title, title_de) VALUES ('a', 'generic', 'A1', 'grammar', 'Hello', 'Hallo'),
        ('b', 'generic', 'A1', 'grammar', 'Bye', '');`);
    const text = createContentText(db);
    expect(text.lessonTitle('a', 'de')).toBe('Hallo');
    expect(text.lessonTitle('b', 'de')).toBe('Bye');
    expect(text.lessonTitle('a', 'en')).toBe('Hello');
    expect(text.milestoneTitle('m', 'de')).toBe('Grundlagen');
    expect(text.milestoneDescription('m', 'de')).toBe('Der Anfang.');
  });
});
```

In `lib/tutoring/exerciseView.test.ts`, add:

```ts
  it('carries the instruction in both languages', () => {
    const view = toExerciseView({
      id: 'e',
      lessonId: 'l',
      track: null,
      type: 'free_text',
      content: { prompt: '', modelAnswer: 'Hallo!', instruction: { en: 'Say hello.', de: 'Sag hallo.' } },
    });
    expect(view).toEqual({ id: 'e', type: 'free_text', prompt: '', instruction: { en: 'Say hello.', de: 'Sag hallo.' } });
  });
```

In `lib/tutoring/freeTextGrading.test.ts`:
- Replace the parse tests' reply fixtures `{"result":…,"feedback":"…"}` with `{"result":…,"feedback_en":"…","feedback_de":"…"}`, and expect `feedback: { en, de }`.
- Add:

```ts
  it('requires feedback in both languages', () => {
    expect(parseFreeTextGrade('{"result":"almost","feedback_en":"Article."}')).toBeNull();
  });

  it('asks for English and level-simplified German feedback', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt({ prompt: 'Say hello.', modelAnswer: 'Hallo!', studentAnswer: 'Halo', level: 'A1' });
    expect(systemPrompt).toContain('"feedback_en"');
    expect(systemPrompt).toContain('"feedback_de"');
    expect(systemPrompt).toContain('simple enough for CEFR level A1');
  });
```

- Remove `uiLanguage` from every `FreeTextGradingInput` literal in that file.

In `lib/tutoring/lessonChat.test.ts`:
- remove `uiLanguage` from the prompt inputs;
- replace any assertion on "Answer in English/German" with:

```ts
    expect(prompt).toContain("Reply in the language of the learner's latest message (German or English).");
    expect(prompt).not.toMatch(/Answer in (English|German)/);
```

In `lib/services/attemptService.test.ts`:
- Every `gradeFreeText` stub that returns `{ ok: true, result, feedback: '…' }` now returns `feedback: { en: '…', de: '…' }`.
- Expectations on the outcome's `feedback` become the `{ en, de }` object.
- Add:

```ts
  it('stores feedback in both languages', async () => {
    const grade = vi.fn<GradeFreeText>().mockResolvedValue({ ok: true, result: 'almost', feedback: { en: 'Good.', de: 'Gut.' } });
    const { db, service } = setup({ grade });
    db.prepare("INSERT INTO lesson_completions (lesson_id, completed_at) VALUES ('a1-greet', '2026-09-20T10:00:00.000Z')").run();
    const outcome = await service.recordAttempt('a1-sein__ex10', { type: 'free_text', text: 'Ich bin mude.' }, 'lesson');
    expect(outcome.feedback).toEqual({ en: 'Good.', de: 'Gut.' });
    const row = db.prepare('SELECT ai_feedback FROM lesson_attempts ORDER BY id DESC LIMIT 1').get() as { ai_feedback: string };
    expect(JSON.parse(row.ai_feedback)).toEqual({ en: 'Good.', de: 'Gut.' });
  });
```

In the same file, change `setup`'s default grader to `mockResolvedValue({ ok: true, result: 'correct', feedback: { en: 'Good.', de: 'Gut.' } })`.

In `lib/services/progressService.test.ts`, add:

```ts
  it('resolves the tree and locked views to the UI language, and gives the open lesson both languages', () => {
    const { db, progress, profiles } = setup();
    db.exec(`UPDATE lessons SET title_de = 'Begrüßen', explanation = 'Say Hallo.', explanation_de = 'Sag Hallo.' WHERE id = 'a1-greet';
      UPDATE milestones SET title_de = 'Grundlagen' WHERE id = 'g-a1-m1';`);
    profiles.updateProfile({ uiLanguage: 'de' });
    const tree = progress.getTree();
    expect(tree.milestones[0].title).toBe('Grundlagen');
    expect(tree.milestones[0].lessons.find((l) => l.id === 'a1-greet')?.title).toBe('Begrüßen');
    const view = progress.getLessonView('a1-greet');
    expect(view).toMatchObject({
      locked: false,
      title: { en: 'Saying hello', de: 'Begrüßen' },
      explanation: { en: 'Say Hallo.', de: 'Sag Hallo.' },
    });
  });
```

In `lib/services/placementService.test.ts`:
- a free-text grader stub returns `feedback: { en: 'x', de: 'y' }`;
- an answer record's `feedback` expectation becomes that object;
- add a case where a stored session's answers JSON has `"feedback": "legacy"`, and `getState()` or the result mapping returns `{ en: 'legacy', de: 'legacy' }` for it. Construct it by writing the session row directly, as the file's other session tests do.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services lib/tutoring`
Expected: FAIL, for the new cases and the changed types.

- [ ] **Step 3: Implement**

Create `lib/services/contentText.ts`:

```ts
import type Database from 'better-sqlite3';
import { localized, pickText, type ContentLanguage } from '../i18n/localizedText';

// Resolves stored English/German titles to one language, for views without a toggle.
export function createContentText(db: Database.Database) {
  const lessonRow = db.prepare('SELECT title, title_de FROM lessons WHERE id = ?');
  const milestoneRow = db.prepare('SELECT title, title_de, description, description_de FROM milestones WHERE id = ?');
  return {
    lessonTitle(id: string, language: ContentLanguage): string {
      const row = lessonRow.get(id) as { title: string; title_de: string } | undefined;
      return row ? pickText(localized(row.title, row.title_de), language) : id;
    },
    milestoneTitle(id: string, language: ContentLanguage): string {
      const row = milestoneRow.get(id) as { title: string; title_de: string } | undefined;
      return row ? pickText(localized(row.title, row.title_de), language) : id;
    },
    milestoneDescription(id: string, language: ContentLanguage): string | null {
      const row = milestoneRow.get(id) as { description: string | null; description_de: string | null } | undefined;
      return row?.description ? pickText(localized(row.description, row.description_de), language) : null;
    },
  };
}
```

`lib/tutoring/exerciseView.ts`:
- Add `import type { LocalizedText } from '../i18n/localizedText';`.
- Add `instruction?: LocalizedText` to the multiple-choice, fill-blank and free-text variants.
- In `toExerciseView`, add `...(content.instruction ? { instruction: content.instruction } : {})` to those three returns.

`lib/tutoring/lessonAnswers.ts`:
- Add:

```ts
// The English task text for AI prompts: the instruction (if any) followed by the stimulus.
export function taskTextOf(exercise: Exercise): string {
  const content = exercise.content as { instruction?: { en: string } };
  const stimulus = taskTextFor(exercise);
  return [content.instruction?.en, stimulus].filter((part) => part && part.trim()).join(' — ');
}
```

- Change `AttemptOutcome.feedback` to `LocalizedText | null`, importing the type.

`lib/tutoring/freeTextGrading.ts`:
- Remove `uiLanguage` from `FreeTextGradingInput`.
- Replace the feedback instruction line and the reply line in `buildFreeTextGradingPrompt` with:

```ts
    'Write the feedback twice: "feedback_en" in English and "feedback_de" in German. Each is one to three short sentences naming the main mistake and its corrected form, if there is one.',
    `Keep the German feedback simple enough for CEFR level ${input.level}.`,
    'Reply with only a JSON object: {"result": "correct" | "almost" | "wrong", "feedback_en": "...", "feedback_de": "..."}',
```

- Remove the `language` constant.
- Change `parseFreeTextGrade` to return `{ result: GradeResult; feedback: LocalizedText } | null`, reading `feedback_en` and `feedback_de`. Both must be strings, or it returns `null`. Trim both.

`lib/services/freeTextGradingService.ts`: the ok branch type becomes `feedback: LocalizedText`.

`lib/services/exerciseGrading.ts`:
- Remove `uiLanguage` from `ExerciseGradingDeps`.
- The ok outcome's feedback becomes `LocalizedText | null`.
- In the free-text branch, call `deps.gradeFreeText({ prompt: taskTextOf(exercise), modelAnswer: content.modelAnswer, studentAnswer: answer.text, level })`.

Then run `npx tsc --noEmit`. At every call site it reports, delete the `uiLanguage: …` argument to `gradeExerciseAnswer` or `gradeFreeText`. These are in `attemptService`, `practiceService` (Phase 2), `testOutService` and `placementService`.

`lib/services/attemptService.ts`: where the attempt is inserted, write `feedback ? storeFeedback(feedback) : null` into `ai_feedback`. The returned outcome's `feedback` is the `LocalizedText`.

`lib/tutoring/placementTypes.ts`:
- `PlacementAnswerRecord.feedback` becomes `LocalizedText | null`.
- The question views gain `instruction?: LocalizedText`.

`lib/services/placementService.ts`:
- `toView` adds `...(question.content.instruction ? { instruction: question.content.instruction } : {})` to each variant.
- The free-text grading call passes `prompt: [question.content.instruction?.en, content.prompt].filter(Boolean).join(' — ')`.
- Records keep `feedback: graded.feedback`.
- Wherever stored session answers are read back (`JSON.parse(... answers)`), map each record's feedback through `readFeedback(record.feedback)`. That keeps legacy string feedback working (Review Focus 5).

`lib/tutoring/lessonChat.ts`:
- remove `uiLanguage` from `LessonChatPromptInput`;
- replace the "Answer in …" line with:

```ts
    "Reply in the language of the learner's latest message (German or English).",
    `Keep German words and example sentences in German, and keep any German you write simple enough for CEFR level ${input.level}.`,
```

`lib/services/lessonChatService.ts`:
- remove `uiLanguage` from the prompt input;
- build `task` with `taskTextOf(exercise)`;
- read the stored feedback with `readFeedback(row.ai_feedback)?.en ?? null` for the prompt context (Review Focus 1).

`lib/tutoring/progressTypes.ts`: the open `LessonView` variant's `title` becomes `LocalizedText`, `explanation` becomes `LocalizedText | null` and `examples` becomes `LocalizedText[] | null`. The other variants are unchanged.

`lib/services/progressService.ts`:
- Create `const text = createContentText(db);`.
- In `getTree`:
  - read `const language = profiles.getProfile().uiLanguage;`;
  - milestone `title` is `text.milestoneTitle(milestone.id, language)` and `description` is `text.milestoneDescription(milestone.id, language)`;
  - lesson `title` is `text.lessonTitle(id, language)`;
  - `earlierPrerequisites` titles are `text.lessonTitle(p.id, language)`.
- In `getLessonView`:
  - the level-locked and lesson-locked variants resolve `title`, `milestone.title` and `missingPrerequisites[].title` with `text` and the profile language;
  - the open variant returns:

```ts
      title: localized(lesson.title, lesson.titleDe),
      explanation: lesson.explanation ? localized(lesson.explanation, lesson.explanationDe) : null,
      examples: lesson.examples ? lesson.examples.map((example, i) => localized(example, lesson.examplesDe?.[i])) : null,
```

  - `prerequisites[].title` resolves to the UI language.
- In `getDailyQueue`: `lessonTitle` and `suggestedLesson.title` use `text.lessonTitle(…, language)`.

`lib/services/testOutService.ts`: `state()`'s `milestone.title` resolves with `createContentText(db).milestoneTitle(id, profiles.getProfile().uiLanguage)`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Client components that read `lesson.title`, `lesson.explanation`, `lesson.examples` or `outcome.feedback` as strings now fail type-checking. Task 4 fixes them; for this task, make them compile with `pickText(value, 'en')` at each reported line, and Task 4 replaces those calls.

- [ ] **Step 5: Commit**

```bash
git add -A lib components
git commit -m "feat: resolve content to the UI language, send both languages for toggles, and grade with bilingual feedback"
```

---

### Task 4: Client — language toggle, lesson page, exercise card, placement test

**Files:**
- Create: `components/LanguageToggle.tsx`, `components/LanguageToggle.test.tsx`
- Modify:
  - `components/tutoring/LessonPage.tsx`, `components/tutoring/LessonPage.test.tsx`
  - `components/tutoring/ExerciseCard.tsx`, `components/tutoring/ExerciseCard.test.tsx`
  - `components/placement/PlacementTest.tsx`, `components/placement/PlacementTest.test.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: the Task 3 views.
- Produces:
  - `LanguageToggle({ value: ContentLanguage; onChange: (l: ContentLanguage) => void; label: string })`: two buttons, "EN" and "DE", with `aria-pressed`, inside `role="group"`.
  - `ExerciseCard` gains `contentLanguage?: ContentLanguage`, defaulting to the UI locale.

- [ ] **Step 1: Catalog text**

`messages/en.json`:
- add a top-level namespace `"languageToggle": { "lesson": "Lesson language", "feedback": "Feedback language", "placement": "Question language" }`;
- change `exercise.feedback` to `"Feedback: {feedback}"` if it differs.

`messages/de.json`: `"languageToggle": { "lesson": "Sprache der Lektion", "feedback": "Sprache des Feedbacks", "placement": "Sprache der Fragen" }`.

- [ ] **Step 2: Write the failing tests**

Create `components/LanguageToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageToggle } from './LanguageToggle';

describe('LanguageToggle', () => {
  it('marks the current language and reports a switch', () => {
    const onChange = vi.fn();
    render(<LanguageToggle value="en" onChange={onChange} label="Lesson language" />);
    expect(screen.getByRole('group', { name: 'Lesson language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(onChange).toHaveBeenCalledWith('de');
  });
});
```

In `components/tutoring/LessonPage.test.tsx`:
- change the `LESSON` fixture's `title`, `explanation` and `examples` to `LocalizedText` values: `title: { en: 'Saying hello', de: 'Begrüßen' }`, `explanation: { en: 'Say Hallo to greet someone.', de: 'Sag Hallo zur Begrüßung.' }`, `examples: [{ en: 'Hallo!', de: 'Hallo!' }]`;
- give the first exercise `instruction: { en: 'Pick the greeting.', de: 'Wähle die Begrüßung.' }`;
- add:

```tsx
  it('switches the lesson between English and German, starting in the UI language', async () => {
    stubFetch({ 'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON) });
    renderWithIntl(<LessonPage lessonId="a1-greet" />);
    expect(await screen.findByRole('heading', { name: 'Saying hello' })).toBeInTheDocument();
    expect(screen.getByText('Say Hallo to greet someone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByRole('heading', { name: 'Begrüßen' })).toBeInTheDocument();
    expect(screen.getByText('Sag Hallo zur Begrüßung.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the exercises' }));
    expect(screen.getByText('Wähle die Begrüßung.')).toBeInTheDocument();
  });

  // Review Focus 2: the same component instance moving to another lesson starts in the UI language again.
  it('resets the toggle when another lesson opens', async () => {
    stubFetch({
      'GET /api/tutoring/lessons/a1-greet': () => delayedResponse(LESSON),
      'GET /api/tutoring/lessons/a1-bye': () => delayedResponse({ ...LESSON, id: 'a1-bye', title: { en: 'Saying goodbye', de: 'Verabschieden' } }),
    });
    const { rerender } = renderWithIntl(<LessonPage lessonId="a1-greet" />);
    fireEvent.click(await screen.findByRole('button', { name: 'DE' }));
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LessonPage lessonId="a1-bye" />
      </NextIntlClientProvider>
    );
    expect(await screen.findByRole('heading', { name: 'Saying goodbye' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  });
```

(Add `import { NextIntlClientProvider } from 'next-intl';` and `import en from '@/messages/en.json';` to that file if missing.)

In `components/tutoring/ExerciseCard.test.tsx`:
- give `MC` the instruction `{ en: 'Pick the greeting.', de: 'Wähle die Begrüßung.' }`;
- free-text outcome stubs return `feedback: { en: 'Watch the umlaut.', de: 'Achte auf den Umlaut.' }`, and existing feedback expectations use the English text;
- add:

```tsx
  it('shows the instruction in the content language, and feedback with its own toggle', async () => {
    stubAttempts(() => delayedResponse(outcome({ result: 'almost', correctAnswer: 'Ich bin müde.', feedback: { en: 'Watch the umlaut.', de: 'Achte auf den Umlaut.' } })));
    renderWithIntl(<ExerciseCard exercise={{ ...FREE, instruction: { en: 'Say you are tired.', de: 'Sag, dass du müde bist.' } }} source="lesson" contentLanguage="de" onAnswered={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Sag, dass du müde bist.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Ich bin mude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Feedback: Watch the umlaut.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Feedback: Achte auf den Umlaut.')).toBeInTheDocument();
  });
```

In `components/placement/PlacementTest.test.tsx`, give one question stub `instruction: { en: 'Choose the greeting.', de: 'Wähle die Begrüßung.' }` and add:

```tsx
  it('shows question instructions with a language toggle', async () => {
    stubFetch({
      '/api/placement/start': () =>
        delayedResponse({
          status: 'in_progress',
          question: { ...MC_QUESTION, instruction: { en: 'Choose the right verb form.', de: 'Wähle die richtige Verbform.' } },
        }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    expect(await screen.findByText('Choose the right verb form.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(screen.getByText('Wähle die richtige Verbform.')).toBeInTheDocument();
  });
```

(Use the start button label the file's existing "starts the test" case clicks, if it differs from `'Start the test'`.)

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components`
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `components/LanguageToggle.tsx`:

```tsx
'use client';

import type { ContentLanguage } from '@/lib/i18n/localizedText';

// Spec: the en ↔ de switch for content (lesson, feedback, placement questions).
export function LanguageToggle({
  value,
  onChange,
  label,
}: {
  value: ContentLanguage;
  onChange: (language: ContentLanguage) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label}>
      {(['en', 'de'] as const).map((language) => (
        <button key={language} type="button" aria-pressed={value === language} onClick={() => onChange(language)}>
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

`components/tutoring/LessonPage.tsx`:
- import `useLocale` from `next-intl`, `LanguageToggle`, and `pickText`/`ContentLanguage`;
- add the state and the reset:

```tsx
  const locale = useLocale() as ContentLanguage;
  const tToggle = useTranslations('languageToggle');
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  // Spec: the toggle starts in the UI language every time a lesson opens (Review Focus 2).
  useEffect(() => setLanguage(locale), [lessonId, locale]);
```

- render `<LanguageToggle value={language} onChange={setLanguage} label={tToggle('lesson')} />` next to the open lesson's `<h1>`;
- the heading shows `pickText(lesson.title, language)`, the explanation `pickText(lesson.explanation, language)` and each example `pickText(example, language)`;
- pass `contentLanguage={language}` to every `ExerciseCard` rendered by the page, including Phase 2's `PracticeRun`, which forwards it;
- replace the `pickText(…, 'en')` stop-gaps from Task 3.

`components/tutoring/ExerciseCard.tsx`:
- accept `contentLanguage`, defaulting to `useLocale() as ContentLanguage`;
- render the instruction line first, in both the question and answered states:

```tsx
  const instruction = 'instruction' in exercise && exercise.instruction ? pickText(exercise.instruction, contentLanguage) : null;
```

  render `{instruction && <p>{instruction}</p>}` before `taskText(...)`. Skip the task-text paragraph when `taskText(exercise)` is empty.
- the `Shown.feedback` type becomes `LocalizedText | null`;
- add `const [feedbackLanguage, setFeedbackLanguage] = useState<ContentLanguage>(locale);`;
- render feedback as:

```tsx
        {shown.feedback && (
          <div>
            <p>{t('feedback', { feedback: pickText(shown.feedback, feedbackLanguage) })}</p>
            <LanguageToggle value={feedbackLanguage} onChange={setFeedbackLanguage} label={tToggle('feedback')} />
          </div>
        )}
```

`components/placement/PlacementTest.tsx`:
- add `const [language, setLanguage] = useState<ContentLanguage>(useLocale() as ContentLanguage);`;
- render the `LanguageToggle` (label `tToggle('placement')`) in the question phase;
- show `{question.instruction && <p>{pickText(question.instruction, language)}</p>}` above the question text;
- in the results list, render record feedback with `pickText(a.feedback, language)`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A components messages
git commit -m "feat: add the en/de toggle to lessons, feedback, and the placement test"
```

---

### Task 5: Admin — bilingual editors and save validation

**Files:**
- Modify:
  - `lib/services/lessonAdminService.ts`, `lib/services/lessonAdminService.test.ts`
  - `lib/services/curriculumStructureService.ts`, `lib/services/curriculumStructureService.test.ts`
  - `lib/curriculum-admin/placementResolver.ts`, `lib/curriculum-admin/placementResolver.test.ts`
  - `app/api/admin/curriculum/milestones/route.ts`, `app/api/admin/curriculum/milestones/[id]/route.ts`
  - `components/admin/LessonEditorForm.tsx`, `components/admin/LessonEditorForm.test.tsx`
  - `components/admin/ExerciseEditor.tsx`, `components/admin/ExerciseEditor.test.tsx`
  - `components/admin/TrackLevelStructure.tsx`, `components/admin/TrackLevelStructure.test.tsx`
  - `components/admin/PlacementPicker.tsx`, `components/admin/PlacementPicker.test.tsx`
  - the lesson edit page that builds `LessonEditorInitialValues` (`app/admin/curriculum/lesson/[id]/edit/page.tsx`)

**Interfaces:**
- Consumes: `lessonTextProblems`, `milestoneTextProblems`, `instructionProblems` (Task 1).
- Produces:
  - `CreateLessonInput` and `UpdateLessonInput` gain `titleDe: string; explanationDe: string | null; examplesDe: string[] | null`.
  - `createMilestone(track, level, texts: { title; titleDe; description; descriptionDe }, difficultyRank)`.
  - `updateMilestone(id, { title, titleDe, description, descriptionDe, difficultyRank })`.
  - `PlacementInput`'s new-milestone form becomes `{ newMilestoneTitle: string; newMilestoneTitleDe: string; newMilestoneRank: number }`.
  - The milestone routes take `titleDe` and `descriptionDe`.

- [ ] **Step 1: Write the failing tests**

In `lib/services/lessonAdminService.test.ts`:
- every `createLesson` or `updateLesson` input gets `titleDe: '<title> (de)', explanationDe: <explanation copy or null>, examplesDe: <examples copy or null>`;
- add:

```ts
  it('refuses a save without German texts or with a half-filled instruction, listing the problems', () => {
    const db = createDbClient(':memory:');
    db.exec("INSERT INTO milestones (id, track, level, title, difficulty_rank) VALUES ('m1', 'generic', 'A1', 'M1', 1)");
    const base = {
      slug: 'x',
      track: 'generic' as const,
      sourceLevel: 'A1' as const,
      skill: 'grammar' as const,
      title: 'X',
      explanation: 'E',
      examples: null,
      prerequisiteIds: [],
      placement: { milestoneId: 'm1' },
    };
    expect(() =>
      createLessonAdminService(db).createLesson({ ...base, titleDe: '', explanationDe: null, examplesDe: null, exercises: [] })
    ).toThrow('German title is required; The explanation needs both English and German');
    expect(() =>
      createLessonAdminService(db).createLesson({
        ...base,
        titleDe: 'X',
        explanationDe: 'D',
        examplesDe: null,
        exercises: [{ type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: '' } } }],
      })
    ).toThrow('Exercise 1: instruction needs both English and German');
  });
```

In `lib/services/curriculumStructureService.test.ts`, update the create/update calls to the object form, with `titleDe`. Add:

```ts
  it('requires a German milestone title', () => {
    const service = createCurriculumStructureService(createDbClient(':memory:'));
    expect(() => service.createMilestone('generic', 'A1', { title: 'A', titleDe: '', description: null, descriptionDe: null }, 1)).toThrow(
      'German title is required'
    );
  });
```

In `lib/curriculum-admin/placementResolver.test.ts`, the new-milestone inputs become `{ newMilestoneTitle: 'Later', newMilestoneTitleDe: 'Später', newMilestoneRank: 3 }`, and the created row asserts `title_de: 'Später'`.

In `components/admin/ExerciseEditor.test.tsx`, add:

```tsx
  it('edits an instruction in both languages, and drops it when both fields are emptied', () => {
    const onChange = vi.fn();
    const exercise = { type: 'fill_blank' as const, content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: 'Ergänze.' } } };
    render(<ExerciseEditor exercises={[exercise]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (German)'), { target: { value: 'Fülle aus.' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'fill_blank', content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: 'Fülle aus.' } } },
    ]);
  });

  // Review Focus 4: clearing both fields removes the key entirely.
  it('removes the instruction key when both languages are empty', () => {
    const onChange = vi.fn();
    const exercise = { type: 'fill_blank' as const, content: { textWithBlank: 'Ich ___.', correctAnswer: 'bin', instruction: { en: 'Fill in.', de: '' } } };
    render(<ExerciseEditor exercises={[exercise]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Exercise 1 instruction (English)'), { target: { value: '' } });
    expect(onChange.mock.lastCall![0][0].content).not.toHaveProperty('instruction');
  });
```

In `components/admin/LessonEditorForm.test.tsx`:
- replace lookups by placeholder `'Title'` with `getByLabelText('Title (English)')`, and add `fireEvent.change(getByLabelText('Title (German)'), …)` wherever a test saves;
- do the same for `'Explanation'`, which becomes `'Explanation (English)'` / `'Explanation (German)'`, and for `'Example N'`, which becomes `'Example N (English)'` / `'Example N (German)'`;
- expected request bodies gain `titleDe`, `explanationDe` and `examplesDe`.

In `components/admin/TrackLevelStructure.test.tsx`, the create test also fills `New milestone German title`, and the expected POST body gains `titleDe: 'Vergangenheit'` and `descriptionDe: null`. Adjust the PATCH expectation to include `titleDe` and `descriptionDe` from the entry.

In `components/admin/PlacementPicker.test.tsx`, the new-milestone case also fills `New milestone German title`, and expects `{ newMilestoneTitle: 'Later', newMilestoneTitleDe: 'Später', newMilestoneRank: 3 }`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services lib/curriculum-admin components/admin`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/services/lessonAdminService.ts`:
- Add the three German fields to both input interfaces.
- Add a helper, and call it first thing inside both transactions, before `assertFlashcardRule`:

```ts
function assertLessonTexts(input: {
  title: string;
  titleDe: string;
  explanation: string | null;
  explanationDe: string | null;
  examples: string[] | null;
  examplesDe: string[] | null;
  exercises: { type: ExerciseType; content: unknown }[];
}): void {
  const problems = [
    ...lessonTextProblems(input),
    ...input.exercises.flatMap((e, i) => instructionProblems(e.type, e.content).map((p) => `Exercise ${i + 1}: ${p}`)),
  ];
  if (problems.length > 0) throw new Error(problems.join('; '));
}
```

- The INSERT and UPDATE statements add the columns `title_de`, `explanation_de` and `examples_de`, with the values `input.titleDe`, `input.explanationDe`, and `input.examplesDe ? JSON.stringify(input.examplesDe) : null`.

`lib/services/curriculumStructureService.ts`:
- `createMilestone(track, level, texts: { title: string; titleDe: string; description: string | null; descriptionDe: string | null }, difficultyRank: unknown)`: after the rank check, throw `new Error(milestoneTextProblems(texts).join('; '))` when there are problems. The INSERT includes `title_de` and `description_de`.
- `updateMilestone(id, input)`: the input gains `titleDe` and `descriptionDe`, with the same check. The UPDATE sets both.

`lib/curriculum-admin/placementResolver.ts`: the new-milestone input gains `newMilestoneTitleDe`. It must be non-empty (`'A new milestone needs a German title'`), and the INSERT adds `title_de`.

Milestone routes: POST reads `{ track, level, title, titleDe, description, descriptionDe, difficultyRank }` and calls `createMilestone(track, level, { title, titleDe, description, descriptionDe }, difficultyRank)`. PATCH passes the same fields to `updateMilestone`.

`components/admin/ExerciseEditor.tsx`: in `ExerciseContentFields`, for non-flashcard types, render after the type-specific fields:

```tsx
      {type !== 'flashcard' && (
        <InstructionFields
          value={(content as { instruction?: { en: string; de: string } }).instruction}
          index={index}
          onChange={(instruction) => {
            const { instruction: _old, ...rest } = content as Record<string, unknown>;
            onChange((instruction ? { ...rest, instruction } : rest) as ExerciseContent);
          }}
        />
      )}
```

with:

```tsx
function InstructionFields({
  value,
  index,
  onChange,
}: {
  value: { en: string; de: string } | undefined;
  index: number;
  onChange: (instruction: { en: string; de: string } | undefined) => void;
}) {
  const current = value ?? { en: '', de: '' };
  // Spec: both empty means no instruction; the key is removed, never stored empty (Review Focus 4).
  const emit = (next: { en: string; de: string }) => onChange(next.en === '' && next.de === '' ? undefined : next);
  return (
    <div>
      <input
        aria-label={`Exercise ${index + 1} instruction (English)`}
        placeholder="Instruction (English)"
        value={current.en}
        onChange={(e) => emit({ ...current, en: e.target.value })}
      />
      <input
        aria-label={`Exercise ${index + 1} instruction (German)`}
        placeholder="Instruction (German)"
        value={current.de}
        onChange={(e) => emit({ ...current, de: e.target.value })}
      />
    </div>
  );
}
```

`ExerciseContentFields` is the switch that Phase 2 exported. Wrap its return in a fragment that holds the type-specific fields and then the instruction fields.

`components/admin/LessonEditorForm.tsx`:
- add state `titleDe`, `explanationDe` and `examples` as an array of `{ en: string; de: string }`, initialised from `initial.examples` and `initial.examplesDe`;
- `LessonEditorInitialValues` gains `titleDe: string; explanationDe: string | null; examplesDe: string[] | null`, and the edit page passes them from the lesson;
- inputs are labelled `Title (English)`, `Title (German)`, `Explanation (English)`, `Explanation (German)`, and per example `Example N (English)` and `Example N (German)`;
- the request body sends `title`, `titleDe`, `explanation: explanation || null`, `explanationDe: explanationDe || null`, `examples: rows.length ? rows.map((r) => r.en) : null` and `examplesDe: rows.length ? rows.map((r) => r.de) : null`.

`components/admin/TrackLevelStructure.tsx`:
- the new-milestone row adds an input `aria-label="New milestone German title"`;
- POST sends `titleDe` and `descriptionDe: null`;
- `saveMilestone` includes `titleDe` and `descriptionDe` from the entry (add them to `StructureEntry.milestone`);
- "Rename milestone" asks for the English title and then the German title with two `window.prompt` calls, and saves both.

`components/admin/PlacementPicker.tsx`: the new-milestone form adds `aria-label="New milestone German title"`. It emits `{ newMilestoneTitle, newMilestoneTitleDe, newMilestoneRank }` only when both titles are filled and the rank is valid.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib app components
git commit -m "feat: edit lessons, milestones, and instructions in both languages"
```

---

### Task 6: Content — the German draft for all seeds and the placement exam

A content task. The implementer writes the German, and a validation test pins the mechanics. The user spot-checks the wording (spec: "spot-check only").

**Files:**
- Create: `lib/services/bundledSeedLanguages.test.ts`
- Modify: `data/curriculum-seed/*.json` (all 15), `data/placement-exam.json`, `lib/services/bundledSeedStructure.test.ts`
- Delete: `scripts/convert-seeds-v3.ts`

- [ ] **Step 1: Write the validation test**

Create `lib/services/bundledSeedLanguages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from './curriculumSeedLoader';
import { validatePlacementExam } from '../tutoring/placementExamFormat';

const DIR = join(process.cwd(), 'data', 'curriculum-seed');
const seeds = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as SeedFile] as const);

// Quoted German inside an English example ('…' or „…“) must reappear unchanged in its German version.
function quotedSegments(text: string): string[] {
  return [...text.matchAll(/'([^']{4,})'|„([^“]{4,})“/g)].map((m) => m[1] ?? m[2]);
}

describe('bundled German content', () => {
  it.each(seeds)('%s: is seed version 6', (_f, seed) => {
    expect(seed.seedVersion).toBe('6');
  });

  it.each(seeds)('%s: has real German titles, descriptions and explanations (not English copies)', (_f, seed) => {
    for (const { milestone } of seed.milestones) expect(milestone.titleDe).not.toBe(milestone.title);
    const translatedTitles = seed.lessons.filter((l) => l.titleDe !== l.title).length;
    // Some titles are the same in both languages ("Perfekt"); nearly all are not.
    expect(translatedTitles / seed.lessons.length).toBeGreaterThanOrEqual(0.9);
    for (const lesson of seed.lessons) {
      if (lesson.explanation) expect(lesson.explanationDe).not.toBe(lesson.explanation);
    }
  });

  it.each(seeds)('%s: keeps quoted German passages unchanged in German examples', (_f, seed) => {
    for (const lesson of seed.lessons) {
      (lesson.examples ?? []).forEach((example, i) => {
        for (const segment of quotedSegments(example)) expect(lesson.examplesDe![i]).toContain(segment);
      });
    }
  });

  it('keeps the placement exam valid, with instructions where it had English task text', () => {
    const exam = JSON.parse(readFileSync(join(process.cwd(), 'data', 'placement-exam.json'), 'utf8'));
    expect(validatePlacementExam(exam)).toMatchObject({ ok: true });
  });
});
```

In `lib/services/bundledSeedStructure.test.ts`, change the expected `seedVersion` to `'6'`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/services/bundledSeedLanguages.test.ts`
Expected: FAIL. The German fields are English copies, at version 5.

- [ ] **Step 3: Draft the German, one file at a time**

For each seed file, working track by track (Generic, then Goethe, then telc), set `"seedVersion": "6"` and:

1. **Milestones:** write `titleDe` (natural German, 2–5 words) and `descriptionDe` (one sentence).
2. **Lesson titles:** write `titleDe` in natural German. Exam-part names stay as they are officially called, e.g. "Leseverstehen Teil 1", "Schreiben Aufgabe 1".
3. **Explanations:** write `explanationDe` **simplified to the lesson's `sourceLevel`**:
   - A1: short main clauses, present tense, the 1,000 most common words, and grammar terms explained with an example.
   - A2: short sentences, simple *weil/dass* clauses, the Perfekt.
   - B1: clear, natural sentences.
   - B2 and C1: natural German.
   Keep every German example sentence inside the explanation exactly as it is.
4. **Examples:** write `examplesDe`, the same length as `examples`. German passages stay character-for-character identical; translate only the English framing (e.g. "Text:", "Aufgabe 1:", "→ Richtig" notes and English glosses). An example that is entirely German is copied unchanged.
5. **Exercises:** find English task text and move it into `instruction`.
   - A `question` or `prompt` that is entirely an English instruction (e.g. "Explain how contrasting words like 'doch' … help you …") becomes `instruction: { en: <that text>, de: <German> }`, and the field becomes `""`.
   - Mixed text, English framing plus German, is split: the English framing goes into `instruction` (with a German translation), and the German stays in the field.
   - Pure German stays as it is, without an instruction.
   - Never add an instruction to a flashcard.
   - Leave fill-blank parenthesised hints (e.g. `(number: zwei)`) as authored.
6. **Checking:** after each file, run `npx vitest run lib/services/bundledSeedLanguages.test.ts lib/services/bundledSeedStructure.test.ts -t "<file name>"`.

Then, in `data/placement-exam.json`, apply rule 5 to all questions. Its German instructions are simplified to each question's level.

- [ ] **Step 4: Run everything**

Run: `git rm scripts/convert-seeds-v3.ts && npx tsc --noEmit && npm test && npm run build`
Expected: PASS.

Then with a fresh data dir (`GAIT_DATA_DIR=$(mktemp -d) npm run dev`), open a lesson, toggle DE, and read the explanation and an instruction in German.

- [ ] **Step 5: Commit, one commit per track, then the placement exam**

```bash
git add lib/services/bundledSeedLanguages.test.ts lib/services/bundledSeedStructure.test.ts
git add data/curriculum-seed/generic-*.json && git commit -m "content: German texts and instructions for the Generic track"
git add data/curriculum-seed/goethe-*.json && git commit -m "content: German texts and instructions for the Goethe track"
git add data/curriculum-seed/telc-*.json && git commit -m "content: German texts and instructions for the telc track"
git add data/placement-exam.json && git commit -m "content: bilingual instructions for the placement exam"
```

The suite is green once all four commits land. Run `npm test` after the last one.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Data model: Task 2.
  - Domain types: Tasks 1–3.
  - Views and pages: Tasks 3 and 4.
  - Grading and chat: Task 3.
  - Seed v3: Task 2.
  - Admin: Task 5.
  - Content: Task 6.
  - The practice pool's German-only rule is in Phase 2's plan (amended in commit e329775).
- **Placeholders:** none. Every test step gives its code.
