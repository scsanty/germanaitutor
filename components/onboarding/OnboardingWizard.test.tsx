// components/onboarding/OnboardingWizard.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
  render(<OnboardingWizard />);
  fireEvent.click(screen.getByText('Get started'));
  fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
  fireEvent.click(screen.getByText('Test connection'));
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps Next disabled on the provider step until the connection test succeeds', async () => {
    stubFetch();

    render(<OnboardingWizard />);
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
    await screen.findByText('Choose your track and level');
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

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Anthropic returned 401'));
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('shows an error and keeps Next disabled when saving the provider connection fails', async () => {
    const fetchMock = stubFetch({ '/api/providers': { ok: false, json: async () => ({}) } });

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save provider connection'));
    expect(screen.getByText('Next')).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
