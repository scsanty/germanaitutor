# Graph Report - GermanLearner  (2026-11-23)

## Corpus Check
- 991 files · ~1,590,126 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4056 nodes · 12739 edges · 149 communities (139 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 332 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d33ee25`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- button.tsx
- seedTutoringCurriculum
- isAdminSessionValid
- Tutoring Phase 1B Teaching Loop Plan
- extract-wortlisten.ts
- TappableGerman.tsx
- ExerciseCard.tsx
- client.ts
- createProviderService
- speechClipService.ts
- App-wide Design Pass Implementation Plan
- lessonChatService.ts
- 2026-09-24-tutoring-section-design.md
- WritingSession.tsx
- Curriculum Admin Management (Phase 1) Implementation Plan
- attemptService.ts
- wordLists.ts
- testOutService.ts
- audio-content-checks.ts
- curriculumExportService.ts
- providers/types.ts
- practiceService
- delayedResponse
- freestyle/routes.test.ts
- curriculumSeedLoader.ts
- practiceService.ts
- examPracticeService.ts
- audioService.ts
- audio_core.py
- errorCodes.ts
- react
- AppShell.tsx
- speech/route.ts
- package.json
- spokenPartService.ts
- better-sqlite3
- notificationService.ts
- Curriculum + Admin Auth SQLite Schema (9 tables)
- srs.ts
- createTestOutService
- schema.ts
- SpeechError
- GermanLearner Kanban board
- lessonAnswers.ts
- freeTextGrading.ts
- resolveAudioGate
- formats.ts
- devDependencies
- SettingsPage
- a11y.test.tsx
- deckService.ts
- DeckPage.test.tsx
- Freestyle and Vocabulary Deck Implementation Plan
- compilerOptions
- components.json
- levelGating.ts
- teilSetService.ts
- ErrorCode
- CefrLevel
- TaskInputs.tsx
- spokenGrading.ts
- curriculumStructureService.ts
- attemptService.test.ts
- createProfileService
- Shared Teil exam-part engine
- createFreestyleService
- createConceptLinkService
- renderWithIntl.tsx
- DependencyDiagram.tsx
- lib/types.ts
- test_core.py
- replies.ts
- speaking.test.tsx
- dependencies
- Reading Module and Teil Engine Implementation Plan
- speechProvider.ts
- Find Skills (skill)
- LessonPage
- merge-lesson-exercises.ts
- aiService.ts
- next-intl
- worker.ts
- TestOutPage.test.tsx
- Bilingual Content Implementation Plan
- Speaking Module Plan
- createDbClient
- createExamPracticeService
- OnboardingWizard.tsx
- memoryStore.ts
- build-icons.ts
- app/page.tsx
- contentCheck.ts
- themeTokens.test.ts
- freestyleService.ts
- gating.ts pure gating rules
- NaDoch! brand identity: blue-teal bubble with orange exclamation
- TrackLevelStructure
- vitest
- adminAuthService (password hash/verify, session tokens)
- getDb
- [mode]/page.tsx
- AudioActions
- onboarding/page.tsx
- Accounts & Hosting Plan
- .ffmpeg
- placementService.ts
- FfmpegArgsTest
- merge-teil-sets.ts
- 2026-09-29-accounts-hosting-design.md
- audioService.test.ts
- createProgressService
- ServerTest
- defaultKeyFilePath
- SystemSettingsAdmin.tsx
- SystemSettingsAdmin.test.tsx
- RequestBodyTest
- spokenPartService.test.ts
- next.config.js
- scripts
- merge-lesson-exercises.test.ts
- lessonCards.ts
- Level Exams Plan
- createPracticeService
- allowScripts
- MultipleChoiceFields
- build-logo.ts
- renderWithIntl
- Flashcards only in vocabulary lessons rule
- next-env.d.ts
- ExamPracticeAdmin.test.tsx
- 2026-09-29-design-pass-design.md
- backupService.ts
- speech.test.tsx
- ParseRenderRequestTest
- Bilingual en/de content model
- merge-teil-sets.test.ts
- createCurriculumService
- SessionSetup
- CurriculumTree.test.tsx
- manifest.ts
- exerciseTypesMigration.test.ts
- Speech sidecar
- QueuePage.test.tsx
- TranscribeHelpersTest
- TranscriptReveal.tsx
- ProfilePage.test.tsx
- freestyleService.test.ts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 257 edges
2. `vitest` - 246 edges
3. `cn()` - 152 edges
4. `react` - 110 edges
5. `createDbClient()` - 107 edges
6. `CefrLevel` - 94 edges
7. `createProfileService()` - 81 edges
8. `isAdminSessionValid()` - 77 edges
9. `better-sqlite3` - 74 edges
10. `LocalizedText` - 72 edges

## Surprising Connections (you probably didn't know these)
- `App icon SVG (D! speech bubble)` --semantically_similar_to--> `PWA icon 512`  [INFERRED] [semantically similar]
  app/icon.svg → public/icons/icon-512.png
- `NaDoch! logo (design source)` --semantically_similar_to--> `NaDoch! logo (public brand asset)`  [INFERRED] [semantically similar]
  docs/design/nadoch-logo.svg → public/brand/nadoch-logo.svg
- `AdminTrackLevelPage()` --calls--> `isAdminSessionValid()`  [EXTRACTED]
  app/admin/curriculum/[track]/[level]/page.tsx → lib/auth/adminSession.ts
- `NotificationsAdminPage()` --calls--> `isAdminSessionValid()`  [EXTRACTED]
  app/admin/notifications/page.tsx → lib/auth/adminSession.ts
- `jobStatus()` --calls--> `getDb()`  [EXTRACTED]
  app/api/admin/audio/routes.test.ts → lib/db/client.ts

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

## Communities (149 total, 9 thin omitted)

### Community 0 - "cn"
Cohesion: 0.03
Nodes (78): activeHref(), AdminNav(), ITEMS, useUnread(), Heatmap(), shade(), SkillProgress(), DISC (+70 more)

### Community 1 - "button.tsx"
Cohesion: 0.11
Nodes (22): StructureEntry, StructureLesson, AudioPlayer(), SEEK_ACTIONS, setSeekHandlers(), Phase, SummaryList(), WordResult (+14 more)

### Community 2 - "seedTutoringCurriculum"
Cohesion: 0.14
Nodes (20): oldDatabase(), ACTIVITY_DAYS, setup(), setup(), setup(), setup(), listeningSetup(), setup() (+12 more)

### Community 3 - "isAdminSessionValid"
Cohesion: 0.04
Nodes (54): FlashcardViolationsPage(), AdminLessonPage(), dynamic, AdminCurriculumPage(), dynamic, PlacementExamAdminPage(), dynamic, PracticeReviewPage() (+46 more)

### Community 4 - "Tutoring Phase 1B Teaching Loop Plan"
Cohesion: 0.05
Nodes (68): ActiveProviderBanner translation, aiService (generateWithActiveProvider), Catalog parity test, Curriculum export service, Default placement exam (data/placement-exam.json), delayedResponse test helper, exerciseContentValidation, Admin export downloads (zip) (+60 more)

### Community 5 - "extract-wortlisten.ts"
Cohesion: 0.07
Nodes (57): drop(), feminineOf(), GOETHE, main(), ONE, OUT_DIR, Parsed, parseGoethe() (+49 more)

### Community 6 - "TappableGerman.tsx"
Cohesion: 0.19
Nodes (10): ABBREVIATIONS, endsSentence(), SaveState, splitSentences(), TappableGerman(), Token, tokenize(), Popover() (+2 more)

### Community 7 - "ExerciseCard.tsx"
Cohesion: 0.05
Nodes (80): CardFace(), Rating, RATINGS, answeredCount(), emptyAnswer(), itemLabel(), ItemsReview(), percentOf() (+72 more)

### Community 8 - "client.ts"
Cohesion: 0.10
Nodes (31): dynamic, etagOf(), GET(), matches(), BYTES, get(), HASH, dynamic (+23 more)

### Community 9 - "createProviderService"
Cohesion: 0.14
Nodes (20): decrypt(), encrypt(), createProviderService(), createConnection(), getActiveConnection(), getConnection(), getDecryptedApiKey(), getRow() (+12 more)

### Community 10 - "speechClipService.ts"
Cohesion: 0.07
Nodes (42): dynamic, GET(), badRequest(), respond(), clipRequest(), provider, RESULT, upload() (+34 more)

### Community 11 - "App-wide Design Pass Implementation Plan"
Cohesion: 0.10
Nodes (43): Provider adapter interface, Anthropic adapter, Server-side API routes (profile, providers, usage, backup, reset), App shell onboarding gate and provider failure banner, Backup export/import service, BYOK AI provider connections, Core global constraints (local-only, server-side only, four providers), Master key file and AES-256-GCM encryption (+35 more)

### Community 12 - "lessonChatService.ts"
Cohesion: 0.12
Nodes (29): dynamic, GET(), mapError(), POST(), post(), ChatError, ChatErrorKind, createLessonChatService() (+21 more)

### Community 13 - "2026-09-24-tutoring-section-design.md"
Cohesion: 0.27
Nodes (9): Milestone regrouping (15 seeds, 3-4 milestones each), Lesson chat and Ask AI, Level unlocking (global hard lock), Placement test, SM-2 spaced repetition and Daily Queue, Tutoring teaching loop (lesson, exercises, grading), Branching tree layout, Ranked hard-gated milestones (+1 more)

### Community 14 - "WritingSession.tsx"
Cohesion: 0.09
Nodes (26): marksOf(), markTypeOf(), pairVersions(), WritingSession(), GermanTextarea(), Props, GermanTextInput(), Props (+18 more)

### Community 15 - "Curriculum Admin Management (Phase 1) Implementation Plan"
Cohesion: 0.11
Nodes (36): Admin session gate (isAdminSessionValid, JSON 401), Concept-link API routes, ConceptLinkSection and Edit/Clone wiring, Concept-link service, Concept-links connect different tracks at same level only, Milestone/section structure service, wouldCreateCycle cycle detection, Data-preserving schema migration rule (+28 more)

### Community 16 - "attemptService.ts"
Cohesion: 0.13
Nodes (20): AudioAvailabilityDeps, AudioGate, NEVER_REVIEWED_SQL, AttemptDeps, AttemptErrorKind, AttemptService, DEFAULT_CODE, SrsRow (+12 more)

### Community 17 - "wordLists.ts"
Cohesion: 0.13
Nodes (28): lemmaKey(), nounHasArticle(), DroppedEntry, FIELDS, formatWordListFile(), lowerLevels(), mergeWordList(), normalized() (+20 more)

### Community 18 - "testOutService.ts"
Cohesion: 0.08
Nodes (34): branchLayout.ts branch layout, CurriculumTree UI, DependencyDiagram bands, Error codes lesson_locked, testout_unavailable, testout_cooldown, levelGating.ts service, Milestone test-out, TestOutPage UI, testOut.ts test-out rules (+26 more)

### Community 19 - "audio-content-checks.ts"
Cohesion: 0.12
Nodes (18): AudioCheckOptions, AudioCheckResult, audioContentProblems(), ENGLISH, MARKER_TEXT, MAYBE_PRINTED_AUDIO, MULTI_TEXT, normalize() (+10 more)

### Community 20 - "curriculumExportService.ts"
Cohesion: 0.21
Nodes (13): dynamic, GET(), one(), dynamic, GET(), createCurriculumExportService(), currentSeedVersion(), exportAll() (+5 more)

### Community 21 - "providers/types.ts"
Cohesion: 0.14
Nodes (17): dynamic, GET(), createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter() (+9 more)

### Community 22 - "practiceService"
Cohesion: 0.08
Nodes (31): Admin practice API routes, Admin practice review page and pool section, attemptService, Batch of 5 exercises served one at a time, Chat load retry, Curriculum export and seed loader practice list, errorCodes (ErrorCode, errorBody), errors message namespace (+23 more)

### Community 23 - "delayedResponse"
Cohesion: 0.06
Nodes (16): NOTIFICATIONS_CHANGED, HASH, STRUCTURE, ITEMS, SUMMARY, FOUR, OVERVIEW, push (+8 more)

### Community 24 - "freestyle/routes.test.ts"
Cohesion: 0.20
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+9 more)

### Community 25 - "curriculumSeedLoader.ts"
Cohesion: 0.09
Nodes (23): filled(), lessonTextProblems(), LessonTexts, milestoneTextProblems(), ok, hasInstructionKey(), DIR, seeds (+15 more)

### Community 26 - "practiceService.ts"
Cohesion: 0.09
Nodes (40): EXERCISE_TYPES, hasInstruction(), instructionProblems(), isNonEmptyString(), validateExerciseContent(), validateSpokenResponse(), ExerciseContent, ExerciseType (+32 more)

### Community 27 - "examPracticeService.ts"
Cohesion: 0.08
Nodes (43): ExamFormat, ExamPart, ItemReview, MockRun, OralMockRun, PracticeOverview, PracticeResult, ReadinessView (+35 more)

### Community 28 - "audioService.ts"
Cohesion: 0.07
Nodes (49): dynamic, ownedHash(), Props, PUT(), jobStatus(), provider, uploadSpy, hasAudio() (+41 more)

### Community 29 - "audio_core.py"
Cohesion: 0.07
Nodes (37): Cancelled, Event, Ffmpeg, check_cancelled(), check_pcm(), chime_args(), concat_list(), convert() (+29 more)

### Community 30 - "errorCodes.ts"
Cohesion: 0.09
Nodes (29): dynamic, POST(), RATINGS, dynamic, GET(), dynamic, GET(), badRequest() (+21 more)

### Community 31 - "react"
Cohesion: 0.04
Nodes (85): dynamic, dynamic, dynamic, TopMistakeItem, BTN, FIELD_LABEL, FOCUS, HINT (+77 more)

### Community 32 - "AppShell.tsx"
Cohesion: 0.10
Nodes (20): RUN, ShellState(), Shortcuts(), AppShell(), BadgeCounts, BARE_ROUTES, fetchDue(), NavLink() (+12 more)

### Community 33 - "speech/route.ts"
Cohesion: 0.20
Nodes (21): adminError(), notAdmin(), readJsonObject(), unauthorized(), POST(), dynamic, POST(), dynamic (+13 more)

### Community 34 - "package.json"
Cohesion: 0.08
Nodes (22): name, private, version, clsx, @fontsource/nunito, jsdom, postcss, react-dom (+14 more)

### Community 35 - "spokenPartService.ts"
Cohesion: 0.11
Nodes (43): clock(), SpokenState, explain(), finish(), letterResult(), revealOf(), storedResult(), submit() (+35 more)

### Community 36 - "better-sqlite3"
Cohesion: 0.13
Nodes (17): wouldCreateCycle(), ExerciseInput, reconcileExercises(), PlacementInput, assertFlashcardRule(), assertLessonTexts(), createLessonAdminService(), createLesson() (+9 more)

### Community 37 - "notificationService.ts"
Cohesion: 0.11
Nodes (23): AdminNotification, countIn(), createNotificationService(), email(), info(), list(), raise(), resolve() (+15 more)

### Community 38 - "Curriculum + Admin Auth SQLite Schema (9 tables)"
Cohesion: 0.10
Nodes (22): CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import (+14 more)

### Community 39 - "srs.ts"
Cohesion: 0.24
Nodes (10): getDashboard(), addDays(), localDate(), computeNextReview(), EASE_CHANGE, INITIAL_EASE, MIN_EASE, roundEase() (+2 more)

### Community 40 - "createTestOutService"
Cohesion: 0.46
Nodes (13): createTestOutService(), answer(), context(), currentStatus(), finish(), getExercise(), openAttempt(), pruned() (+5 more)

### Community 41 - "schema.ts"
Cohesion: 0.11
Nodes (18): createChatPracticeIndex(), createTablesIfMissing(), EXERCISE_TYPES, migrateBilingualColumns(), migrateChatPracticeColumn(), migrateConceptIdAndPlacementUniqueness(), migrateDailyReviewCap(), migrateExerciseTypeCheck() (+10 more)

### Community 42 - "SpeechError"
Cohesion: 0.10
Nodes (28): exception_handler, get, PiperVoice, post, Request, check_whisper_model(), parse_render_body(), parse_render_request() (+20 more)

### Community 43 - "GermanLearner Kanban board"
Cohesion: 0.18
Nodes (21): 8 Accounts and hosting, #2.5 Curriculum admin management, 1b Curriculum expansion telc B1, 0b Bilingual content, GermanLearner Kanban board, #2 CEFR frameworks, #1 Core platform, 1 App-wide design pass NaDoch! (+13 more)

### Community 44 - "lessonAnswers.ts"
Cohesion: 0.05
Nodes (80): Shown, FillBlankContent, FreeTextContent, MultipleChoiceContent, SpokenResponseContent, reviewOf(), ExerciseGradeOutcome, ExerciseLetterInput (+72 more)

### Community 45 - "freeTextGrading.ts"
Cohesion: 0.09
Nodes (30): LetterReview(), useCopyToFreestyle(), copy(), storeWritingDraft(), trimSnippet(), ErrorCategory, escapeRe(), IDS (+22 more)

### Community 46 - "resolveAudioGate"
Cohesion: 0.36
Nodes (6): resolveAudioGate(), availableExercises(), getDailyQueue(), DueCandidate, remainingReviews(), selectDueItems()

### Community 47 - "formats.ts"
Cohesion: 0.06
Nodes (58): GRADE, TWO_TASKS, IDS, LEVELS, DIR, files, ROOT, DIR (+50 more)

### Community 48 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, @fontsource/nunito, jsdom, opentype.js, postcss, sharp, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 49 - "SettingsPage"
Cohesion: 0.16
Nodes (12): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleProfileChange(), handleRetest(), handleSaveModel(), handleSetActive() (+4 more)

### Community 50 - "a11y.test.tsx"
Cohesion: 0.09
Nodes (19): PROFILE, { refreshMock }, Harness(), push, RESULT, RUN, HOEREN_1, LESEN_1 (+11 more)

### Community 51 - "deckService.ts"
Cohesion: 0.11
Nodes (30): deckRemaining(), selectDeckDue(), activateItem(), insertDeckSrs(), readWordList(), wordListPath(), AddedWordSource, CODE (+22 more)

### Community 52 - "DeckPage.test.tsx"
Cohesion: 0.22
Nodes (4): DeckPage(), DECK, play, renderPage()

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
Cohesion: 0.07
Nodes (36): applyRepairAndDelete(), computeRepairPreview(), Placement, placementLookup(), RepairEdge, RepairPreview, PlacedLesson, DIR (+28 more)

### Community 57 - "teilSetService.ts"
Cohesion: 0.07
Nodes (68): ExamPracticeAdminPage(), formatOptions(), dynamic, GET(), Ctx, DELETE(), dynamic, PATCH() (+60 more)

### Community 58 - "ErrorCode"
Cohesion: 0.17
Nodes (9): CODE, PracticeErrorKind, STATUS, toPracticeErrorResponse(), GenerationFailure, ApiErrorBody, errorBodyFor(), ErrorCode (+1 more)

### Community 59 - "CefrLevel"
Cohesion: 0.07
Nodes (46): AdminTrackLevelPage(), dynamic, LessonEditorForm(), LessonEditorInitialValues, Preferences, Exercise, isNeverReviewedType(), Lesson (+38 more)

### Community 60 - "TaskInputs.tsx"
Cohesion: 0.07
Nodes (33): RunnerHeader(), AudioMode, Cloze(), letterOf(), Matching(), Props, TaskInputs(), TaskPane (+25 more)

### Community 61 - "spokenGrading.ts"
Cohesion: 0.09
Nodes (25): UNCLEAR_THRESHOLD, estimate, part, rubric, set, turns, buildPartnerPrompt(), buildSpokenGradingPrompt() (+17 more)

### Community 62 - "curriculumStructureService.ts"
Cohesion: 0.12
Nodes (22): PlacementMode, resolvePlacement(), assertPrerequisiteScope(), scopeViolationMessages(), setup(), randomSuffix(), ensureUnsortedExists(), unsortedMilestoneId() (+14 more)

### Community 63 - "attemptService.test.ts"
Cohesion: 0.15
Nodes (26): words(), AttemptError, createAttemptService(), assertDueInQueue(), assertLessonOpen(), completeLesson(), getExercise(), getSrs() (+18 more)

### Community 64 - "createProfileService"
Cohesion: 0.05
Nodes (50): dynamic, GET(), PATCH(), dynamic, GET(), dynamic, GET(), Item (+42 more)

### Community 65 - "Shared Teil exam-part engine"
Cohesion: 0.19
Nodes (17): Admin notifications and SMTP email, audio_questions task type, Freestyle mode registry, Piper TTS speech sidecar, Exam format data (15 formats), Task types (passage, matching, cloze), Shared Teil exam-part engine, Teil sets (3 per Teil) (+9 more)

### Community 66 - "createFreestyleService"
Cohesion: 0.24
Nodes (26): recordMistakes(), createFreestyleService(), addMessage(), ask(), askConversation(), end(), grammarTopics(), history() (+18 more)

### Community 67 - "createConceptLinkService"
Cohesion: 0.13
Nodes (14): DELETE(), dynamic, dynamic, POST(), dynamic, GET(), dynamic, GET() (+6 more)

### Community 68 - "renderWithIntl.tsx"
Cohesion: 0.14
Nodes (13): FREE_QUESTION, MC_QUESTION, OUTCOME, PreferencesContext, PreferencesProvider(), save(), Probe(), usePreferences() (+5 more)

### Community 69 - "DependencyDiagram.tsx"
Cohesion: 0.23
Nodes (7): DependencyDiagram(), DiagramEdge, DiagramEntry, DiagramLesson, BranchNode, computeBranchLayout(), layout()

### Community 70 - "lib/types.ts"
Cohesion: 0.21
Nodes (15): dynamic, GET(), selectIntroductions(), getLessonView(), passedExerciseIds(), checkLevelFinishedAfterCompletion(), raiseUnlockedLevel(), UnlockService (+7 more)

### Community 71 - "test_core.py"
Cohesion: 0.16
Nodes (13): fake_synth(), ogg_seconds(), opus_head(), Standard-library tests for audio_core: run with `cd speech && python3 -m…, A mono s16 sine tone as WAV bytes, built with ffmpeg so it has the given native…, Run ffmpeg into a real WAV file (a piped WAV has no length in its header) and…, S16: mixed 22.05 kHz and 16 kHz voices must join at the right speed., Decode ogg back to WAV with ffmpeg and measure it with the wave module. (+5 more)

### Community 72 - "replies.ts"
Cohesion: 0.22
Nodes (16): extractJsonObject(), correction, buildNormalizePrompt(), corrections(), localizedPair(), parseArticleReply(), parseConversationReply(), parseDrillReply() (+8 more)

### Community 73 - "speaking.test.tsx"
Cohesion: 0.10
Nodes (12): FakeRecorder, GRADE, INTRO, PARTNER, renderRunner(), RESULT, RUBRIC, RUN (+4 more)

### Community 74 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, better-sqlite3, class-variance-authority, clsx, fflate, lucide-react, next, next-intl (+7 more)

### Community 75 - "Reading Module and Teil Engine Implementation Plan"
Cohesion: 0.29
Nodes (13): Double submit idempotence, Exam practice admin authoring, ExamFormat (formats.ts, formatProblems), 15 exam formats data, examPracticeService, Freestyle exam practice screen, Lesson pass rule (80/50), Reading Module and Teil Engine Implementation Plan (+5 more)

### Community 76 - "speechProvider.ts"
Cohesion: 0.11
Nodes (30): send, SMTP, dynamic, POST(), AudioFilter, deleteSetting(), getSetting(), setSetting() (+22 more)

### Community 77 - "Find Skills (skill)"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 79 - "merge-lesson-exercises.ts"
Cohesion: 0.21
Nodes (15): englishWords(), maybePrintsAudio(), printsAudio(), strings(), canonical(), FORM_LESSONS, LETTER_WORDS, main() (+7 more)

### Community 80 - "aiService.ts"
Cohesion: 0.16
Nodes (7): generateWithActiveProvider(), isAiAvailable(), request, setup(), input, createUsageService(), UsageService

### Community 81 - "next-intl"
Cohesion: 0.05
Nodes (56): dynamic, NotificationsAdminPage(), Filter, FILTERS, NotificationsAdmin(), when(), DeckReview(), AddWord() (+48 more)

### Community 82 - "worker.ts"
Cohesion: 0.10
Nodes (23): register(), CONTENT_TICK_MS, createTick(), HEALTH_TICK_MS, JOB_TICK_MS, startBackgroundWorker(), started, started (+15 more)

### Community 83 - "TestOutPage.test.tsx"
Cohesion: 0.20
Nodes (8): push, Q1, Q2, RESULT, TestOutPage(), loadState(), startOrResume(), base()

### Community 84 - "Bilingual Content Implementation Plan"
Cohesion: 0.13
Nodes (18): telc B1 coverage matrix, Tested German never translated, Per-lesson en/de toggle, LocalizedText {en,de} domain type, Bilingual Content Implementation Plan, Seed format v3 (German fields), Generalized coverage test, Level inventories per level (+10 more)

### Community 85 - "Speaking Module Plan"
Cohesion: 0.14
Nodes (17): audio_jobs queue worker, Piper TTS sidecar (FastAPI), Listening Module Plan, Replay rules, SpeechProvider adapter, Speaking Module Plan, Estimated pronunciation read-out, speech_clips temporary storage (+9 more)

### Community 86 - "createDbClient"
Cohesion: 0.13
Nodes (7): setup(), createDbClient(), setup(), oldDatabase(), seed(), setup(), setup()

### Community 87 - "createExamPracticeService"
Cohesion: 0.25
Nodes (19): createExamPracticeService(), activeFormat(), insertAttempt(), listeningRunnable(), mockParts(), overview(), pick(), readiness() (+11 more)

### Community 88 - "OnboardingWizard.tsx"
Cohesion: 0.12
Nodes (12): Logo(), MARKUP, LOGO_SVG, DOT_STEPS, JSON_HEADERS, PROVIDER_TYPES, Step, WizardCard() (+4 more)

### Community 89 - "memoryStore.ts"
Cohesion: 0.24
Nodes (7): createMemoryStore(), getEntity(), queryEntities(), MemoryEntity, MemoryStore, Row, rowToEntity()

### Community 90 - "build-icons.ts"
Cohesion: 0.22
Nodes (9): opentype.js, sharp, d, font, fontBytes, fontPath, iconSvg(), main() (+1 more)

### Community 91 - "app/page.tsx"
Cohesion: 0.15
Nodes (7): dynamic, Home(), { mockRedirect, mockGetProfile }, ActiveProviderBanner(), HomeIntro(), HomeScreen(), TREE

### Community 92 - "contentCheck.ts"
Cohesion: 0.24
Nodes (10): CheckState, CONTENT_CHECK_INTERVAL_MS, ContentCheckDeps, ContentCheckResult, contentIssues(), info(), parseList(), readState() (+2 more)

### Community 93 - "themeTokens.test.ts"
Cohesion: 0.31
Nodes (6): channel(), contrastRatio(), luminance(), css, PAIRS, THEMES

### Community 94 - "freestyleService.ts"
Cohesion: 0.18
Nodes (16): ARTICLE_WORDS, buildArticlePrompt(), buildConversationPrompt(), buildDrillPrompt(), buildSummaryPrompt(), buildWritingPrompt(), Built, History (+8 more)

### Community 95 - "gating.ts pure gating rules"
Cohesion: 0.15
Nodes (15): convert-seeds-v2.ts one-off script, gating.ts pure gating rules, lesson_completions source column / milestone_testouts table, migrateToMilestoneOnlyStructure migration, Difficulty-ranked hard-gated milestones, Move to... lesson milestone route, Tutoring Phase 2 practice pool precondition, Curriculum Restructure Implementation Plan (+7 more)

### Community 96 - "NaDoch! brand identity: blue-teal bubble with orange exclamation"
Cohesion: 0.39
Nodes (8): Apple touch icon (D! bubble), App icon SVG (D! speech bubble), NaDoch! logo (design source), NaDoch! logo (public brand asset), NaDoch! brand identity: blue-teal bubble with orange exclamation, PWA icon 192, PWA icon 512, PWA maskable icon 512

### Community 97 - "TrackLevelStructure"
Cohesion: 0.50
Nodes (7): errorOf(), TrackLevelStructure(), createMilestone(), deleteMilestone(), load(), moveLesson(), saveMilestone()

### Community 98 - "vitest"
Cohesion: 0.07
Nodes (17): { redirectMock, isAdminSessionValidMock, listMock }, { redirectMock, isAdminSessionValidMock, listTracksMock }, AdminLogin(), goetheStructure, telcStructure, structure, trackStructureResponse, ITEM (+9 more)

### Community 99 - "adminAuthService (password hash/verify, session tokens)"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 100 - "getDb"
Cohesion: 0.21
Nodes (23): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+15 more)

### Community 101 - "[mode]/page.tsx"
Cohesion: 0.19
Nodes (11): dynamic, FreestyleModePage(), FreestyleSession(), addMessages(), send(), getJson(), LoadError, parseInitialTopic() (+3 more)

### Community 102 - "AudioActions"
Cohesion: 0.21
Nodes (11): AudioActions(), regenerate(), run(), upload(), describe(), errorOf(), PlacementExamAdmin(), upload() (+3 more)

### Community 103 - "onboarding/page.tsx"
Cohesion: 0.21
Nodes (8): dynamic, OnboardingPage(), { mockGetProfile, mockGetActiveConnection }, OnboardingWizard(), finishOnboarding(), handleConnectAndTest(), loadModels(), skipPlacement()

### Community 104 - "Accounts & Hosting Plan"
Cohesion: 0.33
Nodes (7): Better Auth, BYOK per user, Data rights and legal pages, Docker Compose + Tailscale + Litestream deployment, Table-driven isolation test, Per-user data migration (user_id), Accounts & Hosting Plan

### Community 105 - ".ffmpeg"
Cohesion: 0.13
Nodes (7): decode_for_transcription(), Decode an uploaded recording (any container on the /convert allow-list, file…, Decode an upload to PCM. Like `convert`, it goes through a temp file, not a…, transcribe_args(), The pipeline's ffmpeg calls, recorded without running ffmpeg., RenderCancellationTest, RenderWithFakeFfmpegTest

### Community 106 - "placementService.ts"
Cohesion: 0.05
Nodes (77): dynamic, formatFrom(), GET(), PUT(), put(), dynamic, POST(), respondWithPlacementErrors() (+69 more)

### Community 107 - "FfmpegArgsTest"
Cohesion: 0.10
Nodes (5): skipIf, BuildGuardsTest, FfmpegArgsTest, skipUnless, VoiceManifestTest

### Community 108 - "merge-teil-sets.ts"
Cohesion: 0.24
Nodes (17): BundledSetFile, transcriptHashOf(), bundledAudioHashes(), canonical(), existingSets(), EXPECTED_LISTENING_ITEMS, letterTotals(), letterWarnings() (+9 more)

### Community 109 - "2026-09-29-accounts-hosting-design.md"
Cohesion: 0.53
Nodes (5): Better Auth accounts, Per-user BYOK keys, Launch checklist, SQLite + Litestream hosting, Tailscale access

### Community 110 - "audioService.test.ts"
Cohesion: 0.15
Nodes (12): createLocalSpeechProvider(), errorText(), MAX_CONVERT_BYTES, MAX_RENDER_BYTES, MAX_TRANSCRIBE_BYTES, parseTranscription(), post(), renderTimeoutMs() (+4 more)

### Community 111 - "createProgressService"
Cohesion: 0.10
Nodes (21): dynamic, POST(), dynamic, POST(), dynamic, GET(), dynamic, GET() (+13 more)

### Community 112 - "ServerTest"
Cohesion: 0.15
Nodes (5): ogg_seconds(), skipUnless, HTTP tests for the sidecar. They need FastAPI, httpx, Piper and the voice…, Render German speech, re-encode it as a browser would record it, and transcribe…, ServerTest

### Community 113 - "defaultKeyFilePath"
Cohesion: 0.22
Nodes (13): dynamic, GET(), PUT(), DELETE(), PATCH(), POST(), dynamic, GET() (+5 more)

### Community 114 - "SystemSettingsAdmin.tsx"
Cohesion: 0.26
Nodes (11): EMPTY_SMTP, errorOf(), JSON_HEADERS, SmtpForm, SmtpSettingsCard(), SpeechInfo, SpeechSettingsCard(), toForm() (+3 more)

### Community 115 - "SystemSettingsAdmin.test.tsx"
Cohesion: 0.22
Nodes (3): NoResizeObserver, SPEECH, STORED

### Community 117 - "spokenPartService.test.ts"
Cohesion: 0.12
Nodes (19): ParsedTranscript, ChatMessage, AiRequest, AiResult, ExamPracticeDeps, SETS_DIR, setup(), SPEECH_UP (+11 more)

### Community 118 - "next.config.js"
Cohesion: 0.40
Nodes (3): createNextIntlPlugin, nextConfig, withNextIntl

### Community 119 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 120 - "merge-lesson-exercises.test.ts"
Cohesion: 0.28
Nodes (5): exercisesOf(), passage, run(), seed(), seedPath()

### Community 121 - "lessonCards.ts"
Cohesion: 0.28
Nodes (11): migrateFlashcardReviewsToDeck(), DeckItemRef, findItemByKey(), LessonCardInput, lessonCardKey(), lessonCardLemma(), upsertLessonCard(), vocabularyCardContent() (+3 more)

### Community 122 - "Level Exams Plan"
Cohesion: 0.47
Nodes (6): NaDoch! PDF certificates, examSittingService, Gated formal level exam, Open Badge 3.0 credentials, Level Exams Plan, unlockService exam condition

### Community 123 - "createPracticeService"
Cohesion: 0.33
Nodes (9): createPracticeService(), getPracticeLesson(), gradeAnswer(), rowToExercise(), serveBatch(), PracticeError, listeningSetup(), setup() (+1 more)

### Community 124 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, better-sqlite3@13.0.3, esbuild@0.28.2, fsevents@2.3.3

### Community 127 - "renderWithIntl"
Cohesion: 0.08
Nodes (15): connectSuccessfully(), { pushMock, refreshMock }, renderShell(), CARD, FakeRecorder, FILL, FREE, LETTER (+7 more)

### Community 131 - "ExamPracticeAdmin.test.tsx"
Cohesion: 0.15
Nodes (5): FORMATS, POOL, SET, STARTER, Tree

### Community 132 - "2026-09-29-design-pass-design.md"
Cohesion: 0.36
Nodes (6): NaDoch! brand and logo, Installable PWA, Theme tokens, Thumb-zone shell and navigation, NaDoch! certificate and Open Badge, Gated level exams

### Community 133 - "backupService.ts"
Cohesion: 0.11
Nodes (30): isAudioFileName(), BackupEnvelope, BackupSizeOptions, BackupTooLargeError, base64Length(), clearSpeech(), createBackupStream(), decodedLength() (+22 more)

### Community 134 - "speech.test.tsx"
Cohesion: 0.18
Nodes (5): FakeRecorder, RESULT, trackStop, MAX_SECONDS, SPEECH_LIMIT_SECONDS

### Community 136 - "Bilingual en/de content model"
Cohesion: 0.47
Nodes (4): Bilingual en/de content model, Seed format v3, Curriculum export, AI practice pool with admin review

### Community 137 - "merge-teil-sets.test.ts"
Cohesion: 0.22
Nodes (4): EXPECTED_LETTER_SETS, EXPECTED_SPOKEN_SETS, NUM, REAL

### Community 138 - "createCurriculumService"
Cohesion: 0.20
Nodes (7): createCurriculumService(), getExercises(), getLesson(), getTrackStructure(), rowToExercise(), rowToLesson(), rowToMilestone()

### Community 139 - "SessionSetup"
Cohesion: 0.22
Nodes (4): SessionSetup(), Scenario, SCENARIOS, scenariosFor()

### Community 140 - "CurriculumTree.test.tsx"
Cohesion: 0.20
Nodes (4): CurriculumTree(), lesson(), TREE, write()

### Community 142 - "exerciseTypesMigration.test.ts"
Cohesion: 0.22
Nodes (7): DDL, LISTENING_EXERCISES, LISTENING_PRACTICE, READING_EXERCISES, READING_PRACTICE, WRITING_EXERCISES, WRITING_PRACTICE

### Community 143 - "Speech sidecar"
Cohesion: 0.50
Nodes (3): Build, start and check, Speech sidecar, Tests without Docker

### Community 144 - "QueuePage.test.tsx"
Cohesion: 0.28
Nodes (8): QueuePage(), moveOn(), next(), skip(), OUTCOME, push, QUEUE, stubFetch()

### Community 146 - "TranscriptReveal.tsx"
Cohesion: 0.53
Nodes (4): evidenceSpans(), Span, TRANSCRIPT, TranscriptReveal()

### Community 147 - "ProfilePage.test.tsx"
Cohesion: 0.33
Nodes (3): ProfilePage(), PROFILE, { refreshMock }

### Community 148 - "freestyleService.test.ts"
Cohesion: 0.40
Nodes (5): MAX_SETUP_VALUE_LENGTH, conversationReply, setup(), spokenSetup(), summaryReply

## Ambiguous Edges - Review These
- `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` → `germanaitutor (project README)`  [AMBIGUOUS]
  README.md · relation: references
- `TRACKS / isTrack in levels.ts` → `en/de message catalogs parity`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-24-tutoring-phase1b-teaching-loop.md · relation: semantically_similar_to

## Knowledge Gaps
- **779 isolated node(s):** `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }` (+774 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1225 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` and `germanaitutor (project README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `TRACKS / isTrack in levels.ts` and `en/de message catalogs parity`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `seedTutoringCurriculum`, `isAdminSessionValid`, `ExerciseCard.tsx`, `client.ts`, `createProviderService`, `speechClipService.ts`, `lessonChatService.ts`, `WritingSession.tsx`, `wordLists.ts`, `testOutService.ts`, `audio-content-checks.ts`, `curriculumExportService.ts`, `providers/types.ts`, `delayedResponse`, `freestyle/routes.test.ts`, `curriculumSeedLoader.ts`, `practiceService.ts`, `examPracticeService.ts`, `audioService.ts`, `errorCodes.ts`, `react`, `AppShell.tsx`, `speech/route.ts`, `package.json`, `better-sqlite3`, `notificationService.ts`, `srs.ts`, `schema.ts`, `lessonAnswers.ts`, `freeTextGrading.ts`, `resolveAudioGate`, `formats.ts`, `a11y.test.tsx`, `deckService.ts`, `DeckPage.test.tsx`, `levelGating.ts`, `teilSetService.ts`, `CefrLevel`, `TaskInputs.tsx`, `spokenGrading.ts`, `curriculumStructureService.ts`, `attemptService.test.ts`, `createProfileService`, `createConceptLinkService`, `renderWithIntl.tsx`, `DependencyDiagram.tsx`, `lib/types.ts`, `replies.ts`, `speaking.test.tsx`, `speechProvider.ts`, `LessonPage`, `aiService.ts`, `worker.ts`, `TestOutPage.test.tsx`, `createDbClient`, `OnboardingWizard.tsx`, `memoryStore.ts`, `app/page.tsx`, `contentCheck.ts`, `themeTokens.test.ts`, `getDb`, `[mode]/page.tsx`, `onboarding/page.tsx`, `placementService.ts`, `audioService.test.ts`, `createProgressService`, `defaultKeyFilePath`, `SystemSettingsAdmin.test.tsx`, `spokenPartService.test.ts`, `merge-lesson-exercises.test.ts`, `lessonCards.ts`, `createPracticeService`, `renderWithIntl`, `ExamPracticeAdmin.test.tsx`, `backupService.ts`, `speech.test.tsx`, `merge-teil-sets.test.ts`, `createCurriculumService`, `CurriculumTree.test.tsx`, `manifest.ts`, `exerciseTypesMigration.test.ts`, `QueuePage.test.tsx`, `TranscriptReveal.tsx`, `ProfilePage.test.tsx`, `freestyleService.test.ts`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `getDb()` connect `getDb` to `isAdminSessionValid`, `client.ts`, `speechClipService.ts`, `lessonChatService.ts`, `curriculumExportService.ts`, `providers/types.ts`, `freestyle/routes.test.ts`, `audioService.ts`, `errorCodes.ts`, `react`, `speech/route.ts`, `teilSetService.ts`, `createProfileService`, `createConceptLinkService`, `lib/types.ts`, `speechProvider.ts`, `createDbClient`, `app/page.tsx`, `[mode]/page.tsx`, `onboarding/page.tsx`, `placementService.ts`, `createProgressService`, `defaultKeyFilePath`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `better-sqlite3` connect `better-sqlite3` to `seedTutoringCurriculum`, `isAdminSessionValid`, `backupService.ts`, `ExerciseCard.tsx`, `client.ts`, `createProviderService`, `speechClipService.ts`, `lessonChatService.ts`, `exerciseTypesMigration.test.ts`, `attemptService.ts`, `testOutService.ts`, `curriculumExportService.ts`, `curriculumSeedLoader.ts`, `practiceService.ts`, `examPracticeService.ts`, `audioService.ts`, `speech/route.ts`, `package.json`, `spokenPartService.ts`, `notificationService.ts`, `schema.ts`, `freeTextGrading.ts`, `deckService.ts`, `levelGating.ts`, `teilSetService.ts`, `CefrLevel`, `curriculumStructureService.ts`, `createProfileService`, `createConceptLinkService`, `lib/types.ts`, `replies.ts`, `speechProvider.ts`, `aiService.ts`, `worker.ts`, `createDbClient`, `memoryStore.ts`, `contentCheck.ts`, `freestyleService.ts`, `placementService.ts`, `lessonCards.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic` to the rest of the system?**
  _779 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.03264462809917355 - nodes in this community are weakly interconnected._