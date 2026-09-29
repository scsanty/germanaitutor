# Writing Module — Design Spec

## Overview

Writing adds real, graded writing. It brings:
- a **letter task** type for lessons and for the writing parts of all 15 exam formats;
- **AI grading against each format's rubric**, kept consistent with **anchor letters** in the prompt;
- rich feedback: **inline marked-up errors** coloured by type, **A–D criterion cards** with points, and a **fully corrected version**.

It introduces two cross-module features. The **error log** tags every correction, from any source, with a fixed category and surfaces the student's top recurring mistakes on the Dashboard. **Typing helpers** add umlaut buttons to every German input app-wide, a live word counter, and spellcheck off in timed Teile.

### In scope

- **Rubrics as data:** every format's writing parts gain a `rubric` (criteria, grade → points, descriptors) and a `wordTarget`. A generic lesson rubric covers lesson letter tasks.
- **Letter task type:** content, view, answer and AI grading, returning marks, criterion grades, points, the corrected text and a summary. The lesson pass rule is ≥ 60% correct, 40–59% almost.
- **Anchors:** 4 rated reference letters per format writing part (one per grade band A–D). Each grading call includes 2–3 of them.
- **Teil runner for writing:** choose a task (A/B where the format offers a choice), always timed with overtime marked, a word counter, spellcheck off, and submit. The result is final, with **Copy into free writing**.
- **Lessons and Freestyle:** revise and regrade (a new attempt per submission, with versions side by side). Freestyle free writing upgrades to the marked-up feedback.
- **Error log:**
  - a fixed German-grammar **taxonomy** (~30 categories);
  - the sources are letter grading, free-text lesson grading, Freestyle conversation corrections and Freestyle writing corrections (Speaking adds spoken corrections);
  - the Dashboard shows the **top 5** categories of the last 30 days, each linking to a matching grammar lesson in the active track+level, or to a Freestyle grammar drill on that topic.
- **Typing helpers:**
  - `GermanTextInput` and `GermanTextarea`, with a toggleable row `ä ö ü ß Ä Ö Ü` that inserts at the cursor, used for every German input;
  - `WordCounter` with the target range;
  - `spellCheck={false}` in timed Teile only.
- **Content:**
  - rubrics and word targets for all 15 formats' writing parts;
  - anchors;
  - **3 exam sets per writing part for all 15 formats** (each set is the part's task, or its choice of 2 tasks);
  - one letter-task exercise added to each writing lesson.

### Out of scope

- Handwriting upload (typed only, by decision).
- Speaking's error-log source (Speaking wires it in).

## Rubrics (format data)

Writing parts in `data/exam-formats/*.json` gain:

```ts
interface WritingRubric {
  criteria: { id: string; name: LocalizedText; descriptors: Record<'A' | 'B' | 'C' | 'D' | 'E', string>; points: Record<'A' | 'B' | 'C' | 'D' | 'E', number> }[];
  // grades a format doesn't use are omitted from descriptors/points
}
// ExamPart (writing): { …, taskType: 'letter', rubric: WritingRubric, wordTarget: { min: number; max: number }, choices: 1 | 2 }
```

- **telc B1:** Aufgabenbewältigung, Kommunikative Gestaltung and Formale Richtigkeit, each A–D worth 15 / 10 / 5 / 0 points (45 in total), with ~150 words.
- **Other formats:** each gets its own official criteria and points from its Modellsatz (e.g. Goethe B1: Erfüllung, Kohärenz, Wortschatz, Strukturen).
- **The NaDoch format:** it uses the telc-style 3 criteria.

`LESSON_LETTER_RUBRIC` (in code) has the same 3 criteria at A–D: 5 / 3 / 1 / 0 points.

## Letter Task Type

```ts
interface LetterTask {
  situation: string;            // German task text
  leitpunkte: string[];         // 3–4 German guiding points
  register: 'informal' | 'semi_formal' | 'formal';
  wordTarget: { min: number; max: number };
}
interface LetterContent { instruction?: LocalizedText; tasks: LetterTask[] }  // 1 task, or 2 to choose from
// Answer: { type: 'letter'; taskIndex: number; text: string }
```

The view is the content itself: nothing is secret.

**Grading** is one AI call built by `buildLetterGradingPrompt({ level, formatName?, rubric, task, anchors, text })`. It returns JSON:

```ts
{
  marks: { original: string; correction: string; type: 'grammar' | 'vocabulary' | 'spelling' | 'register';
           category: string /* taxonomy id */; reason_en: string; reason_de: string }[];
  criteria: { id: string; grade: 'A' | 'B' | 'C' | 'D' | 'E'; justification_en: string; justification_de: string }[];
  corrected: string;
  summary_en: string; summary_de: string;
}
```

- **Placing marks:** the parser finds each mark's `original` in the text, in order, and computes the offsets. A mark whose `original` can't be found is dropped, and an unknown category becomes `other`.
- **Required fields:** the criteria must cover every rubric criterion with a valid grade; otherwise the reply is `ai_bad_reply`.
- **Scoring:** points are the sum of the criterion points, and `percent = points / max`.
- **Lesson grade:** ≥ 60% correct, ≥ 40% almost, and anything else wrong.
- **Word count:** it's shown, but never scored by code. The rubric's task-completion criterion covers length, and the prompt states the target.
- **Anchors:** the prompt gets 2–3 anchors for the format part: the A anchor, the D anchor, and the anchor nearest the level's pass band (B). Each has its task, letter, grades and justification. Lesson letter tasks use the anchors of their track+level's writing part when one exists, otherwise the NaDoch format's.

## Error Log

```sql
CREATE TABLE error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('lesson','teil','freestyle_chat','freestyle_writing','speaking')),
  category TEXT NOT NULL,
  wrong TEXT NOT NULL, right TEXT NOT NULL,   -- short snippets only
  created_at TEXT NOT NULL
);
```

- **Taxonomy** (`lib/errors/taxonomy.ts`): `{ id, label: LocalizedText, keywords: string[] }`. Keywords are matched against lesson titles (en and de) to find a grammar lesson. The categories:
  - articles and gender;
  - case after prepositions, Akkusativ/Dativ objects;
  - adjective endings;
  - verb conjugation;
  - Perfekt auxiliary;
  - participles;
  - separable verbs;
  - modal verbs;
  - verb position in main clauses and in subordinate clauses;
  - word order in the middle field;
  - connectors;
  - relative pronouns;
  - reflexive pronouns;
  - verbs with prepositions;
  - Konjunktiv II;
  - Passiv;
  - plural forms;
  - comparison;
  - Genitiv;
  - n-Deklination;
  - infinitive with zu;
  - negation (kein/nicht);
  - capitalisation;
  - spelling (ß/ss, umlauts);
  - punctuation (commas);
  - word choice;
  - collocations;
  - register (du/Sie, formal phrases);
  - letter conventions (greeting, closing);
  - other.
- **Writing to the log:**
  - letter grading and free-text grading write their marks and mistakes. The free-text grader's reply gains `mistakes: [{ category, wrong, right }]`;
  - Freestyle conversation and writing corrections gain a `category` from the same list: the prompts are updated, and an unknown value becomes `other`.
- **Snippets:** each is at most 80 characters, cut at word boundaries.
- **Dashboard card "Your top mistakes":**
  - the 5 most frequent categories in the last 30 days, each with its count and its latest example (~~wrong~~ → right);
  - a link to the first grammar lesson in the active track+level whose title matches a keyword, otherwise "Practise in Freestyle" → `/freestyle/grammar_drill?topic=<label>`, which pre-fills the setup.
  - It's hidden when the log is empty.

## Typing Helpers

- **`GermanTextInput` / `GermanTextarea`:** wrappers around the design-system Input and Textarea.
  - A small "äöü" toggle shows a row of 7 buttons, which insert at the caret and keep the focus. They're `type="button"`, with `aria-label`s "Insert ä" and so on.
  - The row's open or closed state is remembered in `localStorage` (with a try/catch).
  - They replace every German text input: fill-in-the-blank, free text, cloze typed gaps, chat inputs (lesson chat, Freestyle), writing textareas, deck add-word, and the test-out and practice inputs.
- **`WordCounter({ text, target })`:** "74 / 80–100 words", neutral inside the range and `warning` outside it.
- **Spellcheck:** `spellCheck={false}` on the writing textarea and cloze gaps in the Teil runner and mocks. Everywhere else it's the browser default.

## Teil Runner and Freestyle

- **Runtime:** `letter` joins `RUNTIME_TASK_TYPES`.
- **Sets:** Teil sets for writing parts have `taskType: 'letter'` and content `{ tasks: [A, B?] }`.
- **The runner:**
  - shows the task(s), with the choice as two cards;
  - after the choice: the textarea, the counter and the umlaut row;
  - it's always timed, with overtime marked;
  - Submit grades on the server (it can take up to a minute: a progress state with no timeout on the client, and a server provider timeout of 90 s). A grading failure keeps the attempt open, so the student can resubmit.
- **The result:**
  - the marked-up letter: each mark underlined in its type's colour (grammar `danger`, vocabulary `warning`, spelling `primary`, register `highlight`), and tapping one shows the correction and reason with the toggle;
  - the criterion cards (grade, points, justification);
  - the total against the pass ratio;
  - the corrected version, with a side-by-side toggle;
  - **Copy into free writing**, which opens the Freestyle free-writing session with the text pre-filled.
- **Error log:** marks are written with `source: 'teil'`.
- **Mocks:** the full mock now includes the writing part(s) of the written block.
- **Readiness:** it includes the writing parts.
- **Freestyle free writing:** it uses the same marked-up view (without criteria and points, since it's not exam-format). Its corrections carry categories and feed the log.

## Lessons

- **Types:** `letter` joins `ExerciseType`, with validation, view, answer parsing and grading through the AI (like free text). It isn't test-out eligible, and it isn't in the Daily Queue: a passed letter task never enters review.
- **Revise and regrade:** each submission is a new attempt. The card shows earlier versions, collapsed, above the newest result.
- **Error log:** marks are written with `source: 'lesson'`.
- **Content:** each writing lesson (all tracks) gains one letter-task exercise matching what it teaches.

## Error Handling

- **Grading failures** (`ai_failed`, `ai_bad_reply`) keep the text and offer a retry. In the Teil runner, the attempt stays open.
- **A missing or broken anchor file** never blocks grading: the call goes out with the rubric only, and the admin gets a `content_issues` notification.

## Testing

- **Pure:**
  - rubric validation in the format files;
  - letter content, answer and view;
  - the grading prompt contents (rubric, anchors, word target, register, German-only for exam tasks);
  - the reply parser: offsets from `original`, dropped marks, unknown category → other, missing criteria → null, points and percent;
  - the lesson pass rule;
  - the taxonomy (unique ids, both labels);
  - the lesson-matching by keywords;
  - snippet trimming;
  - the top-5 aggregation over 30 days;
  - word counting;
  - umlaut insertion at the caret.
- **Services:** lesson grading and revise attempts; Teil letter submit (final, resubmit after failure, error-log rows); free-text grading mistakes → log; Freestyle corrections → log; the Dashboard error card data.
- **Client:**
  - `GermanTextarea`: insert at the caret, focus kept, remembered toggle;
  - `WordCounter`;
  - the letter runner (choice, counter, spellcheck off, submit progress, result views, copy to Freestyle);
  - the marked-up text interactions;
  - the Dashboard card.
- **Content:** rubric and word target completeness for every writing part; anchors (4 per part, grades valid for the rubric); sets validated; each writing lesson has a letter task.

## Decisions (2026-09-29)

- **Grading:** the AI grades against anchor letters (2–3 per call), with Claude-drafted anchors that the user spot-checks.
- **Feedback:** inline marks coloured by type, A–D criterion cards with points, and a fully corrected version.
- **Revising:** allowed in lessons and Freestyle free writing. A timed Teil attempt is final, with "Copy into free writing".
- **Lesson letter tasks:** added alongside the existing exercises, correct at ≥ 60% of rubric points and almost at 40–59%. Typed only.
- **Error log:** fed by every source, showing the top 5 on the Dashboard with links to a grammar lesson or a Freestyle drill.
- **Typing helpers:** umlaut buttons on every German input, a live word counter, and spellcheck off in timed Teile.
- **Content:** 3 exam sets per writing part for all 15 formats, plus the anchors.
