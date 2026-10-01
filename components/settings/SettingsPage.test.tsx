// components/settings/SettingsPage.test.tsx
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { SettingsPage } from './SettingsPage';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';
import { delayedResponse } from '@/test/delayedResponse';

const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  theme: 'dark',
  soundEnabled: true,
  onboardingComplete: true,
  highestUnlockedLevel: 'B1',
  placementStatus: 'taken',
  unlockNoticeLevel: null,
  onboardingChoicesSaved: true,
  dailyReviewCap: 50,
  updatedAt: '',
};

/**
 * "METHOD url"-keyed fetch stub; individual tests override only what they care
 * about. Keyed by method too, since GET and POST /api/providers differ.
 */
function stubProfileRoutes(profilePatch: Record<string, unknown> = {}, adminAuth: Record<string, unknown> = { authenticated: false }, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, any> = {
    'GET /api/profile': { ok: true, json: async () => ({ ...PROFILE, ...profilePatch }) },
    'GET /api/providers': { ok: true, json: async () => [] },
    'GET /api/admin/auth': { ok: true, json: async () => ({ passwordSet: true, ...adminAuth }) },
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


function renderSettings() {
  return renderWithIntl(
    <PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}>
      <SettingsPage />
    </PreferencesProvider>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    stubProfileRoutes();
  });

  it('adds a new provider connection and refreshes the list', async () => {
    const fetchMock = stubProfileRoutes();

    renderSettings();
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
    renderSettings();
    await waitFor(() => screen.getByText('Add provider'));

    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByLabelText('New provider type'), { target: { value: 'ollama' } });

    expect(screen.getByPlaceholderText('Ollama host')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('API key')).not.toBeInTheDocument();
  });

  it('lets the user pick a model for the newly added connection', async () => {
    const fetchMock = stubProfileRoutes({}, undefined, {
      'GET /api/providers/7/models': {
        ok: true,
        json: async () => [
          { id: 'model-a', label: 'Model A' },
          { id: 'model-b', label: 'Model B' },
        ],
      },
    });

    renderSettings();
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
    stubProfileRoutes({}, undefined, {
      'GET /api/providers/7/models': { ok: false, json: async () => ({ error: 'Ollama returned 500' }) },
    });

    renderSettings();
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    fireEvent.click(screen.getByText('Save provider'));

    // M-1: loadModels must branch on res.ok, not just infer failure from the response shape,
    // and the failure text is a visible error (role="alert"), not a plain paragraph.
    expect(await screen.findByRole('alert')).toHaveTextContent('Ollama returned 500');
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows "no models" as plain text, not an alert, when the provider has none', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/providers/7/models': { ok: true, json: async () => [] } });

    renderSettings();
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    fireEvent.click(screen.getByText('Save provider'));

    await screen.findByText('No models reported by this provider');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and re-enables Save provider when adding a provider rejects', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (`${init?.method ?? 'GET'} ${url}` === 'POST /api/providers') return Promise.reject(new Error('network down'));
      const routes: Record<string, any> = {
        'GET /api/profile': { ok: true, json: async () => PROFILE },
        'GET /api/providers': { ok: true, json: async () => [] },
      };
      return Promise.resolve(routes[`${init?.method ?? 'GET'} ${url}`] ?? { ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettings();
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    const saveButton = screen.getByText('Save provider');
    fireEvent.click(saveButton);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save provider connection');
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('shows the provider status translated, not the raw status value', async () => {
    stubProfileRoutes({}, undefined, {
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
            lastValidatedStatus: 'failing',
            lastValidatedAt: null,
            lastError: null,
            createdAt: '',
          },
        ],
      },
    });
    renderSettings();
    expect(await screen.findByText('Having trouble')).toBeInTheDocument();
    expect(screen.queryByText('failing')).not.toBeInTheDocument();
  });

  it('shows recent usage totals next to each provider connection', async () => {
    const fetchMock = stubProfileRoutes({}, undefined, {
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

    renderSettings();

    await screen.findByText(/5 requests, 2000 tokens \(last 7 days\)/);
    expect(fetchMock).toHaveBeenCalledWith('/api/usage?connectionId=7&days=7');
  });

  it('requires confirmation before resetting app data', async () => {
    const fetchMock = stubProfileRoutes();
    renderSettings();
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });

  it('saves a new daily review limit when the field loses focus', async () => {
    const fetchMock = stubProfileRoutes({}, undefined, { 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, dailyReviewCap: 30 }) } });
    renderSettings();
    const field = await screen.findByLabelText('Daily review limit');
    expect(field).toHaveValue(50);

    fireEvent.change(field, { target: { value: '30' } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyReviewCap: 30 }),
      })
    );
    await waitFor(() => expect(field).toHaveValue(30));
  });

  it('rejects a daily review limit outside 1–500 without saving it', async () => {
    const fetchMock = stubProfileRoutes();
    renderSettings();
    const field = await screen.findByLabelText('Daily review limit');

    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.blur(field);

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 500.');
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
  });

  const CONNECTION = {
    id: 3,
    providerType: 'ollama',
    label: null,
    ollamaHost: 'http://localhost:11434',
    selectedModel: 'llama',
    isActive: false,
    lastValidatedStatus: 'valid',
    lastValidatedAt: null,
    lastError: null,
    createdAt: '',
  };

  it('shows an error when a provider action fails', async () => {
    stubProfileRoutes({}, undefined, {
      'GET /api/providers': { ok: true, json: async () => [CONNECTION] },
      'PUT /api/providers/active': { ok: false, status: 500, json: async () => ({ error: 'boom' }) },
    });
    renderSettings();
    fireEvent.click(await screen.findByText('Make active'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete that: boom');
  });

  it('shows an error when the providers cannot load', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/providers': { ok: false, status: 500, json: async () => ({}) } });
    renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your AI providers.');
  });

  it('confirms a restored backup, and says why a restore failed', async () => {
    stubProfileRoutes({}, undefined, { 'POST /api/backup/import': { ok: true, json: async () => ({ ok: true }) } });
    const { container } = renderSettings();
    await screen.findByText('Export backup');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['x'], 'backup.gaitbackup')] } });
    expect(await screen.findByText('Backup restored. Reload the page to see the restored data.')).toBeInTheDocument();

    stubProfileRoutes({}, undefined, { 'POST /api/backup/import': { ok: false, status: 400, json: async () => ({ error: 'Not a backup file' }) } });
    fireEvent.change(input, { target: { files: [new File(['y'], 'other.gaitbackup')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore the backup: Not a backup file');
  });

  it('shows an error and stays when the reset fails', async () => {
    stubProfileRoutes({}, undefined, { 'POST /api/reset': { ok: false, status: 500, json: async () => ({}) } });
    renderSettings();
    fireEvent.click(await screen.findByText('Reset app data'));
    fireEvent.click(screen.getByText('Yes, reset everything'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reset the app data. Please try again.');
  });

  it('changes the theme and the sound setting', async () => {
    const fetchMock = stubProfileRoutes({});
    renderSettings();
    fireEvent.click(await screen.findByRole('radio', { name: 'Light' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ body: JSON.stringify({ theme: 'light' }) }))
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Sounds' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ body: JSON.stringify({ soundEnabled: false }) }))
    );
  });

  it('shows an alert when the theme or sound setting cannot be saved', async () => {
    stubProfileRoutes({}, undefined, {
      'PATCH /api/profile': delayedResponse({ error: 'nope' }, { ok: false, status: 500 }),
    });
    renderSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Sounds' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this setting');
  });

  it('shows Content Admin only with an admin session', async () => {
    stubProfileRoutes({}, { authenticated: true });
    renderSettings();
    expect(await screen.findByRole('link', { name: 'Content Admin' })).toHaveAttribute('href', '/admin/curriculum');
  });

  it('has no admin link without an admin session', async () => {
    stubProfileRoutes({});
    renderSettings();
    await screen.findByRole('heading', { name: 'Providers' });
    expect(screen.queryByRole('link', { name: 'Content Admin' })).not.toBeInTheDocument();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    stubProfileRoutes({}, undefined, { 'GET /api/profile': { ok: false, status: 500, json: async () => ({}) } });
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load your settings. Please reload the page.')
    );
  });
});
