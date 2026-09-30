// lib/services/profileService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService, LockedLevelError, ProfileUpdateError } from './profileService';

describe('profileService', () => {
  it('returns default profile values before any update', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.getProfile()).toMatchObject({
      activeTrack: 'generic',
      activeLevel: 'A1',
      uiLanguage: 'en',
      onboardingComplete: false,
      highestUnlockedLevel: 'A1',
      placementStatus: 'pending',
      unlockNoticeLevel: null,
      onboardingChoicesSaved: false,
    });
  });

  it('persists partial updates across calls', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.writeLevelState({ highestUnlockedLevel: 'B1' });
    service.updateProfile({ activeTrack: 'telc', activeLevel: 'B1' });
    const updated = service.updateProfile({ onboardingComplete: true });
    expect(updated).toMatchObject({ activeTrack: 'telc', activeLevel: 'B1', onboardingComplete: true });
  });

  it('rejects switching to a level above the highest unlocked one', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(() => service.updateProfile({ activeLevel: 'A2' })).toThrow(LockedLevelError);
    expect(service.getProfile().activeLevel).toBe('A1');
  });

  it('rejects an unknown activeLevel instead of hitting the SQLite CHECK', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(() => service.updateProfile({ activeLevel: 'Z9' as never })).toThrow(LockedLevelError);
    expect(service.getProfile().activeLevel).toBe('A1');
  });

  it('ignores level-state fields sent through updateProfile', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.updateProfile({ highestUnlockedLevel: 'C1', placementStatus: 'taken' } as never);
    expect(service.getProfile()).toMatchObject({ highestUnlockedLevel: 'A1', placementStatus: 'pending' });
  });

  it('writes level state directly and can clear the unlock notice', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.writeLevelState({
      highestUnlockedLevel: 'B2',
      activeLevel: 'B1',
      placementStatus: 'taken',
      unlockNoticeLevel: 'B2',
    });
    expect(service.getProfile()).toMatchObject({
      highestUnlockedLevel: 'B2',
      activeLevel: 'B1',
      placementStatus: 'taken',
      unlockNoticeLevel: 'B2',
    });

    service.writeLevelState({ unlockNoticeLevel: null });
    expect(service.getProfile()).toMatchObject({ unlockNoticeLevel: null, highestUnlockedLevel: 'B2', activeLevel: 'B1' });
  });

  it('stores that the onboarding choices were saved', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.updateProfile({ onboardingChoicesSaved: true }).onboardingChoicesSaved).toBe(true);
  });

  it('stores a daily review limit and rejects values outside 1–500', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(service.getProfile().dailyReviewCap).toBe(50);
    expect(service.updateProfile({ dailyReviewCap: 120 }).dailyReviewCap).toBe(120);
    for (const bad of [0, 501, 2.5]) {
      expect(() => service.updateProfile({ dailyReviewCap: bad })).toThrow(ProfileUpdateError);
    }
    expect(service.getProfile().dailyReviewCap).toBe(120);
  });

  it('treats a locked level as a profile update error', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(() => service.updateProfile({ activeLevel: 'B2' })).toThrow(ProfileUpdateError);
  });

  it('updates the theme and sound, and rejects an unknown theme', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(service.updateProfile({ theme: 'light', soundEnabled: false })).toMatchObject({ theme: 'light', soundEnabled: false });
    expect(() => service.updateProfile({ theme: 'neon' as never })).toThrow('Theme must be dark, light or system');
    expect(service.getProfile().theme).toBe('light');
  });
});
