# Graph Report - GermanLearner  (2026-10-21)

## Corpus Check
- 873 files · ~1,459,926 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3742 nodes · 11577 edges · 145 communities (134 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 317 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d7ed4332`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- react
- closeDb
- getDb
- Tutoring Phase 1B Teaching Loop Plan
- extract-wortlisten.ts
- localizedText.ts
- LessonPage.tsx
- backup/route.test.ts
- createProviderService
- DeleteLessonWizard
- App-wide Design Pass Implementation Plan
- lessonChatService.ts
- 2026-09-24-tutoring-section-design.md
- ExerciseCard.tsx
- Curriculum Admin Management (Phase 1) Implementation Plan
- attemptService.ts
- createDeckService
- testOutStatus.ts
- audio-content-checks.ts
- curriculumExportService.ts
- providers/types.ts
- practiceService
- delayedResponse
- createFreestyleService
- curriculumSeedLoader.ts
- practiceGeneration.ts
- LessonEditorForm.tsx
- audioService.ts
- audio_core.py
- deckService.ts
- ReadingTaskFields.tsx
- AppShell.tsx
- admin/audio/routes.test.ts
- package.json
- ExamPracticeAdmin.tsx
- lessonAdminService.ts
- notificationService.ts
- Curriculum + Admin Auth SQLite Schema (9 tables)
- createAttemptService
- createTestOutService
- vitest
- SpeechError
- GermanLearner Kanban board
- lessonAnswers.ts
- errorLogService.ts
- progressService.ts
- examPracticeService.ts
- devDependencies
- SettingsPage
- a11y.test.tsx
- placementService.ts
- AppShell.test.tsx
- Freestyle and Vocabulary Deck Implementation Plan
- compilerOptions
- components.json
- levelGating.ts
- createTeilSetService
- practiceService.ts
- CefrLevel
- next-intl
- teilSetService.ts
- curriculumStructureService.ts
- placementExamFormat.ts
- createProfileService
- Shared Teil exam-part engine
- DeckReview.tsx
- AdminNav.tsx
- app/layout.tsx
- DependencyDiagram.tsx
- worker.ts
- test_core.py
- placementService.test.ts
- speechProvider.ts
- dependencies
- Reading Module and Teil Engine Implementation Plan
- mailService.ts
- Find Skills (skill)
- LessonPage.test.tsx
- merge-lesson-exercises.ts
- aiService.test.ts
- FreestyleSession.tsx
- speechAvailability.ts
- TestOutPage.test.tsx
- Bilingual Content Implementation Plan
- Speaking Module Plan
- createPlacementService
- mistakes/route.ts
- OnboardingWizard.tsx
- memoryStore.ts
- build-icons.ts
- app/page.tsx
- contentCheck.ts
- themeTokens.test.ts
- createPracticeAdminService
- gating.ts pure gating rules
- NaDoch! brand identity: blue-teal bubble with orange exclamation
- TrackLevelStructure
- @testing-library/react
- adminAuthService (password hash/verify, session tokens)
- createExamPracticeService
- placementScoring.ts
- AudioActions
- onboarding/page.tsx
- Accounts & Hosting Plan
- RenderWithFakeFfmpegTest
- placement/routes.test.ts
- VoiceManifestTest
- merge-teil-sets.ts
- 2026-09-29-accounts-hosting-design.md
- audioService.test.ts
- levels.ts
- ServerTest
- defaultKeyFilePath
- UmlautRow.tsx
- SystemSettingsAdmin.test.tsx
- RequestBodyTest
- examPracticeService.test.ts
- next.config.js
- scripts
- merge-lesson-exercises.test.ts
- practice-review/page.tsx
- Level Exams Plan
- catalogs.test.ts
- allowScripts
- ExerciseEditor.tsx
- build-logo.ts
- ExerciseCard.test.tsx
- Flashcards only in vocabulary lessons rule
- next-env.d.ts
- ExamPracticeAdmin.test.tsx
- 2026-09-29-design-pass-design.md
- backupService.ts
- FfmpegArgsTest
- ParseRenderRequestTest
- Bilingual en/de content model
- merge-teil-sets.test.ts
- ConceptLinkSection.test.tsx
- TeilSetEditor.tsx
- CurriculumTree.test.tsx
- manifest.ts
- LessonChat.test.tsx
- Speech sidecar
- QueuePage

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 244 edges
2. `vitest` - 235 edges
3. `cn()` - 148 edges
4. `react` - 103 edges
5. `createDbClient()` - 97 edges
6. `CefrLevel` - 91 edges
7. `createProfileService()` - 79 edges
8. `isAdminSessionValid()` - 77 edges
9. `Track` - 68 edges
10. `better-sqlite3` - 66 edges

## Surprising Connections (you probably didn't know these)
- `App icon SVG (D! speech bubble)` --semantically_similar_to--> `PWA icon 512`  [INFERRED] [semantically similar]
  app/icon.svg → public/icons/icon-512.png
- `NaDoch! logo (design source)` --semantically_similar_to--> `NaDoch! logo (public brand asset)`  [INFERRED] [semantically similar]
  docs/design/nadoch-logo.svg → public/brand/nadoch-logo.svg
- `jobStatus()` --calls--> `getDb()`  [EXTRACTED]
  app/api/admin/audio/routes.test.ts → lib/db/client.ts
- `addJob()` --calls--> `getDb()`  [EXTRACTED]
  app/api/backup/route.test.ts → lib/db/client.ts
- `RootLayout()` --indirect_call--> `getDb()`  [INFERRED]
  app/layout.tsx → lib/db/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Admin authentication flow (password auth addendum)** — docs_superpowers_plans_2026_09_20_cefr_frameworks_session_secret, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_auth_service, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_session_helper, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_auth_api_route, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_login_component [EXTRACTED 1.00]
- **Coded API errors to translated client text** — docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_error_codes, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_errors_catalog, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_use_api_error_text [EXTRACTED 1.00]
- **Provider adapters implementing common interface** — docs_superpowers_plans_2026_09_20_core_platform_anthropic, docs_superpowers_plans_2026_09_20_core_platform_openai, docs_superpowers_plans_2026_09_20_core_platform_gemini, docs_superpowers_plans_2026_09_20_core_platform_ollama, docs_superpowers_plans_2026_09_20_core_platform_adapter_iface [EXTRACTED 1.00]
- **Curriculum content query and browse pipeline** — docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_schema, docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_service, docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_api_routes, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_curriculum_browse_ui, docs_superpowers_plans_2026_09_20_cefr_frameworks_seed_loader [EXTRACTED 1.00]
- **Focus mode: layout, shortcuts, sound, celebration** — docs_superpowers_plans_2026_09_29_design_pass_focus, docs_superpowers_plans_2026_09_29_design_pass_shortcuts, docs_superpowers_plans_2026_09_29_design_pass_sound, docs_superpowers_plans_2026_09_29_design_pass_celebration [EXTRACTED 1.00]
- **Lesson delete flow with dependency repair** — docs_superpowers_plans_2026_09_22_curriculum_admin_management_dependency_repair, docs_superpowers_plans_2026_09_22_curriculum_admin_management_lesson_delete_service, docs_superpowers_plans_2026_09_22_curriculum_admin_management_lesson_api_routes, docs_superpowers_plans_2026_09_22_curriculum_admin_management_delete_lesson_wizard [EXTRACTED 1.00]
- **Lesson create/edit flow** — docs_superpowers_plans_2026_09_22_curriculum_admin_management_lesson_editor_form, docs_superpowers_plans_2026_09_22_curriculum_admin_management_lesson_api_routes, docs_superpowers_plans_2026_09_22_curriculum_admin_management_lesson_admin_service, docs_superpowers_plans_2026_09_22_curriculum_admin_management_cycle_detection, docs_superpowers_plans_2026_09_22_curriculum_admin_management_placement_resolver, docs_superpowers_plans_2026_09_22_curriculum_admin_management_exercise_reconciliation [EXTRACTED 1.00]
- **Admin tooling** — docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_flashcard_violations, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_export_downloads, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_exam_admin [EXTRACTED 1.00]
- **Level unlock model** — docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_levels_helpers, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_profile_service, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_unlock_service, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_level_lock [EXTRACTED 1.00]
- **Placement test flow** — docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_service, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_scoring, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_exam_format, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_api_routes, docs_superpowers_plans_2026_09_24_tutoring_phase1a_levels_placement_admin_placement_test_component [EXTRACTED 1.00]
- **Progress tables** — docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lesson_attempts, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lesson_completions, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_exercise_srs_state, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lesson_chat_messages [EXTRACTED 1.00]
- **Skill discovery workflow (leaderboard check, CLI search, quality verification)** — _agents_skills_find_skills_skill_skills_sh_leaderboard, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_quality_verification [EXTRACTED 1.00]
- **Teaching loop DB services** — docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_progressservice, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_attemptservice, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lessonchatservice [EXTRACTED 1.00]
- **Teaching loop client components** — docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_exercise_card, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lesson_chat_panel, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_lesson_page, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_curriculum_tree, docs_superpowers_plans_2026_09_24_tutoring_phase1b_teaching_loop_queue_page [EXTRACTED 1.00]
- **AI-graded skill modules** — docs_superpowers_plans_2026_09_29_writing_lettergradingservice, docs_superpowers_plans_2026_09_29_speaking_plan, docs_superpowers_plans_2026_09_29_listening_plan [INFERRED 0.75]
- **Curriculum structuring flow** — docs_superpowers_specs_2026_09_29_curriculum_restructure_design_ranked_milestones, docs_superpowers_content_2026_09_29_milestone_regrouping_regrouping, docs_superpowers_specs_2026_09_29_bilingual_content_design_bilingual_model [INFERRED 0.75]
- **App icon set (same D! bubble mark)** — app_apple_icon, app_icon, public_icons_icon_192, public_icons_icon_512, public_icons_icon_maskable_512 [INFERRED 0.85]
- **Pure rules consumed by server gating** — docs_superpowers_plans_2026_09_29_curriculum_restructure_gating, docs_superpowers_plans_2026_09_29_curriculum_restructure_branch_layout, docs_superpowers_plans_2026_09_29_curriculum_restructure_testout_rules, docs_superpowers_plans_2026_09_29_curriculum_restructure_level_gating [INFERRED 0.85]
- **Token foundation: theme.css, Tailwind, contrast test** — docs_superpowers_plans_2026_09_29_design_pass_tokens, docs_superpowers_plans_2026_09_29_design_pass_tailwind, docs_superpowers_plans_2026_09_29_design_pass_contrast, docs_superpowers_plans_2026_09_29_design_pass_theme [INFERRED 0.85]
- **Deck introduction and queue logic** — docs_superpowers_plans_2026_09_29_freestyle_deck_lemmakey, docs_superpowers_plans_2026_09_29_freestyle_selectintroductions, docs_superpowers_plans_2026_09_29_freestyle_deck_queue, docs_superpowers_plans_2026_09_29_freestyle_deckservice [INFERRED 0.85]
- **Exam skill modules** — kanban_reading, kanban_listening, kanban_writing, kanban_speaking [INFERRED 0.85]
- **Practice batch serve and grade flow** — docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_practice_service, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_practice_types, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_practice_generation, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_exercise_grading, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_practice_routes, docs_superpowers_plans_2026_09_29_tutoring_phase2_practice_pool_practice_run [INFERRED 0.85]
- **Reading exam engine** — docs_superpowers_plans_2026_09_29_reading_exam_format, docs_superpowers_plans_2026_09_29_reading_task_types, docs_superpowers_plans_2026_09_29_reading_teilsetservice, docs_superpowers_plans_2026_09_29_reading_exampracticeservice, docs_superpowers_plans_2026_09_29_reading_timed_runner [INFERRED 0.85]
- **Skills CLI command surface (find / add / update / init)** — _agents_skills_find_skills_skill_skills_cli, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_npx_skills_add, _agents_skills_find_skills_skill_npx_skills_update, _agents_skills_find_skills_skill_npx_skills_init [INFERRED 0.85]
- **Speech sidecar stack (TTS, STT, provider)** — docs_superpowers_plans_2026_09_29_listening_piper_sidecar, docs_superpowers_plans_2026_09_29_speaking_transcribe, docs_superpowers_plans_2026_09_29_listening_speechprovider [INFERRED 0.85]
- **Skill modules built on the shared Teil engine** — docs_superpowers_specs_2026_09_29_reading_design_doc, docs_superpowers_specs_2026_09_29_listening_design_doc, docs_superpowers_specs_2026_09_29_writing_design_doc, docs_superpowers_specs_2026_09_29_speaking_design_doc [INFERRED 0.85]
- **Test-out flow** — docs_superpowers_plans_2026_09_29_curriculum_restructure_testout_rules, lib_services_testoutservice, lib_services_testoutstatus, docs_superpowers_plans_2026_09_29_curriculum_restructure_testout_page [INFERRED 0.85]

## Communities (145 total, 10 thin omitted)

### Community 0 - "cn"
Cohesion: 0.04
Nodes (59): AudioPlayer(), SEEK_ACTIONS, setSeekHandlers(), Heatmap(), shade(), MilestoneBand(), TestOut(), LessonChatProps (+51 more)

### Community 1 - "react"
Cohesion: 0.07
Nodes (57): AdminLogin(), BTN, ConceptLinkEntry, DeletePreviewResponse, RepairEdge, EMPTY_SMTP, errorOf(), JSON_HEADERS (+49 more)

### Community 2 - "closeDb"
Cohesion: 0.07
Nodes (39): dynamic, POST(), batch(), grade(), closeDb(), oldDatabase(), GradeFreeText, GradeLetter (+31 more)

### Community 3 - "getDb"
Cohesion: 0.05
Nodes (64): FlashcardViolationsPage(), { redirectMock, isAdminSessionValidMock, listMock }, AdminLessonPage(), dynamic, AdminTrackLevelPage(), dynamic, NotificationsAdminPage(), dynamic (+56 more)

### Community 4 - "Tutoring Phase 1B Teaching Loop Plan"
Cohesion: 0.05
Nodes (68): ActiveProviderBanner translation, aiService (generateWithActiveProvider), Catalog parity test, Curriculum export service, Default placement exam (data/placement-exam.json), delayedResponse test helper, exerciseContentValidation, Admin export downloads (zip) (+60 more)

### Community 5 - "extract-wortlisten.ts"
Cohesion: 0.07
Nodes (57): drop(), feminineOf(), GOETHE, main(), ONE, OUT_DIR, Parsed, parseGoethe() (+49 more)

### Community 6 - "localizedText.ts"
Cohesion: 0.07
Nodes (50): WordSearch(), AssistantMessage, ChatThread(), Composer(), Props, UserMessage, Verdict, VERDICT_STYLE (+42 more)

### Community 7 - "LessonPage.tsx"
Cohesion: 0.08
Nodes (31): Celebration(), FocusLayout(), DISC, ONWARD, ResultCard(), REVIEW_BADGE, ReviewBadge(), SCORE (+23 more)

### Community 8 - "backup/route.test.ts"
Cohesion: 0.17
Nodes (13): dynamic, GET(), POST(), addJob(), POST(), audioDir(), dataDir(), getDbPath() (+5 more)

### Community 9 - "createProviderService"
Cohesion: 0.16
Nodes (17): decrypt(), encrypt(), createProviderService(), createConnection(), getActiveConnection(), getConnection(), getDecryptedApiKey(), getRow() (+9 more)

### Community 11 - "App-wide Design Pass Implementation Plan"
Cohesion: 0.10
Nodes (43): Provider adapter interface, Anthropic adapter, Server-side API routes (profile, providers, usage, backup, reset), App shell onboarding gate and provider failure banner, Backup export/import service, BYOK AI provider connections, Core global constraints (local-only, server-side only, four providers), Master key file and AES-256-GCM encryption (+35 more)

### Community 12 - "lessonChatService.ts"
Cohesion: 0.12
Nodes (30): dynamic, GET(), mapError(), POST(), post(), ChatMessage, isAiAvailable(), ChatError (+22 more)

### Community 13 - "2026-09-24-tutoring-section-design.md"
Cohesion: 0.27
Nodes (9): Milestone regrouping (15 seeds, 3-4 milestones each), Lesson chat and Ask AI, Level unlocking (global hard lock), Placement test, SM-2 spaced repetition and Daily Queue, Tutoring teaching loop (lesson, exercises, grading), Branching tree layout, Ranked hard-gated milestones (+1 more)

### Community 14 - "ExerciseCard.tsx"
Cohesion: 0.07
Nodes (36): answeredCount(), Article, Question, readArticle(), ReadingSession(), READING_SUGGESTIONS, SessionSetup(), WRITING_SUGGESTIONS (+28 more)

### Community 15 - "Curriculum Admin Management (Phase 1) Implementation Plan"
Cohesion: 0.11
Nodes (36): Admin session gate (isAdminSessionValid, JSON 401), Concept-link API routes, ConceptLinkSection and Edit/Clone wiring, Concept-link service, Concept-links connect different tracks at same level only, Milestone/section structure service, wouldCreateCycle cycle detection, Data-preserving schema migration rule (+28 more)

### Community 16 - "attemptService.ts"
Cohesion: 0.07
Nodes (53): Shown, Error codes lesson_locked, testout_unavailable, testout_cooldown, levelGating.ts service, Milestone test-out, TestOutPage UI, testOut.ts test-out rules, ParsedTranscript, Exercise (+45 more)

### Community 17 - "createDeckService"
Cohesion: 0.07
Nodes (51): dynamic, GET(), dynamic, GET(), deckRemaining(), selectDeckDue(), selectIntroductions(), lemmaKey() (+43 more)

### Community 18 - "testOutStatus.ts"
Cohesion: 0.14
Nodes (19): branchLayout.ts branch layout, CurriculumTree UI, DependencyDiagram bands, audioHashOf(), audioReady(), eligibleCandidates(), testOutStatusFor(), cooldownEndsAt() (+11 more)

### Community 19 - "audio-content-checks.ts"
Cohesion: 0.12
Nodes (19): ExamPart, AudioCheckOptions, AudioCheckResult, audioContentProblems(), ENGLISH, MARKER_TEXT, MAYBE_PRINTED_AUDIO, MULTI_TEXT (+11 more)

### Community 20 - "curriculumExportService.ts"
Cohesion: 0.20
Nodes (14): dynamic, GET(), one(), dynamic, GET(), createCurriculumExportService(), currentSeedVersion(), exportAll() (+6 more)

### Community 21 - "providers/types.ts"
Cohesion: 0.14
Nodes (17): dynamic, GET(), createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter() (+9 more)

### Community 22 - "practiceService"
Cohesion: 0.08
Nodes (31): Admin practice API routes, Admin practice review page and pool section, attemptService, Batch of 5 exercises served one at a time, Chat load retry, Curriculum export and seed loader practice list, errorCodes (ErrorCode, errorBody), errors message namespace (+23 more)

### Community 23 - "delayedResponse"
Cohesion: 0.07
Nodes (17): HASH, ITEM, STRUCTURE, OVERVIEW, push, Reply, stubFetch(), FREE_QUESTION (+9 more)

### Community 24 - "createFreestyleService"
Cohesion: 0.06
Nodes (75): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+67 more)

### Community 25 - "curriculumSeedLoader.ts"
Cohesion: 0.13
Nodes (18): DIR, files, seeds, escapeRegExp(), getCurrentSeedVersion(), loadSeedIfNeeded(), load(), readSeedFile() (+10 more)

### Community 26 - "practiceGeneration.ts"
Cohesion: 0.13
Nodes (21): ExerciseContent, ExerciseType, Skill, FlashcardViolation, ItemRow, PracticePoolItem, generateMissing(), PoolRow (+13 more)

### Community 27 - "LessonEditorForm.tsx"
Cohesion: 0.12
Nodes (13): ExerciseFormEntry, LessonCloneContent, LessonEditorForm(), LessonEditorInitialValues, SKILLS, trackStructureResponse, TrackStructureResponse, PlacementMilestoneOption (+5 more)

### Community 28 - "audioService.ts"
Cohesion: 0.11
Nodes (36): dynamic, etagOf(), GET(), matches(), parseRange(), BYTES, get(), HASH (+28 more)

### Community 29 - "audio_core.py"
Cohesion: 0.07
Nodes (35): Cancelled, Event, Ffmpeg, check_cancelled(), chime_args(), concat_list(), convert(), convert_args() (+27 more)

### Community 30 - "deckService.ts"
Cohesion: 0.09
Nodes (32): dynamic, POST(), RATINGS, badRequest(), dynamic, GET(), POST(), SOURCES (+24 more)

### Community 31 - "ReadingTaskFields.tsx"
Cohesion: 0.16
Nodes (20): FIELD_LABEL, INPUT, REGISTERS, Question, blankGap(), ChoiceQuestion, ClozeFields(), ClozeGap (+12 more)

### Community 32 - "AppShell.tsx"
Cohesion: 0.19
Nodes (12): AppShell(), BadgeCounts, BARE_ROUTES, fetchDue(), NavLink(), useBadgeCounts(), Probe(), useMediaQuery() (+4 more)

### Community 33 - "admin/audio/routes.test.ts"
Cohesion: 0.12
Nodes (27): adminError(), notAdmin(), readJsonObject(), unauthorized(), dynamic, ownedHash(), POST(), Props (+19 more)

### Community 34 - "package.json"
Cohesion: 0.08
Nodes (22): name, private, version, clsx, @fontsource/nunito, jsdom, postcss, react-dom (+14 more)

### Community 35 - "ExamPracticeAdmin.tsx"
Cohesion: 0.17
Nodes (16): dynamic, AdminCurriculumPage(), dynamic, { redirectMock, isAdminSessionValidMock, listTracksMock }, FOCUS, HINT, LINK, PAGE_TITLE (+8 more)

### Community 36 - "lessonAdminService.ts"
Cohesion: 0.12
Nodes (28): wouldCreateCycle(), ExerciseInput, reconcileExercises(), PlacementInput, assertPrerequisiteScope(), randomSuffix(), EXERCISE_TYPES, hasInstruction() (+20 more)

### Community 37 - "notificationService.ts"
Cohesion: 0.11
Nodes (23): AdminNotification, countIn(), createNotificationService(), email(), info(), list(), raise(), resolve() (+15 more)

### Community 38 - "Curriculum + Admin Auth SQLite Schema (9 tables)"
Cohesion: 0.10
Nodes (22): CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import (+14 more)

### Community 39 - "createAttemptService"
Cohesion: 0.15
Nodes (25): vocabularyCardContent(), AttemptError, createAttemptService(), assertDueInQueue(), assertLessonOpen(), completeLesson(), getExercise(), getSrs() (+17 more)

### Community 40 - "createTestOutService"
Cohesion: 0.27
Nodes (18): dynamic, GET(), mapError(), POST(), createTestOutService(), answer(), context(), currentStatus() (+10 more)

### Community 41 - "vitest"
Cohesion: 0.05
Nodes (36): LessonDetail(), createDbClient(), DDL, LISTENING_EXERCISES, LISTENING_PRACTICE, READING_EXERCISES, READING_PRACTICE, setup() (+28 more)

### Community 42 - "SpeechError"
Cohesion: 0.10
Nodes (25): exception_handler, get, PiperVoice, post, Request, parse_render_body(), parse_render_request(), Exception (+17 more)

### Community 43 - "GermanLearner Kanban board"
Cohesion: 0.18
Nodes (21): 8 Accounts and hosting, #2.5 Curriculum admin management, 1b Curriculum expansion telc B1, 0b Bilingual content, GermanLearner Kanban board, #2 CEFR frameworks, #1 Core platform, 1 App-wide design pass NaDoch! (+13 more)

### Community 44 - "lessonAnswers.ts"
Cohesion: 0.05
Nodes (79): JSON_HEADERS, AudioMode, Cloze(), letterOf(), Matching(), Props, TaskPane, FillBlankContent (+71 more)

### Community 45 - "errorLogService.ts"
Cohesion: 0.18
Nodes (14): trimSnippet(), ErrorCategory, escapeRe(), IDS, keywordMatches(), keywordRes, normalizeCategory(), TAXONOMY (+6 more)

### Community 46 - "progressService.ts"
Cohesion: 0.15
Nodes (18): DoneState, getDailyQueue(), getTree(), isLevelFinished(), visibleLessons(), isDone(), ProgressDeps, ProgressService (+10 more)

### Community 47 - "examPracticeService.ts"
Cohesion: 0.05
Nodes (82): IDS, LEVELS, ROOT, DIR, files, taxonomyIds(), DIR(), ExamBlock (+74 more)

### Community 48 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, @fontsource/nunito, jsdom, opentype.js, postcss, sharp, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 49 - "SettingsPage"
Cohesion: 0.16
Nodes (12): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleProfileChange(), handleRetest(), handleSaveModel(), handleSetActive() (+4 more)

### Community 50 - "a11y.test.tsx"
Cohesion: 0.07
Nodes (22): PROFILE, { refreshMock }, DashboardPage(), emptyAnswer(), TaskInputs(), Harness(), push, RESULT (+14 more)

### Community 51 - "placementService.ts"
Cohesion: 0.18
Nodes (16): BestRow, DEFAULT_CODE, PlacementErrorKind, PlacementExamSource, PlacementService, SessionRow, PlacementQuestionType, PlacementStopReason (+8 more)

### Community 52 - "AppShell.test.tsx"
Cohesion: 0.10
Nodes (19): DECK, play, renderPage(), RUN, ShellState(), Shortcuts(), HOEREN_1, LESEN_1 (+11 more)

### Community 53 - "Freestyle and Vocabulary Deck Implementation Plan"
Cohesion: 0.19
Nodes (18): AI JSON helper (lib/ai/json.ts), attemptService / testOutService, lemmaKey (lemma_key dedupe), Deck queue (selectDeckDue, deckRemaining), deckService, extract-wortlisten script, Freestyle hub, freestyleService (+10 more)

### Community 54 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 55 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 56 - "levelGating.ts"
Cohesion: 0.09
Nodes (28): applyRepairAndDelete(), computeRepairPreview(), Placement, placementLookup(), RepairEdge, RepairPreview, PlacedLesson, scopeViolationMessages() (+20 more)

### Community 57 - "createTeilSetService"
Cohesion: 0.10
Nodes (43): dynamic, GET(), Ctx, DELETE(), dynamic, PATCH(), POST(), badRequest() (+35 more)

### Community 58 - "practiceService.ts"
Cohesion: 0.07
Nodes (44): dynamic, POST(), AudioAvailabilityDeps, AudioGate, resolveAudioGate(), buildNormalizePrompt(), AiRequest, AiResult (+36 more)

### Community 59 - "CefrLevel"
Cohesion: 0.11
Nodes (24): dynamic, dynamic, GET(), LinkedLessonOffer, SetupData, Lesson, Milestone, Scenario (+16 more)

### Community 60 - "next-intl"
Cohesion: 0.10
Nodes (32): evidenceSpans(), Span, TranscriptReveal(), AskAbout(), itemLabel(), ItemsReview(), LetterReview(), percentOf() (+24 more)

### Community 61 - "teilSetService.ts"
Cohesion: 0.14
Nodes (22): dynamic, ExamPracticeAdminPage(), formatOptions(), buildTeilSetPrompt(), BundledSetFile, letterSetProblems(), parseTeilSetReply(), SHAPE (+14 more)

### Community 62 - "curriculumStructureService.ts"
Cohesion: 0.10
Nodes (29): PlacementMode, resolvePlacement(), setup(), setup(), ensureUnsortedExists(), unsortedMilestoneId(), filled(), lessonTextProblems() (+21 more)

### Community 63 - "placementExamFormat.ts"
Cohesion: 0.17
Nodes (15): dynamic, formatFrom(), GET(), PUT(), put(), DIR, seeds, loadDefaultExam() (+7 more)

### Community 64 - "createProfileService"
Cohesion: 0.05
Nodes (47): dynamic, GET(), PATCH(), Dashboard(), dynamic, dynamic, Flashcards(), { mockRedirect, mockGetProfile } (+39 more)

### Community 65 - "Shared Teil exam-part engine"
Cohesion: 0.19
Nodes (17): Admin notifications and SMTP email, audio_questions task type, Freestyle mode registry, Piper TTS speech sidecar, Exam format data (15 formats), Task types (passage, matching, cloze), Shared Teil exam-part engine, Teil sets (3 per Teil) (+9 more)

### Community 66 - "DeckReview.tsx"
Cohesion: 0.18
Nodes (11): CardFace(), DeckReview(), Rating, RATINGS, AddWord(), isActivatable(), isTyping(), useExerciseShortcuts() (+3 more)

### Community 67 - "AdminNav.tsx"
Cohesion: 0.19
Nodes (7): activeHref(), AdminNav(), ITEMS, NOTIFICATIONS_CHANGED, useUnread(), NotificationsAdmin(), when()

### Community 68 - "app/layout.tsx"
Cohesion: 0.13
Nodes (15): dynamic, inter, metadata, nunito, viewport, PreferencesContext, PreferencesProvider(), save() (+7 more)

### Community 69 - "DependencyDiagram.tsx"
Cohesion: 0.20
Nodes (8): DependencyDiagram(), DiagramEdge, DiagramEntry, DiagramLesson, structure, BranchNode, computeBranchLayout(), layout()

### Community 70 - "worker.ts"
Cohesion: 0.21
Nodes (9): register(), runHealthCheck(), CONTENT_TICK_MS, createTick(), HEALTH_TICK_MS, JOB_TICK_MS, started, started (+1 more)

### Community 71 - "test_core.py"
Cohesion: 0.16
Nodes (13): fake_synth(), ogg_seconds(), opus_head(), Standard-library tests for audio_core: run with `cd speech && python3 -m…, A mono s16 sine tone as WAV bytes, built with ffmpeg so it has the given native…, Run ffmpeg into a real WAV file (a piped WAV has no length in its header) and…, S16: mixed 22.05 kHz and 16 kHz voices must join at the right speed., Decode ogg back to WAV with ffmpeg and measure it with the wave module. (+5 more)

### Community 72 - "placementService.test.ts"
Cohesion: 0.27
Nodes (8): reworded(), setup(), QuestionRow, answerInOrder(), PlacementQuestion, rightAnswer(), smallPlacementExam(), wrongAnswer()

### Community 73 - "speechProvider.ts"
Cohesion: 0.21
Nodes (19): send, SMTP, display(), dynamic, GET(), PUT(), AudioFilter, startBackgroundWorker() (+11 more)

### Community 74 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, better-sqlite3, class-variance-authority, clsx, fflate, lucide-react, next, next-intl (+7 more)

### Community 75 - "Reading Module and Teil Engine Implementation Plan"
Cohesion: 0.29
Nodes (13): Double submit idempotence, Exam practice admin authoring, ExamFormat (formats.ts, formatProblems), 15 exam formats data, examPracticeService, Freestyle exam practice screen, Lesson pass rule (80/50), Reading Module and Teil Engine Implementation Plan (+5 more)

### Community 76 - "mailService.ts"
Cohesion: 0.18
Nodes (14): clearSmtpSettings(), EMAIL_NOT_SET_UP, isAddress(), MailServiceDeps, readSmtpSettings(), readSmtpSettingsForDisplay(), saveSmtpSettings(), smtpProblems() (+6 more)

### Community 77 - "Find Skills (skill)"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 79 - "merge-lesson-exercises.ts"
Cohesion: 0.22
Nodes (13): maybePrintsAudio(), printsAudio(), strings(), canonical(), FORM_LESSONS, LETTER_WORDS, main(), mergeLessonExercises() (+5 more)

### Community 80 - "aiService.test.ts"
Cohesion: 0.19
Nodes (6): dynamic, GET(), request, setup(), createUsageService(), UsageService

### Community 81 - "FreestyleSession.tsx"
Cohesion: 0.09
Nodes (24): Filter, FILTERS, EndSession(), FreestyleHub(), ICONS, NEEDS_AI(), Overview, FreestyleSession() (+16 more)

### Community 82 - "speechAvailability.ts"
Cohesion: 0.15
Nodes (10): AudioServiceDeps, createSpeechAvailability(), isUp(), record(), HEALTH_MEMO_MS, KEY, SpeechAvailability, SpeechAvailabilityOptions (+2 more)

### Community 83 - "TestOutPage.test.tsx"
Cohesion: 0.29
Nodes (4): push, Q1, Q2, RESULT

### Community 84 - "Bilingual Content Implementation Plan"
Cohesion: 0.13
Nodes (18): telc B1 coverage matrix, Tested German never translated, Per-lesson en/de toggle, LocalizedText {en,de} domain type, Bilingual Content Implementation Plan, Seed format v3 (German fields), Generalized coverage test, Level inventories per level (+10 more)

### Community 85 - "Speaking Module Plan"
Cohesion: 0.14
Nodes (17): audio_jobs queue worker, Piper TTS sidecar (FastAPI), Listening Module Plan, Replay rules, SpeechProvider adapter, Speaking Module Plan, Estimated pronunciation read-out, speech_clips temporary storage (+9 more)

### Community 86 - "createPlacementService"
Cohesion: 0.22
Nodes (16): createPlacementService(), answer(), finish(), getBestResult(), getExam(), getSession(), gradeAnswer(), replaceExam() (+8 more)

### Community 87 - "mistakes/route.ts"
Cohesion: 0.26
Nodes (9): dynamic, GET(), Item, seed(), TopMistakeItem, createErrorLogService(), anyLessonFor(), bestLesson() (+1 more)

### Community 88 - "OnboardingWizard.tsx"
Cohesion: 0.14
Nodes (11): Logo(), MARKUP, LOGO_SVG, DOT_STEPS, JSON_HEADERS, PROVIDER_TYPES, Step, WizardCard() (+3 more)

### Community 89 - "memoryStore.ts"
Cohesion: 0.24
Nodes (7): createMemoryStore(), getEntity(), queryEntities(), MemoryEntity, MemoryStore, Row, rowToEntity()

### Community 90 - "build-icons.ts"
Cohesion: 0.22
Nodes (9): opentype.js, sharp, d, font, fontBytes, fontPath, iconSvg(), main() (+1 more)

### Community 91 - "app/page.tsx"
Cohesion: 0.25
Nodes (6): dynamic, Home(), { mockRedirect, mockGetProfile }, ActiveProviderBanner(), HomeIntro(), HomeScreen()

### Community 92 - "contentCheck.ts"
Cohesion: 0.24
Nodes (10): CheckState, CONTENT_CHECK_INTERVAL_MS, ContentCheckDeps, ContentCheckResult, contentIssues(), info(), parseList(), readState() (+2 more)

### Community 93 - "themeTokens.test.ts"
Cohesion: 0.31
Nodes (6): channel(), contrastRatio(), luminance(), css, PAIRS, THEMES

### Community 94 - "createPracticeAdminService"
Cohesion: 0.42
Nodes (8): createPracticeAdminService(), editContent(), getRow(), list(), promote(), setStatus(), PracticeAdminError, rowToItem()

### Community 95 - "gating.ts pure gating rules"
Cohesion: 0.15
Nodes (15): convert-seeds-v2.ts one-off script, gating.ts pure gating rules, lesson_completions source column / milestone_testouts table, migrateToMilestoneOnlyStructure migration, Difficulty-ranked hard-gated milestones, Move to... lesson milestone route, Tutoring Phase 2 practice pool precondition, Curriculum Restructure Implementation Plan (+7 more)

### Community 96 - "NaDoch! brand identity: blue-teal bubble with orange exclamation"
Cohesion: 0.39
Nodes (8): Apple touch icon (D! bubble), App icon SVG (D! speech bubble), NaDoch! logo (design source), NaDoch! logo (public brand asset), NaDoch! brand identity: blue-teal bubble with orange exclamation, PWA icon 192, PWA icon 512, PWA maskable icon 512

### Community 97 - "TrackLevelStructure"
Cohesion: 0.50
Nodes (7): errorOf(), TrackLevelStructure(), createMilestone(), deleteMilestone(), load(), moveLesson(), saveMilestone()

### Community 98 - "@testing-library/react"
Cohesion: 0.08
Nodes (19): TRANSCRIPT, days, VIEW, ITEMS, MESSAGES, SUMMARY, FOUR, SESSION (+11 more)

### Community 99 - "adminAuthService (password hash/verify, session tokens)"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 100 - "createExamPracticeService"
Cohesion: 0.11
Nodes (46): dynamic, POST(), dynamic, POST(), dynamic, GET(), badRequest(), isId() (+38 more)

### Community 101 - "placementScoring.ts"
Cohesion: 0.31
Nodes (8): LEVEL_POINTS, MAX_MISTAKES, maxScore(), PASS_SHARE, placedLevel(), placementThresholds(), pointsFor(), stopReasonAfterAnswer()

### Community 102 - "AudioActions"
Cohesion: 0.17
Nodes (13): AudioActions(), regenerate(), run(), upload(), describe(), errorOf(), upload(), PlacementExamAdmin() (+5 more)

### Community 103 - "onboarding/page.tsx"
Cohesion: 0.21
Nodes (8): dynamic, OnboardingPage(), { mockGetProfile, mockGetActiveConnection }, OnboardingWizard(), finishOnboarding(), handleConnectAndTest(), loadModels(), skipPlacement()

### Community 104 - "Accounts & Hosting Plan"
Cohesion: 0.33
Nodes (7): Better Auth, BYOK per user, Data rights and legal pages, Docker Compose + Tailscale + Litestream deployment, Table-driven isolation test, Per-user data migration (user_id), Accounts & Hosting Plan

### Community 105 - "RenderWithFakeFfmpegTest"
Cohesion: 0.17
Nodes (3): The pipeline's ffmpeg calls, recorded without running ffmpeg., RenderCancellationTest, RenderWithFakeFfmpegTest

### Community 106 - "placement/routes.test.ts"
Cohesion: 0.18
Nodes (13): dynamic, POST(), respondWithPlacementErrors(), dynamic, GET(), answerRequest(), dynamic, POST() (+5 more)

### Community 107 - "VoiceManifestTest"
Cohesion: 0.17
Nodes (4): skipIf, BuildGuardsTest, skipUnless, VoiceManifestTest

### Community 108 - "merge-teil-sets.ts"
Cohesion: 0.24
Nodes (16): englishWords(), transcriptHashOf(), bundledAudioHashes(), canonical(), existingSets(), EXPECTED_LISTENING_ITEMS, letterTotals(), letterWarnings() (+8 more)

### Community 109 - "2026-09-29-accounts-hosting-design.md"
Cohesion: 0.53
Nodes (5): Better Auth accounts, Per-user BYOK keys, Launch checklist, SQLite + Litestream hosting, Tailscale access

### Community 110 - "audioService.test.ts"
Cohesion: 0.16
Nodes (10): listAudioFiles(), createLocalSpeechProvider(), errorText(), MAX_CONVERT_BYTES, MAX_RENDER_BYTES, post(), renderTimeoutMs(), isUnreachableError() (+2 more)

### Community 111 - "levels.ts"
Cohesion: 0.07
Nodes (38): dynamic, GET(), STATUSES, dynamic, GET(), dynamic, GET(), dynamic (+30 more)

### Community 112 - "ServerTest"
Cohesion: 0.26
Nodes (4): ogg_seconds(), skipUnless, HTTP tests for the sidecar. They need FastAPI, httpx, Piper and the voice…, ServerTest

### Community 113 - "defaultKeyFilePath"
Cohesion: 0.22
Nodes (13): dynamic, GET(), PUT(), DELETE(), PATCH(), POST(), dynamic, GET() (+5 more)

### Community 114 - "UmlautRow.tsx"
Cohesion: 0.29
Nodes (8): Field, insertAtCaret(), LETTERS, UmlautRow(), listeners, read(), subscribe(), useUmlautRow()

### Community 115 - "SystemSettingsAdmin.test.tsx"
Cohesion: 0.22
Nodes (3): NoResizeObserver, SPEECH, STORED

### Community 117 - "examPracticeService.test.ts"
Cohesion: 0.14
Nodes (18): audioHash(), FILTERS, parseTranscript(), PAUSE_MS, RENDERER_VERSION, VOICES, AdminAudioStatus, audioStatusFor() (+10 more)

### Community 118 - "next.config.js"
Cohesion: 0.40
Nodes (3): createNextIntlPlugin, nextConfig, withNextIntl

### Community 119 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 120 - "merge-lesson-exercises.test.ts"
Cohesion: 0.28
Nodes (5): exercisesOf(), passage, run(), seed(), seedPath()

### Community 121 - "practice-review/page.tsx"
Cohesion: 0.29
Nodes (5): dynamic, PracticeReviewPage(), { mockRedirect, mockIsAdmin }, PracticePoolList(), preview()

### Community 122 - "Level Exams Plan"
Cohesion: 0.47
Nodes (6): NaDoch! PDF certificates, examSittingService, Gated formal level exam, Open Badge 3.0 credentials, Level Exams Plan, unlockService exam condition

### Community 124 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, better-sqlite3@13.0.3, esbuild@0.28.2, fsevents@2.3.3

### Community 125 - "ExerciseEditor.tsx"
Cohesion: 0.11
Nodes (10): blankContentFor(), ExerciseContentFields(), ExerciseEditor(), addExercise(), MultipleChoiceFields(), typeSpecificFields(), blankLetterTask(), LetterTaskFields() (+2 more)

### Community 127 - "ExerciseCard.test.tsx"
Cohesion: 0.20
Nodes (6): CARD, FILL, FREE, LETTER, MC, renderCard()

### Community 131 - "ExamPracticeAdmin.test.tsx"
Cohesion: 0.15
Nodes (8): errorOf(), ExamPracticeAdmin(), act(), ExamPracticeFormatOption, FORMATS, POOL, SET, STARTER

### Community 132 - "2026-09-29-design-pass-design.md"
Cohesion: 0.36
Nodes (6): NaDoch! brand and logo, Installable PWA, Theme tokens, Thumb-zone shell and navigation, NaDoch! certificate and Open Badge, Gated level exams

### Community 133 - "backupService.ts"
Cohesion: 0.13
Nodes (24): isAudioFileName(), BackupEnvelope, BackupSizeOptions, BackupTooLargeError, base64Length(), createBackupStream(), decodedLength(), envelopeChunks() (+16 more)

### Community 136 - "Bilingual en/de content model"
Cohesion: 0.47
Nodes (4): Bilingual en/de content model, Seed format v3, Curriculum export, AI practice pool with admin review

### Community 137 - "merge-teil-sets.test.ts"
Cohesion: 0.25
Nodes (3): EXPECTED_LETTER_SETS, NUM, REAL

### Community 138 - "ConceptLinkSection.test.tsx"
Cohesion: 0.33
Nodes (3): ConceptLinkSection(), goetheStructure, telcStructure

### Community 139 - "TeilSetEditor.tsx"
Cohesion: 0.60
Nodes (4): explanationCount(), resized(), TeilSetEditor(), changeContent()

### Community 140 - "CurriculumTree.test.tsx"
Cohesion: 0.40
Nodes (3): lesson(), TREE, write()

### Community 142 - "LessonChat.test.tsx"
Cohesion: 0.33
Nodes (4): EARLIER, renderChat(), REPLY, CHAT_MESSAGE_MAX_LENGTH

### Community 143 - "Speech sidecar"
Cohesion: 0.50
Nodes (3): Build, start and check, Speech sidecar, Tests without Docker

### Community 144 - "QueuePage"
Cohesion: 0.83
Nodes (4): QueuePage(), moveOn(), next(), skip()

## Ambiguous Edges - Review These
- `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` → `germanaitutor (project README)`  [AMBIGUOUS]
  README.md · relation: references
- `TRACKS / isTrack in levels.ts` → `en/de message catalogs parity`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-24-tutoring-phase1b-teaching-loop.md · relation: semantically_similar_to

## Knowledge Gaps
- **724 isolated node(s):** `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }` (+719 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1123 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` and `germanaitutor (project README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `TRACKS / isTrack in levels.ts` and `en/de message catalogs parity`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `react`, `closeDb`, `getDb`, `localizedText.ts`, `LessonPage.tsx`, `backup/route.test.ts`, `createProviderService`, `DeleteLessonWizard`, `lessonChatService.ts`, `ExerciseCard.tsx`, `attemptService.ts`, `createDeckService`, `testOutStatus.ts`, `audio-content-checks.ts`, `curriculumExportService.ts`, `providers/types.ts`, `delayedResponse`, `createFreestyleService`, `curriculumSeedLoader.ts`, `practiceGeneration.ts`, `LessonEditorForm.tsx`, `audioService.ts`, `deckService.ts`, `AppShell.tsx`, `admin/audio/routes.test.ts`, `package.json`, `ExamPracticeAdmin.tsx`, `lessonAdminService.ts`, `notificationService.ts`, `createAttemptService`, `lessonAnswers.ts`, `errorLogService.ts`, `progressService.ts`, `examPracticeService.ts`, `a11y.test.tsx`, `placementService.ts`, `AppShell.test.tsx`, `levelGating.ts`, `createTeilSetService`, `practiceService.ts`, `next-intl`, `teilSetService.ts`, `curriculumStructureService.ts`, `placementExamFormat.ts`, `createProfileService`, `AdminNav.tsx`, `app/layout.tsx`, `DependencyDiagram.tsx`, `worker.ts`, `placementService.test.ts`, `speechProvider.ts`, `mailService.ts`, `LessonPage.test.tsx`, `aiService.test.ts`, `speechAvailability.ts`, `TestOutPage.test.tsx`, `mistakes/route.ts`, `OnboardingWizard.tsx`, `app/page.tsx`, `contentCheck.ts`, `themeTokens.test.ts`, `@testing-library/react`, `createExamPracticeService`, `placementScoring.ts`, `onboarding/page.tsx`, `placement/routes.test.ts`, `audioService.test.ts`, `levels.ts`, `defaultKeyFilePath`, `SystemSettingsAdmin.test.tsx`, `examPracticeService.test.ts`, `merge-lesson-exercises.test.ts`, `practice-review/page.tsx`, `catalogs.test.ts`, `ExerciseEditor.tsx`, `ExerciseCard.test.tsx`, `ExamPracticeAdmin.test.tsx`, `backupService.ts`, `merge-teil-sets.test.ts`, `ConceptLinkSection.test.tsx`, `CurriculumTree.test.tsx`, `manifest.ts`, `LessonChat.test.tsx`?**
  _High betweenness centrality (0.199) - this node is a cross-community bridge._
- **What connects `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic` to the rest of the system?**
  _724 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.036311514572384136 - nodes in this community are weakly interconnected._
- **Should `react` be split into smaller, more focused modules?**
  _Cohesion score 0.070271407532085 - nodes in this community are weakly interconnected._
- **Should `closeDb` be split into smaller, more focused modules?**
  _Cohesion score 0.0742447516641065 - nodes in this community are weakly interconnected._