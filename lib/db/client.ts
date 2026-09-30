import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { runMigrations } from './schema';

function defaultDataDir(): string {
  return process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
}

export function getDbPath(): string {
  return process.env.GAIT_DB_PATH ?? join(defaultDataDir(), 'app.db');
}

export function createDbClient(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

let singleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('getDb() must not be called during `next build`: the database is opened at request time only');
  }
  if (!singleton) {
    singleton = createDbClient(getDbPath());
  }
  return singleton;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}
