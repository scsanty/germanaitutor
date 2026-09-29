import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ActiveProviderBanner } from './ActiveProviderBanner';

function stubActive(connection: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => connection }));
}

describe('ActiveProviderBanner', () => {
  it('shows an alert when the active provider is failing', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded'));
  });

  it('shows an alert when the active provider failed its last re-test', async () => {
    stubActive({ providerType: 'openai', lastValidatedStatus: 'invalid', lastError: 'OpenAI returned 401' });
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OpenAI returned 401'));
  });

  it('links to Settings from the alert', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    renderWithIntl(<ActiveProviderBanner />);
    const link = await screen.findByRole('link', { name: 'Visit Settings' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders nothing when the active provider is healthy', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'valid', lastError: null });
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing when the active provider has never been tested', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'untested', lastError: null });
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the alert in German when the UI language is German', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    renderWithIntl(<ActiveProviderBanner />, 'de');
    const link = await screen.findByRole('link', { name: 'Öffne die Einstellungen' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders nothing when the status request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
