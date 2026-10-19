import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { NotificationsAdmin } from './NotificationsAdmin';
import { NOTIFICATIONS_CHANGED } from './AdminNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/notifications', useRouter: () => ({ push: vi.fn() }) }));

const note = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'speech_down',
  problemKey: 'speech_down',
  severity: 'problem',
  title: `Note ${id}`,
  body: 'Body text',
  createdAt: '2026-10-17T09:30:00.000Z',
  resolvedAt: null,
  readAt: null,
  emailError: null,
  ...over,
});

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('NotificationsAdmin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists notifications with their state and the email error per row', async () => {
    stubFetch({
      'GET /api/admin/notifications?filter=all': () =>
        delayedResponse([
          note(1, { title: 'Speech service is down', emailError: 'Email is not set up' }),
          note(2, { title: 'Audio generation failed', resolvedAt: '2026-10-17T10:00:00.000Z', readAt: '2026-10-17T10:01:00.000Z' }),
          note(3, { title: 'Practice pool', severity: 'info', kind: 'pool_items', problemKey: null }),
        ]),
    });
    render(<NotificationsAdmin />);
    const down = await screen.findByRole('listitem', { name: 'Speech service is down' });
    expect(within(down).getByText('Open problem')).toBeInTheDocument();
    expect(within(down).getByText('Unread')).toBeInTheDocument();
    expect(within(down).getByText('Email not sent: Email is not set up')).toBeInTheDocument();
    const failed = screen.getByRole('listitem', { name: 'Audio generation failed' });
    expect(within(failed).getByText('Resolved')).toBeInTheDocument();
    expect(within(failed).queryByText('Unread')).not.toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Practice pool' })).getByText('Info')).toBeInTheDocument();
  });

  it('filters to open problems and unread', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/notifications?filter=all': () => delayedResponse([note(1)]),
      'GET /api/admin/notifications?filter=open': () => delayedResponse([note(4, { title: 'Still down' })]),
      'GET /api/admin/notifications?filter=unread': () => delayedResponse([]),
    });
    render(<NotificationsAdmin />);
    await screen.findByText('Note 1');
    fireEvent.click(screen.getByRole('button', { name: 'Open problems' }));
    expect(await screen.findByText('Still down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open problems' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/notifications?filter=unread');
  });

  it('marks all read, reloads, and tells the bell', async () => {
    const lists = [() => delayedResponse([note(1)]), () => delayedResponse([note(1, { readAt: '2026-10-17T11:00:00.000Z' })])];
    const fetchMock = stubFetch({
      'GET /api/admin/notifications?filter=all': () => lists.shift()!(),
      'POST /api/admin/notifications': () => delayedResponse({ marked: 1 }),
    });
    const changed = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED, changed);
    render(<NotificationsAdmin />);
    const row = await screen.findByRole('listitem', { name: 'Note 1' });
    expect(within(row).getByText('Unread')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/notifications', { method: 'POST' }));
    await waitFor(() => expect(within(screen.getByRole('listitem', { name: 'Note 1' })).queryByText('Unread')).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    window.removeEventListener(NOTIFICATIONS_CHANGED, changed);
  });

  it('shows an error when marking fails', async () => {
    stubFetch({
      'GET /api/admin/notifications?filter=all': () => delayedResponse([note(1)]),
      'POST /api/admin/notifications': () => delayedResponse({ error: 'nope' }, { ok: false, status: 500 }),
    });
    render(<NotificationsAdmin />);
    await screen.findByText('Note 1');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark the notifications read (500)');
  });
});
