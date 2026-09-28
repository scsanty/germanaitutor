import type Database from 'better-sqlite3';
import type { CefrLevel, Profile } from '../types';
import { higherLevel, isAtOrBelow, nextLevel, TRACKS } from '../tutoring/levels';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';

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

  // Spec: Level Unlocking. Runs after every lesson completion. A completion can finish its level
  // in its own track, or in another track through a concept link (links always join the same
  // level), so every track is checked; either way the next level unlocks everywhere.
  function checkLevelFinishedAfterCompletion(level: CefrLevel): Profile {
    const next = nextLevel(level);
    const progress = createProgressService(db);
    if (next && TRACKS.some((track) => progress.isLevelFinished(track, level))) {
      return raiseUnlockedLevel(next, { notify: true });
    }
    return profiles.getProfile();
  }

  return { isLevelUnlocked, raiseUnlockedLevel, resolveUnlockNotice, checkLevelFinishedAfterCompletion };
}

export type UnlockService = ReturnType<typeof createUnlockService>;
