import type Database from 'better-sqlite3';
import type { CefrLevel, Profile } from '../types';
import { higherLevel, isAtOrBelow } from '../tutoring/levels';
import { createProfileService } from './profileService';

export function createUnlockService(db: Database.Database) {
  const profiles = createProfileService(db);

  function isLevelUnlocked(level: CefrLevel): boolean {
    return isAtOrBelow(level, profiles.getProfile().highestUnlockedLevel);
  }

  // Unlocks never go down: a level at or below the current ceiling changes nothing.
  function raiseUnlockedLevel(level: CefrLevel, options: { notify: boolean }): Profile {
    const profile = profiles.getProfile();
    if (isAtOrBelow(level, profile.highestUnlockedLevel)) return profile;
    const notice = options.notify
      ? profile.unlockNoticeLevel
        ? higherLevel(profile.unlockNoticeLevel, level)
        : level
      : profile.unlockNoticeLevel;
    return profiles.writeLevelState({ highestUnlockedLevel: level, unlockNoticeLevel: notice });
  }

  function resolveUnlockNotice(action: 'switch' | 'dismiss'): Profile {
    const profile = profiles.getProfile();
    if (!profile.unlockNoticeLevel) return profile;
    return profiles.writeLevelState({
      unlockNoticeLevel: null,
      ...(action === 'switch' ? { activeLevel: profile.unlockNoticeLevel } : {}),
    });
  }

  return { isLevelUnlocked, raiseUnlockedLevel, resolveUnlockNotice };
}

export type UnlockService = ReturnType<typeof createUnlockService>;
