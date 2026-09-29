# Curriculum Expansion: the Other 14 Track+Levels — Design Spec

## Overview

The telc B1 expansion (sub-project 1b) introduced a fixed **inventory** of what a level must cover, a **coverage map** from inventory items to lessons, and gap-driven new lessons. This sub-project does the same for the other 14 track+levels. It runs after the Speaking module, so new lessons use **every exercise type**:
- `multiple_choice`, `fill_blank`, `flashcard` (vocabulary only) and `free_text`;
- `passage_questions`, `matching`, `cloze`;
- `audio_questions`, `letter`, `spoken_response`.

By decision, it also adds **Sprachbausteine-style lessons in every track**: grammar-in-context cloze practice. They aren't an exam part outside telc.

### In scope

- **Level inventories** `data/inventory/{a1,a2,b2,c1}.json`, in the B1 file's shape (grammar, themes, communication). They're shared by all three tracks of a level.
- **Exam-part items** per track+level, derived from that format's parts (`e-<partId>`), plus `e-sprachbausteine-practice` for every track.
- **A coverage map** per track+level (`data/inventory/<track>-<level>-coverage.json`), covering every inventory and exam-part item, with a `_new` list.
- **Gap-filling lessons** for all 14 track+levels:
  - bilingual, placed in difficulty milestones (still 3–5 per level), respecting prerequisites and the scope rule;
  - 4–8 exercises each, using the types that fit the skill;
  - the skill modules' rules for audio (speaker-tagged transcripts), letters (rubric and word target) and spoken responses apply.
- **Concept links** between new lessons that teach the same concept in another track at the same level (listed in both files).
- **One review summary per track+level.**
- **Generalizing the telc B1 test** into one coverage test over all 15 track+levels. telc B1 already passes it; it's checked against the extended inventory, with `e-sprachbausteine-practice` covered by its existing Sprachbausteine lessons.

### Out of scope

- Rewriting existing lessons. They may only gain concept links.
- New exam content (Teil sets and exams have their own sub-projects).

## Inventories

- **A1:** ~15 grammar points (present tense, sein and haben, W-questions, articles and gender, the accusative, negation, modal verbs basics, separable verbs, possessives, imperative, numbers and time, prepositions of place basics), ~12 themes, ~8 communication functions.
- **A2:** ~18 grammar points (Perfekt, Dativ, two-way prepositions, comparison, weil, dass, wenn, reflexive basics, Präteritum of sein, haben and the modal verbs, adjective endings basics, …), ~14 themes, ~9 functions.
- **B1:** the existing file.
- **B2:** ~20 grammar points (Passiv variants, Konjunktiv I recognition, Partizipialattribute, Nominalisierung, Konnektoren (indem, sodass, je … desto), Modalpartikeln, n-Deklination review, …), ~15 themes, ~10 functions.
- **C1:** ~18 grammar points (Nominalstil, erweiterte Partizipialkonstruktionen, Konjunktiv I in reported speech, advanced connectors, Funktionsverbgefüge, register, …), ~15 themes, ~10 functions.

The exact lists are drafted in the plan's first task and spot-checked by the user. They're grounded in the Goethe and telc level descriptions and Profile deutsch.

## Coverage Rule

A lesson counts for an item when its explanation teaches it and at least two of its exercises practise it (as in 1b). The test checks, for every track+level:
- every item is covered;
- every mapped id exists in that seed file;
- every lesson is mapped;
- new lessons have 4–8 exercises of valid types for their skill.

## Content Rules (all new lessons)

- The same rules as telc B1:
  - English explanations (3–8 sentences), with German versions simplified to the level;
  - 2–4 examples;
  - accurate German at the level, and plausible distractors;
  - `acceptableVariants` for alternative answers.
- **Types by skill:**
  - grammar: `multiple_choice`, `fill_blank`, `cloze`;
  - vocabulary: plus `flashcard`;
  - reading: `passage_questions`, `matching`, `cloze`;
  - listening: `audio_questions`, with speaker-tagged transcripts, `@filter`, and evidence;
  - writing: `free_text` and `letter` (with a word target and register);
  - speaking: `free_text` and `spoken_response`.
- **Sprachbausteine-style lessons** (`e-sprachbausteine-practice`): a grammar-skill lesson per track+level with `cloze` exercises in `select` and `bank` modes over short connected texts.
- **Placement and ids:** as in the restructure (ids `<level>-<track>-<slug>`, matching the file's existing pattern). `seedVersion` is bumped once per track commit.

## Testing

- The coverage test over all 15 track+levels, including exam-part items derived from the formats.
- The existing structure, language and content validation tests stay green: milestones, scope, bilingual fields, transcript validation and letter content.
- A concept-link symmetry test over all files.

## Decisions (2026-09-29)

- The other 14 levels are expanded after Speaking, with all exercise types.
- The expansion is gap-driven against per-level inventories, with no fixed count.
- Sprachbausteine lessons go in all tracks.
