// components/onboarding/OnboardingWizard.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { OnboardingWizard } from './OnboardingWizard';

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps Next disabled on the provider step until the connection test succeeds', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({}) });

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(nextButton).not.toBeDisabled());
  });

  it('shows the error and keeps Next disabled when the test fails', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: false, error: 'Anthropic returned 401' }) });

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Anthropic returned 401'));
    expect(screen.getByText('Next')).toBeDisabled();
  });
});
