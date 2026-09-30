// components/profile/ProfilePage.test.tsx
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ProfilePage } from './ProfilePage';

const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  theme: 'dark',
  soundEnabled: true,
  onboardingComplete: true,
  highestUnlockedLevel: 'B1',
  placementStatus: 'taken',
  unlockNoticeLevel: null,
  onboardingChoicesSaved: true,
  dailyReviewCap: 50,
  updatedAt: '',
};

/**
 * "METHOD url"-keyed fetch stub; individual tests override only what they care
 * about. Keyed by method too, since GET and POST /api/providers differ.
 */
function stubProfileRoutes(profilePatch: Record<string, unknown> = {}, adminAuth: Record<string, unknown> = { authenticated: false }, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, any> = {
    'GET /api/profile': { ok: true, json: async () => ({ ...PROFILE, ...profilePatch }) },
    'GET /api/providers': { ok: true, json: async () => [] },
    'GET /api/admin/auth': { ok: true, json: async () => ({ passwordSet: true, ...adminAuth }) },
    'POST /api/providers': { ok: true, json: async () => ({ id: 7 }) },
    'GET /api/providers/7/models': { ok: true, json: async () => [{ id: 'model-a', label: 'Model A' }] },
    'PATCH /api/providers/7': { ok: true, json: async () => ({ id: 7 }) },
    ...overrides,
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(routes[`${init?.method ?? 'GET'} ${url}`] ?? { ok: true, json: async () => ({}) })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}


describe('ProfilePage', () => {
  beforeEach(() => {
    stubProfileRoutes();
  });

  it('offers only the unlocked levels', async () => {
    stubProfileRoutes();
    renderWithIntl(<ProfilePage />);
    const levelSelect = await screen.findByLabelText('Level');
    const options = Array.from(levelSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['A1', 'A2', 'B1']);
    expect(screen.getByText('Levels above B1 unlock as you finish lessons or place higher in the placement test.')).toBeInTheDocument();
  });

  it('shows an error when a setting cannot be saved', async () => {
    stubProfileRoutes({}, undefined, { 'PATCH /api/profile': { ok: false, status: 400, json: async () => ({ error: 'Level B1 is locked' }) } });
    renderWithIntl(<ProfilePage />);
    fireEvent.change(await screen.findByLabelText('Level'), { target: { value: 'B1' } });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save this setting: Level B1 is locked')
    );
  });

  it('refreshes the page after changing the interface language', async () => {
    stubProfileRoutes({}, undefined, { 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, uiLanguage: 'de' }) } });
    renderWithIntl(<ProfilePage />);
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'de' } });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows the best placement result and a retake link', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/placement': {
        ok: true,
        json: async () => ({
          best: { score: 24, maxScore: 120, placedLevel: 'B1', stopReason: 'five_mistakes', takenAt: '2026-09-24 10:00:00' },
          questionCount: 40,
        }),
      },
    });
    renderWithIntl(<ProfilePage />);
    expect(await screen.findByText('Best result: B1 (24 of 120 points, 2026-09-24)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retake the placement test' })).toHaveAttribute('href', '/placement');
  });

  it('offers the placement test when it was never taken', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/placement': { ok: true, json: async () => ({ best: null, questionCount: 40 }) } });
    renderWithIntl(<ProfilePage />);
    expect(await screen.findByText('You have not taken the placement test yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the placement test' })).toBeInTheDocument();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/profile': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<ProfilePage />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load your settings. Please reload the page.')
    );
  });

  it('saves the display name on blur', async () => {
    const fetchMock = stubProfileRoutes({ displayName: 'Anna' });
    renderWithIntl(<ProfilePage />);
    const name = await screen.findByLabelText('Your name');
    fireEvent.change(name, { target: { value: 'Santy' } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Santy' }),
      })
    );
  });
});
