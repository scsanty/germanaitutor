# Core Platform — Design Spec

## Product Context

This is the first of eight sub-projects that together make up the German AI Tutor WebApp — a local, single-user, gamified German-learning app with an emphasis on the Speaking module, and exam-format practice for TELC and Goethe alongside a Generic CEFR track. The full build order:

1. **Core** (this spec) — platform shell: BYOK AI provider connections, settings, onboarding, structured memory infrastructure
2. CEFR frameworks — A1–C1 curriculum/content structure for Generic, TELC, and Goethe tracks, including the shared concept-mastery schema
3. Tutoring section — the core teaching mechanism that uses those frameworks
4. Writing module (end-to-end)
5. Gamification layer
6. Speaking module (end-to-end) — including STT/TTS provider integration
7. Reading module
8. Listening module

Each sub-project gets its own spec → plan → implementation cycle. This document covers **Core only**.

## Purpose

Core provides the foundation every later sub-project depends on:
- Connecting to one or more AI providers under the user's own API keys (BYOK)
- Capturing user preferences (track, level, UI language) via onboarding and settings
- A generic, provider-agnostic structured memory store so learning continuity survives switching AI providers
- Local, encrypted persistence with no external services required

## Scope

**In scope:**
- Onboarding wizard (mandatory on first run)
- Settings UI covering provider connections, track/level, UI language, freestyle-mode default, backup/export/import, reset
- Provider abstraction layer for text-LLM calls (Anthropic, OpenAI, Gemini, Ollama)
- Encrypted local storage of API keys
- Usage tracking (requests/tokens per provider per day)
- Generic structured memory store (infrastructure only — no German-specific schema)
- Backup/export and import of local state

**Explicitly out of scope (deferred to later sub-projects):**
- STT/TTS provider integration (Speaking sub-project)
- The concept/mastery schema itself — what gets written into the memory store (CEFR frameworks sub-project)
- AI-driven placement quiz (future enhancement; self-select level for now)
- Actual lesson/tutoring content and UI (Tutoring section sub-project)
- Gamification (XP, streaks, achievements)
- Multi-user/multi-device support — this app is local-only, single-user by design

## Deployment Model

Local-only, single-user. No authentication system. Runs entirely on the user's own machine.

## Architecture & Stack

- **Frontend**: React/Next.js. Onboarding wizard and Settings share the same underlying form components.
- **Backend**: a small local Node server (Next.js API routes or a lightweight Express server) co-located with the frontend. All AI provider calls and all DB access happen server-side — the frontend never talks to providers or the DB directly. This keeps API keys off the client and means every later sub-project reuses the same provider-calling layer instead of reimplementing it.
- **Persistence**: local SQLite file (e.g. `better-sqlite3` or Prisma+SQLite).
- **Provider abstraction**: one internal interface (`generateText`, `listModels`, `testConnection`, etc.) with four adapters — Anthropic, OpenAI, Gemini, Ollama. STT/TTS adapters are explicitly not part of this interface; that's the Speaking sub-project's job.

## Data Model (SQLite)

- **`profile`** — singleton row: display name, UI language (`en`/`de`), active track (`generic`/`telc`/`goethe`), active CEFR level (A1–C1), freestyle-mode default.
- **`provider_connections`** — one row per configured provider (anthropic/openai/gemini/ollama): encrypted API key (or Ollama host URL), selected model, `is_active` flag, last-validated status/timestamp. Multiple providers can be configured simultaneously; exactly one is active at a time, switchable in settings (takes effect on the *next* session, not mid-session).
- **`provider_usage`** — daily rollup per provider: date, request count, token count (where the provider reports it). Powers an "approaching your limit" view in settings, supporting the user's stated need to switch providers based on daily limits.
- **`memory_store`** — generic structured memory infrastructure: typed entities/facts (`entity_type`, `key`, `value`, `updated_at`, `updated_by_provider`), queryable by type/key. This is what lets "any agent pick up after a provider switch" — whichever provider is active reads/writes structured facts here rather than relying on raw chat history. Core defines only the storage and read/write API; the CEFR frameworks sub-project defines what entity types actually get written (concepts, mastery state, notes, etc.).
- **Secrets**: a master encryption key generated on first run, stored in a restricted-permission file in the app's local data directory, outside the SQLite file and outside any git-tracked path. `provider_connections.api_key` is AES-256-GCM encrypted with it.

## Onboarding Flow (mandatory, first run)

1. Welcome screen
2. Connect a provider — pick provider type, enter API key (or Ollama host), pick model from the provider's available models, **test connection**. Onboarding cannot complete without at least one successfully validated provider connection.
3. Choose track (Generic / TELC / Goethe) + CEFR level (self-select, A1–C1; AI-driven placement quiz deferred to future work)
4. Choose UI language (en/de)
5. Done → lands on a placeholder home screen (no lesson content yet in this sub-project)

## Settings (revisit anytime)

- Provider connections: add/edit/remove, switch active provider, view daily usage stats, re-test a connection
- Track & level — switchable anytime; safe because mastery tracking is concept-based rather than track-based (concepts learned under one track are recognized under another), per the CEFR frameworks sub-project's future design
- UI language toggle
- Freestyle-mode default preference — freestyle is a toggleable practice mode (conversation/grammar/reading/writing/listening at the user's level, outside the active track's exam-format structure) that is scored but does **not** feed the shared concept-mastery graph, since it represents informal outside practice rather than the structured "school" track
- Backup/export (bundles the SQLite DB and the master key file into one archive) and import
- Reset app data (clear everything, start fresh)

## Error Handling

- Failed connection test: show the error inline (invalid key, unreachable Ollama host, etc.). The user may still save an unvalidated connection in case of a transient network issue, but onboarding's completion gate specifically requires at least one *validated* connection.
- If the currently-active provider starts failing during normal use (key revoked, quota exhausted, host unreachable), surface a persistent banner directing the user to Settings to fix or switch providers.
- Import of a backup archive validates its contents (DB + master key present, version-compatible) before overwriting local state, behind a confirmation prompt since it overwrites current local data.

## Testing Approach

- **Unit tests**: encryption/decryption roundtrip (AES-256-GCM), each provider adapter's request/response mapping (HTTP calls mocked), usage-stat rollup logic, backup archive bundling/validation logic.
- **Integration tests**: backend API routes — settings CRUD, provider connection save/test/switch-active, onboarding-completion gate (rejects finishing without a validated provider), backup export/import roundtrip (export then import into a fresh profile, verify state matches).
- **Manual/E2E**: full onboarding wizard happy path; onboarding with an invalid key (verify it blocks completion); settings changes persist across app restart; provider switch takes effect on next session, not mid-session; one real pass against an actual local Ollama instance (adapters are mocked elsewhere).

## Key Decisions Log

- Local-only, single-user — no auth system, no multi-device sync.
- Full-stack (frontend + local backend + SQLite), not a pure browser app — keeps API keys server-side and centralizes provider calls for reuse by later sub-projects.
- All four providers supported (Anthropic, OpenAI, Gemini, Ollama); multiple can be configured, one active at a time, user-switchable based on preference/daily limits.
- STT/TTS explicitly deferred to the Speaking sub-project to avoid over-building Core's provider interface prematurely.
- Structured memory store is generic infrastructure in Core; its content schema belongs to the CEFR frameworks sub-project.
- API keys encrypted at rest via a local master-key file (not OS keychain) — simpler, no native dependencies, acceptable for the local single-user threat model.
- Provider switching takes effect between sessions, not mid-session, to keep the mental model simple.
- Freestyle mode is scored but excluded from concept-mastery tracking — it represents informal outside practice ("what he learns from friends/YouTube/articles") versus structured track study ("what he learns at school").
