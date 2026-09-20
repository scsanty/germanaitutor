# CEFR Frameworks — Design Spec

## Product Context

This is the second of eight sub-projects that make up the German AI Tutor WebApp. Core (sub-project #1, complete) built the platform shell: BYOK AI provider connections, onboarding, settings, and a generic structured-memory store for mastery tracking. The full build order:

1. Core (complete)
2. **CEFR frameworks** (this spec) — the static, pre-built curriculum content for Generic/TELC/Goethe × A1–C1
3. Tutoring section — the runtime teaching mechanism that consumes this curriculum: spaced repetition, corpus growth from live AI calls, adaptive/improved explanations, chat-based clarification, progress/gating logic
4. Writing module
5. Gamification layer
6. Speaking module
7. Reading module
8. Listening module

Each sub-project gets its own spec → plan → implementation cycle. This document covers **CEFR frameworks only**.

## Purpose

Build a complete, static, pre-authored curriculum — the full Track → Level → Milestone → Section → Lesson hierarchy for all three tracks (Generic, TELC, Goethe) across all five CEFR levels (A1–C1), with full text content (explanations, examples, and exercises) for all six skill areas. This is generated once, offline, by a developer-run script using AI, and shipped as seed data with the app. Sub-project #3 (Tutoring section) is the first consumer of this data — it adds the live, per-user mechanisms (scheduling, corpus growth, adaptive explanations) on top of what this sub-project builds.

## Scope

**In scope:**
- The full curriculum hierarchy: Track → Level → Milestone → Section → Lesson, independently structured per track.
- Full text content per lesson: explanation, examples, and a pre-generated exercise corpus (multiple choice, fill-in-the-blank, flashcard, free-text) — for all six skill tags (grammar, vocabulary, reading, listening, writing, speaking), text-only (no synthesized audio, no AI grading — those are added by later sub-projects on top of this content).
- Track-specific content overrides (a track can use different explanation/examples and/or different exercises for a shared concept when its real syllabus treats it differently).
- Explicit lesson prerequisites, captured during generation.
- A three-phase, resumable offline generation script producing seed data.
- A merge-capable seed loader (stable lesson IDs, upsert on app update, not just first-run load).
- Basic read-only API routes to browse the generated curriculum.
- An admin-only browse UI for QA, gated behind a small authentication addendum to Core (see below).

**Explicitly out of scope (deferred to sub-project #3, Tutoring section):**
- Spaced repetition scheduling and any per-user review algorithm.
- Assembling milestone tests at request time (this sub-project stores the exercise corpus only; #3 selects/mixes from it).
- Growing the exercise corpus from live user/AI interactions ("corpus building").
- Chat-based clarification and adaptive/improved explanations (both the per-user and global feedback loops).
- Actual lesson delivery UI, progress tracking, gating/redirect logic (e.g. redirecting a user to complete a newly-inserted prerequisite lesson after a content update — this sub-project only exposes the data needed to detect that case).
- TTS audio synthesis (Listening/Speaking sub-projects) and AI-based grading (Writing/Speaking sub-projects) — lessons for these skills get full text content now, audio/grading capability is layered on later.

## Authentication Addendum

Core shipped with no authentication ("local-only, single-user, no auth system"). This sub-project is the first to need a gated route (the admin browse UI), so it adds a small, scoped addendum to Core: simple password auth only (Google SSO deferred to a future public/multi-user phase — disproportionate OAuth setup for gating one local admin tool today). Implemented as an early task in this sub-project's plan, before the admin UI task.

- **Storage:** a new `admin_auth` table (`password_hash`, `created_at`). Password hashed with Node's built-in `crypto.scrypt` — no new dependency, consistent with how Core already handles crypto.
- **Sessions:** stateless, HMAC-signed HTTP-only cookie (signed with a server-side secret, following the same local-secret-file pattern as `lib/crypto/keyfile.ts`) — no session table, no cleanup job. Long-lived (e.g. 30 days, refreshed on activity), appropriate for a local single-user admin gate rather than a public system.
- **Gating mechanism:** NOT Next.js middleware — `middleware.ts` runs in the Edge Runtime, which lacks Node's `crypto` module, and introducing a second Edge-compatible crypto path just for this would be inconsistent with Core's existing Node-crypto-only approach. Instead, a shared `requireAdminSession()` check (in a new `lib/services/adminAuthService.ts`) is called at the top of each `/admin/*` page and each `/api/admin/*` route handler — the same per-route gating pattern Core's `app/page.tsx` already uses for the onboarding-completion redirect.
- **Flow:** visiting `/admin` with no `admin_auth` row yet shows a one-time "set admin password" form; once set, all `/admin/*` pages and `/api/admin/*` routes require a valid session cookie, redirecting to `/admin/login` otherwise.
- **Recovery:** if the password is forgotten, delete the `admin_auth` row directly (the developer already has full local DB access) — no email/SSO recovery flow needed at this scope.
- **Files:** `lib/services/adminAuthService.ts` (hash/verify password, sign/verify session cookie, `requireAdminSession()`), `app/api/admin/auth/route.ts` (setup/login/logout), `app/admin/login/page.tsx`.

Note: **only the `/admin/*` pages are gated.** The read-only curriculum data routes (see API Routes below) live under `/api/curriculum/*`, not `/api/admin/*`, and are intentionally ungated — sub-project #3 needs to call them for regular end-user features later, not just the admin browse UI. The admin UI is just one more consumer of that same public data API.

## Data Model (new SQLite tables, extending Core's DB)

- **`milestones`** — `id (stable slug), track, level, title, description, order_index`.
- **`sections`** — `id (stable slug), milestone_id, title, description, order_index`.
- **`lessons`** — `id (stable slug, e.g. "generic-a1-present-tense-regular"), skill (grammar|vocabulary|reading|listening|writing|speaking), title, explanation, examples (JSON), created_at`. This is the concept — its `id` is what Core's `memory_store` mastery entries key off (`entity_type: 'concept_mastery'`, `entity_key: lesson.id`). No `level` column — a lesson's level is wherever a track places it.
- **`lesson_placements`** — `id, lesson_id, section_id, order_index, created_at`. How a shared lesson is positioned into a specific track's structure. A lesson can have multiple placements (different tracks, potentially different relative positions). `created_at` (on both this table and `lessons`) is what lets sub-project #3 detect exactly which lessons/placements are new since a user's last sync (`curriculum_meta.last_synced_at`) — without it, #3 would only know "something changed," not what.
- **`lesson_track_overrides`** — `id, lesson_id, track, explanation, examples`. Presence of a row means this track uses this content instead of the lesson's canonical content.
- **`exercises`** — `id (stable slug, e.g. "generic-a1-present-tense-regular-mc-1"), lesson_id, track (nullable), type (multiple_choice|fill_blank|flashcard|free_text), content (JSON, shape per type — see below)`. `track = NULL` means shared across all tracks studying that lesson; non-null means track-exclusive.
- **`lesson_prerequisites`** — `lesson_id, prerequisite_lesson_id`. Concept-level, track-independent. Captured during master-pool generation. Consumed by sub-project #3's gating/sequencing logic.
- **`curriculum_meta`** — `seed_version, last_synced_at`. Lets the app detect "curriculum content changed since I last synced," which sub-project #3 needs to implement the described update-catchup behavior (redirecting a user to complete a newly-inserted prerequisite before returning them to their prior position).

**Exercise content JSON shapes:**
- `multiple_choice`: `{ question, options: string[], correctIndex }`
- `fill_blank`: `{ textWithBlank, correctAnswer, acceptableVariants?: string[] }`
- `flashcard`: `{ front, back }`
- `free_text`: `{ prompt, modelAnswer }`

Stable, slug-style IDs (not raw auto-increment integers) are used for `milestones`, `sections`, `lessons`, and `exercises` — for lessons specifically because mastery records and prerequisite edges key off lesson ID; for exercises because sub-project #3's future spaced-repetition tracking will key per-user item history off exercise ID, and a regeneration reassigning IDs would silently break "has this user already seen this exact item" tracking. A regeneration that meaningfully changes an existing exercise's content should mint a new stable ID rather than mutate the old one in place, so any history already recorded against the old ID stays valid and the item is treated as new.

## Content Generation Pipeline

A standalone, resumable script (`scripts/generate-curriculum.ts`, run via `tsx`, not part of the Next.js request path), in three phases:

1. **Master concept pool per level** — for each CEFR level (A1–C1), one generation pass produces a flat list of concepts (skill-tagged, grounded in official CEFR "can-do" descriptors) and their prerequisite relationships. These become `lessons` rows and `lesson_prerequisites` edges — content not yet written.
2. **Track structuring** — for each track × level, a pass arranges that level's relevant pool concepts into that track's own Milestone → Section tree, in pedagogical order. Generic draws on most/all of the pool, grounded only in general CEFR descriptors. TELC and Goethe passes rely on the model's own training knowledge of these well-documented, publicly known exams (no reference documents supplied/ingested) to ground their structure in the real exam format/syllabus, selecting and ordering concepts accordingly, and flagging (a) any exam-specific lesson that needs to be created fresh (e.g. "TELC formal letter format") and (b) any shared concept that needs a track-specific content or exercise override. Produces `milestones`, `sections`, `lesson_placements`, and any new track-exclusive lesson stubs. Granularity (how many milestones/sections/lessons) is AI-determined, not fixed by a template — the prompt gives loose guidance (a milestone should be a meaningful chunk of study, not a single lesson or an entire level) and the validation pass (below) flags structurally degenerate output (e.g. a milestone with one section, a section with a single lesson) for manual review rather than silently accepting it.
3. **Content generation** — for each lesson, generate the full explanation, examples, and exercise corpus (the generator determines the appropriate exercise-type mix per skill — e.g. flashcards for vocabulary, free-text for writing prompts). For lessons flagged in phase 2 as needing a track-specific variant, also generate the `lesson_track_overrides` content and/or track-specific exercises.

**Practical requirements:**
- Reuses Core's existing provider adapters (`lib/providers/*`) for consistency, but takes its own AI provider credentials directly (env var) — independent of any end-user's stored connection, since this runs once, by the developer, before the app ships.
- Must be **resumable**: on each phase, the script checks what's already been generated (by stable ID) and skips it, so a crash or rate-limit partway through a run of potentially thousands of AI calls doesn't require starting over.
- Output is committed as seed data, split per track+level (e.g. `data/curriculum-seed/generic-a1.json`, `telc-b1.json`, ...) rather than one monolithic file — at potentially thousands of lessons across 15 track×level combinations, a single file would be impractical to review or diff; per-track-level files also let a partial regeneration (e.g. fixing just TELC B1) produce a small, reviewable diff instead of touching one giant blob.
- Can be re-run later (to fix or extend content) — later runs produce an updated seed file, not a full regeneration, since already-generated IDs are skipped/preserved unless explicitly targeted for regeneration.
- A **validation pass** runs after generation completes: structural integrity checks (required fields present and non-empty, valid JSON shape per exercise type, referential integrity across `lesson_placements`/`lesson_track_overrides`/`lesson_prerequisites`) and a summary report (counts per track/level/skill, any flagged gaps) for the developer to review before shipping the seed file. This is a structural check only — no automated content-quality grading; quality review happens via the admin browse UI.

**Seed loading (app side):** the "load seed data into the DB" step is a merge/upsert, not a one-time "if empty, load." On every app start, it compares `curriculum_meta.seed_version` against the bundled seed files' version (all per-track-level files share one version number, bumped together); if newer, it upserts changed/added rows across all seed files by stable ID (inserting new `lesson_placements` into a track's existing order where needed) and updates `curriculum_meta`. This never touches a user's own progress data (Core's `memory_store`, profile, track/level settings), which lives in separate tables.

## API Routes (read-only)

Under `/api/curriculum/*` — ungated (see Authentication Addendum above), following Core's established pattern (thin routes wrapping a service layer, server-side DB access only):
- List tracks/levels.
- Get a track's Milestone → Section → Lesson structure (for a given level, or the whole track).
- Get a lesson's content (explanation, examples, resolved against any track-specific override) and its exercise corpus (track-specific exercises falling back to shared ones).

These are the full interface sub-project #3 needs to query curriculum data — it builds no query layer of its own for this. The admin browse UI below is just one more consumer of these same routes.

## Admin Browse UI

A small, admin-only section (`/admin/curriculum`) for QA-ing the generated content: browse tracks → levels → milestones → sections → lessons, read full lesson content and its exercise corpus, by calling the same `/api/curriculum/*` routes any other consumer would. Gated by `requireAdminSession()` (see Authentication Addendum above). Exists purely for manual review — no automated content-quality grading.

## Testing Approach

- **Schema/migrations**: unit tests verifying the new tables, following Core's `lib/db/client.test.ts` pattern.
- **Query/service layer**: unit tests against an in-memory DB with small fixture data — hierarchy traversal, track-override fallback (track-specific → canonical), exercise track-fallback (track-specific → shared), prerequisite lookups.
- **API routes**: integration tests hitting route handlers directly with a fixture-seeded temp DB, following Core's established pattern.
- **Generation script**: unit-tested with a mocked AI provider (reusing Core's `FetchLike` injection) to verify it correctly parses responses and persists the right relationships (placements, overrides, prerequisites), and that resumability correctly skips already-generated items by stable ID. Actual generated-content *quality* is a manual review step via the admin UI, not an automated test.
- **Seed loader/merge logic**: unit tests verifying upsert-by-stable-ID behavior — new lessons inserted correctly into existing track order, changed content updated, a user's separate progress data left untouched.
- **Admin UI**: component tests following Core's established pattern (RTL, mocked fetch).
- **`adminAuthService`**: unit tests for password hashing/verification (real `crypto.scrypt` round-trip, following the rigor of Core's `lib/crypto/encrypt.test.ts`) and session cookie signing/verification (valid signature accepted, tampered/expired cookie rejected).
- **Admin auth routes/gating**: integration tests for the setup-then-login flow, and that `requireAdminSession()` actually blocks an unauthenticated request to a protected `/admin/*` page or `/api/admin/*` route.
- **Manual verification**: after a real (or small pilot) generation run, spot-check content quality and coherence via the admin browse UI.

## Key Decisions Log

- Concept = Lesson, 1:1 — the same unit Core's shared mastery graph keys off, so mastery transfers between tracks exactly as Core's spec promised.
- Each track has its own independent Milestone/Section structure and ordering; lesson *content* is shared/referenced across tracks, not duplicated, unless a track-specific override is needed.
- Milestone tests are **not** pre-composed or stored by this sub-project — only the per-lesson exercise corpus is pre-built; #3's algorithm assembles a mixed test from it at request time.
- Curriculum content is generated once, offline, by a developer-run script — not generated live by end users' own connected providers.
- Granularity (how many milestones/sections/lessons per track/level) is AI-determined during generation, not fixed by a template — "as rich as required."
- Text-only content is built now for all six skill tags, including listening/speaking/writing, even though audio synthesis and AI grading aren't built until their respective later sub-projects — avoids having to backfill curriculum content later.
- Stable, slug-style IDs (not auto-increment integers) for milestones/sections/lessons, specifically to support safe content updates after initial ship without corrupting stored mastery/prerequisite references.
- Authentication addendum: password-only for v1 (Google SSO deferred to a future public/multi-user phase); Node's built-in `crypto.scrypt` and a stateless HMAC-signed session cookie, no new dependency and no sessions table; gated via a per-route `requireAdminSession()` check rather than Next.js middleware, since middleware runs in the Edge Runtime and lacks Node's `crypto` module — this keeps auth on the same Node-crypto approach Core already uses everywhere else.
- Curriculum data routes (`/api/curriculum/*`) are deliberately ungated and separate from `/api/admin/*` — sub-project #3 needs them for regular end-user features later, not just the admin browse UI, which is just one more consumer of the same routes.
- TELC/Goethe structuring relies on the AI's own training knowledge of these well-documented exams — no reference documents sourced/ingested. Manual review via the admin browse UI is the accuracy check, not automated grounding.
- `lessons` and `lesson_placements` carry `created_at`, so sub-project #3 can diff against `curriculum_meta.last_synced_at` to know exactly which lessons/placements are new after a content update, not just that something changed.
- Seed data ships as one file per track+level, not a single monolithic file — keeps partial regenerations reviewable and diffable at the scale this curriculum is expected to reach.
