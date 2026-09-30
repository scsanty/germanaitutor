import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

  it('redirects to /admin/login when not authenticated', async () => {
    isAdminSessionValidMock.mockReturnValue(false);
    await expect(AdminCurriculumPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('renders track list when authenticated', async () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listTracksMock.mockReturnValue([{ track: 'generic', levels: ['A1'] }]);
    const result = await AdminCurriculumPage();
    expect(result).toBeTruthy();
  });

  it('links to the admin tools and the seed exports', async () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listTracksMock.mockReturnValue([{ track: 'generic', levels: ['A1'] }]);
    render(await AdminCurriculumPage());
    expect(screen.getByRole('link', { name: 'Download all as seed files (zip)' })).toHaveAttribute(
      'href',
      '/api/admin/curriculum/export'
    );
    expect(screen.getByRole('link', { name: '(export)' })).toHaveAttribute('href', '/api/admin/curriculum/export/generic/A1');
    expect(screen.getByRole('link', { name: 'Placement exam' })).toHaveAttribute('href', '/admin/placement-exam');
    expect(screen.getByRole('link', { name: 'Practice exercises to review' })).toHaveAttribute('href', '/admin/practice-review');
  });
});
