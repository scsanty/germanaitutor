import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { redirectMock, isAdminSessionValidMock, listMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  isAdminSessionValidMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: isAdminSessionValidMock }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/curriculumAuditService', () => ({
  createCurriculumAuditService: () => ({ listFlashcardViolations: listMock }),
}));

import FlashcardViolationsPage from './page';

describe('FlashcardViolationsPage', () => {
  it('redirects to /admin/login when not authenticated', async () => {
    isAdminSessionValidMock.mockReturnValue(false);
    await expect(FlashcardViolationsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('links each lesson to its edit form', async () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listMock.mockReturnValue([
      { lessonId: 'a1-g', title: 'Pronouns', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 3 },
    ]);
    render(await FlashcardViolationsPage());
    expect(screen.getByRole('link', { name: 'Pronouns' })).toHaveAttribute(
      'href',
      '/admin/curriculum/lesson/a1-g/edit?track=generic'
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('says so when there are none', async () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listMock.mockReturnValue([]);
    render(await FlashcardViolationsPage());
    expect(screen.getByText('None — every flashcard is in a vocabulary lesson.')).toBeInTheDocument();
  });
});
