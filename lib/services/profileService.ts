import type Database from 'better-sqlite3';
import type { Profile, Track, CefrLevel } from '../types';

interface Row {
  display_name: string;
  ui_language: 'en' | 'de';
  active_track: Track;
  active_level: CefrLevel;
  freestyle_default: number;
  onboarding_complete: number;
  updated_at: string;
}

function rowToProfile(row: Row): Profile {
  return {
    displayName: row.display_name,
    uiLanguage: row.ui_language,
    activeTrack: row.active_track,
    activeLevel: row.active_level,
    freestyleDefault: row.freestyle_default === 1,
    onboardingComplete: row.onboarding_complete === 1,
    updatedAt: row.updated_at,
  };
}

export function createProfileService(db: Database.Database) {
  function ensureRow(): void {
    db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  }

  function getProfile(): Profile {
    ensureRow();
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Row;
    return rowToProfile(row);
  }

  function updateProfile(
    input: Partial<{
      displayName: string;
      uiLanguage: 'en' | 'de';
      activeTrack: Track;
      activeLevel: CefrLevel;
      freestyleDefault: boolean;
      onboardingComplete: boolean;
    }>
  ): Profile {
    ensureRow();
    const current = getProfile();
    db.prepare(
      `UPDATE profile SET display_name = ?, ui_language = ?, active_track = ?, active_level = ?, freestyle_default = ?, onboarding_complete = ?, updated_at = datetime('now') WHERE id = 1`
    ).run(
      input.displayName ?? current.displayName,
      input.uiLanguage ?? current.uiLanguage,
      input.activeTrack ?? current.activeTrack,
      input.activeLevel ?? current.activeLevel,
      (input.freestyleDefault ?? current.freestyleDefault) ? 1 : 0,
      (input.onboardingComplete ?? current.onboardingComplete) ? 1 : 0
    );
    return getProfile();
  }

  return { getProfile, updateProfile };
}

export type ProfileService = ReturnType<typeof createProfileService>;
