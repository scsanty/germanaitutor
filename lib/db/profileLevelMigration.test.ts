import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './schema';
import { createDbClient } from './client';
import { createProfileService } from '../services/profileService';

describe('profile level migration', () => {
  it('adds the level columns and resets an existing self-selected level to A1', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT NOT NULL DEFAULT '',
        ui_language TEXT NOT NULL DEFAULT 'en',
        active_track TEXT NOT NULL DEFAULT 'generic',
        active_level TEXT NOT NULL DEFAULT 'A1',
        freestyle_default INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO profile (id, active_track, active_level, onboarding_complete) VALUES (1, 'goethe', 'B1', 1);
    `);

    runMigrations(db);

    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    expect(row).toMatchObject({
      active_track: 'goethe',
      active_level: 'A1',
      onboarding_complete: 1,
      highest_unlocked_level: 'A1',
      placement_status: 'pending',
      unlock_notice_level: null,
      onboarding_choices_saved: 0,
    });
  });

  it('does not reset a profile that already has the columns', () => {
    const db = createDbClient(':memory:');
    createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });

    runMigrations(db);

    expect(createProfileService(db).getProfile()).toMatchObject({ activeLevel: 'B1', highestUnlockedLevel: 'B1' });
  });
});
