import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { AppShell } from './AppShell';
import { ShellProvider, useShell } from './ShellContext';
import { FocusLayout } from '@/components/focus/FocusLayout';

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

// A lesson-like page: local state decides whether the focus-mode run is showing.
function StartPage({ mounts }: { mounts: { count: number } }) {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    mounts.count += 1;
  }, [mounts]);
  if (!running) return <button onClick={() => setRunning(true)}>start</button>;
  return (
    <FocusLayout progress={null} confirmExit={false} onExit={() => setRunning(false)}>
      <p>run</p>
    </FocusLayout>
  );
}

// A queue-like page: fetches on mount, then shows the run in focus mode.
function FetchingPage({ loads }: { loads: { count: number } }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    loads.count += 1;
    let stale = false;
    void Promise.resolve().then(() => {
      if (!stale) setLoaded(true);
    });
    return () => {
      stale = true;
    };
  }, [loads]);
  if (!loaded) return <p>loading</p>;
  return (
    <FocusLayout progress={null} confirmExit={false} onExit={() => {}}>
      <p>queue run</p>
    </FocusLayout>
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

  // Final review C1: entering focus mode must not remount the page.
  it.each([
    ['phone', false, false],
    ['tablet', false, true],
    ['desktop', true, true],
  ])('keeps the page mounted when a run enters focus mode (%s)', async (_name, desktop, tablet) => {
    setWidth(desktop, tablet);
    const mounts = { count: 0 };
    renderWithIntl(
      <ShellProvider>
        <AppShell>
          <StartPage mounts={mounts} />
        </AppShell>
      </ShellProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'start' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('run')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('run'));
    expect(mounts.count).toBe(1);
  });

  it('loads a fetching page once when it then enters focus mode', async () => {
    setWidth(false);
    const loads = { count: 0 };
    renderWithIntl(
      <ShellProvider>
        <AppShell>
          <FetchingPage loads={loads} />
        </AppShell>
      </ShellProvider>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('queue run')).toBeInTheDocument();
    expect(loads.count).toBe(1);
  });
});
