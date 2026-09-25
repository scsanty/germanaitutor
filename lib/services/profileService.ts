import type Database from 'better-sqlite3';
import type { Profile, Track, CefrLevel, PlacementStatus } from '../types';
import { isAtOrBelow, isCefrLevel } from '../tutoring/levels';

interface Row {
  display_name: string;
  ui_language: 'en' | 'de';
  active_track: Track;
  active_level: CefrLevel;
  freestyle_default: number;
  onboarding_complete: number;
  highest_unlocked_level: CefrLevel;
  placement_status: PlacementStatus;
  unlock_notice_level: CefrLevel | null;
  onboarding_choices_saved: number;
  daily_review_cap: number;
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
    highestUnlockedLevel: row.highest_unlocked_level,
    placementStatus: row.placement_status,
    unlockNoticeLevel: row.unlock_notice_level,
    onboardingChoicesSaved: row.onboarding_choices_saved === 1,
    dailyReviewCap: row.daily_review_cap,
    updatedAt: row.updated_at,
  };
}

// A client update the profile can't accept; the profile route answers it with 400.
export class ProfileUpdateError extends Error {}
export class LockedLevelError extends ProfileUpdateError {}

export const DAILY_REVIEW_CAP_MIN = 1;
export const DAILY_REVIEW_CAP_MAX = 500;

export function isValidDailyReviewCap(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DAILY_REVIEW_CAP_MIN &&
    value <= DAILY_REVIEW_CAP_MAX
  );
}

export interface ProfileUpdate {
  displayName?: string;
  uiLanguage?: 'en' | 'de';
  activeTrack?: Track;
  activeLevel?: CefrLevel;
  freestyleDefault?: boolean;
  onboardingComplete?: boolean;
  onboardingChoicesSaved?: boolean;
  dailyReviewCap?: number;
}

export interface LevelStateUpdate {
  activeLevel?: CefrLevel;
  highestUnlockedLevel?: CefrLevel;
  placementStatus?: PlacementStatus;
  unlockNoticeLevel?: CefrLevel | null;
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

  function updateProfile(input: ProfileUpdate): Profile {
    ensureRow();
    const current = getProfile();
    if (
      input.activeLevel !== undefined &&
      (!isCefrLevel(input.activeLevel) || !isAtOrBelow(input.activeLevel, current.highestUnlockedLevel))
    ) {
      throw new LockedLevelError(`Level ${input.activeLevel} is locked`);
    }
    if (input.dailyReviewCap !== undefined && !isValidDailyReviewCap(input.dailyReviewCap)) {
      throw new ProfileUpdateError('The daily review limit must be a whole number from 1 to 500');
    }
    db.prepare(
      `UPDATE profile SET display_name = ?, ui_language = ?, active_track = ?, active_level = ?, freestyle_default = ?,
         onboarding_complete = ?, onboarding_choices_saved = ?, daily_review_cap = ?, updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      input.displayName ?? current.displayName,
      input.uiLanguage ?? current.uiLanguage,
      input.activeTrack ?? current.activeTrack,
      input.activeLevel ?? current.activeLevel,
      (input.freestyleDefault ?? current.freestyleDefault) ? 1 : 0,
      (input.onboardingComplete ?? current.onboardingComplete) ? 1 : 0,
      (input.onboardingChoicesSaved ?? current.onboardingChoicesSaved) ? 1 : 0,
      input.dailyReviewCap ?? current.dailyReviewCap
    );
    return getProfile();
  }

  // Level state changes only through the unlock and placement services, never a client PATCH.
  function writeLevelState(update: LevelStateUpdate): Profile {
    ensureRow();
    const current = getProfile();
    db.prepare(
      `UPDATE profile SET active_level = ?, highest_unlocked_level = ?, placement_status = ?, unlock_notice_level = ?,
         updated_at = datetime('now') WHERE id = 1`
    ).run(
      update.activeLevel ?? current.activeLevel,
      update.highestUnlockedLevel ?? current.highestUnlockedLevel,
      update.placementStatus ?? current.placementStatus,
      'unlockNoticeLevel' in update ? (update.unlockNoticeLevel ?? null) : current.unlockNoticeLevel
    );
    return getProfile();
  }

  return { getProfile, updateProfile, writeLevelState };
}

export type ProfileService = ReturnType<typeof createProfileService>;
