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
vi.mock('@/components/tutoring/QueuePage', () => ({ QueuePage: () => null }));

import Queue from './page';

describe('Queue page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Queue();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the queue otherwise', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(Queue()).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
