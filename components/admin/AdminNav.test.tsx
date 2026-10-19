import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { AdminNav, NOTIFICATIONS_CHANGED } from './AdminNav';

let pathname = '/admin/curriculum';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

describe('AdminNav', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    pathname = '/admin/curriculum';
  });

  it('links Notifications with the unread count, and Settings', async () => {
    const counts = [{ unread: 3 }, { unread: 0 }];
    const fetchMock = vi.fn(() => delayedResponse(counts.shift()));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminNav />);
    expect(await screen.findByRole('link', { name: 'Notifications 3 unread' })).toHaveAttribute('href', '/admin/notifications');
    expect(screen.getByRole('option', { name: 'Notifications (3 unread)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin/settings');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/notifications/count');

    act(() => {
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    });
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('asks for nothing on the login page', () => {
    pathname = '/admin/login';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<AdminNav />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
