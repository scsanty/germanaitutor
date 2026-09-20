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
          return Promise.resolve({ json: async () => [] });
        }
        return Promise.resolve({ json: async () => ({ ok: true }) });
      })
    );
  });

  it('requires confirmation before resetting app data', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });
});
