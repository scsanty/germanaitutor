import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
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
  `);
}
