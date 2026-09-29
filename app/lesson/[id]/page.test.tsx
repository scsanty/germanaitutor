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
vi.mock('@/components/tutoring/LessonPage', () => ({ LessonPage: () => null }));

import Lesson from './page';

describe('Lesson page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', async () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    await Lesson({ params: Promise.resolve({ id: 'a1-greet' }) });
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the lesson otherwise', async () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(await Lesson({ params: Promise.resolve({ id: 'a1-greet' }) })).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
