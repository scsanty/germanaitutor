// lib/services/profileService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';

describe('profileService', () => {
  it('returns default profile values before any update', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.getProfile()).toMatchObject({
      activeTrack: 'generic',
      activeLevel: 'A1',
      uiLanguage: 'en',
      onboardingComplete: false,
    });
  });

  it('persists partial updates across calls', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.updateProfile({ activeTrack: 'telc', activeLevel: 'B1' });
    const updated = service.updateProfile({ onboardingComplete: true });
    expect(updated).toMatchObject({ activeTrack: 'telc', activeLevel: 'B1', onboardingComplete: true });
  });
});
