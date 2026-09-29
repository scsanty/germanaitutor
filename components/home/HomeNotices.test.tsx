import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { HomeNotices } from './HomeNotices';

const BASE_PROFILE = { placementStatus: 'taken', unlockNoticeLevel: null };

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('HomeNotices', () => {
  it('prompts for the placement test while it is pending, and skipping hides the prompt', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, placementStatus: 'pending' }),
      '/api/placement/skip': () => delayedResponse({ ...BASE_PROFILE, placementStatus: 'skipped' }),
    });
    renderWithIntl(<HomeNotices />);
    expect(await screen.findByRole('link', { name: 'Take the placement test' })).toHaveAttribute('href', '/placement');

    fireEvent.click(screen.getByText('Skip, start at A1'));
    await waitFor(() => expect(screen.queryByText('Take the placement test')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/skip', { method: 'POST' });
  });

  it('offers to switch to a newly unlocked level', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse(BASE_PROFILE),
    });
    renderWithIntl(<HomeNotices />);
    expect(await screen.findByText('A2 unlocked — switch to A2?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Switch'));
    await waitFor(() => expect(screen.queryByText('A2 unlocked — switch to A2?')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/unlock-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch' }),
    });
  });

  it('dismisses the unlock notice', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'B1' }),
      '/api/tutoring/unlock-notice': () => delayedResponse(BASE_PROFILE),
    });
    renderWithIntl(<HomeNotices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('B1 unlocked — switch to B1?')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/unlock-notice', expect.objectContaining({
      body: JSON.stringify({ action: 'dismiss' }),
    }));
  });

  it('shows nothing when nothing is pending', async () => {
    const fetchMock = stubFetch({ '/api/profile': () => delayedResponse(BASE_PROFILE) });
    const { container } = renderWithIntl(<HomeNotices />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an alert when the profile cannot be loaded', async () => {
    stubFetch({ '/api/profile': () => delayedResponse({}, { ok: false, status: 500 }) });
    renderWithIntl(<HomeNotices />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please reload the page.')
    );
  });

  it('shows an alert when an action fails', async () => {
    stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse({}, { ok: false, status: 500 }),
    });
    renderWithIntl(<HomeNotices />);
    fireEvent.click(await screen.findByText('Switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('reports the changed profile to its parent', async () => {
    stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse({ ...BASE_PROFILE, activeLevel: 'A2' }),
    });
    const onChange = vi.fn();
    renderWithIntl(<HomeNotices onChange={onChange} />);
    fireEvent.click(await screen.findByText('Switch'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...BASE_PROFILE, activeLevel: 'A2' }));
  });
});
