import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDbClient } from './client';
import { runMigrations } from './schema';

describe('profile preferences', () => {
  it('defaults to the dark theme with sound on, and has no freestyle default', () => {
    const db = createDbClient(':memory:');
    db.prepare('INSERT INTO profile (id) VALUES (1)').run();
    expect(db.prepare('SELECT theme, sound_enabled FROM profile').get()).toEqual({ theme: 'dark', sound_enabled: 1 });
    const columns = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('freestyle_default');
  });

  it('migrates an existing profile without losing its data', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.exec('ALTER TABLE profile DROP COLUMN theme; ALTER TABLE profile DROP COLUMN sound_enabled;');
    db.exec('ALTER TABLE profile ADD COLUMN freestyle_default INTEGER NOT NULL DEFAULT 0');
    db.prepare("INSERT INTO profile (id, display_name, freestyle_default) VALUES (1, 'Anna', 1)").run();
    runMigrations(db);
    expect(db.prepare('SELECT display_name, theme, sound_enabled FROM profile').get()).toEqual({
      display_name: 'Anna',
      theme: 'dark',
      sound_enabled: 1,
    });
    const columns = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('freestyle_default');
  });
});
