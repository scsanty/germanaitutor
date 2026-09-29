# Bilingual Content — Design Spec

## Overview

Learning content is authored in English today:
- lesson titles and explanations;
- the notes around examples;
- English task instructions inside exercises;
- milestone titles once the restructure lands.

This sub-project makes **every text around the German being learned** available in English and German. **The tested German itself is never translated**: German stimulus text, answer options, gap sentences, correct answers and model answers stay exactly as authored.

It is built right after the Curriculum Restructure (seed format v2, difficulty milestones) and before the design pass. Tutoring Phase 2 is already merged.

### What the student gets

| Where | Language shown | Toggle |
|---|---|---|
| Tree: milestone titles, descriptions, lesson titles | UI language | none |
| Lesson page: title, explanation, examples, exercise instructions | UI language by default | **en ↔ de toggle in the lesson header, reset on every lesson** |
| Daily Queue and test-out: instructions and lesson titles | UI language | none |
| Placement test: question instructions | UI language by default | **en ↔ de toggle on the placement page** |
| Free-text grading feedback | UI language by default | **en ↔ de toggle on each feedback message** |
| Lesson chat replies | the language the student wrote the message in | none |

German versions of **explanations and feedback are simplified to the lesson's CEFR level**:
- **A1:** short main clauses, present tense, the most common words.
- **A2:** simple subordinate clauses and the Perfekt.
- **B1 and above:** clear but natural German.

### In scope

- Schema and domain: `LocalizedText { en, de }` for milestone titles and descriptions, lesson titles, explanations and examples; an optional `instruction` on exercise and placement-question content; feedback stored in both languages.
- Views: server resolution to the UI language (tree, queue, locked views, test-out), and the lesson and placement toggles.
- Free-text grading returns feedback in both languages, with the German version at the lesson's level. The chat replies in the language of the student's message.
- Seed format v3 (with German fields), plus loader validation and export.
- Admin: both languages side by side in the lesson, milestone and exercise editors, and in placement exam upload and download. Saving requires both languages.
- **Content task:** Claude drafts German for all 15 seed files and the placement exam, and extracts instructions from mixed fields. The user spot-checks only, so there's no review screen.

### Out of scope

- **Practice pool and level exams** (Phase 2, Level exams) are **German only**, CEFR-style, with words chosen for the level. They get no instruction translations.
  - Phase 2's plan is amended separately: its generation prompt requires German-only, level-appropriate instructions.
  - Level exams and Freestyle Teil practice follow the real exam format, which is German.
- Translating the tested German.
- `lesson_track_overrides`: the table exists but no code or seed uses it, so it's unchanged.
- Admin pages stay English. Only the content they edit is bilingual.

## Data Model

```sql
ALTER TABLE milestones ADD COLUMN title_de TEXT NOT NULL DEFAULT '';
ALTER TABLE milestones ADD COLUMN description_de TEXT;
ALTER TABLE lessons ADD COLUMN title_de TEXT NOT NULL DEFAULT '';
ALTER TABLE lessons ADD COLUMN explanation_de TEXT;
ALTER TABLE lessons ADD COLUMN examples_de TEXT;   -- JSON array, same length as `examples`
```

The existing `title`, `description`, `explanation` and `examples` columns are the English versions. Until a German value exists (the moment after the migration, before the new seed loads), a German display **falls back to English**. `pickText` does this, so nothing breaks mid-migration.

**Exercise and placement-question content** gain an optional field:

```ts
instruction?: { en: string; de: string }
```

- **Instruction:** the task the student is given, e.g. "Draft an invitation sentence to your friend…" / "Schreib einen Satz, mit dem du deinen Freund einlädst…".
- **Stimulus fields** (`question`, `prompt`, `textWithBlank`, flashcard `front`/`back`, `options`, answers): the German being practised, unchanged.
- `question` (multiple choice) and `prompt` (free text) may be empty only when `instruction` is present.
- A flashcard never has an instruction.

**Feedback:** `lesson_attempts.ai_feedback` holds JSON `{"en": "...", "de": "..."}` for new rows. A legacy plain-text value is read as `{ en: text, de: text }`.

## Domain Types

```ts
// lib/i18n/localizedText.ts
export interface LocalizedText { en: string; de: string }
export type ContentLanguage = 'en' | 'de';
export function pickText(text: LocalizedText, language: ContentLanguage): string; // de falls back to en when empty
export function localized(en: string, de: string | null | undefined): LocalizedText;
```

- `Lesson` gains `titleDe`, `explanationDe` and `examplesDe`.
- `Milestone` gains `titleDe` and `descriptionDe`.
- The content types gain `instruction?: LocalizedText`.
- `ExerciseView` and the placement question view carry `instruction?: LocalizedText`. The client picks the language.

## Views and Pages

- **Tree** (`GET /api/tutoring/tree`): milestone `title` and `description`, and lesson `title`, are resolved to the profile's UI language on the server.
- **Lesson** (`GET /api/tutoring/lessons/[id]`):
  - The open view carries `title: LocalizedText`, `explanation: LocalizedText | null` and `examples: LocalizedText[] | null`, and every exercise view carries its `instruction`.
  - The locked views (level and lesson) resolve titles to the UI language.
  - **Lesson page:** a two-state toggle "EN | DE" in the header. It starts in the UI language each time a lesson opens, and switches the title, explanation, examples and every exercise's instruction line. The chat panel and "Get more exercises" aren't affected.
- **Exercise card:** it shows the `instruction` line, in the language passed down from the page, above the stimulus. Feedback (`{ en, de }`) gets its own small "EN | DE" toggle, starting in the UI language.
- **Daily Queue and test-out:** lesson titles and instructions are shown in the UI language, with no toggle.
- **Placement test:** a toggle on the page, starting in the UI language. It switches each question's instruction.
- **Lesson chat:** the system prompt tells the AI to reply in the language of the student's latest message (German or English), keep German examples in German, and simplify German to the lesson's level. The UI-language line in the prompt is removed.
- **Free-text grading:** the prompt asks for `{"result", "feedback_en", "feedback_de"}`, with `feedback_de` simplified to the lesson's level. The parser requires both. A reply missing one counts as `ai_bad_reply`, as a malformed reply does today. The placement test ignores feedback, as today.

## Seed Format v3

It is v2 plus the German fields:
- milestone: `titleDe` (required, non-empty), `descriptionDe` (`string | null`, set whenever `description` is);
- lesson: `titleDe` (required, non-empty), `explanationDe` (set whenever `explanation` is), `examplesDe` (same length as `examples`);
- exercise content: `instruction` (optional, both languages non-empty).

The loader accepts only `formatVersion: 3`, and **validates every file before writing anything**. A missing German title, a mismatched `examplesDe` length, or a half-filled `instruction` rejects the file, with a message naming the file and the lesson or milestone id.

Export writes v3. The placement exam file format adds the same optional `instruction` to each question, validated the same way.

## Admin

- **Lesson editor:** paired fields "Title (English)" / "Title (German)", and the same for explanation. Examples are rows of English and German versions. Each exercise gets an "Instruction (English)" / "Instruction (German)" pair; both empty means no instruction.
- **Validation on save**, with an error listing what's missing:
  - a German title is required;
  - if either explanation is filled, the other must be too;
  - every example needs both versions;
  - an instruction needs both languages or neither.
- **Milestone editor** (structure page and the placement picker's "new milestone"): title and description in both languages. The German title is required.
- **Placement exam:** download and upload include `instruction`, and upload validation applies the rule above.

## Content: the Translation Draft

A plan task (content, not code) that works track by track:

1. **Milestones:** `titleDe` and `descriptionDe` for every milestone.
2. **Lessons:**
   - `titleDe` for every lesson.
   - `explanationDe` for every explanation, **simplified to the lesson's `sourceLevel`**.
   - `examplesDe` for every example. The German passages stay character-for-character identical; only English notes and glosses are translated. For example, `"Text: '…' - Aufgabe 1: Thomas sagt das Treffen ab (Richtig)"` keeps its German and renders its English framing in German.
3. **Exercises:** find English instruction text inside `question` / `prompt` / `textWithBlank` and move it into `instruction` with a German translation.
   - **Pure instruction:** a question or prompt that is only an English instruction (e.g. "Explain how contrasting words like 'doch' … help you …") becomes `instruction` with an empty stimulus field.
   - **Mixed:** English framing plus German text is split. The English framing goes to `instruction`; the German stays in the stimulus field.
   - **Pure German:** stays as it is, with no instruction.
   - Fill-blank hints in parentheses, like `(number: zwei)`, are left alone, because they're part of the gap sentence as authored.
4. **Placement exam** (`data/placement-exam.json`, 40 questions): the same instruction extraction.
5. **Seed version** bumps to `5`, with `formatVersion: 3`.

A validation test over the bundled seeds pins the mechanics:
- every German field is present and non-empty;
- `examplesDe` lengths match;
- every German passage is preserved: each quoted German segment in an English example appears unchanged in its German version;
- no exercise stimulus is empty without an instruction.

The user spot-checks the wording.

## Error Handling

- Every German field falls back to English when empty, so partial data never shows a blank.
- The toggle is purely client-side and needs no fetch.
- A grading reply that lacks either feedback language is `ai_bad_reply` (502), as before.

## Testing

- **Pure:** `pickText` fallback; the legacy feedback parse; `parseFreeTextGrade` requires both languages; the seed v3 validators (each rule, with file and id in the message); instruction validation for admin and placement upload.
- **Migration:** the columns are added, and existing rows get `''`/NULL German and display in English.
- **Services:**
  - the tree resolves to the UI language (switch the profile's UI language and the titles change);
  - the lesson view carries both languages;
  - the queue resolves;
  - `recordAttempt` stores bilingual feedback and returns it;
  - the chat prompt contains the reply-in-your-language rule and no UI-language rule.
- **Client:**
  - the lesson toggle switches title, explanation, examples and instructions, and starts over in the UI language on the next lesson;
  - the feedback toggle switches only the feedback;
  - the placement toggle switches instructions;
  - admin editors block a save without a German title, and show the error.
- **Bundled content:** the validation test above.

## Decisions (2026-09-29)

- The following are bilingual:
  - milestone titles and descriptions;
  - lesson titles;
  - explanations;
  - example notes;
  - exercise and placement instructions;
  - grading feedback.
- Never translated: the tested German.
- The lesson toggle starts in the UI language and resets on every lesson. The feedback and placement toggles start in the UI language.
- German explanations and feedback are simplified to the lesson's level.
- Claude drafts every translation, and the user spot-checks only.
- Admin edits require both languages.
- The lesson chat replies in the language of the student's message.
- The practice pool and level exams are German only.
