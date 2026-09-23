# Curriculum Admin Management — Design Spec

## Product Context

This extends sub-project #2 (CEFR frameworks). That sub-project's original design generated curriculum content via an in-app AI pipeline; that pipeline was later replaced with importing real, hand-authored YAML files (`curricula/*.yaml`, one per track × level), each track's lessons kept fully independent (own id, own content, own exercises) — see `docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md`, "Content Authoring & Import Pipeline" and "Key Decisions Log" for that history.

This spec covers the next step: **the DB becomes the sole, permanent source of truth for curriculum content, edited exclusively through a management UI added to the existing `/admin/curriculum` section** (currently browse-only). `curricula/*.yaml` and the one-time converter script that imported them are retired as part of this work — they did their job (bootstrapping 303 real lessons into the DB) and have no further role.

## Purpose

Give the admin (the same person as the app's only end-user, on this local single-user app) full CRUD over the curriculum — add, edit, delete, and reorganize lessons and the milestone/section structure they live in — plus two supporting mechanisms the rest of the app depends on being correct: prerequisite dependency management (with automatic repair on delete) and cross-track concept linking (recording that a lesson in one track covers the same ground as one or more lessons in another track, for a future sub-project's completion-sharing feature).

## Scope

This is a large feature set, split into three phases, each its own brainstorm → spec → plan → implementation cycle. **This spec covers Phase 1 only.**

**Phase 1 (this spec) — the foundational data-mutation layer:**
- Lesson CRUD: add, edit, delete, clone.
- Prerequisite management, with automatic dependency repair when a lesson with predecessors and/or dependents is deleted.
- Full milestone/section curation: create, rename, delete, reorder — including a reserved "Unsorted" safety bucket for lessons displaced by deleting a non-empty container.
- Cross-track concept linking: a manual (search-and-select) many-to-many pairwise tagging mechanism, replacing the single-column `concept_id` design from the prior spec (see "Key Decisions Log" for why).
- A read-only, interactive dependency diagram (one track+level at a time).
- Retiring `curricula/*.yaml` and `scripts/build-curriculum-seed.ts`.

**Phase 2 (deferred, future cycle) — AI-assisted authoring:**
- A new admin setting choosing which configured BYOK provider connection is used for authoring AI calls (separate from the end-user's active tutoring connection, reusing the same underlying `provider_connections`).
- **Generate** — one combined AI call producing explanation + examples + exercises for a lesson, editable before save, re-clickable on demand. Per a later clarification in the brainstorm that supersedes an earlier, more generic answer: **generating appends to the existing examples/exercises rather than replacing them** — the admin trims by deleting what they don't want, matching Phase 1's uncapped add/remove editor. Starting-point prompt shape volunteered during this brainstorm, to ground whenever Phase 2's prompts are actually designed: *"Act like a German teacher, teaching CEFR Level `<level>` for `<track>` and explain the topic `<title>`."*
- **Guess** — one combined AI call suggesting skill + prerequisites, informed by the other existing lessons in the same track+level.
- **Find Similar** — an AI-powered search of the other two tracks at the same level for candidate concept-link matches, feeding Phase 1's manual linking UI instead of requiring the admin to search by hand.

**Phase 3 (deferred, future cycle) — convenience & observability:**
- Global lesson search across all tracks/levels.
- A curriculum health panel (stray structural issues: empty milestones/sections, lessons with zero exercises, etc. — a live-UI descendant of the old, now-deleted `validate.ts`).
- Export-to-YAML (for reviewing the authoring format / backup) and import-from-YAML (upsert-only, for mass-uploading a batch of externally-authored lessons) — explicitly *not* a return to YAML being the source of truth; these are interop conveniences layered on top of a DB-authoritative model.

**Out of scope entirely (still sub-project #3, Tutoring section's job):** actually consuming any of this data for spaced repetition, gating, or progress/completion tracking. This spec's job is to let the admin *record* accurate prerequisite and concept-link relationships; interpreting them for a live learner is a different sub-project's concern.

## Data Model Changes

### `lessons`

Drop the `concept_id` column added in the prior spec cycle — it was never populated (no tagging UI existed yet) and its single-string-per-group design turned out to be wrong for real data (see "Key Decisions Log"). Since it holds no data, this is a safe in-place `ALTER TABLE lessons DROP COLUMN concept_id`.

Field mutability, enforced at the service/API layer (not all achievable as DB constraints):
- **Immutable after creation:** `id` (slug). Referenced by `lesson_prerequisites`, `lesson_placements`, `exercises`, and (new) `lesson_concept_links` — renaming it would mean cascading the rename everywhere; simpler and safer to require delete + re-add for that mistake.
- **Editable, but gated:** `track`, `source_level`. Changing either is rejected by the API if the lesson currently has any prerequisite edges (as dependent or predecessor) or any concept-links — those are all scoped to a specific track+level and would become nonsensical. The admin must clear them first (via the normal edit/untag actions), then change track/level, then re-add whatever's still relevant in the new track+level. Successfully changing track/level also clears the lesson's placement, and the same edit action must immediately pick a new section in the new track+level's structure (same requirement as Add — see "Unsorted" below).
- **Freely editable:** `title`, `explanation`, `examples`, `skill`, exercises, prerequisites (within the new track+level once set), placement (which section), concept-links.

**New id uniqueness rule, enforced at Add-time:** the DB id is `{level}-{slug}` (same level-namespacing the import script already used to resolve a real collision it found — see the prior spec). This must be unique **globally, across all three tracks**, not just within the track being added to, since all lessons live in one shared `lessons` table. The Add form takes the bare slug (matching what an admin would see in a YAML file) and the level from the form's own level field; the API derives and validates the full id server-side.

### `lesson_placements`

Add a `UNIQUE(lesson_id)` constraint (a lesson now belongs to exactly one section, full stop — the old multi-placement support existed only because one lesson used to be shared across tracks, which no longer happens). This requires an in-place, **data-preserving** rebuild: create a new table with the constraint, copy existing rows across, drop the old table, rename the new one into place — not the "drop and recreate empty" pattern the prior migration used for the `lessons.track` change. That pattern is no longer acceptable for curriculum tables now that they hold irreplaceable admin-authored content instead of YAML-re-importable content (see "Key Decisions Log").

Every track+level gets one reserved, non-deletable **"Unsorted"** milestone (id `{track}-{level}-unsorted`) containing one reserved, non-deletable section — ensured to exist (idempotent create-if-missing) whenever that track+level's structure is loaded in the admin UI. It exists solely to catch lessons displaced by deleting a non-empty milestone/section; **it is never a selectable destination when adding a new lesson** — Add always requires picking (or inline-creating) a real milestone and section. An already-existing lesson's "move to a different section" action *may* target Unsorted, if the admin deliberately wants to shelve something there.

### `milestones` / `sections`

No schema change. Semantics change: no longer "one per skill, fixed" — full admin CRUD (create/rename/delete/reorder within their parent) via this feature. `order_index` on both remains meaningful and admin-controlled. Deleting a non-empty milestone or section relocates its lessons to that track+level's Unsorted bucket as part of the same delete action — delete always succeeds, nothing is ever blocked or silently cascade-deleted. Unsorted itself rejects delete attempts.

**Unsorted is excluded from normal reordering** and always renders last among a track+level's milestones — it's a system safety bucket, not something the admin curates the position of. It's left out of both the reorder UI (not draggable alongside real milestones) and the reorder API's accepted id list.

**Extending the same "show the blast radius" principle from lesson delete (not explicitly discussed, flagging the extension rather than assuming silently):** deleting a milestone confirms by naming every section and lesson it contains that's about to move to Unsorted, and a section delete names the lessons moving. No repair algorithm or cascade wizard is needed here (moving to Unsorted isn't destructive — nothing is deleted, no edges change), so this is a single static list, not a multi-step wizard like the lesson-delete flow.

**Lessons within a section have no order** (`lesson_placements.order_index` still exists as a column — new placements just auto-append — but nothing in this feature exposes reordering it). The reasoning volunteered mid-brainstorm and worth recording: a lesson's actual sequencing constraint is its prerequisites ("cannot start without finishing prerequisites successfully"), not its position in a list — that's sub-project #3's future gating concern, and it's *why* manual lesson-within-section ordering isn't a feature here. Levels (A1–C1) already have a fixed natural order everywhere in the app; nothing new needed for that.

### `lesson_prerequisites`

No schema change. New behavior: validated acyclic at write-time — adding an edge that would create a cycle (in either the manual prerequisite-picker on the lesson edit form, or as a side effect of the delete-repair algorithm reconnecting edges) is rejected with an error naming the cycle.

### `lesson_concept_links` (new table)

```sql
CREATE TABLE lesson_concept_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_a_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  lesson_b_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lesson_a_id, lesson_b_id)
);
CREATE INDEX idx_lesson_concept_links_a ON lesson_concept_links(lesson_a_id);
CREATE INDEX idx_lesson_concept_links_b ON lesson_concept_links(lesson_b_id);
```

A plain many-to-many pairwise table — no "concept group" or shared identifier at all. This replaces the single-column `concept_id` design from the prior spec, which broke on a real case surfaced during this brainstorm: `generic`'s A2 content has two separate lessons (`perfekt-haben-regular`, `perfekt-sein-movement`) that `goethe`/`telc` each cover in one combined lesson. Tagging generic's single combined-concept lesson to *both* of those would, under the old single-`concept_id` design, incorrectly make the two `generic` lessons look like "the same concept as each other" too (since they'd share one ID) — they aren't. A pairwise table sidesteps this entirely: linking X↔Y and X↔Z are two independent rows; Y and Z are never implicitly connected through X.

Consequences of dropping the group model: no "mint new / join existing / merge two groups" logic needed — tagging is just "insert or delete one row." No "stray tag" case either — a link row always connects exactly two lessons by definition (present or absent, nothing in between), and it's cleaned up automatically by the `ON DELETE CASCADE` when either lesson is deleted, same as exercises and placements already are.

**Validated at write time:** `lesson_a_id` and `lesson_b_id` must be different tracks (a lesson "matching" another lesson in its own track isn't a meaningful action here) and the same level (concept-linking is about the same level's content authored differently per track, not cross-level equivalence). Store canonically with `lesson_a_id < lesson_b_id` (or similar deterministic ordering) so a link and its reverse are never both insertable as distinct rows.

### `lesson_track_overrides`

Untouched, remains the deprecated/unused vestigial table from the prior spec cycle — nothing in this feature reads or writes it.

### `exercises`

**Exercises have no order within a lesson** — they're just tagged to it and can display in any order (no `order_index`, no reorder feature, no reorder API). This simplifies most of what an earlier pass of this spec proposed here; the one piece that's still genuinely needed, for an entirely separate reason, is fixing how exercise ids are assigned:

**Stop deriving exercise ids from position.** The import-time scheme (`{lessonId}__ex{index}`, index = position in the YAML file) was fine for write-once content but breaks the moment exercises are freely added/removed through this admin UI: if ids are recomputed from array position every time the list is saved, deleting one exercise would silently rewrite every other exercise's id that happened to shift — corrupting the "stable id across edits" guarantee the original CEFR-frameworks spec explicitly called for (needed later for per-user item-history tracking), even though no "order" is being changed, only membership. The fix: a **newly added** exercise gets a fresh id with a random, non-positional suffix (e.g. `{lessonId}__ex-{6-char random}`), assigned once at creation and never recomputed for any reason. Editing an existing exercise's content **in place keeps its id** (this is manual, deliberate admin editing — fixing a typo or refining a question — not the bulk AI regeneration the original spec's "mint a new id on meaningful change" principle was written for; that principle still applies to Phase 2's Generate, not to hand-editing). Deleting an exercise removes its id permanently (never reused, and never causes any other exercise's id to change). No migration needed for *existing* exercise ids — they stay exactly as imported, cosmetically position-shaped but functionally just opaque stable strings from here on; this only governs ids minted for anything added going forward.

**How the editor persists this:** the lesson create/update payload includes the exercises editor's complete current set (each entry carrying its id if it already has one, or none if newly added in this editing session). The server reconciles against what's currently stored for that lesson: an incoming entry with a known id updates that row's content in place; an incoming entry with no id inserts a new row with a freshly minted id; any currently-stored exercise **not** present in the incoming set is deleted. One mechanism handles add, remove, and in-place edit together — there's no separate per-exercise API call, and no ordering to track through any of it.

## Dependency Repair Algorithm (on lesson delete)

Given lesson B is being deleted, with predecessors `pre(B)` (B's own prerequisites) and dependents `dep(B)` (lessons that require B):

```
for each C in dep(B):
    remove edge (C requires B)
    for each A in pre(B):
        add edge (C requires A)   -- skip if it already exists (dedupe)
remove B's own prerequisite edges (pre(B))
-- B's placement and exercises are removed by existing ON DELETE CASCADE
-- B's lesson_concept_links rows are removed by the new table's ON DELETE CASCADE
```

- `pre(B)` empty → dependents simply lose the edge to B, nothing to reconnect to.
- `dep(B)` empty → nothing to repair, B's own prerequisite edges are just removed.
- Both empty → trivial delete.

**Concept-link cascade and the shape of the delete flow:** this is a decision tree, not a single fact — accepting the offer to also delete a linked lesson can reveal *that* lesson's own links, which need their own offer, and so on. So the preview/confirm flow is a **step-by-step wizard, not one upfront computation**:

1. The UI requests lesson B's own preview: its repair effects (edges added/removed per the algorithm above) plus the lessons it's directly concept-linked to (not their cascades).
2. The admin reviews B's repair preview and decides, for each directly-linked lesson, whether to also delete it.
3. Each accepted one is added to a running "to delete" set, and the UI immediately requests *that* lesson's own preview the same way (step 1 again, for it) — recursing one level at a time as the admin makes decisions. A declined one is left alone entirely (once B is actually deleted, its now-dangling link row to B is removed by the table's `ON DELETE CASCADE`, but the lesson itself is untouched).

   **The client tracks every lesson already shown as a candidate this wizard session (accepted or declined) and filters each new preview's linked-lesson list against it before displaying anything.** Concept-links have no built-in tree/acyclic constraint — B↔D, D↔F, F↔B is a perfectly valid set of three separate pairwise links — so without this, the same lesson could be re-offered after already being decided (at minimum confusing, at worst an unbounded loop through a link cycle). This is purely client-side bookkeeping; the server's per-lesson preview endpoint stays simple and doesn't need to know about the wizard's history.
4. Once the admin has resolved every offer, one **single execute call** deletes the entire accumulated set (B plus every accepted lesson) as **one DB transaction** — either all of it commits or none does, never a partially-applied cascade. Since concept-links only ever connect different tracks, and prerequisites never cross tracks, each lesson in the final set repairs its own track+level's edges independently — there's no interaction between the repair passes even though they're committed together.

This is a destructive, hard-to-reverse action that can touch lessons the admin isn't currently looking at, which is why each step shows its real effects rather than a bare "are you sure."

## Lesson CRUD

**Add:** slug (bare, level-prefixed automatically — see "Data Model Changes" above), track, level, skill, title, explanation (multi-line text), examples (repeatable string list, add/remove freely, no min/max), exercises (structured per-type editor — see below, add/remove freely, no order, no min/max), prerequisites (multi-select restricted to other lessons already in the same track+level), concept-links (search-and-select restricted to same level/different track — see "Concept Linking" below), and a required milestone/section placement: a milestone dropdown listing every real milestone in that track+level plus an inline "+ Create new milestone" option, then the same pattern for section within the chosen milestone. Unsorted is never offered here.

**Edit:** everything from Add except `id`, which is fixed. Editing track/level is subject to the gating rule in "Data Model Changes."

**Delete:** runs the algorithm above, behind the step-by-step preview wizard described there.

**Clone:** duplicates an existing lesson's content (title, explanation, examples, exercises, skill) into a fresh Add-form draft — track/level/prerequisites/placement/concept-links are *not* copied (they're either identity-specific or track+level-scoped in ways that wouldn't make sense to duplicate blindly) — for starting a new track's version of a concept that's already well-written elsewhere. The slug field is pre-filled with a suggested variant (e.g. `{original-slug}-copy`) rather than left blank, since the original's slug can't be reused (ids are globally unique) — editable before save like everything else in the draft. **No dedicated API route needed:** Clone is purely a client-side action — fetch the source lesson via the existing read-only `GET /api/curriculum/lessons/:id`, pre-fill the same Add form the "+ New Lesson" action would open, and submit through the normal create endpoint like any other new lesson. The copied exercises carry no id into the draft (same as any newly-added exercise), so the reconciliation logic in "Data Model Changes" → `exercises` mints fresh ids for all of them automatically on save.

**Structured exercise editor:** exercises are added/removed individually (no order to manage — see "Data Model Changes" → `exercises`); each has a type selector (`multiple_choice` | `fill_blank` | `flashcard` | `free_text`) that reveals the right fields for that type (matching the shapes already defined in the CEFR frameworks spec: `{question, options[], correctIndex}`, `{textWithBlank, correctAnswer, acceptableVariants?}`, `{front, back}`, `{prompt, modelAnswer}`). No count is enforced in either direction. Deliberately built this way (not a raw JSON textarea) so Phase 2's Generate button can populate the same editor for review, rather than needing a different UI later.

**Add flow and inline milestone/section creation, made atomic:** the placement picker's milestone and section pickers are each independently "pick existing or create new," so three combinations reach the server: fully existing, existing milestone with a brand-new section, or a brand-new milestone (which always creates its first section alongside it, since a just-created milestone has none yet). Whichever new pieces are involved, the create payload carries them as an inline spec instead of an id (see "API Routes" → the `placement` shapes), and the server creates the milestone/section and the lesson together in **one transaction**. This avoids a multi-request version of this flow ever leaving an empty, orphaned milestone/section behind if the lesson half of it failed (e.g. a validation error, or a slug collision caught server-side).

## Concept Linking

A section on the lesson Add/Edit form (not a separate screen): shows every lesson currently linked to this one (each with an "Unlink" button), plus an "Add link" control — search/select restricted to the same level, a different track. Confirming inserts one `lesson_concept_links` row (rejected server-side if same-track or cross-level, or if the pair already exists). "Unlink" deletes that one row. No group semantics, no merge action, no sweep — see "Data Model Changes" for why.

## Dependency Diagram

One track+level at a time, read-only, custom SVG (no new dependency — appropriate at this scale, max ~23 lessons per track+level, mostly shallow 0–2-deep prerequisite chains). Shows **every** lesson in that track+level regardless of which milestone/section (including Unsorted) it's placed in — prerequisite edges aren't structurally scoped, so the diagram isn't either. Concept-links are cross-track by definition and don't appear in this single-track+level view.

**Layout:** topological layering. A lesson's column = 1 + (max column among its prerequisites); lessons with no prerequisites start at column 0. Lessons within a column stack vertically. Arrows drawn prerequisite → dependent.

**Interaction:** each node is a small card (title + skill tag). On hover, an "Edit" button overlays the card, linking to that lesson's edit form. Otherwise fully read-only — no drag-to-connect; edges only change as a side effect of the lesson editor's prerequisite picker or a delete's repair.

## API Routes

New, all under `/api/admin/curriculum/*`, gated by the existing `requireAdminSession()` (same pattern as current `/admin/*` / `/api/admin/*`). The existing read-only `/api/curriculum/*` routes are untouched.

- `POST /api/admin/curriculum/lessons` — create. Body includes the full exercises set (server mints ids for all of them, see "Data Model Changes" → `exercises`) and a `placement` matching the three combinations the Add form actually offers: `{sectionId}` (fully existing), `{milestoneId, newSectionTitle}` (existing milestone, new section), or `{newMilestoneTitle, newSectionTitle}` (both new) — whichever new pieces are given are created atomically alongside the lesson.
- `PATCH /api/admin/curriculum/lessons/:id` — update (content, skill, prerequisites, placement, track/level-with-gating). Body's exercises set is reconciled against current storage (update-in-place by id / insert new / delete missing — see "Data Model Changes" → `exercises`), same three-shape `placement` and inline-creation support as create.
- `GET /api/admin/curriculum/lessons/:id/delete-preview` — read-only, no side effects. Returns **this one lesson's own** repair effects (edges to be added/removed) plus the lessons it's directly concept-linked to — not a transitive walk of the whole cascade. The UI calls this once per wizard step, recursing into each accepted linked lesson's own preview (see "Dependency Repair Algorithm").
- `DELETE /api/admin/curriculum/lessons` — body is the full accumulated set of lesson ids to delete (the original lesson plus every cascade offer the admin accepted across the wizard). Executes the whole set as one transaction: all repairs + deletions commit together, or none do.
- `POST /api/admin/curriculum/lessons/:id/links` / `DELETE /api/admin/curriculum/lessons/:id/links/:otherId` — concept-link add/remove.
- `POST /api/admin/curriculum/milestones`, `PATCH` / `DELETE /api/admin/curriculum/milestones/:id`, `PATCH /api/admin/curriculum/milestones/reorder` (body: an ordered list of milestone ids — always scoped to one track+level, since that's the only unit the admin UI ever displays/reorders at once; excludes Unsorted, which is pinned last rather than reorderable — see "Data Model Changes" → `milestones`/`sections`) — and the equivalent four for `sections` (reorder scoped to one milestone's sections).

## Admin UI Structure

Extends the existing `/admin/curriculum` tree (currently browse-only):
- The track+level structure view gains milestone/section create/rename/delete/reorder controls, plus a "Diagram" tab alongside the existing tree view.
- The lesson detail page gains "Edit," "Delete," and "Clone" actions.
- A shared lesson editor component (used by both Add and Edit) contains: metadata fields, the structured exercise editor, the prerequisite picker, the concept-linking section, and the placement picker (milestone/section, with inline-create).

## Migration Note (important — reversal of prior practice)

The prior spec cycle's schema migration (`migrateLegacyCurriculumSchema`, for the `lessons.track`/`concept_id` addition) used a **drop-and-recreate-empty** strategy for the curriculum tables, safe at the time because the YAML files were still the recoverable source of truth. **That pattern must not be reused for the changes in this spec.** Once `curricula/*.yaml` is deleted and the DB is the only copy of admin-authored content, a migration that drops and recreates a curriculum table would be permanently destructive. This spec's two schema changes are both designed to be non-destructive instead, run together in one transaction (same reasoning as the prior migration's transaction-wrapping, so a concurrent reader never observes a partially-migrated state):
- `lessons.concept_id` removal: in-place `ALTER TABLE ... DROP COLUMN` (supported by the SQLite version better-sqlite3 bundles), preserving every other column's data.
- `lesson_placements` uniqueness: the standard SQLite rebuild-with-copy pattern (new table with the constraint → copy rows → drop old → rename) — preserves every existing placement row; only fails loudly (constraint violation on copy) if the "every lesson already has at most one placement" assumption this migration relies on turns out to be false, which is expected to be safe given nothing has ever created a second placement for one lesson.

`exercises` needs no schema migration at all — its id-assignment fix (see "Data Model Changes" → `exercises`) only changes how ids are minted for exercises added from now on; existing rows are untouched.

Going forward, any future curriculum-table schema change must use a data-preserving migration, not drop-and-recreate.

## Cleanup (in scope for this phase)

- Delete `curricula/*.yaml` (15 files — fully imported already, DB is now authoritative) and `scripts/build-curriculum-seed.ts` (+ its `npm run build-curriculum-seed` script entry).
- `docs/curriculum-content-authoring-prompt.md` stays — still useful reference for the lesson-content shape even without a YAML pipeline consuming it, and will matter again if Phase 3's import-from-YAML is ever built.
- Add a short pointer in `docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md`'s "Cross-Track Concept Linking" section noting that its single-`concept_id`-column mechanism is superseded by this spec's `lesson_concept_links` table, so the two documents don't silently disagree.

## Testing Approach

Following the project's established Vitest + Testing Library conventions:
- **Dependency repair**: unit tests on the pure algorithm — simple 1-in/1-out, fan-out/fan-in (multiple predecessors × multiple dependents), dedup (a dependent already has a direct edge to one of the deleted lesson's own prerequisites), leaf deletion (no prerequisites), root deletion (no dependents), isolated lesson (neither), and cycle rejection on manual edge addition.
- **Concept linking**: insert/delete a link row; reject same-track; reject cross-level; reject duplicate pair; cascade-delete on either lesson's removal (via FK, verify no orphan rows).
- **Milestone/section CRUD**: create/rename/reorder; delete-with-lessons correctly relocates everything to Unsorted (including nested — a milestone with multiple sections, each with lessons); Unsorted itself rejects delete; ensure-Unsorted-exists is idempotent.
- **Lesson CRUD**: create requires a real (non-Unsorted) section and globally-unique `{level}-{slug}` id (reject a collision against *any* track, not just the current one); update; track/level change is rejected while prerequisites/dependents/links exist, succeeds and clears placement otherwise; delete wired end-to-end to the repair + cascade-offer algorithm; all three `placement` shapes (existing section, existing milestone + new section, fully new) each tested, and each new-piece variant is atomic (a failure partway through leaves neither the lesson nor the new milestone/section behind).
- **Milestone reorder excludes Unsorted**: a reorder call's id list never includes it, it always renders last regardless of the other milestones' order, and attempting to include its id in a reorder payload is rejected.
- **Exercise reconciliation**: the core case this whole mechanism exists for — editing an existing exercise's content in place keeps its id; adding a new exercise mints a fresh non-positional id; omitting a previously-stored exercise from the payload deletes it *without* changing any other exercise's id (the specific bug this design avoids); a mixed payload (some kept/edited, one new, one removed) produces exactly the expected end state in one call.
- **Migration**: the `lessons.concept_id` drop and the `lesson_placements` uniqueness rebuild are both verified to preserve existing row data (seed a DB with the pre-migration shape and real rows, run the migration, assert the rows are intact) — a stronger bar than the prior migration's tests, given the "must not be destructive" requirement above.
- **Admin API routes**: integration tests per route (session-gated like existing `/api/admin/*`, correct status codes/effects); specifically for delete, that each wizard-step `GET .../delete-preview` call matches what the batch `DELETE` actually does once that accumulated set is executed, and that the batch delete is atomic — a failure partway through (e.g. a constraint violation on one lesson in the set) leaves the DB completely unchanged, not partially deleted.
- **Delete wizard dedup**: a concept-link triangle (B↔D, D↔F, F↔B) is walked through the full wizard flow and asserted to ask about each lesson exactly once, never re-offering B (or D, or F) once it's already been decided.
- **Diagram layout**: the topological-column-assignment function tested as a pure function, separate from rendering.
- **Admin UI components**: RTL tests for the lesson editor (including the structured exercise sub-editor), milestone/section management controls, and the diagram, following Core's mocked-fetch convention.

## Key Decisions Log

- **`concept_id` single column → `lesson_concept_links` pairwise table.** The original design (prior spec cycle) assumed cross-track concept equivalence was always a clean grouping. A real case in the actual imported content — `generic`'s A2 splits Perfekt-tense instruction into two lessons (`perfekt-haben-regular`, `perfekt-sein-movement`) where `goethe`/`telc` each use one combined lesson — breaks that assumption: the combined lesson needs to link to *both* of the split ones, without those two split lessons becoming falsely linked to each other. A plain many-to-many table has no such failure mode and is simpler to reason about (no minting/joining/merging/sweeping), at the cost of losing a build-then-discard "group" mental model that turned out not to fit the real data anyway.
- **Migration strategy must change from drop-and-recreate to data-preserving**, because this spec is precisely the point where curriculum data stops being YAML-recoverable and starts being DB-authoritative and irreplaceable. Documented prominently (its own section above) so it isn't lost or accidentally reversed in a future change.
- **Lesson position within a section is deliberately not a feature.** Raised mid-brainstorm: the real sequencing constraint is prerequisites ("cannot start without finishing prerequisites"), which is sub-project #3's future gating concern — building manual reordering here would be solving a problem prerequisites already solve, for no benefit.
- **Track/level are editable, unlike the lesson id** — chosen over the initially-recommended "lock everything" option specifically because slug/id renames have wide fan-out (every referencing row) while track/level changes are cleanly containable by requiring prerequisites/links to be cleared first.
- **Delete is a step-by-step preview wizard, not a single precomputed preview** — the cascade is a genuine decision tree (accepting one linked lesson's deletion can reveal further links needing their own decision), so a single upfront "here's everything" payload can't actually be computed before the admin has made those decisions. Each step previews just that one lesson's own effects; the whole accumulated set executes as one atomic transaction at the end. Chosen over a bare "are you sure" because repair/cascade effects reach beyond the lesson currently on screen, and a destructive action with invisible blast radius is worse than the extra UI work.
- **No caps on examples/exercises**, and Phase 2's future Generate action is documented to *append* rather than replace — both volunteered mid-brainstorm, the second one explicitly correcting an earlier, more generic answer in the same conversation ("re-generate... overwrites") that would otherwise have been the recorded decision.
- **Phased rather than one large spec**: the full feature set as originally described (CRUD + 3 AI-assist actions + cascading delete + full structure curation + diagram + global search + health panel + YAML import/export) is comparable in size to a whole sub-project. Splitting it lets Phase 1 (the foundational, everything-else-depends-on-it layer) ship and stabilize before layering AI-assist and convenience features on top of it.
- **Exercise ids must stop being positionally derived — but exercises don't need an explicit order at all.** Found during a third gap-hunting pass, by checking the spec's exercise-editing requirements against the actual current schema rather than just against the conversation record — the table has no ordering column today, and its id scheme happens to encode YAML-import position, which masked the real issue. First fix attempt added an `order_index` column; corrected immediately after by the explicit statement that exercises have no order within a lesson at all — they're just tagged to it, displayable in any order. That removed the ordering machinery entirely, but the *underlying* id-stability problem it was tangled up with is still real and independent of ordering: recomputing an id from array position on every save would still rewrite other exercises' ids whenever one is added or removed, even with no order to speak of. Fixed by minting each exercise a random, non-positional id once at creation, kept stable through every future edit/add/remove of *other* exercises on the same lesson. This also simplified Clone down to a pure client-side action — no dedicated API route was ever actually necessary, since the source content is already reachable via the existing read-only endpoint.
- **Placement API had to be widened to three shapes, not two.** Found during a fourth gap-hunting pass: the UI description (milestone picker and section picker each independently "pick existing or create new") already implied three valid combinations, but the API section only defined two (`sectionId`, or both-new), silently disallowing "existing milestone, brand-new section" — something the UI text promised but the API couldn't actually do. Confirmed with the user rather than assumed, since the "obviously correct" fix pattern bit once already this session (the exercise-ordering false start above); resolved by widening the API to `{sectionId} | {milestoneId, newSectionTitle} | {newMilestoneTitle, newSectionTitle}` rather than narrowing the UI.
- **"Unsorted" is pinned last, excluded from milestone reordering entirely** — a system safety bucket isn't something the admin curates the position of; confirmed explicitly rather than left as an unstated assumption, since nothing earlier in the spec addressed it either way.
- **The delete wizard must track its own history and filter against it.** Found during a fifth pass, by tracing a full delete journey step by step rather than re-reading the spec section by section. Concept-links have no acyclic constraint (unlike prerequisites, which are explicitly validated acyclic) — a triangle of three separate pairwise links is entirely valid — so a naive recursive wizard could re-offer an already-decided lesson, or in principle loop through a cycle indefinitely. Fixed as pure client-side bookkeeping (track everything already shown, filter future candidates against it); no server/API change needed. Two other angles chased during this same pass — whether multiple same-track-level lessons pulled into one batch via separate concept-link paths could break the repair algorithm depending on processing order, and whether the migration's mixed `ALTER`+rebuild-with-copy could safely share one transaction — were both checked closely and confirmed to already be correct as specified (the repair algorithm is order-independent because each step queries live graph state rather than a precomputed snapshot).
