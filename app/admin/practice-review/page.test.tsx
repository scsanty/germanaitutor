import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockIsAdmin } = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  mockIsAdmin: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: mockIsAdmin }));
vi.mock('@/components/admin/PracticePoolList', () => ({ PracticePoolList: () => null }));

import PracticeReviewPage from './page';

describe('Practice review page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a visitor without an admin session to the login', async () => {
    mockIsAdmin.mockResolvedValue(false);
    await expect(PracticeReviewPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('renders the review list for an admin', async () => {
    mockIsAdmin.mockResolvedValue(true);
    expect(await PracticeReviewPage()).toBeTruthy();
  });
});
