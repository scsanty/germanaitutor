import type Database from 'better-sqlite3';
import { lessonCardLemma, upsertLessonCard } from '../deck/lessonCards';

/**
 * The `lessons` table gained required `track`/`concept_id` columns when the curriculum
 * import moved from a single shared-lesson-per-concept model to independent per-track
 * lessons (see docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md). SQLite's
 * `CREATE TABLE IF NOT EXISTS` won't add columns to a table that already exists on disk,
 * so an app.db created before this change would be stuck on the old shape. Since the old
 * shape only ever held self-generated pilot content (explicitly discarded in favor of the
 * real imported curricula), the fix is to drop and let the curriculum tables recreate —
 * never the non-curriculum tables (profile, provider_connections, etc.), which hold real
 * user settings.
 */
function migrateLegacyCurriculumSchema(db: Database.Database): void {
  const lessonsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lessons'")
    .get();
  if (!lessonsTable) return;

  const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
  const hasTrackColumn = columns.some((c) => c.name === 'track');
  if (hasTrackColumn) return;

  db.exec(`
    DROP TABLE IF EXISTS lesson_placements;
    DROP TABLE IF EXISTS lesson_track_overrides;
    DROP TABLE IF EXISTS exercises;
    DROP TABLE IF EXISTS lesson_prerequisites;
    DROP TABLE IF EXISTS lessons;
    DROP TABLE IF EXISTS sections;
    DROP TABLE IF EXISTS milestones;
    DROP TABLE IF EXISTS curriculum_meta;
  `);
}

/**
 * Removes the `lessons.concept_id` column (replaced by `lesson_concept_links` — see
 * docs/superpowers/specs/2026-09-22-curriculum-admin-management-design.md) and adds a
 * UNIQUE constraint on `lesson_placements.lesson_id` (a lesson now belongs to exactly one
 * section). Both changes are data-preserving: the column drop is a plain in-place
 * `ALTER TABLE`, and the placements table is rebuilt via the standard SQLite
 * create-copy-drop-rename pattern rather than dropped and recreated empty — curriculum
 * tables hold irreplaceable admin-authored content now, not YAML-re-importable content.
 */
function migrateConceptIdAndPlacementUniqueness(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(lessons)').all() as { name: string }[];
  const hasConceptIdColumn = columns.some((c) => c.name === 'concept_id');
  if (!hasConceptIdColumn) return;

  db.exec(`
    DROP INDEX IF EXISTS idx_lessons_concept_id;
    ALTER TABLE lessons DROP COLUMN concept_id;

    CREATE TABLE lesson_placements_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id)
    );
    INSERT INTO lesson_placements_new (id, lesson_id, section_id, order_index, created_at)
      SELECT id, lesson_id, section_id, order_index, created_at FROM lesson_placements;
    DROP TABLE lesson_placements;
    ALTER TABLE lesson_placements_new RENAME TO lesson_placements;
  `);
}

/**
 * Adds the level-unlocking columns to a profile created before the placement test existed.
 * That profile self-selected its level in onboarding; per the Tutoring spec it restarts at A1
 * and is prompted for the placement test. Fresh databases already have the columns.
 */
function migrateProfileLevelColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'placement_status')) return;

  db.exec(`
    ALTER TABLE profile ADD COLUMN highest_unlocked_level TEXT NOT NULL DEFAULT 'A1'
      CHECK (highest_unlocked_level IN ('A1','A2','B1','B2','C1'));
    ALTER TABLE profile ADD COLUMN placement_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (placement_status IN ('pending','skipped','taken'));
    ALTER TABLE profile ADD COLUMN unlock_notice_level TEXT
      CHECK (unlock_notice_level IN ('A2','B1','B2','C1'));
    ALTER TABLE profile ADD COLUMN onboarding_choices_saved INTEGER NOT NULL DEFAULT 0;
    UPDATE profile SET active_level = 'A1' WHERE id = 1;
  `);
}

/**
 * Adds the Daily Queue's per-day review limit to a profile created before the teaching loop.
 * Fresh databases already have the column.
 */
function migrateDailyReviewCap(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'daily_review_cap')) return;
  db.exec('ALTER TABLE profile ADD COLUMN daily_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (daily_review_cap BETWEEN 1 AND 500)');
}

/**
 * Spec: Curriculum Restructure, Data Model. Sections are removed and milestones get a difficulty
 * rank (old order + 1; NULL for the admin-only Unsorted bucket). Placements move onto their
 * section's milestone with the create-copy-drop-rename pattern, so no curriculum data is lost.
 * The regrouped seeds then replace this placeholder structure.
 */
function migrateToMilestoneOnlyStructure(db: Database.Database): void {
  const hasSections = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sections'").get();
  if (hasSections) {
    db.exec(`
      ALTER TABLE milestones ADD COLUMN difficulty_rank INTEGER CHECK (difficulty_rank IS NULL OR difficulty_rank >= 1);
      UPDATE milestones SET difficulty_rank = CASE WHEN id LIKE '%-unsorted' THEN NULL ELSE order_index + 1 END;

      CREATE TABLE lesson_placements_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(lesson_id)
      );
      INSERT INTO lesson_placements_new (id, lesson_id, milestone_id, created_at)
        SELECT p.id, p.lesson_id, s.milestone_id, p.created_at
        FROM lesson_placements p JOIN sections s ON s.id = p.section_id;
      DROP TABLE lesson_placements;
      ALTER TABLE lesson_placements_new RENAME TO lesson_placements;
      DROP TABLE sections;
      ALTER TABLE milestones DROP COLUMN order_index;
    `);
  }
  const completionColumns = db.prepare('PRAGMA table_info(lesson_completions)').all() as { name: string }[];
  if (!completionColumns.some((c) => c.name === 'source')) {
    db.exec(
      "ALTER TABLE lesson_completions ADD COLUMN source TEXT NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson','testout'))"
    );
  }
}

/**
 * Chat messages can be about a practice-pool exercise (Tutoring Phase 2). Adds the column to a
 * chat table created before Phase 2; fresh databases already have it.
 */
function migrateChatPracticeColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(lesson_chat_messages)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'practice_exercise_id')) return;
  db.exec(
    'ALTER TABLE lesson_chat_messages ADD COLUMN practice_exercise_id TEXT REFERENCES practice_exercises(id) ON DELETE SET NULL'
  );
}

// After the column exists on both fresh and migrated databases.
function createChatPracticeIndex(db: Database.Database): void {
  db.exec('CREATE INDEX IF NOT EXISTS idx_lesson_chat_messages_practice ON lesson_chat_messages(practice_exercise_id)');
}

// Spec: Bilingual Content, Data Model. German columns beside the English ones; empty until seeded.
function migrateBilingualColumns(db: Database.Database): void {
  const has = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!has('milestones', 'title_de')) {
    db.exec("ALTER TABLE milestones ADD COLUMN title_de TEXT NOT NULL DEFAULT ''; ALTER TABLE milestones ADD COLUMN description_de TEXT;");
  }
  if (!has('lessons', 'title_de')) {
    db.exec(
      "ALTER TABLE lessons ADD COLUMN title_de TEXT NOT NULL DEFAULT ''; ALTER TABLE lessons ADD COLUMN explanation_de TEXT; ALTER TABLE lessons ADD COLUMN examples_de TEXT;"
    );
  }
}

export function runMigrations(db: Database.Database): void {
  // Wrapped in one transaction so a concurrent connection (e.g. a parallel `next build`
  // static-page-data worker also calling getDb()) never observes the mid-migration state
  // where the legacy curriculum tables have been dropped but not yet recreated.
  const migrate = db.transaction(() => {
    migrateLegacyCurriculumSchema(db);
    createTablesIfMissing(db);
    migrateConceptIdAndPlacementUniqueness(db);
    migrateProfileLevelColumns(db);
    migrateDailyReviewCap(db);
    migrateChatPracticeColumn(db);
    createChatPracticeIndex(db);
    migrateToMilestoneOnlyStructure(db);
    migrateBilingualColumns(db);
    migrateProfilePreferences(db);
    migrateFreestyle(db);
    migrateFlashcardReviewsToDeck(db);
  });
  migrate();
}

// Freestyle and the vocabulary deck: deck settings on the profile, and the End guard on sessions.
// `ending` is reset on every start so a crashed End can never leave a session busy.
function migrateFreestyle(db: Database.Database): void {
  const profile = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
  if (!profile.includes('new_words_per_day')) {
    db.exec('ALTER TABLE profile ADD COLUMN new_words_per_day INTEGER NOT NULL DEFAULT 10 CHECK (new_words_per_day BETWEEN 0 AND 50)');
  }
  if (!profile.includes('deck_review_cap')) {
    db.exec('ALTER TABLE profile ADD COLUMN deck_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (deck_review_cap BETWEEN 1 AND 500)');
  }
  const sessions = (db.prepare('PRAGMA table_info(freestyle_sessions)').all() as { name: string }[]).map((c) => c.name);
  if (!sessions.includes('ending')) db.exec('ALTER TABLE freestyle_sessions ADD COLUMN ending INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE freestyle_sessions SET ending = 0');
}

// Freestyle spec (B1): existing reviews of vocabulary-lesson flashcards move into the vocabulary deck
// with their state (due date, interval, ease, repetitions), and leave the Daily Queue. Idempotent:
// a moved card has no exercise review left, so a second run finds nothing. Runs inside the
// `runMigrations` transaction, so a failure leaves both tables as they were.
function migrateFlashcardReviewsToDeck(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT s.exercise_id, s.repetitions, s.ease_factor, s.interval_days, s.next_due_at, s.updated_at, e.content
       FROM exercise_srs_state s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN lessons l ON l.id = e.lesson_id
       WHERE e.type = 'flashcard' AND l.skill = 'vocabulary'`
    )
    .all() as {
    exercise_id: string;
    repetitions: number;
    ease_factor: number;
    interval_days: number;
    next_due_at: string;
    updated_at: string;
    content: string;
  }[];
  const remove = db.prepare('DELETE FROM exercise_srs_state WHERE exercise_id = ?');
  for (const row of rows) {
    let parsed: { front?: unknown; back?: unknown } | null;
    try {
      parsed = JSON.parse(row.content) as { front?: unknown; back?: unknown } | null;
    } catch {
      continue; // broken content stays a review
    }
    const front = parsed?.front;
    const back = parsed?.back;
    if (typeof front !== 'string' || !front.trim() || typeof back !== 'string') continue; // broken content stays a review
    upsertLessonCard(db, {
      ...lessonCardLemma(front),
      meaningEn: back,
      exerciseId: row.exercise_id,
      state: { repetitions: row.repetitions, easeFactor: row.ease_factor, intervalDays: row.interval_days, nextDueAt: row.next_due_at },
      at: row.updated_at,
    });
    remove.run(row.exercise_id);
  }
}

// Design pass: theme and sound preferences; the freestyle default setting is removed (Freestyle decision).
function migrateProfilePreferences(db: Database.Database): void {
  const columns = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('theme')) {
    db.exec("ALTER TABLE profile ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system'))");
  }
  if (!columns.includes('sound_enabled')) db.exec('ALTER TABLE profile ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1');
  if (columns.includes('freestyle_default')) db.exec('ALTER TABLE profile DROP COLUMN freestyle_default');
}

function createTablesIfMissing(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL DEFAULT '',
      ui_language TEXT NOT NULL DEFAULT 'en' CHECK (ui_language IN ('en','de')),
      active_track TEXT NOT NULL DEFAULT 'generic' CHECK (active_track IN ('generic','telc','goethe')),
      active_level TEXT NOT NULL DEFAULT 'A1' CHECK (active_level IN ('A1','A2','B1','B2','C1')),
      theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      highest_unlocked_level TEXT NOT NULL DEFAULT 'A1' CHECK (highest_unlocked_level IN ('A1','A2','B1','B2','C1')),
      placement_status TEXT NOT NULL DEFAULT 'pending' CHECK (placement_status IN ('pending','skipped','taken')),
      unlock_notice_level TEXT CHECK (unlock_notice_level IN ('A2','B1','B2','C1')),
      onboarding_choices_saved INTEGER NOT NULL DEFAULT 0,
      daily_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (daily_review_cap BETWEEN 1 AND 500),
      new_words_per_day INTEGER NOT NULL DEFAULT 10 CHECK (new_words_per_day BETWEEN 0 AND 50),
      deck_review_cap INTEGER NOT NULL DEFAULT 50 CHECK (deck_review_cap BETWEEN 1 AND 500),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_type TEXT NOT NULL CHECK (provider_type IN ('anthropic','openai','gemini','ollama')),
      label TEXT,
      encrypted_api_key TEXT,
      ollama_host TEXT,
      selected_model TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      last_validated_status TEXT NOT NULL DEFAULT 'untested' CHECK (last_validated_status IN ('valid','invalid','failing','untested')),
      last_validated_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(connection_id, date)
    );

    CREATE TABLE IF NOT EXISTS memory_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_by_provider TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      title TEXT NOT NULL,
      description TEXT,
      difficulty_rank INTEGER CHECK (difficulty_rank IS NULL OR difficulty_rank >= 1),
      title_de TEXT NOT NULL DEFAULT '',
      description_de TEXT
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      source_level TEXT NOT NULL CHECK (source_level IN ('A1','A2','B1','B2','C1')),
      skill TEXT NOT NULL CHECK (skill IN ('grammar','vocabulary','reading','listening','writing','speaking')),
      title TEXT NOT NULL,
      explanation TEXT,
      examples TEXT,
      title_de TEXT NOT NULL DEFAULT '',
      explanation_de TEXT,
      examples_de TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_track_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      explanation TEXT,
      examples TEXT,
      UNIQUE(lesson_id, track)
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      track TEXT CHECK (track IN ('generic','telc','goethe')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_prerequisites (
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      prerequisite_lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      PRIMARY KEY (lesson_id, prerequisite_lesson_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_concept_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_a_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      lesson_b_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_a_id, lesson_b_id),
      CHECK (lesson_a_id < lesson_b_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_concept_links_a ON lesson_concept_links(lesson_a_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_concept_links_b ON lesson_concept_links(lesson_b_id);

    CREATE TABLE IF NOT EXISTS curriculum_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seed_version TEXT NOT NULL DEFAULT '0',
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS placement_questions (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','free_text')),
      content TEXT NOT NULL
    );

    -- Where the stored placement exam came from. A bundled exam is refreshed when the bundled file
    -- changes (content_hash); an uploaded one is never replaced at seed time.
    CREATE TABLE IF NOT EXISTS placement_exam_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source TEXT NOT NULL CHECK (source IN ('bundled','uploaded')),
      content_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS placement_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      started_at TEXT NOT NULL,
      next_position INTEGER NOT NULL,
      score REAL NOT NULL,
      mistakes INTEGER NOT NULL,
      answers TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS placement_best_result (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      score REAL NOT NULL,
      max_score REAL NOT NULL,
      placed_level TEXT NOT NULL CHECK (placed_level IN ('A1','A2','B1','B2','C1')),
      stop_reason TEXT NOT NULL CHECK (stop_reason IN ('beyond_my_knowledge','five_mistakes','finished')),
      taken_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('lesson','queue')),
      result TEXT NOT NULL CHECK (result IN ('correct','almost','wrong')),
      answer_text TEXT,
      ai_feedback TEXT,
      answered_at TEXT NOT NULL,
      answered_on TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_attempts_exercise ON lesson_attempts(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_attempts_lesson ON lesson_attempts(lesson_id);

    CREATE TABLE IF NOT EXISTS lesson_completions (
      lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson','testout'))
    );

    CREATE TABLE IF NOT EXISTS exercise_srs_state (
      exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
      repetitions INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      next_due_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
      practice_exercise_id TEXT REFERENCES practice_exercises(id) ON DELETE SET NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_chat_lesson ON lesson_chat_messages(lesson_id);

    CREATE TABLE IF NOT EXISTS milestone_testouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('in_progress','passed','failed')),
      exercise_ids TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '[]',
      score REAL,
      max_score REAL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_testouts_one_open ON milestone_testouts(milestone_id) WHERE status = 'in_progress';

    CREATE TABLE IF NOT EXISTS practice_exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','approved','rejected')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_practice_exercises_lesson ON practice_exercises(lesson_id);

    CREATE TABLE IF NOT EXISTS practice_seen (
      practice_exercise_id TEXT PRIMARY KEY REFERENCES practice_exercises(id) ON DELETE CASCADE,
      served_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS freestyle_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL CHECK (mode IN ('conversation','grammar_drill','free_reading','free_writing','spoken','exam_practice')),
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      setup TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      ending INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_freestyle_one_open ON freestyle_sessions(mode);

    CREATE TABLE IF NOT EXISTS freestyle_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES freestyle_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      extra TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vocabulary_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lemma TEXT NOT NULL,
      lemma_key TEXT NOT NULL UNIQUE,
      part_of_speech TEXT,
      plural TEXT,
      meaning_en TEXT NOT NULL,
      meaning_de TEXT NOT NULL DEFAULT '',
      example TEXT,
      level TEXT CHECK (level IS NULL OR level IN ('A1','A2','B1','B2','C1')),
      source TEXT NOT NULL CHECK (source IN ('starter','lesson','freestyle','manual')),
      source_ref TEXT,
      status TEXT NOT NULL CHECK (status IN ('not_started','learning')),
      introduced_on TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocabulary_srs_state (
      item_id INTEGER PRIMARY KEY REFERENCES vocabulary_items(id) ON DELETE CASCADE,
      repetitions INTEGER NOT NULL, ease_factor REAL NOT NULL, interval_days REAL NOT NULL,
      next_due_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocabulary_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
      rating TEXT NOT NULL CHECK (rating IN ('knew','sort_of','didnt_know')),
      answered_on TEXT NOT NULL, answered_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vocab_answers_day ON vocabulary_answers(answered_on);
  `);
}
