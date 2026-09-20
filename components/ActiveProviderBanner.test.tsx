import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActiveProviderBanner } from './ActiveProviderBanner';

function stubActive(connection: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => connection }));
}

describe('ActiveProviderBanner', () => {
  it('shows an alert when the active provider is failing', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded'));
  });

  it('shows an alert when the active provider failed its last re-test', async () => {
    stubActive({ providerType: 'openai', lastValidatedStatus: 'invalid', lastError: 'OpenAI returned 401' });
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OpenAI returned 401'));
  });

  it('links to Settings from the alert', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    render(<ActiveProviderBanner />);
    const link = await screen.findByRole('link', { name: 'Visit Settings' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders nothing when the active provider is healthy', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'valid', lastError: null });
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing when the active provider has never been tested', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'untested', lastError: null });
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
