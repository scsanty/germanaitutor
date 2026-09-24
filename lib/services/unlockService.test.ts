import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

function setup() {
  const db = createDbClient(':memory:');
  return { profiles: createProfileService(db), unlocks: createUnlockService(db) };
}

describe('unlockService', () => {
  it('treats every level up to the highest unlocked one as unlocked', () => {
    const { profiles, unlocks } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'A2' });
    expect(unlocks.isLevelUnlocked('A1')).toBe(true);
    expect(unlocks.isLevelUnlocked('A2')).toBe(true);
    expect(unlocks.isLevelUnlocked('B1')).toBe(false);
  });

  it('raises the unlocked level and records a notice when asked', () => {
    const { unlocks } = setup();
    const profile = unlocks.raiseUnlockedLevel('A2', { notify: true });
    expect(profile).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2', activeLevel: 'A1' });
  });

  it('raises without a notice when notify is false', () => {
    const { unlocks } = setup();
    expect(unlocks.raiseUnlockedLevel('B1', { notify: false })).toMatchObject({
      highestUnlockedLevel: 'B1',
      unlockNoticeLevel: null,
    });
  });

  it('never lowers the unlocked level', () => {
    const { profiles, unlocks } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'B2' });
    expect(unlocks.raiseUnlockedLevel('A2', { notify: true })).toMatchObject({
      highestUnlockedLevel: 'B2',
      unlockNoticeLevel: null,
    });
  });

  it('keeps the higher level in the notice when a second unlock happens first', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('A2', { notify: true });
    expect(unlocks.raiseUnlockedLevel('B1', { notify: true }).unlockNoticeLevel).toBe('B1');
  });

  it('switching moves the active level to the notice level and clears it', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('B1', { notify: true });
    expect(unlocks.resolveUnlockNotice('switch')).toMatchObject({ activeLevel: 'B1', unlockNoticeLevel: null });
  });

  it('dismissing clears the notice and keeps the active level', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('B1', { notify: true });
    expect(unlocks.resolveUnlockNotice('dismiss')).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });

  it('does nothing when there is no notice', () => {
    const { unlocks } = setup();
    expect(unlocks.resolveUnlockNotice('switch')).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });
});
