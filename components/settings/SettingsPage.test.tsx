// components/settings/SettingsPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/profile') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              displayName: '',
              uiLanguage: 'en',
              activeTrack: 'generic',
              activeLevel: 'A1',
              freestyleDefault: false,
              onboardingComplete: true,
              updatedAt: '',
            }),
          });
        }
        if (url === '/api/providers') {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      })
    );
  });

  it('adds a new provider connection and refreshes the list', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));

    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByLabelText('New provider type'), { target: { value: 'openai' } });
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-openai' } });
    fireEvent.click(screen.getByText('Save provider'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType: 'openai', apiKey: 'sk-openai' }),
      })
    );
    // The form closes again once the connection list has been refreshed.
    await waitFor(() => expect(screen.queryByText('Save provider')).not.toBeInTheDocument());
  });

  it('offers an Ollama host field instead of an API key for Ollama', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));

    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByLabelText('New provider type'), { target: { value: 'ollama' } });

    expect(screen.getByPlaceholderText('Ollama host')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('API key')).not.toBeInTheDocument();
  });

  it('requires confirmation before resetting app data', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });
});
