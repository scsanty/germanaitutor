import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { AppShell } from './AppShell';
import { ShellProvider, useShell } from './ShellContext';

const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

function setWidth(desktop: boolean, tablet = desktop) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: (desktop && query.includes('min-width: 1024px')) || (tablet && query.includes('min-width: 768px')),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function FocusOn() {
  const { setFocus } = useShell();
  return <button onClick={() => setFocus(true)}>focus</button>;
}

function renderShell() {
  return renderWithIntl(
    <ShellProvider>
      <AppShell>
        <p>page</p>
        <FocusOn />
      </AppShell>
    </ShellProvider>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    pathname.value = '/';
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ due: 7 })));
  });

  it('on a phone: logo and Settings at the top, Review as a floating button with its badge, Dashboard and Profile at the bottom', async () => {
    setWidth(false);
    renderShell();
    expect(screen.getByRole('link', { name: 'NaDoch!' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(await screen.findByRole('link', { name: 'Review (7 due)' })).toHaveAttribute('href', '/queue');
    const bottom = screen.getByRole('navigation', { name: 'Main' });
    expect(bottom).toHaveTextContent('Dashboard');
    expect(bottom).toHaveTextContent('Profile');
    expect(screen.queryByRole('link', { name: /Freestyle/ })).not.toBeInTheDocument();
  });

  it('on a desktop: one sidebar with every built item', async () => {
    setWidth(true);
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Learn', 'Dashboard', 'Profile', 'Settings']) expect(sidebar).toHaveTextContent(name);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Review (7 due)' })).toBeInTheDocument());
  });

  it('hides itself in focus mode and on onboarding', () => {
    setWidth(false);
    const { unmount } = renderShell();
    screen.getByText('focus').click();
    return waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()).then(() => {
      unmount();
      pathname.value = '/onboarding';
      renderShell();
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
      expect(screen.getByText('page')).toBeInTheDocument();
    });
  });

  it('on a tablet: an icon-only sidebar whose links are still named', async () => {
    setWidth(false, true);
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    expect(sidebar).not.toHaveTextContent('Dashboard');
    expect(sidebar).not.toHaveTextContent('Learn');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(await screen.findByRole('link', { name: 'Review (7 due)' })).toBeInTheDocument();
  });

  it('refetches the badge on navigation and not on bare routes', async () => {
    setWidth(false);
    const fetchMock = vi.fn(() => delayedResponse({ due: 7 }));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderShell();
    await screen.findByRole('link', { name: 'Review (7 due)' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    pathname.value = '/onboarding';
    renderShell();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Review Focus 5
  it('shows Review without a badge when the count cannot load', async () => {
    setWidth(false);
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({}, { ok: false, status: 500 })));
    renderShell();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument());
  });
});
