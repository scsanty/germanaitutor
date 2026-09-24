import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockGetProfile } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetProfile: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/components/ActiveProviderBanner', () => ({ ActiveProviderBanner: () => null }));
vi.mock('@/components/home/HomeIntro', () => ({ HomeIntro: () => null }));

import Home from './page';

describe('Home page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('redirects to onboarding when onboarding is incomplete', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Home();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders home content when onboarding is complete', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    const result = Home();
    expect(result).toBeTruthy();
  });
});
