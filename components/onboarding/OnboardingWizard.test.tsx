// components/onboarding/OnboardingWizard.test.tsx
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));
vi.mock('@/components/placement/PlacementTest', () => ({
  PlacementTest: ({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) => (
    <div>
      <button onClick={onFinished}>fake finish</button>
      <button onClick={onSkip}>fake skip</button>
    </div>
  ),
}));

import { OnboardingWizard } from './OnboardingWizard';

/**
 * Routes the wizard touches, keyed by URL so tests stay readable as the number
 * of calls grows. Each entry may be overridden per test.
 */
function stubFetch(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, any> = {
    '/api/providers': { ok: true, json: async () => ({ id: 1 }) },
    '/api/providers/1/test': { ok: true, json: async () => ({ ok: true }) },
    '/api/providers/active': { ok: true, json: async () => ({}) },
    '/api/providers/1/models': { ok: true, json: async () => [{ id: 'model-a', label: 'Model A' }] },
    '/api/providers/1': { ok: true, json: async () => ({ id: 1, selectedModel: 'model-a' }) },
    '/api/profile': { ok: true, json: async () => ({}) },
    '/api/placement/skip': { ok: true, json: async () => ({}) },
    ...overrides,
  };
  const fetchMock = vi.fn((url: string) => {
    const match = routes[url];
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    return Promise.resolve(match);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function connectSuccessfully() {
  renderWithIntl(<OnboardingWizard />);
  fireEvent.click(screen.getByText('Get started'));
  fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
  fireEvent.click(screen.getByText('Test connection'));
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('keeps Next disabled on the provider step until the connection test succeeds', async () => {
    stubFetch();

    renderWithIntl(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(nextButton).not.toBeDisabled());
  });

  it('offers the provider models and persists the picked one before leaving the step', async () => {
    const fetchMock = stubFetch({
      '/api/providers/1/models': {
        ok: true,
        json: async () => [
          { id: 'model-a', label: 'Model A' },
          { id: 'model-b', label: 'Model B' },
        ],
      },
    });

    await connectSuccessfully();

    const modelSelect = await screen.findByLabelText('Model');
    expect(modelSelect).toHaveValue('model-a');
    fireEvent.change(modelSelect, { target: { value: 'model-b' } });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/providers/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModel: 'model-b' }),
      })
    );
    await screen.findByText('Choose your track');
  });

  it('continues past the model picker when the provider cannot list models', async () => {
    stubFetch({
      '/api/providers/1/models': { ok: false, json: async () => ({ error: 'Ollama returned 500' }) },
    });

    await connectSuccessfully();

    await screen.findByText('Ollama returned 500');
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('shows the error and keeps Next disabled when the test fails', async () => {
    stubFetch({ '/api/providers/1/test': { ok: true, json: async () => ({ ok: false, error: 'Anthropic returned 401' }) } });

    renderWithIntl(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Anthropic returned 401'));
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('shows an error and keeps Next disabled when saving the provider connection fails', async () => {
    const fetchMock = stubFetch({ '/api/providers': { ok: false, json: async () => ({}) } });

    renderWithIntl(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save provider connection'));
    expect(screen.getByText('Next')).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('saves the track and language before the placement step', async () => {
    const fetchMock = stubFetch();
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    fireEvent.change(await screen.findByLabelText('Choose your track'), { target: { value: 'telc' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByLabelText('Choose your interface language'), { target: { value: 'de' } });
    fireEvent.click(screen.getByText('Next'));

    await screen.findByText('fake finish');
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeTrack: 'telc', uiLanguage: 'de', onboardingChoicesSaved: true }),
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows an error and stays on the language step when saving the choices fails', async () => {
    stubFetch({ '/api/profile': { ok: false, json: async () => ({}) } });
    renderWithIntl(<OnboardingWizard initialStep="language" />);
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save your choices. Please try again.')
    );
    expect(screen.queryByText('fake finish')).not.toBeInTheDocument();
  });

  it('finishes onboarding after the placement test', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<OnboardingWizard initialStep="placement" />);
    fireEvent.click(screen.getByText('fake finish'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingComplete: true }),
    });
  });

  it('skipping the placement test records the skip and finishes onboarding', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<OnboardingWizard initialStep="placement" />);
    fireEvent.click(screen.getByText('fake skip'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/skip', { method: 'POST' });
  });

  it('shows an error when the working connection cannot be made active', async () => {
    stubFetch({ '/api/providers/active': { ok: false, json: async () => ({}) } });
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save provider connection'));
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('stays on the provider step when the chosen model cannot be saved', async () => {
    stubFetch({ '/api/providers/1': { ok: false, json: async () => ({}) } });
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the model. Please try again.');
    expect(screen.getByText('Test connection')).toBeInTheDocument();
  });
});
