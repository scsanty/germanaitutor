# Graph Report - cefr-frameworks-impl  (2026-09-23)

## Corpus Check
- 129 files · ~221,833 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 719 nodes · 1168 edges · 88 communities (32 shown, 55 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Admin Curriculum Pages
- Curriculum Admin API Routes
- DB Client & Schema Tests
- A2 Grammar & Listening Lessons
- Project Dependencies
- Onboarding & Provider Banner UI
- AI Provider Adapters
- Admin Curriculum Auth Routes
- B2 Goethe Argumentative Lessons
- B2 telc Academic Listening
- B2 telc Passive Voice & Style
- TypeScript Compiler Config
- C1 Goethe Advanced Lessons
- C1 telc Rhetoric & Style
- Settings Page Handlers
- Curriculum Architecture Rationale
- Claude Skills Ecosystem
- A2 Goethe Case & Prepositions
- A1 Generic Basics Lessons
- B1 telc Complaints & Consumer
- Profile API Route
- A1 Goethe Intro Lessons
- A2 Goethe Daily Life Lessons
- A1 telc Housing & Transactions
- Curriculum Authoring Pipeline Docs
- Admin Auth & Memory Store
- A1 Generic Shopping & Negation
- B1 Housing & Work Lessons
- A2 telc Health & Appointments
- B1 telc Negotiation & Inquiry
- B2 Goethe Opinion & Discussion
- A2 telc Forms & Directories
- Next.js Config
- B1 Generic Listening & Prepositions
- B1 Generic Relative Clauses
- C1 telc Passive Alternatives
- Goethe Holidays Lessons
- B2 Goethe Participles & Guidelines
- B1 Reading & Clauses Lessons
- C1 Goethe Function Verbs & Writing
- C1 Goethe Text Cohesion
- B1 telc Mobility & Radio
- telc Reading & Connectors
- B1 telc Vocabulary Selection
- C1 telc Function Verbs & Discussion
- Generated Next.js Types
- A1 Body & Health Vocabulary
- A1 Clothing & Shopping Vocabulary
- A1 Housing Vocabulary
- B1 Infinitive Clauses
- B1 Weak Noun Declension
- B2 Digital Media Vocabulary
- B2 Environment Vocabulary
- B2 Career Vocabulary
- C1 telc Career Vocabulary
- C1 telc Digital & AI Vocabulary
- C1 telc Social Change Vocabulary
- C1 Relative Clause Prepositions
- C1 telc Environment Vocabulary
- C1 Subjunctive I Reported Speech
- A1 Goethe Dual-Task Listening
- B1 Indefinite Relative Clauses
- A2 Goethe Conversation Listening
- B1 Goethe Interview Listening
- B2 Goethe Panel Discussion
- C1 Goethe Lecture Listening
- C1 Indirect Speech
- A2 Goethe Forum Matching
- B2 Goethe Opinion Matching
- B2 Goethe Workplace Reading
- C1 Modal Verb Subjective Meaning
- B1 telc Education Vocabulary
- B2 telc Society Vocabulary
- C1 telc Sustainability Vocabulary
- B1 Reflexive Verbs
- A2 telc Radio News Listening
- B1 Passive Voice Procedures
- A1 telc Opinion Listening
- A2 telc Interview Listening
- B1 telc Selective News Listening
- A1 telc Headline Matching
- B1 telc Situation Matching Reading
- A1 telc Grammar in Context
- B1 telc Lexical Collocations
- A2 telc Presentation Exam
- C1 telc Negotiation Vocabulary
- B2 telc Consumer & Media Vocabulary

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 47 edges
2. `vitest` - 34 edges
3. `createProviderService()` - 29 edges
4. `defaultKeyFilePath()` - 21 edges
5. `Track` - 19 edges
6. `createCurriculumService()` - 17 edges
7. `compilerOptions` - 16 edges
8. `SettingsPage()` - 15 edges
9. `CefrLevel` - 15 edges
10. `closeDb()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `AdminLessonPage()` --calls--> `isAdminSessionValid()`  [EXTRACTED]
  app/admin/curriculum/lesson/[id]/page.tsx → lib/auth/adminSession.ts
- `germanaitutor (project README)` --references--> `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)`  [AMBIGUOUS]
  README.md → docs/superpowers/specs/2026-09-20-core-design.md
- `AdminTrackLevelPage()` --calls--> `isAdminSessionValid()`  [EXTRACTED]
  app/admin/curriculum/[track]/[level]/page.tsx → lib/auth/adminSession.ts
- `AdminTrackLevelPage()` --calls--> `getDb()`  [EXTRACTED]
  app/admin/curriculum/[track]/[level]/page.tsx → lib/db/client.ts
- `AdminCurriculumPage()` --calls--> `getDb()`  [EXTRACTED]
  app/admin/curriculum/page.tsx → lib/db/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Skills CLI command surface (find / add / update / init)** — _agents_skills_find_skills_skill_skills_cli, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_npx_skills_add, _agents_skills_find_skills_skill_npx_skills_update, _agents_skills_find_skills_skill_npx_skills_init [INFERRED 0.85]
- **Skill discovery workflow (leaderboard check, CLI search, quality verification)** — _agents_skills_find_skills_skill_skills_sh_leaderboard, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_quality_verification [EXTRACTED 1.00]
- **Cross-track Perfekt-tense concept overlap (split vs combined lessons)** — curricula_generic_a2_perfekt_haben_regular, curricula_generic_a2_perfekt_sein_movement, curricula_goethe_a2_goethe_perfekt_past_tense, curricula_telc_a2_telc_perfekt_daily_work [EXTRACTED 1.00]
- **Admin authentication flow (password auth addendum)** — docs_superpowers_plans_2026_09_20_cefr_frameworks_session_secret, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_auth_service, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_session_helper, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_auth_api_route, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_login_component [EXTRACTED 1.00]
- **Curriculum content query and browse pipeline** — docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_schema, docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_service, docs_superpowers_plans_2026_09_20_cefr_frameworks_curriculum_api_routes, docs_superpowers_plans_2026_09_20_cefr_frameworks_admin_curriculum_browse_ui, docs_superpowers_plans_2026_09_20_cefr_frameworks_seed_loader [EXTRACTED 1.00]

## Communities (88 total, 55 thin omitted)

### Community 0 - "Admin Curriculum Pages"
Cohesion: 0.06
Nodes (54): AdminLessonPage(), dynamic, AdminTrackLevelPage(), dynamic, dynamic, GET(), dynamic, GET() (+46 more)

### Community 1 - "Curriculum Admin API Routes"
Cohesion: 0.09
Nodes (41): dynamic, GET(), POST(), dynamic, GET(), PUT(), dynamic, GET() (+33 more)

### Community 2 - "DB Client & Schema Tests"
Cohesion: 0.08
Nodes (21): dynamic, GET(), createDbClient(), createTablesIfMissing(), migrateLegacyCurriculumSchema(), runMigrations(), getCurrentSeedVersion(), loadSeedIfNeeded() (+13 more)

### Community 3 - "A2 Grammar & Listening Lessons"
Cohesion: 0.05
Nodes (48): Comparison of Adjectives: Comparative and Superlative, Indirect Questions with Ob and W-Words, Listening to Conversations about Past Vacations and Activities, Understanding Weather Bulletins and Traffic Reports, Conversational Past: Perfekt with Haben and Regular Verbs, Conversational Past: Perfekt with Sein and Irregular Verbs, Simple Past: Präteritum of Modal Verbs, Simple Past: Präteritum of Sein and Haben (+40 more)

### Community 4 - "Project Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, better-sqlite3, next, react, react-dom, yaml, devDependencies, jsdom (+30 more)

### Community 5 - "Onboarding & Provider Banner UI"
Cohesion: 0.07
Nodes (16): dynamic, Home(), { mockRedirect, mockGetProfile }, ActiveProviderBanner(), AdminLogin(), LEVELS, OnboardingWizard(), handleConnectAndTest() (+8 more)

### Community 6 - "AI Provider Adapters"
Cohesion: 0.12
Nodes (19): PROVIDER_TYPES, UsageTotals, createAnthropicAdapter(), KNOWN_MODELS, createGeminiAdapter(), createOllamaAdapter(), createOpenAIAdapter(), getAdapter() (+11 more)

### Community 7 - "Admin Curriculum Auth Routes"
Cohesion: 0.13
Nodes (14): AdminCurriculumPage(), dynamic, { redirectMock, isAdminSessionValidMock, listTracksMock }, DELETE(), dynamic, GET(), POST(), cookieStore (+6 more)

### Community 8 - "B2 Goethe Argumentative Lessons"
Cohesion: 0.09
Nodes (23): Comprehending Argumentative Press Articles and Commentaries, Delivering a Five-Step Thematic Presentation, Past Unreal Conditions with Subjunctive II (Konjunktiv II der Vergangenheit), Subjunctive II for Wishes and Hypotheticals (Konjunktiv II der Gegenwart), Causal and Concessive Subordinate Clauses (weil, da, obwohl), Temporal Subordinate Clauses (als, wenn, während, nachdem, bevor), Two-Part Connectors (Doppelkonnektoren), Structuring an Argumentative Forum Contribution (+15 more)

### Community 9 - "B2 telc Academic Listening"
Cohesion: 0.12
Nodes (20): Abstrahierende Adjektive und wissenschaftliche Nomen, Gehobene Genitivpräpositionen in wissenschaftlichen Kontexten, Diskursmarker und logische Konnektoren im akademischen Text, Hochschulstrukturen, Studienorganisation und Fachtermini, Wissenschaftliche Funktionsverbgefüge und Kollokationen, Grafik- und Datenanalyse im akademischen Kontext, telc Hörverstehen Teil 1: Vorlesungsnachvollzug und Mitschrift, telc Hörverstehen Teil 2: Fachgespräche und Experteninterviews (+12 more)

### Community 10 - "B2 telc Passive Voice & Style"
Cohesion: 0.12
Nodes (19): Passive Voice with Modal Verbs, The Passive Voice in Present and Past Tenses (Vorgangspassiv), Schriftlicher Ausdruck: Formelle Mängelrüge und Beschwerde, Mündlicher Ausdruck: Aufbau und Halten eines Fachreferats, Hörverstehen: Fachvorträge und Diskussionsbeiträge, Leseverstehen: Standpunkte und Ironie in Kommentaren erkennen, Konjunktiv II der Vergangenheit, Nomen-Verb-Verbindungen (Funktionsverbgefüge) (+11 more)

### Community 11 - "TypeScript Compiler Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 12 - "C1 Goethe Advanced Lessons"
Cohesion: 0.14
Nodes (18): Differenzierte Konnektoren und argumentative Steuerung, Feste Nomen-Präpositions-Verbindungen, Goethe Hören Teil 1: Dialogisches Fachgespräch und Mitschrift, Goethe Hören Teil 2: Radiofeature, Vortrag und Interview, Idiomatik, Redensarten und bildhafte Wendungen, Indirekte Rede und sprachliche Distanzierungsmittel, Komplexe Adverbialsätze und modale Nuancen, Komplexe Wortbildung, Komposita und Derivation (+10 more)

### Community 13 - "C1 telc Rhetoric & Style"
Cohesion: 0.14
Nodes (17): Dekodierung von Ironie, Subtext und impliziten Aussagen, Feste Präposition-Nomen-Verbindungen, Gehobener Wortschatz und Abstraktbegriffe, Hypotaxe, Schachtelsätze und die klassische Satzperiode, Komplexe Konnektoren und Textkohäsion, Modalpartikeln und diskursive Nuancierung, Nomen-Verb-Verbindungen und Funktionsverbgefüge, Transformation zwischen Nominalstil und Verbalstil (+9 more)

### Community 14 - "Settings Page Handlers"
Cohesion: 0.20
Nodes (9): SettingsPage(), closeAddProvider(), handleAddProvider(), handleDelete(), handleRetest(), handleSaveModel(), handleSetActive(), loadModels() (+1 more)

### Community 15 - "Curriculum Architecture Rationale"
Cohesion: 0.14
Nodes (14): /admin/curriculum browse UI, /api/curriculum/* read-only routes, Curriculum + Admin Auth SQLite Schema (9 tables), curriculumService (listTracks/getTrackStructure/getLesson/getExercises), Rationale: level-namespaced lesson ids to avoid cross-level slug collisions, loadSeedIfNeeded (merge/upsert seed loader), Rationale: never manually delete SQLite WAL/SHM files (data-loss incident and recovery), BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama) (+6 more)

### Community 16 - "Claude Skills Ecosystem"
Cohesion: 0.21
Nodes (12): anthropics/skills, ComposioHQ/awesome-claude-skills, Find Skills (skill), Microsoft (official source), npx skills add <package>, npx skills find [query] [--owner <owner>], npx skills init, npx skills update (+4 more)

### Community 17 - "A2 Goethe Case & Prepositions"
Cohesion: 0.18
Nodes (12): Adjective Declension after Definite Articles, Dative Case and Dative Personal Pronouns, Fixed Dative Prepositions, Introduction to Reflexive Verbs, Temporal Prepositions: Vor, Nach, Seit, and Ab, Two-Way Prepositions: Accusative vs. Dative, Adjective Endings after Indefinite and Definite Articles, Goethe Hören Teil 2: Extended Monologues and Visual Matching (+4 more)

### Community 18 - "A1 Generic Basics Lessons"
Cohesion: 0.24
Nodes (11): Alphabet, Greetings, and Numbers 0 to 100, Time, Days of the Week, and Daily Routine, Listening for Numbers, Dates, and Prices, Listening to Public Announcements, Modal Verbs: Können and Möchten, Personal Pronouns in the Nominative, Regular Verb Conjugation in Present Tense, Word Order in Declarative Sentences and Questions (+3 more)

### Community 19 - "B1 telc Complaints & Consumer"
Cohesion: 0.18
Nodes (11): Detailed Listening to Radio Interviews (telc Hörverstehen Teil 2), Prepositional Verbs in Complaints and Customer Service, Consumer Rights, Product Defects, and Warranty Claims, Composing a Formal Letter of Complaint (telc Schriftlicher Ausdruck), Konzessive und adversative Verknüpfungen, telc Leseverstehen Teil 2: Detailverstehen mit Dreifachauswahl, Präpositionen mit Genitiv im Amts- und Geschäftsdeutsch, telc Schriftlicher Ausdruck: Formeller Beschwerdebrief (+3 more)

### Community 20 - "Profile API Route"
Cohesion: 0.36
Nodes (8): dynamic, GET(), PATCH(), createProfileService(), ensureRow(), getProfile(), updateProfile(), rowToProfile()

### Community 21 - "A1 Goethe Intro Lessons"
Cohesion: 0.27
Nodes (10): Imperatives and Requests for Goethe Sprechen Teil 3, Personal Pronouns and Present Tense Foundations, Possessive Determiners: Mein and Dein, Question Formation for Goethe Sprechen Teil 2, Goethe Lesen Teil 1: Informal Notes and Emails, Goethe Lesen Teil 3: Notices and Public Signs, Goethe Sprechen Teile 1, 2 und 3: Comprehensive Exam Format, Family, Relatives, and Friends (+2 more)

### Community 22 - "A2 Goethe Daily Life Lessons"
Cohesion: 0.22
Nodes (9): Separable-Prefix Verbs in the Present Tense, Goethe Hören Teil 1: Dialogues with Visual Prompts, Goethe Hören Teil 2: Single-Broadcast Announcements, Goethe Hören Teil 3: Voicemails and Messages, Core Prepositions for Time and Location, Goethe Lesen Teil 2: Functional Information Search, Separable Verbs for Daily Schedules, Meals, Dining Out, and Beverages (+1 more)

### Community 23 - "A1 telc Housing & Transactions"
Cohesion: 0.22
Nodes (9): Accusative Case for Everyday Transactions, Housing, Tenancy, and Neighborhood Terms, Imperatives and Polite Requests, Modal Verbs for House Rules and Regulations, Present Tense Conjugation for Daily Needs, Reading Classified Housing Advertisements, Reading Official Notices and House Rules, Practical Interpersonal Inquiries and Requests (+1 more)

### Community 24 - "Curriculum Authoring Pipeline Docs"
Cohesion: 0.25
Nodes (8): Official Terms and Personal Information, Work, Professions, and the Workplace, Completing Administrative and Registration Forms, CEFR Lesson Content Authoring Prompt, Exercise Type Taxonomy (multiple_choice/fill_blank/flashcard/free_text), Three-phase AI curriculum generation pipeline (deleted), Rationale: self-generated A1 pilot content rejected, replaced by hand-authored YAML import, YAML-to-seed content authoring & import pipeline (build-curriculum-seed.ts)

### Community 25 - "Admin Auth & Memory Store"
Cohesion: 0.25
Nodes (8): /api/admin/auth route, adminAuthService (password hash/verify, session tokens), AdminLogin component, isAdminSessionValid / requireAdminSession, loadOrCreateSessionSecret, Password-only admin authentication addendum to Core, Freestyle practice mode (scored, excluded from concept-mastery tracking), memory_store generic structured memory table

### Community 26 - "A1 Generic Shopping & Negation"
Cohesion: 0.33
Nodes (6): The Accusative Case Direct Object, Definite and Indefinite Articles in Nominative, Food, Groceries, and Shopping, Negation with Nicht and Kein, Reading Notices, Signs, and Classified Ads, Reading Short Personal Notes and Messages

### Community 27 - "B1 Housing & Work Lessons"
Cohesion: 0.33
Nodes (6): Matching Inquiries with Classified Advertisements (Goethe Lesen Teil 3), Education Paths, Vocational Training, and Lifelong Learning, Selective Reading and Classified Ads Matching (telc Leseverstehen Teil 3), Establishing Contact and Personal Exchange (telc Sprechen Teil 1), Tenancy Rights, Building Rules, and Housing Inquiries, Workplace Operations, Contracts, and Labor Relations

### Community 28 - "A2 telc Health & Appointments"
Cohesion: 0.40
Nodes (6): Health, Doctor Visits, and the Pharmacy, Understanding Transit and Public Announcements, Voicemail and Telephone Appointment Inquiries, Temporal Prepositions for Scheduling Appointments, Interrogatives for Official and Administrative Contexts, Writing Notes to Landlords, Doctors, or Employers

### Community 29 - "B1 telc Negotiation & Inquiry"
Cohesion: 0.33
Nodes (6): Indirect Questions in Inquiries and Administrative Contacts, Professional Politeness and Diplomatic Negotiation with Konjunktiv II, Selective Listening to Calls and Voice Messages (telc Hörverstehen Teil 3), Discussing Experiences on Everyday Topics (telc Sprechen Teil 2), Collaborative Problem Solving and Planning (telc Sprechen Teil 3), Formal Letters of Inquiry and Administrative Applications

### Community 30 - "B2 Goethe Opinion & Discussion"
Cohesion: 0.50
Nodes (4): Differenzierter Meinungsausdruck und Argumentationsketten, Goethe Schreiben Teil 1: Verfassen eines Forumsbeitrags, Goethe Sprechen Teil 1: Strukturierter Vortrag mit Optionenvergleich, Goethe Sprechen Teil 2: Kontroverse Diskussion mit dem Partner

### Community 31 - "A2 telc Forms & Directories"
Cohesion: 0.67
Nodes (3): telc Lesen Teil 1: Navigating Directories and Information Boards, Banking, Municipal Offices, and Mail Services, telc Schreiben Teil 1: Extracting Information to Complete Forms

## Ambiguous Edges - Review These
- `germanaitutor (project README)` → `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **241 isolated node(s):** `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }`, `dynamic`, `cookieStore` (+236 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 295 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **55 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `germanaitutor (project README)` and `BYOK provider adapter interface (Anthropic/OpenAI/Gemini/Ollama)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `vitest` connect `DB Client & Schema Tests` to `Admin Curriculum Pages`, `Curriculum Admin API Routes`, `Project Dependencies`, `Onboarding & Provider Banner UI`, `AI Provider Adapters`, `Admin Curriculum Auth Routes`, `Profile API Route`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `better-sqlite3` connect `DB Client & Schema Tests` to `Admin Curriculum Pages`, `Curriculum Admin API Routes`, `Project Dependencies`, `Admin Curriculum Auth Routes`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Curriculum Admin API Routes` to `Admin Curriculum Pages`, `DB Client & Schema Tests`, `Onboarding & Provider Banner UI`, `Admin Curriculum Auth Routes`, `Profile API Route`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `createProviderService()` (e.g. with `createConnection()` and `deleteConnection()`) actually correct?**
  _`createProviderService()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **What connects `dynamic`, `dynamic`, `{ redirectMock, isAdminSessionValidMock, listTracksMock }` to the rest of the system?**
  _241 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Curriculum Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.0601404741000878 - nodes in this community are weakly interconnected._