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

export function runMigrations(db: Database.Database): void {
  // Wrapped in one transaction so a concurrent connection (e.g. a parallel `next build`
  // static-page-data worker also calling getDb()) never observes the mid-migration state
  // where the legacy curriculum tables have been dropped but not yet recreated.
  const migrate = db.transaction(() => {
    migrateLegacyCurriculumSchema(db);
    createTablesIfMissing(db);
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
      concept_id TEXT,
      source_level TEXT NOT NULL CHECK (source_level IN ('A1','A2','B1','B2','C1')),
      skill TEXT NOT NULL CHECK (skill IN ('grammar','vocabulary','reading','listening','writing','speaking')),
      title TEXT NOT NULL,
      explanation TEXT,
      examples TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_concept_id ON lessons(concept_id);

    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id, section_id)
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

    CREATE TABLE IF NOT EXISTS curriculum_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seed_version TEXT NOT NULL DEFAULT '0',
      last_synced_at TEXT
    );
  `);
}
