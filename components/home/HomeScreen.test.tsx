import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { HomeScreen } from './HomeScreen';

const TREE = { track: 'generic', level: 'A1', milestones: [] };

describe('HomeScreen', () => {
  it('reloads the tree after switching to a newly unlocked level', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/profile') return delayedResponse({ placementStatus: 'taken', unlockNoticeLevel: 'A2' });
      if (url === '/api/tutoring/unlock-notice') return delayedResponse({ placementStatus: 'taken', unlockNoticeLevel: null });
      if (url === '/api/tutoring/tree') return delayedResponse(TREE);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const treeCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/tutoring/tree').length;

    renderWithIntl(<HomeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch' }));

    await waitFor(() => expect(treeCalls()).toBe(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Switch' })).not.toBeInTheDocument());
  });

  it('links to the dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ placementStatus: 'taken', unlockNoticeLevel: null, ...TREE })));
    renderWithIntl(<HomeScreen />);
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
  });
});
