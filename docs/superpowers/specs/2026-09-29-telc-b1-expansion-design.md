# Curriculum Expansion: telc B1 — Design Spec

## Overview

telc B1, the user's target exam, has only 20 lessons today:
- 5 grammar;
- 4 vocabulary, including 2 Sprachbausteine lessons;
- 3 reading, 3 listening, 2 writing, 3 speaking.

This content sub-project finds what's missing for B1 and writes lessons to fill every gap. It's **gap-driven, with no fixed count**. It comes after the design pass in the build order, so the new lessons are born in seed format v3: bilingual, placed in difficulty milestones, and hard-gated by prerequisites. It uses the **original four exercise types**; the skill modules (Reading, Listening, Writing, Speaking) later add new-type exercises to these lessons as they do to existing ones.

The other 14 track+levels are expanded later, after the Speaking module (sub-project 6b), with all exercise types.

### In scope

- A **B1 inventory**: a fixed checklist of what a telc B1 learner must cover (below), stored as data.
- A **coverage map** from every inventory item to the telc B1 lessons that teach it. A test enforces that every item is covered.
- **New telc B1 lessons**, one per uncovered item (or per coherent group of items). Each lesson:
  - is bilingual (`titleDe`, `explanationDe` simplified to B1, `examplesDe`, instructions);
  - has 4–8 exercises in the four types;
  - has prerequisites that respect the scope rule;
  - is placed in the telc B1 difficulty milestones, adding at most enough milestones to stay within 3–5.
- A **review summary** for the user's spot-check.

### Out of scope

- Other track+levels (sub-project 6b).
- New exercise types (the skill modules).
- Rewriting existing lessons. Their exercises stay as they are. An existing lesson may be *listed* as covering an item, but it isn't changed.

## The B1 Inventory (`data/inventory/b1.json`)

Four kinds of item, each with a stable id:

**Grammar**
- Tenses and moods:
  - `g-praeteritum`: Präteritum, regular, irregular and modal verbs
  - `g-plusquamperfekt`: Plusquamperfekt
  - `g-futur-1`: Futur I
  - `g-passiv`: Passiv (Präsens, Präteritum, Perfekt, with modal verbs)
  - `g-konjunktiv-2`: Konjunktiv II (würde, hätte, wäre, modal verbs: wishes, advice, unreal conditions)
- Clauses and connectors:
  - `g-relativsaetze`: Relativsätze (Nom., Akk., Dat., with prepositions; wo, was)
  - `g-kausal-konzessiv`: weil, da, obwohl, trotzdem, deshalb
  - `g-final`: damit, um … zu
  - `g-temporal`: als, wenn, während, bevor, nachdem, seit, bis, sobald
  - `g-konditional`: wenn, falls
  - `g-indirekte-fragen`: indirect questions (ob, W-words)
  - `g-infinitiv-zu`: infinitive with zu
  - `g-zweiteilige-konnektoren`: sowohl … als auch, weder … noch, entweder … oder, nicht nur … sondern auch, je … desto
- Nouns and adjectives:
  - `g-adjektivdeklination`: adjective endings (all three types)
  - `g-komparation`: Komparativ and Superlativ
  - `g-genitiv`: Genitiv, and wegen, trotz, während, statt
  - `g-n-deklination`: n-Deklination
- Verbs:
  - `g-reflexive-verben`: reflexive verbs (Akk./Dat.)
  - `g-verben-praepositionen`: verbs with prepositions, and da-/wo-compounds
  - `g-lassen-brauchen`: lassen, and brauchen … zu
  - `g-nomen-verb`: Nomen-Verb-Verbindungen (Antrag stellen, Entscheidung treffen …)
  - `g-partizip-adjektiv`: participles as adjectives (recognition)
- Word order: `g-wortstellung`: word order in the middle field and the sentence bracket

**Themes** (vocabulary)
- Everyday life:
  - `t-arbeit`: work and jobs
  - `t-wohnen`: housing
  - `t-gesundheit`: health and the doctor
  - `t-reisen`: travel and transport
  - `t-einkaufen`: shopping and complaints
  - `t-essen`: food and restaurants
  - `t-geld`: money and banking
- Society and institutions:
  - `t-behoerden`: offices and forms
  - `t-medien`: media and communication
  - `t-bildung`: education and learning
  - `t-umwelt`: environment and nature
  - `t-technik`: technology and the internet
- Personal life:
  - `t-freizeit`: leisure and culture
  - `t-familie`: family and relationships
  - `t-feste`: festivals and traditions

**Exam parts** (telc B1, strategy lessons)
- Reading and Sprachbausteine:
  - `e-lesen-1`, `e-lesen-2`, `e-lesen-3`: Leseverstehen Teil 1–3
  - `e-sprachbausteine-1`, `e-sprachbausteine-2`: Sprachbausteine Teil 1–2
- Listening: `e-hoeren-1`, `e-hoeren-2`, `e-hoeren-3`: Hörverstehen Teil 1–3
- Writing: `e-schreiben`: Schriftlicher Ausdruck, a **personal or semi-formal letter** with 4 Leitpunkte
- Speaking:
  - `e-sprechen-1`, `e-sprechen-2`, `e-sprechen-3`: Mündlicher Ausdruck Teil 1–3
  - `e-sprechen-vorbereitung`: using the 20-minute preparation time

**Communication**
- Opinions:
  - `k-meinung`: giving and justifying an opinion
  - `k-zustimmen-widersprechen`: agreeing and disagreeing politely
  - `k-vorschlaege`: making, accepting and rejecting suggestions
- Requests and problems:
  - `k-beschwerde`: complaining
  - `k-rat`: asking for and giving advice
- Talking about yourself:
  - `k-erfahrungen`: reporting experiences
  - `k-plaene`: describing plans and intentions
  - `k-gefuehle`: expressing feelings
- Arrangements:
  - `k-telefonieren`: phone calls and voicemails
  - `k-termine`: making and moving appointments

That's 61 items: 23 grammar, 15 themes, 13 exam parts, and 10 communication functions. Each item is `{ id, kind: 'grammar' | 'theme' | 'exam' | 'communication', label, labelDe }`.

## Coverage Map (`data/inventory/telc-b1-coverage.json`)

`{ "<item id>": ["<lesson id>", …] }` covers every inventory item.

A lesson may cover several items. For example, the existing complaint-letter lesson covers both `k-beschwerde` and part of `e-schreiben`. Coverage is judged on content, not titles. A lesson counts for an item only when its explanation teaches it **and** at least two of its exercises practise it.

## New Lessons

**Ids:** `b1-telc-<slug>` (kebab-case, unique).

**Content rules** (from `docs/curriculum-content-authoring-prompt.md`, plus the later decisions):
- Explanations are accurate, 3–8 sentences in English, with the German version simplified to B1. There are 2–4 example sentences.
- 4–8 exercises, in types that suit the skill:
  - grammar: multiple choice and fill-in-the-blank;
  - vocabulary: plus flashcards (only in vocabulary lessons, per the flashcard rule);
  - reading and listening: multiple choice, with the text written into the task as today;
  - writing and speaking: free text.
  At least two exercises practise each item the lesson covers.
- The tested German is accurate B1 German. Multiple-choice options are plausible distractors that differ in the point being tested. `acceptableVariants` list other correct answers where a gap has more than one.
- **Instructions follow the bilingual rule.** English framing goes into `instruction` with a German translation. The German stimulus stays in the stimulus field.
- **Prerequisites and placement:**
  - Prerequisites point only to telc B1 lessons in the same or a lower milestone (the restructure's scope rule).
  - New lessons go into the existing difficulty milestones by difficulty. A new milestone is added only if the file stays within 3–5 milestones.
  - Every placement keeps the structure test green.
- **Exam-part lessons:** where an exam part has no strategy lesson (e.g. `e-sprechen-vorbereitung`, or the personal-letter form of `e-schreiben`), the new lesson teaches the format, timing, points and strategy. Its exercises are practice items in that format.

**Concept links:** a new telc B1 lesson that teaches the same concept as an existing Goethe B1 or Generic B1 lesson gets a `conceptLinks` entry (in both files), so completing one covers the other.

## Validation

`lib/services/telcB1Coverage.test.ts`:
- Every item in `data/inventory/b1.json` has at least one lesson id in the coverage map.
- Every mapped id exists in `telc-b1.json`, and every telc B1 lesson is mapped to at least one item. That flags lessons nobody needs.
- **Exercises:**
  - each new lesson (`b1-telc-*` not present before this sub-project, as listed in the map's `"_new"` array) has 4–8 exercises;
  - there are no flashcards outside vocabulary lessons;
  - multiple-choice `correctIndex` values are in range. The loader already validates instruction shape.

The existing structure and language tests keep telc B1 at 3–5 milestones, within the scope rule, and bilingual. `seedVersion` bumps.

## Review

`docs/superpowers/content/2026-09-29-telc-b1-expansion.md` has three parts:
- the coverage matrix: item, then lessons, with new lessons marked;
- each new lesson's title (en / de), milestone and exercise count;
- one line per new lesson saying what it teaches.

The user spot-checks it.

## Decisions (2026-09-29)

- telc B1 is expanded first, right after the design pass, with the original 4 types. The other 14 levels come after Speaking, with all types.
- The expansion is gap-driven, with no fixed count, against the inventory above.
- Sprachbausteine lessons are included; telc B1 already has two, which the map records.
- The existing lessons are unchanged. New lessons are bilingual, placed, and gated like all others.
