# Prompt: Author CEFR-level German lesson content (YAML)

Copy everything below into another LLM (or use it yourself as a checklist) to produce lesson content for a German-learning app. Fill in one file per CEFR level (A1, A2, B1, B2, C1).

---

You are helping author teaching content for a German-as-a-foreign-language app. The content is organized by CEFR level (A1–C1). For the level you're given, produce a **flat, track-agnostic list of lessons** — one lesson per discrete concept (a single grammar point, vocabulary set, or skill). Do NOT organize lessons into units, chapters, modules, or any other grouping — that structuring happens separately, afterward, by someone else. Your only job is the flat list of lessons and their content.

Cover all six skill areas at the given level, grounded in real CEFR "can-do" descriptors for that level: **grammar, vocabulary, reading, listening, writing, speaking**.

## Output format

Produce a single YAML document with this exact shape:

```yaml
level: A1   # the CEFR level this file covers

lessons:
  - slug: personal-pronouns          # REQUIRED. kebab-case, unique within this file, no level prefix
    skill: grammar                   # REQUIRED. one of: grammar | vocabulary | reading | listening | writing | speaking
    title: Personal pronouns         # REQUIRED. short, human-readable
    prerequisites: []                # slugs of OTHER lessons in this same file that must come first (empty if none)
    explanation: |                   # a clear, accurate teaching explanation of the concept (2-6 sentences)
      German personal pronouns change form depending on who is speaking or
      being spoken about. The subject pronouns are: ich (I), du (you,
      informal singular), er/sie/es (he/she/it), wir (we), ihr (you,
      informal plural), sie (they), Sie (you, formal).
    examples:                        # 2-4 real German example sentences illustrating the concept
      - "Ich heiße Anna."
      - "Du bist mein Freund."
      - "Wir lernen Deutsch."
    exercises:                       # 3-5 exercises, types appropriate to the skill (see below)
      - type: multiple_choice
        question: "Welches Pronomen passt? '___ bin Student.'"
        options: ["Ich", "Du", "Er", "Wir"]
        correctIndex: 0
      - type: fill_blank
        textWithBlank: "___ heißt Peter."
        correctAnswer: "Er"
      - type: flashcard
        front: "sie (plural)"
        back: "they"
      - type: free_text
        prompt: "Introduce yourself in one German sentence."
        modelAnswer: "Ich heiße Anna."
```

## Exercise types — use whichever fit the skill and concept

- **`multiple_choice`**: `question`, `options` (array of strings), `correctIndex` (0-based index into `options`)
- **`fill_blank`**: `textWithBlank` (sentence with `___` marking the gap), `correctAnswer`, optionally `acceptableVariants` (array of other acceptable answers)
- **`flashcard`**: `front`, `back` — best for vocabulary
- **`free_text`**: `prompt`, `modelAnswer` — best for writing/speaking practice where there's no single correct string; `modelAnswer` is a reference answer, not the only valid one

Grammar/vocabulary lessons typically suit `multiple_choice`/`fill_blank`/`flashcard`. Writing/speaking lessons typically suit `free_text`. Reading/listening lessons typically suit `multiple_choice`/`free_text` (comprehension questions).

## Rules

1. **Do not invent tracks, milestones, sections, or lesson ordering/grouping.** Only the flat lesson list, in any order — dependency order via `prerequisites` is enough.
2. **`prerequisites` may only reference slugs that appear elsewhere in this same file** (same level). Don't reference a different level's concept.
3. **Aim for 15–25 lessons per level**, roughly covering all six skills (grammar and vocabulary typically need more entries than the others, since they're more granular).
4. **Explanations and examples must be linguistically accurate, real German** — not placeholder or invented grammar.
5. If you're unsure of a field or want to leave a lesson for a human to finish later, still include `slug`, `skill`, and `title`, and write `"TODO: <short note on what's needed>"` as the `explanation` — leave `examples: []` and `exercises: []`. Never fabricate content you're not confident is correct just to fill the field.
6. Output ONLY the YAML — no prose before or after, no markdown code fences around the whole response (a single fenced block is fine if your interface requires it, but don't add commentary).

Now produce the YAML for CEFR level: **[FILL IN: A1 / A2 / B1 / B2 / C1]**
