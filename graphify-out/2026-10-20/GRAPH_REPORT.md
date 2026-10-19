# Graph Report - GermanLearner  (2026-10-15)

## Corpus Check
- 678 files · ~1,195,631 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2950 nodes · 9105 edges · 144 communities (132 shown, 11 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 268 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `62f8d04f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- LessonEditorForm.tsx
- createDbClient
- getDb
- Tutoring Phase 1B Teaching Loop Plan
- extract-wortlisten.ts
- localizedText.ts
- LessonPage.tsx
- closeDb
- createProviderService
- vitest
- App-wide Design Pass Implementation Plan
- lessonChatService.ts
- 2026-09-24-tutoring-section-design.md
- SessionSetup
- Curriculum Admin Management (Phase 1) Implementation Plan
- exerciseGrading.ts
- wordLists.ts
- testOutService.ts
- curriculumSeedLoader.ts
- export/[track]/[level]/route.ts
- providers/types.ts
- practiceService
- delayedResponse
- errorBody
- lessonAdminService.ts
- TrackLevelStructure.tsx
- schema.ts
- practiceService.ts
- levels.ts
- tutoring/routes.test.ts
- createFreestyleService
- app/layout.tsx
- FreeTextGradingInput
- package.json
- adminSession.ts
- CefrLevel
- placementService.ts
- Curriculum + Admin Auth SQLite Schema (9 tables)
- srs.ts
- deckService.ts
- client.ts
- exerciseView.ts
- GermanLearner Kanban board
- lessonAnswers.ts
- freestyleService.ts
- progressService.ts
- LocalizedText
- devDependencies
- SettingsPage
- TeilReview.test.tsx
- react
- AppShell.test.tsx
- Freestyle and Vocabulary Deck Implementation Plan
- compilerOptions
- components.json
- levelGating.ts
- createTeilSetService
- aiService.ts
- createCurriculumService
- ExerciseCard.tsx
- teilSetService.ts
- createCurriculumStructureService
- placementExamFormat.ts
- createProfileService
- Shared Teil exam-part engine
- deckService.test.ts
- TappableGerman.tsx
- renderWithIntl.tsx
- createDeckService
- DependencyDiagram.tsx
- createAttemptService
- placementService.test.ts
- placementScoring.ts
- dependencies
- Reading Module and Teil Engine Implementation Plan
- attemptService.ts
- Find Skills (skill)
- LessonPage.test.tsx
- examPracticeService.ts
- createUsageService
- [mode]/page.tsx
- profileService.ts
- TestOutPage.test.tsx
- Bilingual Content Implementation Plan
- Speaking Module Plan
- createPlacementService
- flashcards/page.tsx
- telc B1 coverage map
- memoryStore.ts
- build-icons.ts
- app/page.tsx
- queue/page.tsx
- themeTokens.test.ts
- admin/practice/routes.test.ts
- getProfile
- NaDoch! brand identity: blue-teal bubble with orange exclamation
- TrackLevelStructure
- renderWithIntl
- adminAuthService (password hash/verify, session tokens)
- api/exam-practice/routes.test.ts
- placement/page.tsx
- ExamPracticeAdmin
- onboarding/page.tsx
- Accounts & Hosting Plan
- ConceptLinkSection.test.tsx
- placement/routes.test.ts
- Level Exams Plan
- teilSetProblems
- 2026-09-29-accounts-hosting-design.md
- createPracticeService
- isCefrLevel
- AdminLogin
- providers/route.test.ts
- app/lesson/[id]/page.tsx
- PlacementTest.test.tsx
- 2026-09-29-speaking-design.md
- examPracticeService.test.ts
- next.config.js
- scripts
- freestyle/page.tsx
- TeilSetError
- Listening Module Plan
- catalogs.test.ts
- allowScripts
- MultipleChoiceFields
- build-logo.ts
- flashcard-violations/route.ts
- Flashcards only in vocabulary lessons rule
- next-env.d.ts
- ExamPracticeAdmin.test.tsx
- 2026-09-29-design-pass-design.md
- backupService.ts
- testOutService.test.ts
- teilSetService.test.ts
- Bilingual en/de content model
- sounds.ts
- ExerciseEditor
- attemptService.test.ts
- CurriculumTree.test.tsx
- PracticeRun.test.tsx
- DeleteLessonWizard
- loadState

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 213 edges
2. `vitest` - 202 edges
3. `cn()` - 138 edges
4. `react` - 88 edges
5. `CefrLevel` - 85 edges
6. `createDbClient()` - 82 edges
7. `createProfileService()` - 76 edges
8. `isAdminSessionValid()` - 68 edges
9. `Track` - 65 edges
10. `@testing-library/react` - 56 edges

## Surprising Connections (you probably didn't know these)
- `App icon SVG (D! speech bubble)` --semantically_similar_to--> `PWA icon 512`  [INFERRED] [semantically similar]
  app/icon.svg → public/icons/icon-512.png
- `NaDoch! logo (design source)` --semantically_similar_to--> `NaDoch! logo (public brand asset)`  [INFERRED] [semantically similar]
  docs/design/nadoch-logo.svg → public/brand/nadoch-logo.svg
- `RootLayout()` --indirect_call--> `getDb()`  [INFERRED]
  app/layout.tsx → lib/db/client.ts
- `stubFetch()` --calls--> `delayedResponse()`  [EXTRACTED]
  components/freestyle/ExamPractice.test.tsx → test/delayedResponse.ts
- `renderPractice()` --calls--> `renderWithIntl()`  [EXTRACTED]
  components/freestyle/ExamPractice.test.tsx → test/renderWithIntl.tsx

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
Nodes (72): Heatmap(), shade(), CARD_GRID, SectionCard(), PROVIDER_TYPES, STATUS_BADGE, UsageTotals, MilestoneBand() (+64 more)

### Community 1 - "LessonEditorForm.tsx"
Cohesion: 0.06
Nodes (52): dynamic, dynamic, dynamic, dynamic, activeHref(), AdminNav(), ITEMS, BTN (+44 more)

### Community 2 - "createDbClient"
Cohesion: 0.16
Nodes (19): setup(), createDbClient(), oldDatabase(), setup(), setup(), ACTIVITY_DAYS, setup(), setup() (+11 more)

### Community 3 - "getDb"
Cohesion: 0.09
Nodes (35): AdminLessonPage(), dynamic, AdminTrackLevelPage(), dynamic, PlacementExamAdminPage(), dynamic, GET(), DELETE() (+27 more)

### Community 4 - "Tutoring Phase 1B Teaching Loop Plan"
Cohesion: 0.05
Nodes (68): ActiveProviderBanner translation, aiService (generateWithActiveProvider), Catalog parity test, Curriculum export service, Default placement exam (data/placement-exam.json), delayedResponse test helper, exerciseContentValidation, Admin export downloads (zip) (+60 more)

### Community 5 - "extract-wortlisten.ts"
Cohesion: 0.07
Nodes (57): drop(), feminineOf(), GOETHE, main(), ONE, OUT_DIR, Parsed, parseGoethe() (+49 more)

### Community 6 - "localizedText.ts"
Cohesion: 0.05
Nodes (69): CardFace(), DeckReview(), Rating, RATINGS, AddWord(), DeckLimits(), Found, LimitField() (+61 more)

### Community 7 - "LessonPage.tsx"
Cohesion: 0.06
Nodes (32): PROFILE, { refreshMock }, DashboardPage(), Celebration(), DISC, ONWARD, ResultCard(), REVIEW_BADGE (+24 more)

### Community 8 - "closeDb"
Cohesion: 0.27
Nodes (11): dynamic, GET(), POST(), POST(), defaultKeyFilePath(), loadOrCreateMasterKey(), closeDb(), defaultDataDir() (+3 more)

### Community 9 - "createProviderService"
Cohesion: 0.13
Nodes (21): decrypt(), encrypt(), request, setup(), createProviderService(), createConnection(), getActiveConnection(), getConnection() (+13 more)

### Community 10 - "vitest"
Cohesion: 0.08
Nodes (12): AdminCurriculumPage(), { redirectMock, isAdminSessionValidMock, listTracksMock }, PracticeReviewPage(), { mockRedirect, mockIsAdmin }, structure, trackStructureResponse, MILESTONES, MESSAGES (+4 more)

### Community 11 - "App-wide Design Pass Implementation Plan"
Cohesion: 0.10
Nodes (43): Provider adapter interface, Anthropic adapter, Server-side API routes (profile, providers, usage, backup, reset), App shell onboarding gate and provider failure banner, Backup export/import service, BYOK AI provider connections, Core global constraints (local-only, server-side only, four providers), Master key file and AES-256-GCM encryption (+35 more)

### Community 12 - "lessonChatService.ts"
Cohesion: 0.10
Nodes (35): dynamic, GET(), mapError(), POST(), post(), Shown, ChatMessage, isAiAvailable() (+27 more)

### Community 13 - "2026-09-24-tutoring-section-design.md"
Cohesion: 0.24
Nodes (10): Milestone regrouping (15 seeds, 3-4 milestones each), Freestyle mode outline, Lesson chat and Ask AI, Level unlocking (global hard lock), Placement test, SM-2 spaced repetition and Daily Queue, Tutoring teaching loop (lesson, exercises, grading), Branching tree layout (+2 more)

### Community 15 - "Curriculum Admin Management (Phase 1) Implementation Plan"
Cohesion: 0.11
Nodes (36): Admin session gate (isAdminSessionValid, JSON 401), Concept-link API routes, ConceptLinkSection and Edit/Clone wiring, Concept-link service, Concept-links connect different tracks at same level only, Milestone/section structure service, wouldCreateCycle cycle detection, Data-preserving schema migration rule (+28 more)

### Community 16 - "exerciseGrading.ts"
Cohesion: 0.13
Nodes (18): MultipleChoiceContent, ExerciseGradeOutcome, gradeExerciseAnswer(), card, fill, free, mc, cloze (+10 more)

### Community 17 - "wordLists.ts"
Cohesion: 0.12
Nodes (32): lemmaKey(), nounHasArticle(), DroppedEntry, FIELDS, formatWordListFile(), lowerLevels(), mergeWordList(), normalized() (+24 more)

### Community 18 - "testOutService.ts"
Cohesion: 0.05
Nodes (66): dynamic, POST(), dynamic, GET(), mapError(), POST(), branchLayout.ts branch layout, convert-seeds-v2.ts one-off script (+58 more)

### Community 19 - "curriculumSeedLoader.ts"
Cohesion: 0.07
Nodes (31): filled(), lessonTextProblems(), LessonTexts, milestoneTextProblems(), MilestoneTexts, ok, getCurrentSeedVersion(), loadSeedIfNeeded() (+23 more)

### Community 20 - "export/[track]/[level]/route.ts"
Cohesion: 0.20
Nodes (13): dynamic, GET(), one(), dynamic, GET(), createCurriculumExportService(), currentSeedVersion(), exportAll() (+5 more)

### Community 21 - "providers/types.ts"
Cohesion: 0.14
Nodes (16): dynamic, GET(), createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter() (+8 more)

### Community 22 - "practiceService"
Cohesion: 0.08
Nodes (31): Admin practice API routes, Admin practice review page and pool section, attemptService, Batch of 5 exercises served one at a time, Chat load retry, Curriculum export and seed loader practice list, errorCodes (ErrorCode, errorBody), errors message namespace (+23 more)

### Community 23 - "delayedResponse"
Cohesion: 0.08
Nodes (19): ITEM, STRUCTURE, days, VIEW, FOUR, OVERVIEW, push, Reply (+11 more)

### Community 24 - "errorBody"
Cohesion: 0.15
Nodes (22): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+14 more)

### Community 25 - "lessonAdminService.ts"
Cohesion: 0.15
Nodes (21): wouldCreateCycle(), PlacementInput, EXERCISE_TYPES, hasInstruction(), instructionProblems(), isNonEmptyString(), validateExerciseContent(), assertFlashcardRule() (+13 more)

### Community 26 - "TrackLevelStructure.tsx"
Cohesion: 0.23
Nodes (12): StructureEntry, StructureLesson, AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter() (+4 more)

### Community 27 - "schema.ts"
Cohesion: 0.11
Nodes (16): createChatPracticeIndex(), createTablesIfMissing(), migrateBilingualColumns(), migrateChatPracticeColumn(), migrateConceptIdAndPlacementUniqueness(), migrateDailyReviewCap(), migrateExerciseTypes(), migrateFlashcardReviewsToDeck() (+8 more)

### Community 28 - "practiceService.ts"
Cohesion: 0.11
Nodes (28): ExerciseFormEntry, ExerciseInput, reconcileExercises(), randomSuffix(), hasInstructionKey(), ExerciseContent, ExerciseType, ItemRow (+20 more)

### Community 29 - "levels.ts"
Cohesion: 0.19
Nodes (16): dynamic, POST(), post(), selectIntroductions(), createUnlockService(), checkLevelFinishedAfterCompletion(), isLevelUnlocked(), raiseUnlockedLevel() (+8 more)

### Community 30 - "tutoring/routes.test.ts"
Cohesion: 0.22
Nodes (10): dynamic, POST(), dynamic, POST(), dynamic, GET(), attempt(), toAttemptErrorResponse() (+2 more)

### Community 31 - "createFreestyleService"
Cohesion: 0.27
Nodes (22): createFreestyleService(), addMessage(), ask(), end(), grammarTopics(), history(), messagesOf(), newArticle() (+14 more)

### Community 32 - "app/layout.tsx"
Cohesion: 0.10
Nodes (20): dynamic, inter, metadata, nunito, RootLayout(), viewport, manifest(), AppShell() (+12 more)

### Community 33 - "FreeTextGradingInput"
Cohesion: 0.53
Nodes (6): AttemptDeps, ExerciseGradingDeps, FreeTextGradeOutcome, PlacementDeps, TestOutDeps, FreeTextGradingInput

### Community 34 - "package.json"
Cohesion: 0.08
Nodes (22): name, private, version, clsx, @fontsource/nunito, jsdom, postcss, react-dom (+14 more)

### Community 35 - "adminSession.ts"
Cohesion: 0.15
Nodes (10): DELETE(), dynamic, GET(), POST(), cookieStore, ADMIN_SESSION_COOKIE, cookieStore, loadOrCreateSessionSecret() (+2 more)

### Community 36 - "CefrLevel"
Cohesion: 0.09
Nodes (36): dynamic, LinkedLessonOffer, LessonCloneContent, LessonEditorForm(), LessonEditorInitialValues, SetupData, PlacementMode, resolvePlacement() (+28 more)

### Community 37 - "placementService.ts"
Cohesion: 0.18
Nodes (16): BestRow, DEFAULT_CODE, PlacementErrorKind, PlacementExamSource, PlacementService, SessionRow, PlacementQuestionType, PlacementStopReason (+8 more)

### Community 38 - "Curriculum + Admin Auth SQLite Schema (9 tables)"
Cohesion: 0.10
Nodes (22): CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import (+14 more)

### Community 39 - "srs.ts"
Cohesion: 0.17
Nodes (14): dynamic, GET(), dynamic, GET(), getDashboard(), addDays(), localDate(), computeNextReview() (+6 more)

### Community 40 - "deckService.ts"
Cohesion: 0.11
Nodes (21): dynamic, POST(), RATINGS, dynamic, GET(), dynamic, GET(), badRequest() (+13 more)

### Community 41 - "client.ts"
Cohesion: 0.08
Nodes (4): dynamic, GET(), seed(), createDashboardService()

### Community 42 - "exerciseView.ts"
Cohesion: 0.17
Nodes (10): FlashcardContent, ClozeView, Gap, GAP_MODES, gradeCloze(), nonEmpty(), validateCloze(), viewTask() (+2 more)

### Community 43 - "GermanLearner Kanban board"
Cohesion: 0.18
Nodes (21): 8 Accounts and hosting, #2.5 Curriculum admin management, 1b Curriculum expansion telc B1, 0b Bilingual content, GermanLearner Kanban board, #2 CEFR frameworks, #1 Core platform, 1 App-wide design pass NaDoch! (+13 more)

### Community 44 - "lessonAnswers.ts"
Cohesion: 0.08
Nodes (22): answerTextOf(), submit(), answerTexts(), ClozeAnswer, MatchingAnswer, text(), validateMatching(), PassageQuestionsAnswer (+14 more)

### Community 45 - "freestyleService.ts"
Cohesion: 0.12
Nodes (31): extractJsonObject(), correction, ARTICLE_WORDS, buildArticlePrompt(), buildConversationPrompt(), buildDrillPrompt(), buildSummaryPrompt(), buildWritingPrompt() (+23 more)

### Community 46 - "progressService.ts"
Cohesion: 0.13
Nodes (23): Skill, localized(), createContentText(), SKILL_ORDER, DoneState, loadDoneState(), createProgressService(), getDailyQueue() (+15 more)

### Community 47 - "LocalizedText"
Cohesion: 0.12
Nodes (24): ExamPracticeAdminPage(), formatOptions(), IDS, LEVELS, FillBlankContent, FreeTextContent, DIR(), ExamBlock (+16 more)

### Community 48 - "devDependencies"
Cohesion: 0.10
Nodes (20): devDependencies, @fontsource/nunito, jsdom, opentype.js, postcss, sharp, tailwindcss, @tailwindcss/postcss (+12 more)

### Community 49 - "SettingsPage"
Cohesion: 0.16
Nodes (12): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleProfileChange(), handleRetest(), handleSaveModel(), handleSetActive() (+4 more)

### Community 50 - "TeilReview.test.tsx"
Cohesion: 0.16
Nodes (13): Harness(), RESULT, RUN, HOEREN_1, LESEN_1, OVERVIEW, renderPractice(), RUN (+5 more)

### Community 51 - "react"
Cohesion: 0.13
Nodes (27): ConceptLinkEntry, DeletePreviewResponse, RepairEdge, Logo(), MARKUP, LOGO_SVG, ReadinessCard(), SkillProgress() (+19 more)

### Community 52 - "AppShell.test.tsx"
Cohesion: 0.17
Nodes (10): RUN, ShellState(), Shortcuts(), countsFetch(), FocusOn(), pathname, renderShell(), ShellContext (+2 more)

### Community 53 - "Freestyle and Vocabulary Deck Implementation Plan"
Cohesion: 0.28
Nodes (13): AI JSON helper (lib/ai/json.ts), attemptService / testOutService, lemmaKey (lemma_key dedupe), Deck queue (selectDeckDue, deckRemaining), deckService, extract-wortlisten script, freestyleService, Lesson flashcards move into deck (+5 more)

### Community 54 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 55 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 56 - "levelGating.ts"
Cohesion: 0.07
Nodes (32): applyRepairAndDelete(), computeRepairPreview(), Placement, placementLookup(), RepairEdge, RepairPreview, PlacedLesson, scopeViolationMessages() (+24 more)

### Community 57 - "createTeilSetService"
Cohesion: 0.23
Nodes (22): dynamic, GET(), Ctx, DELETE(), dynamic, PATCH(), POST(), badRequest() (+14 more)

### Community 58 - "aiService.ts"
Cohesion: 0.13
Nodes (15): buildNormalizePrompt(), generateWithActiveProvider(), DeckError, generateParsed(), normalizeWord(), ParsedAiResult, gradeFreeText(), input (+7 more)

### Community 59 - "createCurriculumService"
Cohesion: 0.14
Nodes (12): dynamic, GET(), LessonConceptLink, ConceptLinkService, LessonRow, createCurriculumService(), getExercises(), getLesson() (+4 more)

### Community 60 - "ExerciseCard.tsx"
Cohesion: 0.07
Nodes (42): answeredCount(), Cloze(), emptyAnswer(), letterOf(), Matching(), Props, TaskInputs(), TaskPane (+34 more)

### Community 61 - "teilSetService.ts"
Cohesion: 0.15
Nodes (22): resized(), TeilSetEditor(), changeContent(), buildTeilSetPrompt(), parseTeilSetReply(), SHAPE, TeilSetContent, TeilSetRow (+14 more)

### Community 62 - "createCurriculumStructureService"
Cohesion: 0.26
Nodes (12): assertPrerequisiteScope(), assertMilestoneTexts(), assertValidRank(), createCurriculumStructureService(), assertNotUnsorted(), createMilestone(), deleteMilestone(), getMilestone() (+4 more)

### Community 63 - "placementExamFormat.ts"
Cohesion: 0.18
Nodes (14): dynamic, formatFrom(), GET(), PUT(), put(), DIR, seeds, loadDefaultExam() (+6 more)

### Community 64 - "createProfileService"
Cohesion: 0.16
Nodes (12): dynamic, GET(), PATCH(), dynamic, GET(), Dashboard(), dynamic, dynamic (+4 more)

### Community 65 - "Shared Teil exam-part engine"
Cohesion: 0.29
Nodes (10): Freestyle hub, Freestyle never writes progress, Freestyle mode registry, Vocabulary deck with own SRS, Official starter word lists, Exam format data (15 formats), Task types (passage, matching, cloze), Shared Teil exam-part engine (+2 more)

### Community 66 - "deckService.test.ts"
Cohesion: 0.33
Nodes (3): NormalizeOutcome, FIXTURES, setup()

### Community 67 - "TappableGerman.tsx"
Cohesion: 0.24
Nodes (9): ABBREVIATIONS, endsSentence(), SaveState, splitSentences(), Token, tokenize(), Popover(), PopoverAnchor() (+1 more)

### Community 68 - "renderWithIntl.tsx"
Cohesion: 0.13
Nodes (10): SUMMARY, PROFILE, { refreshMock }, PreferencesContext, PreferencesProvider(), save(), Probe(), PROFILE (+2 more)

### Community 69 - "createDeckService"
Cohesion: 0.26
Nodes (14): deckRemaining(), selectDeckDue(), activateItem(), insertDeckSrs(), createDeckService(), addWord(), answer(), answeredToday() (+6 more)

### Community 70 - "DependencyDiagram.tsx"
Cohesion: 0.23
Nodes (7): DependencyDiagram(), DiagramEdge, DiagramEntry, DiagramLesson, BranchNode, computeBranchLayout(), layout()

### Community 71 - "createAttemptService"
Cohesion: 0.36
Nodes (14): vocabularyCardContent(), AttemptError, createAttemptService(), assertDueInQueue(), assertLessonOpen(), completeLesson(), getExercise(), getSrs() (+6 more)

### Community 72 - "placementService.test.ts"
Cohesion: 0.27
Nodes (8): reworded(), setup(), QuestionRow, answerInOrder(), PlacementQuestion, rightAnswer(), smallPlacementExam(), wrongAnswer()

### Community 73 - "placementScoring.ts"
Cohesion: 0.28
Nodes (9): LEVELS, LEVEL_POINTS, MAX_MISTAKES, maxScore(), PASS_SHARE, placedLevel(), placementThresholds(), pointsFor() (+1 more)

### Community 74 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, better-sqlite3, class-variance-authority, clsx, fflate, lucide-react, next, next-intl (+6 more)

### Community 75 - "Reading Module and Teil Engine Implementation Plan"
Cohesion: 0.29
Nodes (13): Double submit idempotence, Exam practice admin authoring, ExamFormat (formats.ts, formatProblems), 15 exam formats data, examPracticeService, Freestyle exam practice screen, Lesson pass rule (80/50), Reading Module and Teil Engine Implementation Plan (+5 more)

### Community 76 - "attemptService.ts"
Cohesion: 0.15
Nodes (16): DeckItemRef, findItemByKey(), LessonCardInput, lessonCardKey(), upsertLessonCard(), AttemptErrorKind, AttemptService, inDeck() (+8 more)

### Community 77 - "Find Skills (skill)"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 79 - "examPracticeService.ts"
Cohesion: 0.18
Nodes (27): readFormat(), AttemptRow, CODE, createExamPracticeService(), activeFormat(), allowedMinutes(), explain(), insertAttempt() (+19 more)

### Community 80 - "createUsageService"
Cohesion: 0.23
Nodes (4): dynamic, GET(), createUsageService(), UsageService

### Community 81 - "[mode]/page.tsx"
Cohesion: 0.16
Nodes (11): dynamic, FreestyleModePage(), ExamPractice(), offsetOf(), FreestyleSession(), addMessages(), send(), getJson() (+3 more)

### Community 82 - "profileService.ts"
Cohesion: 0.21
Nodes (14): Preferences, updateProfile(), DAILY_REVIEW_CAP_MAX, DAILY_REVIEW_CAP_MIN, isValidDailyReviewCap(), isWholeNumberIn(), LevelStateUpdate, LockedLevelError (+6 more)

### Community 83 - "TestOutPage.test.tsx"
Cohesion: 0.29
Nodes (4): push, Q1, Q2, RESULT

### Community 84 - "Bilingual Content Implementation Plan"
Cohesion: 0.24
Nodes (11): Tested German never translated, Per-lesson en/de toggle, LocalizedText {en,de} domain type, Bilingual Content Implementation Plan, Seed format v3 (German fields), Level inventories per level, Curriculum Expansion Plan (14 track+levels), Sprachbausteine-style practice (+3 more)

### Community 85 - "Speaking Module Plan"
Cohesion: 0.20
Nodes (12): SpeechProvider adapter, Speaking Module Plan, Estimated pronunciation read-out, speech_clips temporary storage, Spoken Teil server-side turn loop, useRecorder hook / tap-to-talk, Anchor letters for consistent grading, Cross-module error log (+4 more)

### Community 86 - "createPlacementService"
Cohesion: 0.22
Nodes (16): createPlacementService(), answer(), finish(), getBestResult(), getExam(), getSession(), gradeAnswer(), replaceExam() (+8 more)

### Community 87 - "flashcards/page.tsx"
Cohesion: 0.22
Nodes (4): dynamic, Flashcards(), { mockRedirect, mockGetProfile }, DeckPage()

### Community 88 - "telc B1 coverage map"
Cohesion: 0.29
Nodes (7): telc B1 coverage matrix, Generalized coverage test, telc B1 coverage map, Coverage rule, Expansion of the other 14 track+levels, telc B1 inventory (61 items), 38 new telc B1 lessons

### Community 89 - "memoryStore.ts"
Cohesion: 0.24
Nodes (7): createMemoryStore(), getEntity(), queryEntities(), MemoryEntity, MemoryStore, Row, rowToEntity()

### Community 90 - "build-icons.ts"
Cohesion: 0.22
Nodes (9): opentype.js, sharp, d, font, fontBytes, fontPath, iconSvg(), main() (+1 more)

### Community 91 - "app/page.tsx"
Cohesion: 0.25
Nodes (6): dynamic, Home(), { mockRedirect, mockGetProfile }, ActiveProviderBanner(), HomeIntro(), HomeScreen()

### Community 92 - "queue/page.tsx"
Cohesion: 0.31
Nodes (7): dynamic, Queue(), { mockRedirect, mockGetProfile }, QueuePage(), moveOn(), next(), skip()

### Community 93 - "themeTokens.test.ts"
Cohesion: 0.31
Nodes (6): channel(), contrastRatio(), luminance(), css, PAIRS, THEMES

### Community 94 - "admin/practice/routes.test.ts"
Cohesion: 0.22
Nodes (12): dynamic, POST(), dynamic, PATCH(), createPracticeAdminService(), editContent(), getRow(), list() (+4 more)

### Community 95 - "getProfile"
Cohesion: 0.67
Nodes (4): ensureRow(), getProfile(), writeLevelState(), rowToProfile()

### Community 96 - "NaDoch! brand identity: blue-teal bubble with orange exclamation"
Cohesion: 0.39
Nodes (8): Apple touch icon (D! bubble), App icon SVG (D! speech bubble), NaDoch! logo (design source), NaDoch! logo (public brand asset), NaDoch! brand identity: blue-teal bubble with orange exclamation, PWA icon 192, PWA icon 512, PWA maskable icon 512

### Community 97 - "TrackLevelStructure"
Cohesion: 0.50
Nodes (7): errorOf(), TrackLevelStructure(), createMilestone(), deleteMilestone(), load(), moveLesson(), saveMilestone()

### Community 98 - "renderWithIntl"
Cohesion: 0.10
Nodes (14): DECK, play, renderPage(), connectSuccessfully(), { pushMock, refreshMock }, CARD, FILL, FREE (+6 more)

### Community 99 - "adminAuthService (password hash/verify, session tokens)"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 100 - "api/exam-practice/routes.test.ts"
Cohesion: 0.21
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, GET(), badRequest(), isId() (+9 more)

### Community 101 - "placement/page.tsx"
Cohesion: 0.38
Nodes (4): dynamic, Placement(), { mockRedirect, mockGetProfile }, PlacementPage()

### Community 102 - "ExamPracticeAdmin"
Cohesion: 0.17
Nodes (11): errorOf(), ExamPracticeAdmin(), act(), upload(), previewOf(), PlacementExamAdmin(), upload(), file() (+3 more)

### Community 103 - "onboarding/page.tsx"
Cohesion: 0.21
Nodes (8): dynamic, OnboardingPage(), { mockGetProfile, mockGetActiveConnection }, OnboardingWizard(), finishOnboarding(), handleConnectAndTest(), loadModels(), skipPlacement()

### Community 104 - "Accounts & Hosting Plan"
Cohesion: 0.33
Nodes (7): Better Auth, BYOK per user, Data rights and legal pages, Docker Compose + Tailscale + Litestream deployment, Table-driven isolation test, Per-user data migration (user_id), Accounts & Hosting Plan

### Community 105 - "ConceptLinkSection.test.tsx"
Cohesion: 0.33
Nodes (3): ConceptLinkSection(), goetheStructure, telcStructure

### Community 106 - "placement/routes.test.ts"
Cohesion: 0.18
Nodes (13): dynamic, POST(), respondWithPlacementErrors(), dynamic, GET(), answerRequest(), dynamic, POST() (+5 more)

### Community 107 - "Level Exams Plan"
Cohesion: 0.47
Nodes (6): NaDoch! PDF certificates, examSittingService, Gated formal level exam, Open Badge 3.0 credentials, Level Exams Plan, unlockService exam condition

### Community 108 - "teilSetProblems"
Cohesion: 0.15
Nodes (11): ROOT, BundledSetFile, teilSetProblems(), loadBundled(), readBundle(), main(), MergeOptions, MergeResult (+3 more)

### Community 109 - "2026-09-29-accounts-hosting-design.md"
Cohesion: 0.53
Nodes (5): Better Auth accounts, Per-user BYOK keys, Launch checklist, SQLite + Litestream hosting, Tailscale access

### Community 110 - "createPracticeService"
Cohesion: 0.26
Nodes (13): dynamic, POST(), dynamic, POST(), batch(), grade(), createPracticeService(), getPracticeLesson() (+5 more)

### Community 111 - "isCefrLevel"
Cohesion: 0.22
Nodes (10): dynamic, GET(), STATUSES, dynamic, GET(), dynamic, GET(), PracticeReviewStatus (+2 more)

### Community 113 - "providers/route.test.ts"
Cohesion: 0.22
Nodes (10): dynamic, GET(), PUT(), DELETE(), PATCH(), dynamic, GET(), POST() (+2 more)

### Community 114 - "app/lesson/[id]/page.tsx"
Cohesion: 0.50
Nodes (3): dynamic, Lesson(), { mockRedirect, mockGetProfile }

### Community 115 - "PlacementTest.test.tsx"
Cohesion: 0.40
Nodes (3): FREE_QUESTION, MC_QUESTION, OUTCOME

### Community 116 - "2026-09-29-speaking-design.md"
Cohesion: 0.33
Nodes (8): Estimated pronunciation score, spoken_response lesson type, Tap-to-talk recording, faster-whisper transcription sidecar, Writing error log, Letter task type, AI rubric grading with anchors, Typing helpers

### Community 117 - "examPracticeService.test.ts"
Cohesion: 0.17
Nodes (12): AiRequest, AiResult, ExamPracticeDeps, SETS_DIR, setup(), MAX_SETUP_VALUE_LENGTH, conversationReply, setup() (+4 more)

### Community 118 - "next.config.js"
Cohesion: 0.40
Nodes (3): createNextIntlPlugin, nextConfig, withNextIntl

### Community 119 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 120 - "freestyle/page.tsx"
Cohesion: 0.40
Nodes (4): dynamic, Freestyle(), FreestyleHub(), NEEDS_AI()

### Community 121 - "TeilSetError"
Cohesion: 0.27
Nodes (11): duplicate(), exportPart(), list(), remove(), requireRow(), setStatus(), update(), upload() (+3 more)

### Community 122 - "Listening Module Plan"
Cohesion: 0.31
Nodes (8): Admin notifications and SMTP email, audio_jobs queue worker, audio_questions task type, Piper TTS sidecar (FastAPI), Listening Module Plan, Replay rules, faster-whisper /transcribe sidecar endpoint, Piper TTS speech sidecar

### Community 124 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, better-sqlite3@13.0.3, esbuild@0.28.2, fsevents@2.3.3

### Community 127 - "flashcard-violations/route.ts"
Cohesion: 0.28
Nodes (5): FlashcardViolationsPage(), { redirectMock, isAdminSessionValidMock, listMock }, dynamic, GET(), createCurriculumAuditService()

### Community 131 - "ExamPracticeAdmin.test.tsx"
Cohesion: 0.25
Nodes (4): FORMATS, POOL, SET, STARTER

### Community 132 - "2026-09-29-design-pass-design.md"
Cohesion: 0.36
Nodes (6): NaDoch! brand and logo, Installable PWA, Theme tokens, Thumb-zone shell and navigation, NaDoch! certificate and Open Badge, Gated level exams

### Community 133 - "backupService.ts"
Cohesion: 0.46
Nodes (5): BackupEnvelope, exportBackup(), importBackup(), InvalidBackupError, sha256()

### Community 134 - "testOutService.test.ts"
Cohesion: 0.32
Nodes (4): exerciseType(), right(), wrong(), LessonAnswer

### Community 135 - "teilSetService.test.ts"
Cohesion: 0.33
Nodes (6): FIXTURE_SETS, fixtureDir(), fixtureDirs, setup(), starter, STARTER_ID

### Community 136 - "Bilingual en/de content model"
Cohesion: 0.47
Nodes (4): Bilingual en/de content model, Seed format v3, Curriculum export, AI practice pool with admin review

### Community 137 - "sounds.ts"
Cohesion: 0.47
Nodes (3): playTone(), ToneKind, TONES

### Community 138 - "ExerciseEditor"
Cohesion: 0.50
Nodes (3): blankContentFor(), ExerciseEditor(), addExercise()

### Community 139 - "attemptService.test.ts"
Cohesion: 0.40
Nodes (4): GradeFreeText, knew, right, wrong

### Community 143 - "loadState"
Cohesion: 1.00
Nodes (3): loadState(), startOrResume(), base()

## Ambiguous Edges - Review These
- `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` → `germanaitutor (project README)`  [AMBIGUOUS]
  README.md · relation: references
- `TRACKS / isTrack in levels.ts` → `en/de message catalogs parity`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-24-tutoring-phase1b-teaching-loop.md · relation: semantically_similar_to

## Knowledge Gaps
- **585 isolated node(s):** `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }` (+580 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 860 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` and `germanaitutor (project README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `TRACKS / isTrack in levels.ts` and `en/de message catalogs parity`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `createDbClient`, `getDb`, `localizedText.ts`, `LessonPage.tsx`, `closeDb`, `createProviderService`, `lessonChatService.ts`, `exerciseGrading.ts`, `wordLists.ts`, `testOutService.ts`, `curriculumSeedLoader.ts`, `export/[track]/[level]/route.ts`, `providers/types.ts`, `delayedResponse`, `errorBody`, `lessonAdminService.ts`, `schema.ts`, `practiceService.ts`, `levels.ts`, `tutoring/routes.test.ts`, `app/layout.tsx`, `package.json`, `adminSession.ts`, `CefrLevel`, `placementService.ts`, `srs.ts`, `deckService.ts`, `client.ts`, `exerciseView.ts`, `lessonAnswers.ts`, `freestyleService.ts`, `progressService.ts`, `LocalizedText`, `TeilReview.test.tsx`, `react`, `AppShell.test.tsx`, `levelGating.ts`, `createTeilSetService`, `aiService.ts`, `ExerciseCard.tsx`, `teilSetService.ts`, `placementExamFormat.ts`, `createProfileService`, `deckService.test.ts`, `renderWithIntl.tsx`, `createDeckService`, `DependencyDiagram.tsx`, `placementService.test.ts`, `placementScoring.ts`, `attemptService.ts`, `LessonPage.test.tsx`, `createUsageService`, `profileService.ts`, `TestOutPage.test.tsx`, `flashcards/page.tsx`, `memoryStore.ts`, `app/page.tsx`, `queue/page.tsx`, `themeTokens.test.ts`, `admin/practice/routes.test.ts`, `renderWithIntl`, `api/exam-practice/routes.test.ts`, `placement/page.tsx`, `onboarding/page.tsx`, `ConceptLinkSection.test.tsx`, `placement/routes.test.ts`, `teilSetProblems`, `createPracticeService`, `isCefrLevel`, `AdminLogin`, `providers/route.test.ts`, `app/lesson/[id]/page.tsx`, `PlacementTest.test.tsx`, `examPracticeService.test.ts`, `catalogs.test.ts`, `flashcard-violations/route.ts`, `ExamPracticeAdmin.test.tsx`, `backupService.ts`, `testOutService.test.ts`, `teilSetService.test.ts`, `sounds.ts`, `attemptService.test.ts`, `CurriculumTree.test.tsx`, `PracticeRun.test.tsx`?**
  _High betweenness centrality (0.236) - this node is a cross-community bridge._
- **What connects `dynamic`, `{ redirectMock, isAdminSessionValidMock, listMock }`, `dynamic` to the rest of the system?**
  _585 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.035553410553410554 - nodes in this community are weakly interconnected._
- **Should `LessonEditorForm.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.057942057942057944 - nodes in this community are weakly interconnected._
- **Should `getDb` be split into smaller, more focused modules?**
  _Cohesion score 0.08853410740203194 - nodes in this community are weakly interconnected._