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
vi.mock('@/components/deck/DeckPage', () => ({ DeckPage: () => null }));

import Flashcards from './page';

describe('Flashcards page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Flashcards();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the deck otherwise', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(Flashcards()).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
