// components/settings/SettingsPage.test.tsx
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { SettingsPage } from './SettingsPage';

const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  freestyleDefault: false,
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

    renderWithIntl(<SettingsPage />);
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
    renderWithIntl(<SettingsPage />);
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

    renderWithIntl(<SettingsPage />);
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

    renderWithIntl(<SettingsPage />);
    await waitFor(() => screen.getByText('Add provider'));
    fireEvent.click(screen.getByText('Add provider'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-ant' } });
    fireEvent.click(screen.getByText('Save provider'));

    await screen.findByText('Ollama returned 500');
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows the provider status translated, not the raw status value', async () => {
    stubFetch({
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
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByText('Having trouble')).toBeInTheDocument();
    expect(screen.queryByText('failing')).not.toBeInTheDocument();
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

    renderWithIntl(<SettingsPage />);

    await screen.findByText(/5 requests, 2000 tokens \(last 7 days\)/);
    expect(fetchMock).toHaveBeenCalledWith('/api/usage?connectionId=7&days=7');
  });

  it('requires confirmation before resetting app data', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<SettingsPage />);
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });

  it('offers only the unlocked levels', async () => {
    stubFetch();
    renderWithIntl(<SettingsPage />);
    const levelSelect = await screen.findByLabelText('Level');
    const options = Array.from(levelSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['A1', 'A2', 'B1']);
    expect(screen.getByText('Levels above B1 unlock as you finish lessons or place higher in the placement test.')).toBeInTheDocument();
  });

  it('shows an error when a setting cannot be saved', async () => {
    stubFetch({ 'PATCH /api/profile': { ok: false, status: 400, json: async () => ({ error: 'Level B1 is locked' }) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Level'), { target: { value: 'B1' } });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save this setting: Level B1 is locked')
    );
  });

  it('refreshes the page after changing the interface language', async () => {
    stubFetch({ 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, uiLanguage: 'de' }) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'de' } });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows the best placement result and a retake link', async () => {
    stubFetch({
      'GET /api/placement': {
        ok: true,
        json: async () => ({
          best: { score: 24, maxScore: 120, placedLevel: 'B1', stopReason: 'five_mistakes', takenAt: '2026-09-24 10:00:00' },
          questionCount: 40,
        }),
      },
    });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByText('Best result: B1 (24 of 120 points, 2026-09-24)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retake the placement test' })).toHaveAttribute('href', '/placement');
  });

  it('offers the placement test when it was never taken', async () => {
    stubFetch({ 'GET /api/placement': { ok: true, json: async () => ({ best: null, questionCount: 40 }) } });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByText('You have not taken the placement test yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the placement test' })).toBeInTheDocument();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    stubFetch({ 'GET /api/profile': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load your settings. Please reload the page.')
    );
  });

  it('saves a new daily review limit when the field loses focus', async () => {
    const fetchMock = stubFetch({ 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, dailyReviewCap: 30 }) } });
    renderWithIntl(<SettingsPage />);
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
    const fetchMock = stubFetch();
    renderWithIntl(<SettingsPage />);
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
    stubFetch({
      'GET /api/providers': { ok: true, json: async () => [CONNECTION] },
      'PUT /api/providers/active': { ok: false, status: 500, json: async () => ({ error: 'boom' }) },
    });
    renderWithIntl(<SettingsPage />);
    fireEvent.click(await screen.findByText('Make active'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete that: boom');
  });

  it('shows an error when the providers cannot load', async () => {
    stubFetch({ 'GET /api/providers': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your AI providers.');
  });

  it('confirms a restored backup, and says why a restore failed', async () => {
    stubFetch({ 'POST /api/backup/import': { ok: true, json: async () => ({ ok: true }) } });
    const { container } = renderWithIntl(<SettingsPage />);
    await screen.findByText('Export backup');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['x'], 'backup.gaitbackup')] } });
    expect(await screen.findByText('Backup restored. Reload the page to see the restored data.')).toBeInTheDocument();

    stubFetch({ 'POST /api/backup/import': { ok: false, status: 400, json: async () => ({ error: 'Not a backup file' }) } });
    fireEvent.change(input, { target: { files: [new File(['y'], 'other.gaitbackup')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore the backup: Not a backup file');
  });

  it('shows an error and stays when the reset fails', async () => {
    stubFetch({ 'POST /api/reset': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.click(await screen.findByText('Reset app data'));
    fireEvent.click(screen.getByText('Yes, reset everything'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reset the app data. Please try again.');
  });
});
