import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { SystemSettingsAdmin } from './SystemSettingsAdmin';

const STORED = { host: 'smtp.example.com', port: 587, secure: false, user: 'me', from: 'me@example.com', to: 'admin@example.com', hasPassword: true };
const SPEECH = { url: 'http://127.0.0.1:5002', defaultUrl: 'http://127.0.0.1:5002', isDefault: true };

function stubFetch(routes: Record<string, (init?: RequestInit) => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    return route(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const email = () => screen.findByRole('form', { name: 'Email settings' });
const speech = () => screen.findByRole('form', { name: 'Speech service settings' });

// Radix's Switch and Checkbox measure themselves inside a <form>; jsdom has no ResizeObserver.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('SystemSettingsAdmin', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', NoResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('shows a stored password only as set, and an empty password field keeps it', async () => {
    const fetchMock = stubFetch({
      'GET /api/admin/settings/smtp': () => delayedResponse({ settings: STORED }),
      'GET /api/admin/settings/speech': () => delayedResponse(SPEECH),
      'PUT /api/admin/settings/smtp': () => delayedResponse({ settings: { ...STORED, host: 'mail.example.com' } }),
    });
    render(<SystemSettingsAdmin />);
    const form = within(await email());
    const password = form.getByLabelText('Password');
    expect(password).toHaveValue('');
    expect(password).toHaveAttribute('placeholder', '••••••');
    expect(password).toHaveAttribute('type', 'password');
    expect(form.getByText('A password is set. Leave the field empty to keep it.')).toBeInTheDocument();
    expect(form.getByLabelText('Host')).toHaveValue('smtp.example.com');

    fireEvent.change(form.getByLabelText('Host'), { target: { value: 'mail.example.com' } });
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('status')).toHaveTextContent('Saved');
    const put = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/settings/smtp' && init?.method === 'PUT')!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({
      host: 'mail.example.com',
      port: 587,
      secure: false,
      user: 'me',
      password: '',
      from: 'me@example.com',
      to: 'admin@example.com',
      clearPassword: false,
    });
  });

  it('says when no password is set, and shows a save error', async () => {
    stubFetch({
      'GET /api/admin/settings/smtp': () => delayedResponse({ settings: null }),
      'GET /api/admin/settings/speech': () => delayedResponse(SPEECH),
      'PUT /api/admin/settings/smtp': () => delayedResponse({ error: 'host is required' }, { ok: false, status: 400 }),
    });
    render(<SystemSettingsAdmin />);
    const form = within(await email());
    expect(form.getByText('No password is set.')).toBeInTheDocument();
    expect(form.getByLabelText('Password')).toHaveAttribute('placeholder', '');
    expect(form.getByRole('button', { name: 'Send test email' })).toBeDisabled();
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('alert')).toHaveTextContent('host is required');
  });

  it('sends a test email and shows the result inline', async () => {
    const results = [
      () => delayedResponse({ ok: true }),
      () => delayedResponse({ ok: false, error: 'Invalid login: 535 Authentication failed' }, { ok: false, status: 502 }),
    ];
    stubFetch({
      'GET /api/admin/settings/smtp': () => delayedResponse({ settings: STORED }),
      'GET /api/admin/settings/speech': () => delayedResponse(SPEECH),
      'POST /api/admin/settings/smtp/test': () => results.shift()!(),
    });
    render(<SystemSettingsAdmin />);
    const form = within(await email());
    fireEvent.click(form.getByRole('button', { name: 'Send test email' }));
    expect(await form.findByRole('status')).toHaveTextContent('Test email sent.');
    fireEvent.click(form.getByRole('button', { name: 'Send test email' }));
    expect(await form.findByRole('alert')).toHaveTextContent('The test email failed: Invalid login: 535 Authentication failed');
  });

  it('saves the speech address and checks the service', async () => {
    const checks = [
      () => delayedResponse({ ...SPEECH, url: 'http://speech.local:5002', isDefault: false, health: { ok: true, voices: ['thorsten', 'kerstin'] } }),
      () => delayedResponse({ ...SPEECH, url: 'http://speech.local:5002', isDefault: false, health: { ok: false, voices: [] } }),
    ];
    const fetchMock = stubFetch({
      'GET /api/admin/settings/smtp': () => delayedResponse({ settings: null }),
      'GET /api/admin/settings/speech': () => delayedResponse(SPEECH),
      'PUT /api/admin/settings/speech': () => delayedResponse({ ...SPEECH, url: 'http://speech.local:5002', isDefault: false }),
      'GET /api/admin/settings/speech?check=1': () => checks.shift()!(),
    });
    render(<SystemSettingsAdmin />);
    const form = within(await speech());
    expect(form.getByLabelText('Address')).toHaveValue('');
    fireEvent.change(form.getByLabelText('Address'), { target: { value: 'http://speech.local:5002/' } });
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(form.getByLabelText('Address')).toHaveValue('http://speech.local:5002'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/settings/speech', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://speech.local:5002/' }),
    });

    fireEvent.click(form.getByRole('button', { name: 'Check' }));
    expect(await form.findByText('The speech service is running. Voices: thorsten, kerstin.')).toBeInTheDocument();
    fireEvent.click(form.getByRole('button', { name: 'Check' }));
    expect(await form.findByRole('alert')).toHaveTextContent('The speech service is not reachable at http://speech.local:5002.');
  });

  it('shows a refused speech address', async () => {
    stubFetch({
      'GET /api/admin/settings/smtp': () => delayedResponse({ settings: null }),
      'GET /api/admin/settings/speech': () => delayedResponse(SPEECH),
      'PUT /api/admin/settings/speech': () => delayedResponse({ error: 'The address must not have a path' }, { ok: false, status: 400 }),
    });
    render(<SystemSettingsAdmin />);
    const form = within(await speech());
    fireEvent.change(form.getByLabelText('Address'), { target: { value: 'http://x/render' } });
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('alert')).toHaveTextContent('The address must not have a path');
  });
});
