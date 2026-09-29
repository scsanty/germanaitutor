# Reading Module (and the shared Teil engine) — Design Spec

## Overview

Reading is the first skill module, so it also builds what Listening, Writing, Speaking and the Level exams reuse:

1. **Exam formats as data**, for all 15 track+levels (telc, Goethe and the NaDoch track). They cover the parts, item counts, points, timing and instructions of every skill, compiled from the official Modellsätze.
2. **The Teil engine**: Teil sets (content), a timed runner with overtime marking, objective scoring, stored explanations with an "Ask about this" AI follow-up, an AI pool for sets the student has used up, admin review and authoring, and the practice attempt history that feeds a readiness card.
3. **Reading content:** three new exercise types for lessons (passage + questions, matching, cloze), added alongside the existing reading exercises, and starter practice sets for every reading part of every format, plus telc's Sprachbausteine.
4. **Freestyle's "Exam practice"** is switched on: a single reading Teil, or the **full mock**, which at this point is the reading and Sprachbausteine block and grows as later modules land.

### In scope

- Format files and their validation.
- Task types `passage_questions`, `matching` and `cloze` (typed, select, or word bank): content shapes, views without answers, deterministic grading, and the lesson pass rule. They're also usable as Teil set content.
- **Teil sets:** storage, statuses, seen-tracking, and the AI pool for exhausted parts.
- **Runner:** always timed, overtime marked, no pause (leaving abandons), text and questions side by side on desktop with bottom tabs on phones, and the review with stored explanations plus "Ask about this".
- **Attempts:** scores only. A "readiness" card on the Dashboard, averaging the last 5 attempts per part.
- **Admin:** a Teil set list per format and part (review statuses), a form editor per task type, and JSON/YAML upload and download.
- **Lesson integration:**
  - the new types in lessons, the Daily Queue and test-outs (all three are test-out eligible);
  - Phase 2's practice generation learns the three shapes;
  - the flashcard rule stays.
- **Content:**
  - the 15 format files;
  - 3 starter sets per reading part (plus telc Sprachbausteine Teil 1–2) for all 15 formats;
  - new-type exercises added to the existing reading lessons.

### Out of scope

- Listening, writing and speaking parts' runtime (their modules), although their **format data** is compiled here.
- Formal exams and reserved exam sets (the Level exams sub-project).
- Error-log entries (Writing builds the log). Reading answers are objective, so they add nothing to it.

## Exam Formats (`data/exam-formats/<track>-<level>.json`)

```ts
interface ExamFormat {
  id: string;                         // "telc-b1"
  track: Track; level: CefrLevel;
  name: string;                       // "telc Deutsch B1", "Goethe-Zertifikat B1", "NaDoch! B1"
  sources: string[];                  // Modellsatz URLs (empty for the NaDoch format)
  blocks: { id: 'written' | 'oral'; title: LocalizedText; minutes: number; partIds: string[]; passRatio: number }[];
  parts: ExamPart[];
}
interface ExamPart {
  id: string;                         // "lesen-1", "sprachbausteine-2", "hoeren-3", "schreiben", "sprechen-2"
  skill: 'reading' | 'sprachbausteine' | 'listening' | 'writing' | 'speaking';
  title: LocalizedText;               // "Leseverstehen Teil 1" / "Leseverstehen Teil 1"
  taskType: 'passage_questions' | 'matching' | 'cloze' | 'audio_questions' | 'letter' | 'spoken';
  items: number;                      // scored items (writing/speaking: criteria count)
  points: number;                     // max points of the part
  minutes: number;                    // practice time for this part alone
  instructions: string;               // the German task instructions, as in the exam
  replays?: number;                   // listening
}
```

- **Written block:** telc B1's written block is Leseverstehen + Sprachbausteine (90 min), Hörverstehen (~30 min), then Schriftlicher Ausdruck (30 min). Its `passRatio` is 0.6.
- **Oral block:** its `passRatio` is also 0.6.
- **Timing:** a part's `minutes` is its share of the block time (e.g. Leseverstehen Teil 1 ≈ 20 min).
- **The NaDoch format:** 4 skills, simple Teile: Reading 2, Listening 2, Writing 1–2, Speaking 2. It uses the same task types and a pass ratio of 0.6 per block. It's defined here, with the Level exams reusing it.
  - *Ruling:* the exams decision assigned the NaDoch format to the Level exams sub-project. Reading needs it first to write NaDoch practice sets, so it's defined here and the exams reuse it.
- **Validation test:**
  - part ids are unique;
  - every block lists existing parts;
  - points and minutes are positive;
  - the block minutes equal the sum of their parts' minutes, within 1;
  - every `taskType` is known.

## Task Types

**Content** (German; English framing in `instruction` as in bilingual content):

```ts
interface PassageQuestionsContent {
  instruction?: LocalizedText;
  passage: string;                                    // may contain several short texts separated by blank lines
  questions: { question: string; options: string[]; correctIndex: number }[];  // Richtig/Falsch = ["Richtig","Falsch"]
}
interface MatchingContent {
  instruction?: LocalizedText;
  items: string[];                                    // texts or situations
  targets: string[];                                  // headlines or ads
  answers: (number | null)[];                         // target index per item; null = "x" (none fits)
  allowNone: boolean;
}
interface ClozeContent {
  instruction?: LocalizedText;
  text: string;                                       // gaps written as {{1}}, {{2}} …
  gaps: ({ mode: 'typed'; answer: string; variants?: string[] }
       | { mode: 'select'; options: string[]; correctIndex: number }
       | { mode: 'bank'; answer: number })[];         // index into bank
  bank?: string[];                                    // for telc Sprachbausteine Teil 2: 15 words for 10 gaps
}
```

- **Views** remove the answers: `correctIndex`, `answers`, `answer`, `variants`.
- **Answer shapes:**
  - `{ type: 'passage_questions'; selected: (number | null)[] }`;
  - `{ type: 'matching'; selected: (number | null)[] }` (null = "x");
  - `{ type: 'cloze'; values: (string | number | null)[] }`.
- **Grading** is deterministic and returns `{ itemResults: boolean[]; result }`. Typed gaps use the fill-blank comparison (trim, case-insensitive, variants).
- **Lesson pass rule:** ≥ 80% of items right is `correct`, ≥ 50% is `almost`, and anything else is `wrong`.
- **Reviews:** a set is reviewed later as one item.
- **Test-outs:** all three types are eligible.

## Teil Sets

```sql
CREATE TABLE teil_sets (
  id TEXT PRIMARY KEY,                     -- "telc-b1__lesen-1__s01", pool: "…__p<random>"
  format_id TEXT NOT NULL, part_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starter','unreviewed','approved','rejected','reserved')),
  content TEXT NOT NULL,                   -- { taskType, content, explanations: LocalizedText[] (one per item) }
  created_at TEXT NOT NULL, reviewed_at TEXT
);
CREATE TABLE teil_seen (set_id TEXT PRIMARY KEY REFERENCES teil_sets(id) ON DELETE CASCADE, seen_at TEXT NOT NULL);
CREATE TABLE teil_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id TEXT NOT NULL, part_id TEXT NOT NULL, set_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('practice','mock')),
  mock_id TEXT,                             -- groups the parts of one full mock
  score REAL, max_score REAL, overtime_seconds INTEGER,
  started_at TEXT NOT NULL, finished_at TEXT
);
```

- **Sets for practice:** `starter`, `approved`, and `unreviewed` (usable at once, as in Phase 2). They're served **unseen first**. `rejected` never appears. `reserved` is for the formal exams: never in practice, and Level exams adds these.
- **Exhausted part:** when every usable set of a part has been seen, one new set is generated with the AI into `unreviewed`. It's German-only at the level, in the part's task type, with per-item explanations in both languages. If generation fails, the least-recently-seen set comes back.
- **Seeds:** bundled starter sets live in `data/teil-sets/<format>/<part>.json` and load into an empty table (or on a new bundle version), in the curriculum-seed style.

## Runner and Attempts

1. **Start:** `POST /api/exam-practice/start { formatId, partId }` picks a set, marks it seen, creates an attempt with `started_at`, and returns the set view with `minutes`.
2. **Timing:** the client counts down. At zero, it shows **"Time's up: you can finish; this attempt will be marked as overtime"** and keeps going.
3. **Submit:** `POST /api/exam-practice/submit { attemptId, answers }`.
   - The server grades, and computes the overtime from its own `started_at` (never the client's clock).
   - It stores `score`, `max_score` and `overtime_seconds`, and returns the review: per item, the answer, right/wrong, the correct answer, and the stored explanation.
   - The part's points are distributed evenly over its items.
4. **No pause:** leaving the runner abandons the attempt. An unfinished attempt is never scored or shown. Attempts older than 3 hours without `finished_at` are ignored.
5. **Ask about this:** `POST /api/exam-practice/explain { attemptId, itemIndex, question }` makes one AI call with the item, the passage, the student's answer and the stored explanation. It replies in the language of the student's question.

**Layout:**
- **Desktop:** the text on the left and the questions on the right, with the timer in the header.
- **Phone:** bottom tabs, "Text | Aufgaben".
- **Both:** Submit is in the thumb zone, the runner uses focus mode (exit confirmation when anything is answered), and there are no keyboard shortcuts for picking answers (reading needs typing and scrolling).

**Full mock:**
- `POST /api/exam-practice/mock/start { formatId }` runs every part of the written block that has a runtime so far (for now the reading and Sprachbausteine parts), in exam order.
- It has one timer: the sum of those parts' minutes.
- Each part is submitted in turn under a shared `mock_id`, and the result shows points per part and the total against the block's pass ratio.

**Readiness card** (Dashboard): for the active track+level's format, it shows each part's average percentage over its last 5 finished attempts (practice or mock), marked against 60%. Overtime attempts count, with a small "overtime" note.

## Freestyle Integration

- `exam_practice` is `enabled` in the Freestyle mode registry.
- Its screen lists the active format's parts that have a runtime (a "Teil" card each: title, minutes, last score), and a "Full mock" card.
- It isn't a chat session: no Freestyle session row and no End summary.

## Lessons

- **Types:** `ExerciseType` gains the three types. `exerciseContentValidation`, `toExerciseView`, `gradeExerciseAnswer`, `correctAnswerFor`, `answerTextFor` and `taskTextOf` learn them.
- **UI:** the lesson `ExerciseCard` renders them (passage above the questions; matching as a select per item with an "x" option when `allowNone`; cloze as inline inputs, selects or bank chips).
- **Phase 2 practice generation:** it learns the three shapes, still German-only at the level.
- **Admin:** the lesson exercise editor gets form fields for the three types.

## Admin

- **`/admin/exam-practice`:** pick a format and part to see its sets, with status, preview and item count. The actions are Approve, Reject, Edit, Duplicate, Delete (starter and pool only), and **Upload** / **Download** (JSON or YAML: a list of sets for one part, validated in full before anything changes, as with the placement exam).
- **The editor** is a form per task type (passage, questions and options with the correct one marked, explanations en/de per item).

## Content

1. **Formats:**
   - 15 format files. Claude compiles the telc and Goethe ones from the official Modellsätze (each file lists its source URLs) and defines the NaDoch format.
   - They hold every part of every skill; Listening, Writing and Speaking fill in their parts' runtime details.
   - The user spot-checks them.
2. **Starter sets:** **3 per reading part, for all 15 formats**, plus **telc Sprachbausteine Teil 1 and 2** at every telc level that has them.
   - They're German, at the level, in the exact part format (item count, text lengths), with an explanation per item in en and de.
   - Written track by track (telc, Goethe, then NaDoch). The user spot-checks them.
3. **Lesson exercises:** each of the ~44 reading lessons (plus the telc B1 expansion's) gains 1–2 exercises of the new types that fit it, alongside the existing ones.

A validation test covers every bundled set:
- it matches its part's task type and item count;
- the answers are in range;
- the explanations are complete.

## Error Handling

- **Generation failure:** the least-recently-seen set is used, and the student isn't blocked.
- **Submit failure:** keeps the answers and offers a retry. The timer keeps running, and the overtime is computed on the server.
- **Explain failure:** the stored explanation stays shown, with the AI error beside it.

## Testing

- **Pure:** format validation; each task type's view stripping, grading (item results, pass rule, typed variants, "x" matches) and answer parsing; the runner's overtime calculation; set selection (unseen first, exhausted → generate, fallback least-recent); the readiness averages.
- **Services:** start, submit and explain; mock start and part-by-part submit; pool generation with a mocked AI (German-only prompt, parse, validation); admin upload validation.
- **Client:** the runner (timer, overtime notice, tabs on phones, submit, review with explanations, Ask about this); matching and cloze inputs; the exam-practice screen in Freestyle; the readiness card; the admin editor.
- **Content:** format and set validation tests; every reading lesson has at least one new-type exercise.

## Decisions (2026-09-29)

- **Lesson types:** passage + questions, matching and cloze (typed, dropdown or word bank), added alongside the existing exercises. A lesson set counts as correct at ≥ 80% of items.
- **Formats:** all 15, as data, compiled from the official Modellsätze. **3 starter sets per Teil everywhere**, including telc Sprachbausteine.
- **Runner:** Teil practice is always timed, overtime is marked but can be finished, and there's no pause. Text and questions sit side by side on desktop, with bottom tabs on phones.
- **Explanations:** stored per item, plus "Ask about this" AI help.
- **Pool:** an exhausted part generates a new set into the pool for admin review.
- **Admin:** a form editor per format, plus JSON/YAML upload.
- **Readiness:** the last 5 attempts per part.
- **Freestyle:** exam practice (single Teil or full mock with whatever parts exist) is switched on.
