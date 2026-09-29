import type Database from 'better-sqlite3';

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

export function runMigrations(db: Database.Database): void {
  // Wrapped in one transaction so a concurrent connection (e.g. a parallel `next build`
  // static-page-data worker also calling getDb()) never observes the mid-migration state
  // where the legacy curriculum tables have been dropped but not yet recreated.
  const migrate = db.transaction(() => {
    migrateLegacyCurriculumSchema(db);
    createTablesIfMissing(db);
    migrateConceptIdAndPlacementUniqueness(db);
    migrateProfileLevelColumns(db);
  });
  migrate();
}

function createTablesIfMissing(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL DEFAULT '',
      ui_language TEXT NOT NULL DEFAULT 'en' CHECK (ui_language IN ('en','de')),
      active_track TEXT NOT NULL DEFAULT 'generic' CHECK (active_track IN ('generic','telc','goethe')),
      active_level TEXT NOT NULL DEFAULT 'A1' CHECK (active_level IN ('A1','A2','B1','B2','C1')),
      freestyle_default INTEGER NOT NULL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      highest_unlocked_level TEXT NOT NULL DEFAULT 'A1' CHECK (highest_unlocked_level IN ('A1','A2','B1','B2','C1')),
      placement_status TEXT NOT NULL DEFAULT 'pending' CHECK (placement_status IN ('pending','skipped','taken')),
      unlock_notice_level TEXT CHECK (unlock_notice_level IN ('A2','B1','B2','C1')),
      onboarding_choices_saved INTEGER NOT NULL DEFAULT 0,
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
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      source_level TEXT NOT NULL CHECK (source_level IN ('A1','A2','B1','B2','C1')),
      skill TEXT NOT NULL CHECK (skill IN ('grammar','vocabulary','reading','listening','writing','speaking')),
      title TEXT NOT NULL,
      explanation TEXT,
      examples TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
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
  `);
}
