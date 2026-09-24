import { describe, it, expect, vi } from 'vitest';

const { mockGetProfile, mockGetActiveConnection } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockGetActiveConnection: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/crypto/keyfile', () => ({ defaultKeyFilePath: () => '/tmp/unused.key' }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/lib/services/providerService', () => ({
  createProviderService: () => ({ getActiveConnection: mockGetActiveConnection }),
}));
vi.mock('@/components/onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => null }));

import OnboardingPage from './page';

describe('Onboarding page', () => {
  it('resumes at the placement step when choices are saved and the provider works', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: true });
    mockGetActiveConnection.mockReturnValue({ lastValidatedStatus: 'valid' });
    expect(OnboardingPage().props).toEqual({ initialStep: 'placement' });
  });

  it('starts from the welcome step when the choices were never saved', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: false });
    mockGetActiveConnection.mockReturnValue({ lastValidatedStatus: 'valid' });
    expect(OnboardingPage().props).toEqual({ initialStep: 'welcome' });
  });

  it('starts from the welcome step when there is no working provider', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: true });
    mockGetActiveConnection.mockReturnValue(null);
    expect(OnboardingPage().props).toEqual({ initialStep: 'welcome' });
  });
});
