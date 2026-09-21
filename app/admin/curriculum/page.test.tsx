import { describe, it, expect, vi, beforeEach } from 'vitest';

const { redirectMock, isAdminSessionValidMock, listTracksMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  isAdminSessionValidMock: vi.fn(),
  listTracksMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: isAdminSessionValidMock }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/curriculumService', () => ({
  createCurriculumService: () => ({ listTracks: listTracksMock }),
}));

import AdminCurriculumPage from './page';

describe('AdminCurriculumPage', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects to /admin/login when not authenticated', () => {
    isAdminSessionValidMock.mockReturnValue(false);
    expect(() => AdminCurriculumPage()).toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('renders track list when authenticated', () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listTracksMock.mockReturnValue([{ track: 'generic', levels: ['A1'] }]);
    const result = AdminCurriculumPage();
    expect(result).toBeTruthy();
  });
});
