# Graph Report - GermanLearner  (2026-10-20)

## Corpus Check
- 788 files · ~1,364,967 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3527 nodes · 10742 edges · 144 communities (132 shown, 11 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 309 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d142a5a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- ExamPracticeAdmin.tsx
- seedTutoringCurriculum
- isAdminSessionValid
- Tutoring Phase 1B Teaching Loop Plan
- extract-wortlisten.ts
- localizedText.ts
- ExerciseCard.tsx
- backup/route.test.ts
- providerService.ts
- @testing-library/react
- App-wide Design Pass Implementation Plan
- lessonAnswers.ts
- 2026-09-24-tutoring-section-design.md
- alert.tsx
- Curriculum Admin Management (Phase 1) Implementation Plan
- testOutService.ts
- mergeWordList.ts
- createTestOutService
- audio-content-checks.ts
- export/[track]/[level]/route.ts
- providers/types.ts
- practiceService
- delayedResponse
- freestyle/routes.test.ts
- curriculumSeedLoader.ts
- TrackLevelStructure.tsx
- client.ts
- createAudioService
- audio_core.py
- errorBody
- createFreestyleService
- app/layout.tsx
- admin/audio/routes.test.ts
- package.json
- adminSession.ts
- CefrLevel
- notificationService.ts
- Curriculum + Admin Auth SQLite Schema (9 tables)
- attemptService.ts
- flashcards/routes.test.ts
- vitest
- SpeechError
- GermanLearner Kanban board
- taskTypes.ts
- replies.ts
- progressService.ts
- examPracticeService.ts
- devDependencies
- SettingsPage
- a11y.test.tsx
- button.tsx
- AppShell.test.tsx
- Freestyle and Vocabulary Deck Implementation Plan
- compilerOptions
- components.json
- gating.ts
- createTeilSetService
- practiceService.ts
- createCurriculumService
- TaskInputs.tsx
- teilSetService.ts
- curriculumStructureService.ts
- levels.ts
- createProfileService
- Shared Teil exam-part engine
- deckService.test.ts
- TappableGerman.tsx
- PreferencesProvider.tsx
- createDeckService
- contentCheck.ts
- test_core.py
- placementTypes.ts
- speechProvider.ts
- dependencies
- Reading Module and Teil Engine Implementation Plan
- mailService.ts
- Find Skills (skill)
- LessonPage
- createExamPracticeService
- closeDb
- [mode]/page.tsx
- speechAvailability.ts
- TestOutPage.test.tsx
- Bilingual Content Implementation Plan
- Speaking Module Plan
- createPlacementService
- flashcards/page.tsx
- OnboardingWizard.tsx
- memoryStore.ts
- build-icons.ts
- app/page.tsx
- wordLists.ts
- themeTokens.test.ts
- admin/practice/routes.test.ts
- gating.ts pure gating rules
- NaDoch! brand identity: blue-teal bubble with orange exclamation
- TrackLevelStructure
- renderWithIntl
- adminAuthService (password hash/verify, session tokens)
- api/exam-practice/routes.test.ts
- placement/page.tsx
- AudioActions
- onboarding/page.tsx
- Accounts & Hosting Plan
- RenderWithFakeFfmpegTest
- getDb
- VoiceManifestTest
- merge-teil-sets.ts
- 2026-09-29-accounts-hosting-design.md
- localSpeechProvider.ts
- createConceptLinkService
- ServerTest
- createProviderService
- prompts.ts
- SystemSettingsAdmin.test.tsx
- RequestBodyTest
- audioService.ts
- next.config.js
- scripts
- chat/route.ts
- TeilSetError
- Listening Module Plan
- telcB1Coverage.test.ts
- allowScripts
- MultipleChoiceFields
- build-logo.ts
- ExerciseCard.test.tsx
- Flashcards only in vocabulary lessons rule
- next-env.d.ts
- ExamPracticeAdmin.test.tsx
- 2026-09-29-design-pass-design.md
- backupService.ts
- FfmpegArgsTest
- ParseRenderRequestTest
- Seed format v2
- ProfilePage.test.tsx
- topics/route.test.ts
- freestyleService.test.ts
- CurriculumTree.test.tsx
- manifest.ts
- deck.test.ts
- Speech sidecar

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 240 edges
2. `vitest` - 222 edges
3. `cn()` - 140 edges
4. `react` - 94 edges
5. `createDbClient()` - 92 edges
6. `CefrLevel` - 85 edges
7. `isAdminSessionValid()` - 77 edges
8. `createProfileService()` - 76 edges
9. `Track` - 65 edges
10. `better-sqlite3` - 63 edges

## Surprising Connections (you probably didn't know these)
- `App icon SVG (D! speech bubble)` --semantically_similar_to--> `PWA icon 512`  [INFERRED] [semantically similar]
  app/icon.svg → public/icons/icon-512.png
- `NaDoch! logo (design source)` --semantically_similar_to--> `NaDoch! logo (public brand asset)`  [INFERRED] [semantically similar]
  docs/design/nadoch-logo.svg → public/brand/nadoch-logo.svg
- `jobStatus()` --calls--> `getDb()`  [EXTRACTED]
  app/api/admin/audio/routes.test.ts → lib/db/client.ts
- `seedMilestone()` --calls--> `getDb()`  [EXTRACTED]
  app/api/admin/curriculum/lessons/route.test.ts → lib/db/client.ts
- `addJob()` --calls--> `getDb()`  [EXTRACTED]
  app/api/backup/route.test.ts → lib/db/client.ts

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

## Communities (144 total, 11 thin omitted)

### Community 0 - "cn"
Cohesion: 0.04
Nodes (56): activeHref(), AdminNav(), ITEMS, useUnread(), LessonChat(), LessonChatProps, ResultView(), CardAction() (+48 more)

### Community 1 - "ExamPracticeAdmin.tsx"
Cohesion: 0.04
Nodes (86): dynamic, dynamic, dynamic, dynamic, BTN, FIELD_LABEL, FOCUS, HINT (+78 more)

### Community 2 - "seedTutoringCurriculum"
Cohesion: 0.09
Nodes (32): oldDatabase(), READING_EXERCISES, READING_PRACTICE, setup(), GradeFreeText, knew, listeningSetup(), right (+24 more)

### Community 3 - "isAdminSessionValid"
Cohesion: 0.10
Nodes (25): FlashcardViolationsPage(), AdminLessonPage(), dynamic, AdminCurriculumPage(), AdminTrackLevelPage(), NotificationsAdminPage(), PracticeReviewPage(), { mockRedirect, mockIsAdmin } (+17 more)

### Community 4 - "Tutoring Phase 1B Teaching Loop Plan"
Cohesion: 0.05
Nodes (68): ActiveProviderBanner translation, aiService (generateWithActiveProvider), Catalog parity test, Curriculum export service, Default placement exam (data/placement-exam.json), delayedResponse test helper, exerciseContentValidation, Admin export downloads (zip) (+60 more)

### Community 5 - "extract-wortlisten.ts"
Cohesion: 0.07
Nodes (57): drop(), feminineOf(), GOETHE, main(), ONE, OUT_DIR, Parsed, parseGoethe() (+49 more)

### Community 6 - "localizedText.ts"
Cohesion: 0.07
Nodes (49): CardFace(), DeckReview(), Rating, RATINGS, AddWord(), DeckLimits(), Found, LimitField() (+41 more)

### Community 7 - "ExerciseCard.tsx"
Cohesion: 0.06
Nodes (62): evidenceSpans(), Span, TRANSCRIPT, TranscriptReveal(), answeredCount(), Celebration(), FocusLayout(), DISC (+54 more)

### Community 8 - "backup/route.test.ts"
Cohesion: 0.17
Nodes (12): dynamic, GET(), POST(), addJob(), POST(), loadOrCreateMasterKey(), getDbPath(), declaresMoreThan() (+4 more)

### Community 9 - "providerService.ts"
Cohesion: 0.18
Nodes (16): decrypt(), encrypt(), createConnection(), getActiveConnection(), getConnection(), getDecryptedApiKey(), getRow(), listConnections() (+8 more)

### Community 10 - "@testing-library/react"
Cohesion: 0.07
Nodes (12): { redirectMock, isAdminSessionValidMock, listMock }, { redirectMock, isAdminSessionValidMock, listTracksMock }, AdminLogin(), HASH, goetheStructure, telcStructure, LessonDetail(), DeleteLessonWizard() (+4 more)

### Community 11 - "App-wide Design Pass Implementation Plan"
Cohesion: 0.10
Nodes (43): Provider adapter interface, Anthropic adapter, Server-side API routes (profile, providers, usage, backup, reset), App shell onboarding gate and provider failure banner, Backup export/import service, BYOK AI provider connections, Core global constraints (local-only, server-side only, four providers), Master key file and AES-256-GCM encryption (+35 more)

### Community 12 - "lessonAnswers.ts"
Cohesion: 0.08
Nodes (44): Exercise, FreeTextContent, ChatMessage, isAiAvailable(), ExerciseRow, ChatError, ChatErrorKind, createLessonChatService() (+36 more)

### Community 13 - "2026-09-24-tutoring-section-design.md"
Cohesion: 0.24
Nodes (10): Milestone regrouping (15 seeds, 3-4 milestones each), Freestyle mode outline, Lesson chat and Ask AI, Level unlocking (global hard lock), Placement test, SM-2 spaced repetition and Daily Queue, Tutoring teaching loop (lesson, exercises, grading), Branching tree layout (+2 more)

### Community 14 - "alert.tsx"
Cohesion: 0.07
Nodes (38): Filter, FILTERS, NotificationsAdmin(), when(), ChatThread(), Props, ICONS, Overview (+30 more)

### Community 15 - "Curriculum Admin Management (Phase 1) Implementation Plan"
Cohesion: 0.11
Nodes (36): Admin session gate (isAdminSessionValid, JSON 401), Concept-link API routes, ConceptLinkSection and Edit/Clone wiring, Concept-link service, Concept-links connect different tracks at same level only, Milestone/section structure service, wouldCreateCycle cycle detection, Data-preserving schema migration rule (+28 more)

### Community 16 - "testOutService.ts"
Cohesion: 0.07
Nodes (44): dynamic, GET(), Milestone test-out, TestOutPage UI, testOut.ts test-out rules, FillBlankContent, MultipleChoiceContent, AttemptDeps (+36 more)

### Community 17 - "mergeWordList.ts"
Cohesion: 0.18
Nodes (18): DroppedEntry, FIELDS, formatWordListFile(), lowerLevels(), mergeWordList(), normalized(), SHARED_LEVELS, sortKey() (+10 more)

### Community 18 - "createTestOutService"
Cohesion: 0.10
Nodes (31): AudioGate, audioHashOf(), resolveAudioGate(), createTestOutService(), answer(), context(), currentStatus(), finish() (+23 more)

### Community 19 - "audio-content-checks.ts"
Cohesion: 0.07
Nodes (34): AudioCheckOptions, AudioCheckResult, audioContentProblems(), ENGLISH, englishWords(), MARKER_TEXT, MAYBE_PRINTED_AUDIO, maybePrintsAudio() (+26 more)

### Community 20 - "export/[track]/[level]/route.ts"
Cohesion: 0.24
Nodes (12): dynamic, GET(), one(), dynamic, GET(), createCurriculumExportService(), currentSeedVersion(), exportAll() (+4 more)

### Community 21 - "providers/types.ts"
Cohesion: 0.15
Nodes (14): createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter(), FetchLike, GenerateTextParams (+6 more)

### Community 22 - "practiceService"
Cohesion: 0.08
Nodes (31): Admin practice API routes, Admin practice review page and pool section, attemptService, Batch of 5 exercises served one at a time, Chat load retry, Curriculum export and seed loader practice list, errorCodes (ErrorCode, errorBody), errors message namespace (+23 more)

### Community 23 - "delayedResponse"
Cohesion: 0.07
Nodes (17): NOTIFICATIONS_CHANGED, ITEM, STRUCTURE, SUMMARY, FOUR, OVERVIEW, push, Reply (+9 more)

### Community 24 - "freestyle/routes.test.ts"
Cohesion: 0.20
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+9 more)

### Community 25 - "curriculumSeedLoader.ts"
Cohesion: 0.14
Nodes (22): filled(), lessonTextProblems(), LessonTexts, milestoneTextProblems(), ok, EXERCISE_TYPES, hasInstruction(), hasInstructionKey() (+14 more)

### Community 26 - "TrackLevelStructure.tsx"
Cohesion: 0.18
Nodes (16): StructureEntry, StructureLesson, Phase, SummaryList(), WordResult, AlertDialog(), AlertDialogAction(), AlertDialogCancel() (+8 more)

### Community 27 - "client.ts"
Cohesion: 0.12
Nodes (16): createChatPracticeIndex(), createTablesIfMissing(), EXERCISE_TYPES, migrateBilingualColumns(), migrateChatPracticeColumn(), migrateConceptIdAndPlacementUniqueness(), migrateDailyReviewCap(), migrateExerciseTypeCheck() (+8 more)

### Community 28 - "createAudioService"
Cohesion: 0.11
Nodes (32): dynamic, etagOf(), GET(), matches(), parseRange(), BYTES, get(), HASH (+24 more)

### Community 29 - "audio_core.py"
Cohesion: 0.07
Nodes (35): Cancelled, Event, Ffmpeg, check_cancelled(), chime_args(), concat_list(), convert(), convert_args() (+27 more)

### Community 30 - "errorBody"
Cohesion: 0.10
Nodes (25): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+17 more)

### Community 31 - "createFreestyleService"
Cohesion: 0.25
Nodes (23): createFreestyleService(), addMessage(), ask(), end(), grammarTopics(), history(), messagesOf(), newArticle() (+15 more)

### Community 32 - "app/layout.tsx"
Cohesion: 0.12
Nodes (18): dynamic, inter, metadata, nunito, RootLayout(), viewport, AppShell(), BadgeCounts (+10 more)

### Community 33 - "admin/audio/routes.test.ts"
Cohesion: 0.14
Nodes (24): adminError(), notAdmin(), readJsonObject(), unauthorized(), dynamic, ownedHash(), POST(), Props (+16 more)

### Community 34 - "package.json"
Cohesion: 0.08
Nodes (22): name, private, version, clsx, @fontsource/nunito, jsdom, postcss, react-dom (+14 more)

### Community 35 - "adminSession.ts"
Cohesion: 0.16
Nodes (10): DELETE(), dynamic, GET(), POST(), cookieStore, ADMIN_SESSION_COOKIE, cookieStore, loadOrCreateSessionSecret() (+2 more)

### Community 36 - "CefrLevel"
Cohesion: 0.07
Nodes (64): dynamic, wouldCreateCycle(), ExerciseInput, reconcileExercises(), PlacementInput, ExerciseContent, ExerciseType, Lesson (+56 more)

### Community 37 - "notificationService.ts"
Cohesion: 0.11
Nodes (23): AdminNotification, countIn(), createNotificationService(), email(), info(), list(), raise(), resolve() (+15 more)

### Community 38 - "Curriculum + Admin Auth SQLite Schema (9 tables)"
Cohesion: 0.10
Nodes (22): CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import (+14 more)

### Community 39 - "attemptService.ts"
Cohesion: 0.07
Nodes (51): dynamic, GET(), dynamic, GET(), DeckItemRef, findItemByKey(), LessonCardInput, lessonCardKey() (+43 more)

### Community 40 - "flashcards/routes.test.ts"
Cohesion: 0.15
Nodes (14): dynamic, POST(), RATINGS, dynamic, GET(), dynamic, GET(), badRequest() (+6 more)

### Community 41 - "vitest"
Cohesion: 0.05
Nodes (17): seed(), setup(), setup(), ensureUnsortedExists(), createDbClient(), request, setup(), seed() (+9 more)

### Community 42 - "SpeechError"
Cohesion: 0.10
Nodes (25): exception_handler, get, PiperVoice, post, Request, parse_render_body(), parse_render_request(), Exception (+17 more)

### Community 43 - "GermanLearner Kanban board"
Cohesion: 0.18
Nodes (21): 8 Accounts and hosting, #2.5 Curriculum admin management, 1b Curriculum expansion telc B1, 0b Bilingual content, GermanLearner Kanban board, #2 CEFR frameworks, #1 Core platform, 1 App-wide design pass NaDoch! (+13 more)

### Community 44 - "taskTypes.ts"
Cohesion: 0.08
Nodes (24): resized(), TeilSetEditor(), changeContent(), answerTexts(), ClozeAnswer, Gap, GAP_MODES, gradeCloze() (+16 more)

### Community 45 - "replies.ts"
Cohesion: 0.30
Nodes (13): extractJsonObject(), correction, corrections(), localizedPair(), parseArticleReply(), parseConversationReply(), parseDrillReply(), parseNormalizeReply() (+5 more)

### Community 46 - "progressService.ts"
Cohesion: 0.08
Nodes (38): DependencyDiagram(), DiagramEdge, DiagramEntry, DiagramLesson, structure, unsortedMilestoneId(), localized(), createContentText() (+30 more)

### Community 47 - "examPracticeService.ts"
Cohesion: 0.12
Nodes (25): IDS, LEVELS, DIR(), ExamBlock, ExamFormat, ExamPart, formatId(), formatProblems() (+17 more)

### Community 48 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, @fontsource/nunito, jsdom, opentype.js, postcss, sharp, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 49 - "SettingsPage"
Cohesion: 0.16
Nodes (12): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleProfileChange(), handleRetest(), handleSaveModel(), handleSetActive() (+4 more)

### Community 50 - "a11y.test.tsx"
Cohesion: 0.13
Nodes (16): PROFILE, { refreshMock }, emptyAnswer(), Harness(), RESULT, RUN, HOEREN_1, LESEN_1 (+8 more)

### Community 51 - "button.tsx"
Cohesion: 0.10
Nodes (21): AudioPlayer(), SEEK_ACTIONS, setSeekHandlers(), Heatmap(), shade(), ReadinessCard(), SkillProgress(), LETTERS (+13 more)

### Community 52 - "AppShell.test.tsx"
Cohesion: 0.13
Nodes (13): DECK, play, renderPage(), RUN, ShellState(), Shortcuts(), countsFetch(), FocusOn() (+5 more)

### Community 53 - "Freestyle and Vocabulary Deck Implementation Plan"
Cohesion: 0.28
Nodes (13): AI JSON helper (lib/ai/json.ts), attemptService / testOutService, lemmaKey (lemma_key dedupe), Deck queue (selectDeckDue, deckRemaining), deckService, extract-wortlisten script, freestyleService, Lesson flashcards move into deck (+5 more)

### Community 54 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 55 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 56 - "gating.ts"
Cohesion: 0.13
Nodes (18): applyRepairAndDelete(), computeRepairPreview(), Placement, placementLookup(), RepairEdge, PlacedLesson, batchDelete(), getDeletePreview() (+10 more)

### Community 57 - "createTeilSetService"
Cohesion: 0.21
Nodes (24): dynamic, GET(), Ctx, DELETE(), dynamic, PATCH(), POST(), badRequest() (+16 more)

### Community 58 - "practiceService.ts"
Cohesion: 0.06
Nodes (47): AudioAvailabilityDeps, buildNormalizePrompt(), AiRequest, AiResult, generateWithActiveProvider(), DeckError, ExamPracticeDeps, generateParsed() (+39 more)

### Community 59 - "createCurriculumService"
Cohesion: 0.25
Nodes (7): createCurriculumService(), getExercises(), getLesson(), getTrackStructure(), rowToExercise(), rowToLesson(), rowToMilestone()

### Community 60 - "TaskInputs.tsx"
Cohesion: 0.08
Nodes (27): AudioMode, Cloze(), letterOf(), Matching(), Props, TaskInputs(), TaskPane, Tab (+19 more)

### Community 61 - "teilSetService.ts"
Cohesion: 0.10
Nodes (28): dynamic, ExamPracticeAdminPage(), formatOptions(), errorOf(), ExamPracticeAdmin(), act(), upload(), ROOT (+20 more)

### Community 62 - "curriculumStructureService.ts"
Cohesion: 0.14
Nodes (18): PlacementMode, resolvePlacement(), assertPrerequisiteScope(), scopeViolationMessages(), randomSuffix(), MilestoneTexts, assertMilestoneTexts(), assertValidRank() (+10 more)

### Community 63 - "levels.ts"
Cohesion: 0.11
Nodes (28): dynamic, formatFrom(), GET(), PUT(), put(), dynamic, GET(), selectIntroductions() (+20 more)

### Community 64 - "createProfileService"
Cohesion: 0.07
Nodes (32): dynamic, GET(), PATCH(), Dashboard(), dynamic, dynamic, Freestyle(), dynamic (+24 more)

### Community 65 - "Shared Teil exam-part engine"
Cohesion: 0.16
Nodes (18): Freestyle hub, Freestyle never writes progress, Freestyle mode registry, Vocabulary deck with own SRS, Official starter word lists, Exam format data (15 formats), Task types (passage, matching, cloze), Shared Teil exam-part engine (+10 more)

### Community 67 - "TappableGerman.tsx"
Cohesion: 0.19
Nodes (10): ABBREVIATIONS, endsSentence(), SaveState, splitSentences(), TappableGerman(), Token, tokenize(), Popover() (+2 more)

### Community 68 - "PreferencesProvider.tsx"
Cohesion: 0.18
Nodes (11): Preferences, PreferencesContext, PreferencesProvider(), save(), Probe(), usePreferences(), PROFILE, { refreshMock } (+3 more)

### Community 69 - "createDeckService"
Cohesion: 0.32
Nodes (13): activateItem(), insertDeckSrs(), createDeckService(), addWord(), answer(), answeredToday(), dueCount(), dueRows() (+5 more)

### Community 70 - "contentCheck.ts"
Cohesion: 0.14
Nodes (18): register(), CheckState, CONTENT_CHECK_INTERVAL_MS, ContentCheckDeps, ContentCheckResult, contentIssues(), info(), parseList() (+10 more)

### Community 71 - "test_core.py"
Cohesion: 0.16
Nodes (13): fake_synth(), ogg_seconds(), opus_head(), Standard-library tests for audio_core: run with `cd speech && python3 -m…, A mono s16 sine tone as WAV bytes, built with ffmpeg so it has the given native…, Run ffmpeg into a real WAV file (a piped WAV has no length in its header) and…, S16: mixed 22.05 kHz and 16 kHz voices must join at the right speed., Decode ogg back to WAV with ffmpeg and measure it with the wave module. (+5 more)

### Community 72 - "placementTypes.ts"
Cohesion: 0.15
Nodes (15): reworded(), setup(), answerInOrder(), setup(), PlacementQuestion, PlacementQuestionType, parsePlacementAnswer(), PlacementAnswer (+7 more)

### Community 73 - "speechProvider.ts"
Cohesion: 0.22
Nodes (18): send, SMTP, display(), dynamic, GET(), PUT(), AudioFilter, deleteSetting() (+10 more)

### Community 74 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, better-sqlite3, class-variance-authority, clsx, fflate, lucide-react, next, next-intl (+7 more)

### Community 75 - "Reading Module and Teil Engine Implementation Plan"
Cohesion: 0.29
Nodes (13): Double submit idempotence, Exam practice admin authoring, ExamFormat (formats.ts, formatProblems), 15 exam formats data, examPracticeService, Freestyle exam practice screen, Lesson pass rule (80/50), Reading Module and Teil Engine Implementation Plan (+5 more)

### Community 76 - "mailService.ts"
Cohesion: 0.14
Nodes (18): dynamic, POST(), clearSmtpSettings(), createMailService(), EMAIL_NOT_SET_UP, isAddress(), MailServiceDeps, readSmtpSettings() (+10 more)

### Community 77 - "Find Skills (skill)"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 79 - "createExamPracticeService"
Cohesion: 0.22
Nodes (25): createExamPracticeService(), activeFormat(), allowedMinutes(), explain(), insertAttempt(), listeningRunnable(), mockParts(), overview() (+17 more)

### Community 80 - "closeDb"
Cohesion: 0.10
Nodes (18): dynamic, GET(), dynamic, PATCH(), DELETE(), dynamic, POST(), seedMilestone() (+10 more)

### Community 81 - "[mode]/page.tsx"
Cohesion: 0.16
Nodes (11): dynamic, FreestyleModePage(), ExamPractice(), offsetOf(), FreestyleSession(), addMessages(), send(), getJson() (+3 more)

### Community 82 - "speechAvailability.ts"
Cohesion: 0.15
Nodes (12): AudioServiceDeps, createSpeechAvailability(), isUp(), record(), HEALTH_MEMO_MS, isSpeechUp(), KEY, sharedSpeechAvailability() (+4 more)

### Community 83 - "TestOutPage.test.tsx"
Cohesion: 0.20
Nodes (8): push, Q1, Q2, RESULT, TestOutPage(), loadState(), startOrResume(), base()

### Community 84 - "Bilingual Content Implementation Plan"
Cohesion: 0.13
Nodes (18): telc B1 coverage matrix, Tested German never translated, Per-lesson en/de toggle, LocalizedText {en,de} domain type, Bilingual Content Implementation Plan, Seed format v3 (German fields), Generalized coverage test, Level inventories per level (+10 more)

### Community 85 - "Speaking Module Plan"
Cohesion: 0.16
Nodes (14): Piper TTS sidecar (FastAPI), SpeechProvider adapter, Speaking Module Plan, Estimated pronunciation read-out, speech_clips temporary storage, Spoken Teil server-side turn loop, faster-whisper /transcribe sidecar endpoint, useRecorder hook / tap-to-talk (+6 more)

### Community 86 - "createPlacementService"
Cohesion: 0.12
Nodes (25): dynamic, PlacementExamAdminPage(), createPlacementService(), answer(), finish(), getBestResult(), getExam(), getSession() (+17 more)

### Community 87 - "flashcards/page.tsx"
Cohesion: 0.22
Nodes (4): dynamic, Flashcards(), { mockRedirect, mockGetProfile }, DeckPage()

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

### Community 92 - "wordLists.ts"
Cohesion: 0.24
Nodes (13): lemmaKey(), nounHasArticle(), allWordListProblems(), readWordList(), SHARED_LEVELS, ok, TRACK_LEVELS, WORD_LIST_DIR (+5 more)

### Community 93 - "themeTokens.test.ts"
Cohesion: 0.31
Nodes (6): channel(), contrastRatio(), luminance(), css, PAIRS, THEMES

### Community 94 - "admin/practice/routes.test.ts"
Cohesion: 0.16
Nodes (16): dynamic, POST(), dynamic, PATCH(), dynamic, GET(), STATUSES, createPracticeAdminService() (+8 more)

### Community 95 - "gating.ts pure gating rules"
Cohesion: 0.12
Nodes (17): branchLayout.ts branch layout, CurriculumTree UI, DependencyDiagram bands, Error codes lesson_locked, testout_unavailable, testout_cooldown, gating.ts pure gating rules, lesson_completions source column / milestone_testouts table, levelGating.ts service, migrateToMilestoneOnlyStructure migration (+9 more)

### Community 96 - "NaDoch! brand identity: blue-teal bubble with orange exclamation"
Cohesion: 0.39
Nodes (8): Apple touch icon (D! bubble), App icon SVG (D! speech bubble), NaDoch! logo (design source), NaDoch! logo (public brand asset), NaDoch! brand identity: blue-teal bubble with orange exclamation, PWA icon 192, PWA icon 512, PWA maskable icon 512

### Community 97 - "TrackLevelStructure"
Cohesion: 0.50
Nodes (7): errorOf(), TrackLevelStructure(), createMilestone(), deleteMilestone(), load(), moveLesson(), saveMilestone()

### Community 98 - "renderWithIntl"
Cohesion: 0.08
Nodes (15): DashboardPage(), days, VIEW, MESSAGES, REPLY, SESSION, TREE, connectSuccessfully() (+7 more)

### Community 99 - "adminAuthService (password hash/verify, session tokens)"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 100 - "api/exam-practice/routes.test.ts"
Cohesion: 0.21
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, GET(), badRequest(), isId() (+9 more)

### Community 101 - "placement/page.tsx"
Cohesion: 0.38
Nodes (4): dynamic, Placement(), { mockRedirect, mockGetProfile }, PlacementPage()

### Community 102 - "AudioActions"
Cohesion: 0.21
Nodes (11): AudioActions(), regenerate(), run(), upload(), describe(), errorOf(), PlacementExamAdmin(), upload() (+3 more)

### Community 103 - "onboarding/page.tsx"
Cohesion: 0.21
Nodes (8): dynamic, OnboardingPage(), { mockGetProfile, mockGetActiveConnection }, OnboardingWizard(), finishOnboarding(), handleConnectAndTest(), loadModels(), skipPlacement()

### Community 104 - "Accounts & Hosting Plan"
Cohesion: 0.33
Nodes (7): Better Auth, BYOK per user, Data rights and legal pages, Docker Compose + Tailscale + Litestream deployment, Table-driven isolation test, Per-user data migration (user_id), Accounts & Hosting Plan

### Community 105 - "RenderWithFakeFfmpegTest"
Cohesion: 0.17
Nodes (3): The pipeline's ffmpeg calls, recorded without running ffmpeg., RenderCancellationTest, RenderWithFakeFfmpegTest

### Community 106 - "getDb"
Cohesion: 0.14
Nodes (19): dynamic, POST(), respondWithPlacementErrors(), dynamic, GET(), answerRequest(), dynamic, POST() (+11 more)

### Community 107 - "VoiceManifestTest"
Cohesion: 0.17
Nodes (4): skipIf, BuildGuardsTest, skipUnless, VoiceManifestTest

### Community 108 - "merge-teil-sets.ts"
Cohesion: 0.14
Nodes (16): teilSetProblems(), loadBundled(), readBundle(), transcriptHashOf(), bundledAudioHashes(), canonical(), EXPECTED_LISTENING_ITEMS, listeningTotals() (+8 more)

### Community 109 - "2026-09-29-accounts-hosting-design.md"
Cohesion: 0.53
Nodes (5): Better Auth accounts, Per-user BYOK keys, Launch checklist, SQLite + Litestream hosting, Tailscale access

### Community 110 - "localSpeechProvider.ts"
Cohesion: 0.24
Nodes (8): errorText(), MAX_CONVERT_BYTES, MAX_RENDER_BYTES, post(), renderTimeoutMs(), isUnreachableError(), SpeechServiceError, SpeechUnreachableError

### Community 111 - "createConceptLinkService"
Cohesion: 0.14
Nodes (15): DELETE(), dynamic, dynamic, POST(), dynamic, GET(), dynamic, GET() (+7 more)

### Community 112 - "ServerTest"
Cohesion: 0.26
Nodes (4): ogg_seconds(), skipUnless, HTTP tests for the sidecar. They need FastAPI, httpx, Piper and the voice…, ServerTest

### Community 113 - "createProviderService"
Cohesion: 0.19
Nodes (15): dynamic, GET(), PUT(), dynamic, GET(), DELETE(), PATCH(), POST() (+7 more)

### Community 114 - "prompts.ts"
Cohesion: 0.27
Nodes (10): ARTICLE_WORDS, buildArticlePrompt(), buildConversationPrompt(), buildDrillPrompt(), buildSummaryPrompt(), buildWritingPrompt(), Built, History (+2 more)

### Community 115 - "SystemSettingsAdmin.test.tsx"
Cohesion: 0.22
Nodes (3): NoResizeObserver, SPEECH, STORED

### Community 117 - "audioService.ts"
Cohesion: 0.11
Nodes (24): audioHash(), FILTERS, ParsedTranscript, parseTranscript(), PAUSE_MS, RENDERER_VERSION, VOICES, AdminAudioStatus (+16 more)

### Community 118 - "next.config.js"
Cohesion: 0.40
Nodes (3): createNextIntlPlugin, nextConfig, withNextIntl

### Community 119 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 120 - "chat/route.ts"
Cohesion: 0.46
Nodes (6): dynamic, GET(), mapError(), POST(), post(), toChatErrorResponse()

### Community 121 - "TeilSetError"
Cohesion: 0.15
Nodes (17): duplicate(), exportPart(), list(), remove(), requireRow(), setStatus(), update(), upload() (+9 more)

### Community 122 - "Listening Module Plan"
Cohesion: 0.22
Nodes (12): NaDoch! PDF certificates, examSittingService, Gated formal level exam, Open Badge 3.0 credentials, Level Exams Plan, unlockService exam condition, Admin notifications and SMTP email, audio_jobs queue worker (+4 more)

### Community 123 - "telcB1Coverage.test.ts"
Cohesion: 0.18
Nodes (5): coverage, inventory, lessonIds, seed, Tree

### Community 124 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, better-sqlite3@13.0.3, esbuild@0.28.2, fsevents@2.3.3

### Community 127 - "ExerciseCard.test.tsx"
Cohesion: 0.25
Nodes (5): CARD, FILL, FREE, MC, renderCard()

### Community 131 - "ExamPracticeAdmin.test.tsx"
Cohesion: 0.22
Nodes (5): ExamPracticeFormatOption, FORMATS, POOL, SET, STARTER

### Community 132 - "2026-09-29-design-pass-design.md"
Cohesion: 0.36
Nodes (6): NaDoch! brand and logo, Installable PWA, Theme tokens, Thumb-zone shell and navigation, NaDoch! certificate and Open Badge, Gated level exams

### Community 133 - "backupService.ts"
Cohesion: 0.13
Nodes (24): isAudioFileName(), BackupEnvelope, BackupSizeOptions, BackupTooLargeError, base64Length(), createBackupStream(), decodedLength(), envelopeChunks() (+16 more)

### Community 136 - "Seed format v2"
Cohesion: 0.31
Nodes (7): convert-seeds-v2.ts one-off script, Task 8 content regrouping and bundled seed validation test, Seed format v2, Bilingual en/de content model, Seed format v3, Curriculum export, AI practice pool with admin review

### Community 137 - "ProfilePage.test.tsx"
Cohesion: 0.33
Nodes (3): ProfilePage(), PROFILE, { refreshMock }

### Community 138 - "topics/route.test.ts"
Cohesion: 0.60
Nodes (3): dynamic, GET(), get()

### Community 139 - "freestyleService.test.ts"
Cohesion: 0.40
Nodes (4): MAX_SETUP_VALUE_LENGTH, conversationReply, setup(), summaryReply

### Community 140 - "CurriculumTree.test.tsx"
Cohesion: 0.33
Nodes (4): CurriculumTree(), lesson(), TREE, write()

### Community 143 - "Speech sidecar"
Cohesion: 0.50
Nodes (3): Build, start and check, Speech sidecar, Tests without Docker

## Ambiguous Edges - Review These
- `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` → `germanaitutor (project README)`  [AMBIGUOUS]
  README.md · relation: references
- `TRACKS / isTrack in levels.ts` → `en/de message catalogs parity`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-24-tutoring-phase1b-teaching-loop.md · relation: semantically_similar_to

## Knowledge Gaps
- **678 isolated node(s):** `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }` (+673 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1062 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` and `germanaitutor (project README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `TRACKS / isTrack in levels.ts` and `en/de message catalogs parity`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `ExamPracticeAdmin.tsx`, `seedTutoringCurriculum`, `isAdminSessionValid`, `localizedText.ts`, `ExerciseCard.tsx`, `backup/route.test.ts`, `providerService.ts`, `@testing-library/react`, `lessonAnswers.ts`, `testOutService.ts`, `mergeWordList.ts`, `createTestOutService`, `audio-content-checks.ts`, `export/[track]/[level]/route.ts`, `providers/types.ts`, `delayedResponse`, `freestyle/routes.test.ts`, `curriculumSeedLoader.ts`, `client.ts`, `createAudioService`, `errorBody`, `app/layout.tsx`, `admin/audio/routes.test.ts`, `package.json`, `adminSession.ts`, `CefrLevel`, `notificationService.ts`, `attemptService.ts`, `flashcards/routes.test.ts`, `taskTypes.ts`, `replies.ts`, `progressService.ts`, `examPracticeService.ts`, `a11y.test.tsx`, `AppShell.test.tsx`, `gating.ts`, `createTeilSetService`, `practiceService.ts`, `TaskInputs.tsx`, `teilSetService.ts`, `curriculumStructureService.ts`, `levels.ts`, `createProfileService`, `deckService.test.ts`, `PreferencesProvider.tsx`, `contentCheck.ts`, `placementTypes.ts`, `speechProvider.ts`, `mailService.ts`, `LessonPage`, `closeDb`, `speechAvailability.ts`, `TestOutPage.test.tsx`, `createPlacementService`, `flashcards/page.tsx`, `OnboardingWizard.tsx`, `memoryStore.ts`, `app/page.tsx`, `wordLists.ts`, `themeTokens.test.ts`, `admin/practice/routes.test.ts`, `renderWithIntl`, `api/exam-practice/routes.test.ts`, `placement/page.tsx`, `onboarding/page.tsx`, `getDb`, `merge-teil-sets.ts`, `createConceptLinkService`, `createProviderService`, `SystemSettingsAdmin.test.tsx`, `audioService.ts`, `chat/route.ts`, `TeilSetError`, `telcB1Coverage.test.ts`, `ExerciseCard.test.tsx`, `ExamPracticeAdmin.test.tsx`, `backupService.ts`, `ProfilePage.test.tsx`, `topics/route.test.ts`, `freestyleService.test.ts`, `CurriculumTree.test.tsx`, `manifest.ts`, `deck.test.ts`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `getDb()` connect `getDb` to `ExamPracticeAdmin.tsx`, `isAdminSessionValid`, `backup/route.test.ts`, `topics/route.test.ts`, `testOutService.ts`, `export/[track]/[level]/route.ts`, `freestyle/routes.test.ts`, `client.ts`, `createAudioService`, `errorBody`, `app/layout.tsx`, `admin/audio/routes.test.ts`, `adminSession.ts`, `attemptService.ts`, `flashcards/routes.test.ts`, `vitest`, `createTeilSetService`, `levels.ts`, `createProfileService`, `speechProvider.ts`, `mailService.ts`, `closeDb`, `[mode]/page.tsx`, `createPlacementService`, `flashcards/page.tsx`, `app/page.tsx`, `admin/practice/routes.test.ts`, `api/exam-practice/routes.test.ts`, `placement/page.tsx`, `onboarding/page.tsx`, `createConceptLinkService`, `createProviderService`, `chat/route.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `Prerequisite scope rule` connect `gating.ts pure gating rules` to `Seed format v2`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic` to the rest of the system?**
  _678 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.04419493549928333 - nodes in this community are weakly interconnected._