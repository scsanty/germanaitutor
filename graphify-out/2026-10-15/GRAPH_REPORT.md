# Graph Report - GermanLearner  (2026-10-15)

## Corpus Check
- 1 files · ~1,019,062 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2601 nodes · 7799 edges · 131 communities (120 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 245 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- admin/layout.tsx
- flashcard-violations/page.tsx
- topics/route.test.ts
- FlashcardViolationsPage()
- ActiveProviderBanner translation
- extract-wortlisten.ts
- DeckPage.tsx
- Celebration.tsx
- backup/export/route.ts
- active/route.ts
- ActiveProviderBanner.test.tsx
- Provider adapter interface
- chat/route.ts
- 2026-09-29-milestone-regrouping.md
- ChatThread()
- Admin session gate (isAdminSessionValid,
- curriculum/types.ts
- wortlisten.test.ts
- branchLayout.ts branch layout
- bilingualValidation.ts
- curriculum/export/route.ts
- anthropic.ts
- Admin practice API routes
- PlacementExamAdmin.test.tsx
- article/route.ts
- cycleDetection.ts
- TrackLevelStructure.tsx
- bilingualMigration.test.ts
- exerciseContentValidation.ts
- admin/practice/route.ts
- attempts/route.ts
- buildArticlePrompt()
- app/layout.tsx
- AttemptDeps
- package.json
- auth/route.ts
- LinkedLessonOffer
- SetupData
- CEFR Lesson Content Authoring Prompt
- attemptService.ts
- flashcards/answer/route.ts
- dashboard/route.ts
- testout/route.ts
- 8 Accounts and hosting
- ActiveProviderBanner.tsx
- json.ts
- unsortedMilestoneId()
- prompts.ts
- devDependencies
- settings/page.tsx
- a11y.test.tsx
- Logo.tsx
- DeckPage.test.tsx
- AI JSON helper (lib/ai/json.ts)
- tsconfig.json
- components.json
- dependencyRepair.ts
- Skill
- .constructor()
- api/curriculum/lessons/[id]/route.ts
- ExerciseCardProps
- prerequisiteScope.ts
- assertPrerequisiteScope()
- placement-exam/route.ts
- profile/route.ts
- Admin notifications and SMTP email
- readWordList()
- TappableGerman.tsx
- PreferencesProvider.tsx
- deck.test.ts
- DependencyDiagram.tsx
- vocabularyCardContent()
- placementExamRefresh.test.ts
- defaultPlacementExam.test.ts
- dependencies
- Double submit idempotence
- migrateFlashcardReviewsToDeck()
- anthropics/skills
- LessonPage()
- new/page.tsx
- usage/route.ts
- [mode]/page.tsx
- Preferences
- TestOutPage.test.tsx
- Tested German never translated
- audio_jobs queue worker
- answer()
- flashcards/page.tsx
- telc B1 coverage matrix
- memoryStore.ts
- opentype.js
- app/page.tsx
- queue/page.tsx
- contrast.ts
- createPracticeAdminService()
- ensureRow()
- Apple touch icon (D! bubble)
- errorOf()
- ExerciseCard.test.tsx
- /api/admin/auth route
- tree/route.ts
- placement/page.tsx
- PlacementExamAdmin()
- OnboardingWizard()
- Better Auth
- ConceptLinkSection()
- ProfilePage()
- NaDoch! PDF certificates
- Anchor letters for consistent grading
- Better Auth accounts
- getDailyQueue()
- telcB1Coverage.test.ts
- login/page.tsx
- unlock-notice/route.ts
- app/lesson/[id]/page.tsx
- PlacementTest.test.tsx
- 2026-09-29-writing-design.md
- MAX_SETUP_VALUE_LENGTH
- next
- scripts
- freestyle/page.tsx
- manifest.ts
- LessonEditorForm()
- catalogs.test.ts
- allowScripts
- MultipleChoiceFields()
- build-logo.ts
- flashcard-violations/page.test.tsx
- Flashcards only in vocabulary lessons ru
- next-env.d.ts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 190 edges
2. `vitest` - 184 edges
3. `cn()` - 130 edges
4. `CefrLevel` - 82 edges
5. `react` - 77 edges
6. `createDbClient()` - 76 edges
7. `createProfileService()` - 71 edges
8. `Track` - 63 edges
9. `isAdminSessionValid()` - 61 edges
10. `@testing-library/react` - 50 edges

## Surprising Connections (you probably didn't know these)
- `App icon SVG (D! speech bubble)` --semantically_similar_to--> `PWA icon 512`  [INFERRED] [semantically similar]
  app/icon.svg → public/icons/icon-512.png
- `NaDoch! logo (design source)` --semantically_similar_to--> `NaDoch! logo (public brand asset)`  [INFERRED] [semantically similar]
  docs/design/nadoch-logo.svg → public/brand/nadoch-logo.svg
- `WizardCard()` --calls--> `cn()`  [EXTRACTED]
  components/onboarding/OnboardingWizard.tsx → lib/utils.ts
- `MilestoneBand()` --calls--> `cn()`  [EXTRACTED]
  components/tutoring/CurriculumTree.tsx → lib/utils.ts
- `TestOut()` --calls--> `cn()`  [EXTRACTED]
  components/tutoring/CurriculumTree.tsx → lib/utils.ts

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

## Communities (131 total, 10 thin omitted)

### Community 0 - "admin/layout.tsx"
Cohesion: 0.04
Nodes (60): activeHref(), AdminNav(), ITEMS, Heatmap(), shade(), LessonChatProps, ResultView(), AlertTitle() (+52 more)

### Community 1 - "flashcard-violations/page.tsx"
Cohesion: 0.08
Nodes (44): dynamic, dynamic, BTN, FIELD_LABEL, FOCUS, HINT, INPUT, LINK (+36 more)

### Community 2 - "topics/route.test.ts"
Cohesion: 0.07
Nodes (29): dynamic, POST(), batch(), createDbClient(), setup(), generateWithActiveProvider(), GradeFreeText, knew (+21 more)

### Community 3 - "FlashcardViolationsPage()"
Cohesion: 0.07
Nodes (45): FlashcardViolationsPage(), AdminLessonPage(), dynamic, AdminCurriculumPage(), { redirectMock, isAdminSessionValidMock, listTracksMock }, dynamic, PlacementExamAdminPage(), dynamic (+37 more)

### Community 4 - "ActiveProviderBanner translation"
Cohesion: 0.05
Nodes (68): ActiveProviderBanner translation, aiService (generateWithActiveProvider), Catalog parity test, Curriculum export service, Default placement exam (data/placement-exam.json), delayedResponse test helper, exerciseContentValidation, Admin export downloads (zip) (+60 more)

### Community 5 - "extract-wortlisten.ts"
Cohesion: 0.07
Nodes (57): drop(), feminineOf(), GOETHE, main(), ONE, OUT_DIR, Parsed, parseGoethe() (+49 more)

### Community 6 - "DeckPage.tsx"
Cohesion: 0.08
Nodes (39): CardFace(), DeckReview(), Rating, RATINGS, AddWord(), DeckLimits(), Found, LimitField() (+31 more)

### Community 7 - "Celebration.tsx"
Cohesion: 0.08
Nodes (36): Celebration(), FocusLayout(), DISC, ONWARD, ResultCard(), REVIEW_BADGE, ReviewBadge(), SCORE (+28 more)

### Community 8 - "backup/export/route.ts"
Cohesion: 0.09
Nodes (32): dynamic, GET(), POST(), dynamic, POST(), respondWithPlacementErrors(), dynamic, GET() (+24 more)

### Community 9 - "active/route.ts"
Cohesion: 0.08
Nodes (35): dynamic, GET(), PUT(), dynamic, GET(), DELETE(), PATCH(), POST() (+27 more)

### Community 10 - "ActiveProviderBanner.test.tsx"
Cohesion: 0.08
Nodes (17): DeleteLessonWizard(), MESSAGES, SUMMARY, FOUR, SESSION, REPLY, SESSION, BASE_PROFILE (+9 more)

### Community 11 - "Provider adapter interface"
Cohesion: 0.10
Nodes (43): Provider adapter interface, Anthropic adapter, Server-side API routes (profile, providers, usage, backup, reset), App shell onboarding gate and provider failure banner, Backup export/import service, BYOK AI provider connections, Core global constraints (local-only, server-side only, four providers), Master key file and AES-256-GCM encryption (+35 more)

### Community 12 - "chat/route.ts"
Cohesion: 0.10
Nodes (34): dynamic, GET(), mapError(), POST(), post(), ChatMessage, AiRequest, AiResult (+26 more)

### Community 13 - "2026-09-29-milestone-regrouping.md"
Cohesion: 0.07
Nodes (34): Milestone regrouping (15 seeds, 3-4 milestones each), convert-seeds-v2.ts one-off script, gating.ts pure gating rules, lesson_completions source column / milestone_testouts table, migrateToMilestoneOnlyStructure migration, Difficulty-ranked hard-gated milestones, Move to... lesson milestone route, Tutoring Phase 2 practice pool precondition (+26 more)

### Community 14 - "ChatThread()"
Cohesion: 0.10
Nodes (24): ChatThread(), ICONS, Overview, Article, Question, readArticle(), ReadingSession(), Props (+16 more)

### Community 15 - "Admin session gate (isAdminSessionValid,"
Cohesion: 0.11
Nodes (36): Admin session gate (isAdminSessionValid, JSON 401), Concept-link API routes, ConceptLinkSection and Edit/Clone wiring, Concept-link service, Concept-links connect different tracks at same level only, Milestone/section structure service, wouldCreateCycle cycle detection, Data-preserving schema migration rule (+28 more)

### Community 16 - "curriculum/types.ts"
Cohesion: 0.12
Nodes (27): Exercise, FillBlankContent, FlashcardContent, FreeTextContent, LessonConceptLink, LessonPlacement, MultipleChoiceContent, LocalizedText (+19 more)

### Community 17 - "wortlisten.test.ts"
Cohesion: 0.13
Nodes (28): lemmaKey(), nounHasArticle(), DroppedEntry, FIELDS, formatWordListFile(), lowerLevels(), mergeWordList(), normalized() (+20 more)

### Community 18 - "branchLayout.ts branch layout"
Cohesion: 0.10
Nodes (27): branchLayout.ts branch layout, CurriculumTree UI, DependencyDiagram bands, Error codes lesson_locked, testout_unavailable, testout_cooldown, levelGating.ts service, Milestone test-out, TestOutPage UI, testOut.ts test-out rules (+19 more)

### Community 19 - "bilingualValidation.ts"
Cohesion: 0.09
Nodes (18): filled(), lessonTextProblems(), LessonTexts, milestoneTextProblems(), ok, DIR, seeds, DIR (+10 more)

### Community 20 - "curriculum/export/route.ts"
Cohesion: 0.12
Nodes (18): dynamic, GET(), one(), dynamic, GET(), setup(), setup(), ensureUnsortedExists() (+10 more)

### Community 21 - "anthropic.ts"
Cohesion: 0.15
Nodes (14): createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter(), FetchLike, GenerateTextParams (+6 more)

### Community 22 - "Admin practice API routes"
Cohesion: 0.08
Nodes (31): Admin practice API routes, Admin practice review page and pool section, attemptService, Batch of 5 exercises served one at a time, Chat load retry, Curriculum export and seed loader practice list, errorCodes (ErrorCode, errorBody), errors message namespace (+23 more)

### Community 23 - "PlacementExamAdmin.test.tsx"
Cohesion: 0.09
Nodes (15): PracticePoolList(), preview(), ITEM, STRUCTURE, OVERVIEW, push, Reply, stubFetch() (+7 more)

### Community 24 - "article/route.ts"
Cohesion: 0.16
Nodes (20): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, GET() (+12 more)

### Community 25 - "cycleDetection.ts"
Cohesion: 0.15
Nodes (18): wouldCreateCycle(), ExerciseInput, reconcileExercises(), PlacementInput, PlacementMode, resolvePlacement(), randomSuffix(), assertValidRank() (+10 more)

### Community 26 - "TrackLevelStructure.tsx"
Cohesion: 0.15
Nodes (17): StructureEntry, StructureLesson, EndSession(), Phase, SummaryList(), WordResult, LETTERS, AlertDialog() (+9 more)

### Community 27 - "bilingualMigration.test.ts"
Cohesion: 0.14
Nodes (13): createChatPracticeIndex(), createTablesIfMissing(), migrateBilingualColumns(), migrateChatPracticeColumn(), migrateConceptIdAndPlacementUniqueness(), migrateDailyReviewCap(), migrateFreestyle(), migrateLegacyCurriculumSchema() (+5 more)

### Community 28 - "exerciseContentValidation.ts"
Cohesion: 0.15
Nodes (22): EXERCISE_TYPES, hasInstruction(), hasInstructionKey(), instructionProblems(), isNonEmptyString(), validateExerciseContent(), ExerciseContent, ExerciseType (+14 more)

### Community 29 - "admin/practice/route.ts"
Cohesion: 0.18
Nodes (18): dynamic, GET(), STATUSES, dynamic, GET(), selectIntroductions(), PracticeReviewStatus, checkLevelFinishedAfterCompletion() (+10 more)

### Community 30 - "attempts/route.ts"
Cohesion: 0.16
Nodes (18): dynamic, POST(), dynamic, POST(), dynamic, POST(), dynamic, POST() (+10 more)

### Community 31 - "buildArticlePrompt()"
Cohesion: 0.23
Nodes (24): buildArticlePrompt(), buildDrillPrompt(), createFreestyleService(), addMessage(), ask(), end(), grammarTopics(), history() (+16 more)

### Community 32 - "app/layout.tsx"
Cohesion: 0.13
Nodes (17): dynamic, inter, metadata, nunito, viewport, AppShell(), BadgeCounts, BARE_ROUTES (+9 more)

### Community 33 - "AttemptDeps"
Cohesion: 0.17
Nodes (17): AttemptDeps, ExerciseGradingDeps, FreeTextGradeOutcome, gradeFreeText(), DEFAULT_CODE, PracticeDeps, PracticeErrorKind, PracticeService (+9 more)

### Community 34 - "package.json"
Cohesion: 0.09
Nodes (21): name, private, version, clsx, @fontsource/nunito, jsdom, postcss, react-dom (+13 more)

### Community 35 - "auth/route.ts"
Cohesion: 0.13
Nodes (10): DELETE(), dynamic, GET(), POST(), cookieStore, ADMIN_SESSION_COOKIE, cookieStore, loadOrCreateSessionSecret() (+2 more)

### Community 36 - "LinkedLessonOffer"
Cohesion: 0.12
Nodes (21): LinkedLessonOffer, Lesson, LessonPrerequisite, LessonTrackOverride, Milestone, ExerciseRow, LessonRow, MilestoneRow (+13 more)

### Community 37 - "SetupData"
Cohesion: 0.17
Nodes (19): SetupData, BestRow, DEFAULT_CODE, PlacementErrorKind, PlacementExamSource, PlacementService, QuestionRow, SessionRow (+11 more)

### Community 38 - "CEFR Lesson Content Authoring Prompt"
Cohesion: 0.10
Nodes (22): CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import (+14 more)

### Community 39 - "attemptService.ts"
Cohesion: 0.16
Nodes (17): AttemptErrorKind, AttemptService, DEFAULT_CODE, ExerciseRow, SrsRow, STATUS_FOR, getDashboard(), addDays() (+9 more)

### Community 40 - "flashcards/answer/route.ts"
Cohesion: 0.14
Nodes (15): dynamic, POST(), RATINGS, dynamic, GET(), dynamic, GET(), badRequest() (+7 more)

### Community 41 - "dashboard/route.ts"
Cohesion: 0.14
Nodes (14): dynamic, GET(), dynamic, GET(), dynamic, GET(), dynamic, GET() (+6 more)

### Community 42 - "testout/route.ts"
Cohesion: 0.23
Nodes (19): dynamic, GET(), mapError(), POST(), createTestOutService(), answer(), context(), currentStatus() (+11 more)

### Community 43 - "8 Accounts and hosting"
Cohesion: 0.18
Nodes (21): 8 Accounts and hosting, #2.5 Curriculum admin management, 1b Curriculum expansion telc B1, 0b Bilingual content, GermanLearner Kanban board, #2 CEFR frameworks, #1 Core platform, 1 App-wide design pass NaDoch! (+13 more)

### Community 44 - "ActiveProviderBanner.tsx"
Cohesion: 0.17
Nodes (12): SkillProgress(), HomeNotices(), MilestoneBand(), STATE_ICON, TestOut(), Connector, isDone(), LessonNode() (+4 more)

### Community 45 - "json.ts"
Cohesion: 0.22
Nodes (16): extractJsonObject(), correction, corrections(), localizedPair(), parseArticleReply(), parseConversationReply(), parseDrillReply(), parseNormalizeReply() (+8 more)

### Community 46 - "unsortedMilestoneId()"
Cohesion: 0.17
Nodes (14): unsortedMilestoneId(), DoneState, GatingMilestone, LessonLock, LevelGating, loadDoneState(), loadLevelGating(), loadPrerequisites() (+6 more)

### Community 47 - "prompts.ts"
Cohesion: 0.16
Nodes (17): ARTICLE_WORDS, buildConversationPrompt(), buildNormalizePrompt(), buildSummaryPrompt(), buildWritingPrompt(), Built, History, quotedTopic() (+9 more)

### Community 48 - "devDependencies"
Cohesion: 0.10
Nodes (20): devDependencies, @fontsource/nunito, jsdom, opentype.js, postcss, sharp, tailwindcss, @tailwindcss/postcss (+12 more)

### Community 49 - "settings/page.tsx"
Cohesion: 0.16
Nodes (12): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleProfileChange(), handleRetest(), handleSaveModel(), handleSetActive() (+4 more)

### Community 50 - "a11y.test.tsx"
Cohesion: 0.12
Nodes (12): PROFILE, { refreshMock }, DashboardPage(), days, VIEW, CurriculumTree(), TREE, vitest-axe (+4 more)

### Community 51 - "Logo.tsx"
Cohesion: 0.14
Nodes (11): Logo(), MARKUP, LOGO_SVG, DOT_STEPS, JSON_HEADERS, PROVIDER_TYPES, Step, WizardCard() (+3 more)

### Community 52 - "DeckPage.test.tsx"
Cohesion: 0.15
Nodes (12): DECK, play, renderPage(), ShellState(), Shortcuts(), countsFetch(), FocusOn(), pathname (+4 more)

### Community 53 - "AI JSON helper (lib/ai/json.ts)"
Cohesion: 0.19
Nodes (18): AI JSON helper (lib/ai/json.ts), attemptService / testOutService, lemmaKey (lemma_key dedupe), Deck queue (selectDeckDue, deckRemaining), deckService, extract-wortlisten script, Freestyle hub, freestyleService (+10 more)

### Community 54 - "tsconfig.json"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 55 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 56 - "dependencyRepair.ts"
Cohesion: 0.16
Nodes (11): applyRepairAndDelete(), computeRepairPreview(), Placement, placementLookup(), RepairEdge, RepairPreview, batchDelete(), getDeletePreview() (+3 more)

### Community 57 - "Skill"
Cohesion: 0.21
Nodes (14): Skill, ProgressService, VisibleLessonRow, isPassing(), LessonStatus, meetsCompletionRule(), MilestoneState, CurriculumTree (+6 more)

### Community 58 - ".constructor()"
Cohesion: 0.22
Nodes (10): DeckError, createPracticeService(), getPracticeLesson(), gradeAnswer(), rowToExercise(), serveBatch(), GenerationFailure, PracticeError (+2 more)

### Community 59 - "api/curriculum/lessons/[id]/route.ts"
Cohesion: 0.17
Nodes (10): dynamic, GET(), dynamic, GET(), canonicalPair(), ConceptLinkService, createConceptLinkService(), addLink() (+2 more)

### Community 60 - "ExerciseCardProps"
Cohesion: 0.18
Nodes (15): ExerciseCardProps, Shown, StoredAnswer, ExerciseView, GradeResult, AttemptSource, ChatExerciseContext, PracticeChatAbout (+7 more)

### Community 61 - "prerequisiteScope.ts"
Cohesion: 0.23
Nodes (12): PlacedLesson, scopeViolationMessages(), isComplete(), isLessonLocked(), milestoneStates(), nextLockedRank(), openRank(), PlacementInfo (+4 more)

### Community 62 - "assertPrerequisiteScope()"
Cohesion: 0.19
Nodes (15): assertPrerequisiteScope(), MilestoneTexts, assertMilestoneTexts(), createCurriculumStructureService(), assertNotUnsorted(), createMilestone(), deleteMilestone(), getMilestone() (+7 more)

### Community 63 - "placement-exam/route.ts"
Cohesion: 0.26
Nodes (11): dynamic, formatFrom(), GET(), PUT(), put(), ExamFormat, ExamParseResult, parsePlacementExam() (+3 more)

### Community 64 - "profile/route.ts"
Cohesion: 0.19
Nodes (11): dynamic, GET(), PATCH(), Dashboard(), dynamic, dynamic, MilestoneTestOut(), dynamic (+3 more)

### Community 65 - "Admin notifications and SMTP email"
Cohesion: 0.24
Nodes (13): Admin notifications and SMTP email, audio_questions task type, Freestyle mode registry, Piper TTS speech sidecar, Exam format data (15 formats), Task types (passage, matching, cloze), Shared Teil exam-part engine, Teil sets (3 per Teil) (+5 more)

### Community 66 - "readWordList()"
Cohesion: 0.17
Nodes (12): readWordList(), wordListPath(), CODE, DeckErrorKind, DeckService, ItemRow, listCache, loadList() (+4 more)

### Community 67 - "TappableGerman.tsx"
Cohesion: 0.19
Nodes (10): ABBREVIATIONS, endsSentence(), SaveState, splitSentences(), TappableGerman(), Token, tokenize(), Popover() (+2 more)

### Community 68 - "PreferencesProvider.tsx"
Cohesion: 0.20
Nodes (10): PreferencesContext, PreferencesProvider(), save(), Probe(), usePreferences(), PROFILE, { refreshMock }, renderSettings() (+2 more)

### Community 69 - "deck.test.ts"
Cohesion: 0.29
Nodes (12): deckRemaining(), selectDeckDue(), createDeckService(), answer(), answeredToday(), dueCount(), dueRows(), freshState() (+4 more)

### Community 70 - "DependencyDiagram.tsx"
Cohesion: 0.20
Nodes (8): DependencyDiagram(), DiagramEdge, DiagramEntry, DiagramLesson, structure, BranchNode, computeBranchLayout(), layout()

### Community 71 - "vocabularyCardContent()"
Cohesion: 0.36
Nodes (14): vocabularyCardContent(), AttemptError, createAttemptService(), assertDueInQueue(), assertLessonOpen(), completeLesson(), getExercise(), getSrs() (+6 more)

### Community 72 - "placementExamRefresh.test.ts"
Cohesion: 0.24
Nodes (9): reworded(), setup(), PlacementDeps, answerInOrder(), toPlacementErrorResponse(), PlacementQuestion, rightAnswer(), smallPlacementExam() (+1 more)

### Community 73 - "defaultPlacementExam.test.ts"
Cohesion: 0.25
Nodes (10): loadDefaultExam(), LEVELS, LEVEL_POINTS, MAX_MISTAKES, maxScore(), PASS_SHARE, placedLevel(), placementThresholds() (+2 more)

### Community 74 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, better-sqlite3, class-variance-authority, clsx, fflate, lucide-react, next, next-intl (+6 more)

### Community 75 - "Double submit idempotence"
Cohesion: 0.29
Nodes (13): Double submit idempotence, Exam practice admin authoring, ExamFormat (formats.ts, formatProblems), 15 exam formats data, examPracticeService, Freestyle exam practice screen, Lesson pass rule (80/50), Reading Module and Teil Engine Implementation Plan (+5 more)

### Community 76 - "migrateFlashcardReviewsToDeck()"
Cohesion: 0.28
Nodes (12): migrateFlashcardReviewsToDeck(), activateItem(), DeckItemRef, findItemByKey(), insertDeckSrs(), LessonCardInput, lessonCardKey(), lessonCardLemma() (+4 more)

### Community 77 - "anthropics/skills"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 79 - "new/page.tsx"
Cohesion: 0.20
Nodes (7): AdminTrackLevelPage(), dynamic, LessonCloneContent, Row, ConnectionStatus, Profile, ProviderType

### Community 80 - "usage/route.ts"
Cohesion: 0.24
Nodes (4): dynamic, GET(), createUsageService(), UsageService

### Community 81 - "[mode]/page.tsx"
Cohesion: 0.24
Nodes (9): dynamic, FreestyleModePage(), FreestyleSession(), addMessages(), send(), getJson(), LoadError, isFreestyleMode() (+1 more)

### Community 82 - "Preferences"
Cohesion: 0.25
Nodes (9): Preferences, DAILY_REVIEW_CAP_MAX, DAILY_REVIEW_CAP_MIN, LevelStateUpdate, ProfileService, ProfileUpdate, Row, PlacementStatus (+1 more)

### Community 83 - "TestOutPage.test.tsx"
Cohesion: 0.20
Nodes (7): push, Q1, Q2, RESULT, TestOutPage(), loadState(), startOrResume()

### Community 84 - "Tested German never translated"
Cohesion: 0.24
Nodes (11): Tested German never translated, Per-lesson en/de toggle, LocalizedText {en,de} domain type, Bilingual Content Implementation Plan, Seed format v3 (German fields), Level inventories per level, Curriculum Expansion Plan (14 track+levels), Sprachbausteine-style practice (+3 more)

### Community 85 - "audio_jobs queue worker"
Cohesion: 0.22
Nodes (11): audio_jobs queue worker, Piper TTS sidecar (FastAPI), Listening Module Plan, Replay rules, SpeechProvider adapter, Speaking Module Plan, Estimated pronunciation read-out, speech_clips temporary storage (+3 more)

### Community 86 - "answer()"
Cohesion: 0.33
Nodes (11): answer(), finish(), getBestResult(), getExam(), getSession(), gradeAnswer(), start(), stop() (+3 more)

### Community 87 - "flashcards/page.tsx"
Cohesion: 0.22
Nodes (4): dynamic, Flashcards(), { mockRedirect, mockGetProfile }, DeckPage()

### Community 88 - "telc B1 coverage matrix"
Cohesion: 0.29
Nodes (7): telc B1 coverage matrix, Generalized coverage test, telc B1 coverage map, Coverage rule, Expansion of the other 14 track+levels, telc B1 inventory (61 items), 38 new telc B1 lessons

### Community 89 - "memoryStore.ts"
Cohesion: 0.24
Nodes (7): createMemoryStore(), getEntity(), queryEntities(), MemoryEntity, MemoryStore, Row, rowToEntity()

### Community 90 - "opentype.js"
Cohesion: 0.22
Nodes (9): opentype.js, sharp, d, font, fontBytes, fontPath, iconSvg(), main() (+1 more)

### Community 91 - "app/page.tsx"
Cohesion: 0.25
Nodes (6): dynamic, Home(), { mockRedirect, mockGetProfile }, ActiveProviderBanner(), HomeIntro(), HomeScreen()

### Community 92 - "queue/page.tsx"
Cohesion: 0.31
Nodes (7): dynamic, Queue(), { mockRedirect, mockGetProfile }, QueuePage(), moveOn(), next(), skip()

### Community 93 - "contrast.ts"
Cohesion: 0.31
Nodes (6): channel(), contrastRatio(), luminance(), css, PAIRS, THEMES

### Community 94 - "createPracticeAdminService()"
Cohesion: 0.42
Nodes (8): createPracticeAdminService(), editContent(), getRow(), list(), promote(), setStatus(), PracticeAdminError, rowToItem()

### Community 95 - "ensureRow()"
Cohesion: 0.31
Nodes (9): ensureRow(), getProfile(), updateProfile(), writeLevelState(), isValidDailyReviewCap(), isWholeNumberIn(), LockedLevelError, ProfileUpdateError (+1 more)

### Community 96 - "Apple touch icon (D! bubble)"
Cohesion: 0.39
Nodes (8): Apple touch icon (D! bubble), App icon SVG (D! speech bubble), NaDoch! logo (design source), NaDoch! logo (public brand asset), NaDoch! brand identity: blue-teal bubble with orange exclamation, PWA icon 192, PWA icon 512, PWA maskable icon 512

### Community 97 - "errorOf()"
Cohesion: 0.50
Nodes (7): errorOf(), TrackLevelStructure(), createMilestone(), deleteMilestone(), load(), moveLesson(), saveMilestone()

### Community 98 - "ExerciseCard.test.tsx"
Cohesion: 0.25
Nodes (5): CARD, FILL, FREE, MC, renderCard()

### Community 99 - "/api/admin/auth route"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 100 - "tree/route.ts"
Cohesion: 0.33
Nodes (5): dynamic, GET(), createUnlockService(), isLevelUnlocked(), setup()

### Community 101 - "placement/page.tsx"
Cohesion: 0.38
Nodes (4): dynamic, Placement(), { mockRedirect, mockGetProfile }, PlacementPage()

### Community 102 - "PlacementExamAdmin()"
Cohesion: 0.29
Nodes (6): PlacementExamAdmin(), upload(), readText(), file(), dir, wanted

### Community 103 - "OnboardingWizard()"
Cohesion: 0.38
Nodes (5): OnboardingWizard(), finishOnboarding(), handleConnectAndTest(), loadModels(), skipPlacement()

### Community 104 - "Better Auth"
Cohesion: 0.33
Nodes (7): Better Auth, BYOK per user, Data rights and legal pages, Docker Compose + Tailscale + Litestream deployment, Table-driven isolation test, Per-user data migration (user_id), Accounts & Hosting Plan

### Community 105 - "ConceptLinkSection()"
Cohesion: 0.33
Nodes (3): ConceptLinkSection(), goetheStructure, telcStructure

### Community 106 - "ProfilePage()"
Cohesion: 0.33
Nodes (3): ProfilePage(), PROFILE, { refreshMock }

### Community 107 - "NaDoch! PDF certificates"
Cohesion: 0.47
Nodes (6): NaDoch! PDF certificates, examSittingService, Gated formal level exam, Open Badge 3.0 credentials, Level Exams Plan, unlockService exam condition

### Community 108 - "Anchor letters for consistent grading"
Cohesion: 0.40
Nodes (6): Anchor letters for consistent grading, Cross-module error log, Letter task type with AI rubric grading, letterGradingService, Writing Module Plan, Typing helpers (umlaut keys, word counter)

### Community 109 - "Better Auth accounts"
Cohesion: 0.53
Nodes (5): Better Auth accounts, Per-user BYOK keys, Launch checklist, SQLite + Litestream hosting, Tailscale access

### Community 110 - "getDailyQueue()"
Cohesion: 0.53
Nodes (4): getDailyQueue(), DueCandidate, remainingReviews(), selectDueItems()

### Community 111 - "telcB1Coverage.test.ts"
Cohesion: 0.33
Nodes (4): coverage, inventory, lessonIds, seed

### Community 113 - "unlock-notice/route.ts"
Cohesion: 0.60
Nodes (3): dynamic, POST(), post()

### Community 114 - "app/lesson/[id]/page.tsx"
Cohesion: 0.50
Nodes (3): dynamic, Lesson(), { mockRedirect, mockGetProfile }

### Community 115 - "PlacementTest.test.tsx"
Cohesion: 0.40
Nodes (3): FREE_QUESTION, MC_QUESTION, OUTCOME

### Community 116 - "2026-09-29-writing-design.md"
Cohesion: 0.70
Nodes (4): Writing error log, Letter task type, AI rubric grading with anchors, Typing helpers

### Community 117 - "MAX_SETUP_VALUE_LENGTH"
Cohesion: 0.40
Nodes (4): MAX_SETUP_VALUE_LENGTH, conversationReply, setup(), summaryReply

### Community 118 - "next"
Cohesion: 0.40
Nodes (3): createNextIntlPlugin, nextConfig, withNextIntl

### Community 119 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 120 - "freestyle/page.tsx"
Cohesion: 0.50
Nodes (3): dynamic, Freestyle(), FreestyleHub()

### Community 124 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, better-sqlite3@13.0.3, esbuild@0.28.2, fsevents@2.3.3

## Ambiguous Edges - Review These
- `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` → `germanaitutor (project README)`  [AMBIGUOUS]
  README.md · relation: references
- `TRACKS / isTrack in levels.ts` → `en/de message catalogs parity`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-24-tutoring-phase1b-teaching-loop.md · relation: semantically_similar_to

## Knowledge Gaps
- **517 isolated node(s):** `LessonChatProps`, `Found`, `Verdict`, `Phase`, `WordResult` (+512 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 758 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)` and `germanaitutor (project README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `TRACKS / isTrack in levels.ts` and `en/de message catalogs parity`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `vitest` connect `topics/route.test.ts` to `flashcard-violations/page.tsx`, `FlashcardViolationsPage()`, `DeckPage.tsx`, `Celebration.tsx`, `backup/export/route.ts`, `active/route.ts`, `ActiveProviderBanner.test.tsx`, `chat/route.ts`, `curriculum/types.ts`, `wortlisten.test.ts`, `branchLayout.ts branch layout`, `bilingualValidation.ts`, `curriculum/export/route.ts`, `anthropic.ts`, `PlacementExamAdmin.test.tsx`, `article/route.ts`, `cycleDetection.ts`, `bilingualMigration.test.ts`, `exerciseContentValidation.ts`, `admin/practice/route.ts`, `attempts/route.ts`, `app/layout.tsx`, `AttemptDeps`, `package.json`, `auth/route.ts`, `SetupData`, `attemptService.ts`, `flashcards/answer/route.ts`, `testout/route.ts`, `json.ts`, `a11y.test.tsx`, `Logo.tsx`, `DeckPage.test.tsx`, `dependencyRepair.ts`, `Skill`, `api/curriculum/lessons/[id]/route.ts`, `prerequisiteScope.ts`, `placement-exam/route.ts`, `profile/route.ts`, `readWordList()`, `PreferencesProvider.tsx`, `deck.test.ts`, `DependencyDiagram.tsx`, `placementExamRefresh.test.ts`, `defaultPlacementExam.test.ts`, `LessonPage()`, `usage/route.ts`, `TestOutPage.test.tsx`, `flashcards/page.tsx`, `app/page.tsx`, `queue/page.tsx`, `contrast.ts`, `ExerciseCard.test.tsx`, `placement/page.tsx`, `ConceptLinkSection()`, `ProfilePage()`, `getDailyQueue()`, `telcB1Coverage.test.ts`, `login/page.tsx`, `unlock-notice/route.ts`, `app/lesson/[id]/page.tsx`, `PlacementTest.test.tsx`, `MAX_SETUP_VALUE_LENGTH`, `manifest.ts`, `LessonEditorForm()`, `catalogs.test.ts`, `flashcard-violations/page.test.tsx`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **What connects `LessonChatProps`, `Found`, `Verdict` to the rest of the system?**
  _517 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `admin/layout.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `flashcard-violations/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07858807858807859 - nodes in this community are weakly interconnected._
- **Should `topics/route.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07092907092907093 - nodes in this community are weakly interconnected._