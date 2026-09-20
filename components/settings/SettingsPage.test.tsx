// components/settings/SettingsPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from './SettingsPage';

const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  freestyleDefault: false,
  onboardingComplete: true,
  updatedAt: '',
};

/**
 * "METHOD url"-keyed fetch stub; individual tests override only what they care
 * about. Keyed by method too, since GET and POST /api/providers differ.
 */
function stubFetch(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, any> = {
    'GET /api/profile': { ok: true, json: async () => PROFILE },
    'GET /api/providers': { ok: true, json: async () => [] },
    'POST /api/providers': { ok: true, json: async () => ({ id: 7 }) },
    'GET /api/providers/7/models': { ok: true, json: async () => [{ id: 'model-a', label: 'Model A' }] },
    'PATCH /api/providers/7': { ok: true, json: async () => ({ id: 7 }) },
    ...overrides,
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(routes[`${init?.method ?? 'GET'} ${url}`] ?? { ok: true, json: async () => ({}) })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SettingsPage', () => {
  beforeEach(() => {
    stubFetch();
  });

  it('adds a new provider connection and refreshes the list', async () => {
    const fetchMock = stubFetch();

    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));

    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByLabelText('New provider type'), { target: { value: 'openai' } });
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-openai' } });
    fireEvent.click(screen.getByText('Save provider'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType: 'openai', apiKey: 'sk-openai' }),
      })
    );
  });

  it('offers an Ollama host field instead of an API key for Ollama', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));

    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByLabelText('New provider type'), { target: { value: 'ollama' } });

    expect(screen.getByPlaceholderText('Ollama host')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('API key')).not.toBeInTheDocument();
  });

  it('lets the user pick a model for the newly added connection', async () => {
    const fetchMock = stubFetch({
      'GET /api/providers/7/models': {
        ok: true,
        json: async () => [
          { id: 'model-a', label: 'Model A' },
          { id: 'model-b', label: 'Model B' },
        ],
      },
    });

    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    fireEvent.click(screen.getByText('Save provider'));

    const modelSelect = await screen.findByLabelText('Model');
    fireEvent.change(modelSelect, { target: { value: 'model-b' } });
    fireEvent.click(screen.getByText('Done'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/providers/7', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModel: 'model-b' }),
      })
    );
    await waitFor(() => expect(screen.queryByText('Done')).not.toBeInTheDocument());
  });

  it('keeps the connection but reports the problem when models cannot be listed', async () => {
    stubFetch({
      'GET /api/providers/7/models': { ok: false, json: async () => ({ error: 'Ollama returned 500' }) },
    });

    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    fireEvent.click(screen.getByText('Save provider'));

    await screen.findByText('Ollama returned 500');
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows recent usage totals next to each provider connection', async () => {
    const fetchMock = stubFetch({
      'GET /api/providers': {
        ok: true,
        json: async () => [
          {
            id: 7,
            providerType: 'anthropic',
            label: null,
            ollamaHost: null,
            selectedModel: 'model-a',
            isActive: true,
            lastValidatedStatus: 'valid',
            lastValidatedAt: null,
            lastError: null,
            createdAt: '',
          },
        ],
      },
      'GET /api/usage?connectionId=7&days=7': {
        ok: true,
        json: async () => [
          { date: '2026-09-20', requestCount: 3, tokenCount: 1200 },
          { date: '2026-09-19', requestCount: 2, tokenCount: 800 },
        ],
      },
    });

    render(<SettingsPage />);

    await screen.findByText(/5 requests, 2000 tokens \(last 7 days\)/);
    expect(fetchMock).toHaveBeenCalledWith('/api/usage?connectionId=7&days=7');
  });

  it('requires confirmation before resetting app data', async () => {
    const fetchMock = stubFetch();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });
});
