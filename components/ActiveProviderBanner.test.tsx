import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActiveProviderBanner } from './ActiveProviderBanner';

describe('ActiveProviderBanner', () => {
  it('shows an alert when the active provider is failing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' }),
      })
    );
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded'));
  });

  it('renders nothing when the active provider is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ providerType: 'anthropic', lastValidatedStatus: 'valid', lastError: null }),
      })
    );
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
