import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PreferencesProvider, usePreferences } from './PreferencesProvider';

function Probe() {
  const { theme, soundEnabled, setTheme, setSoundEnabled } = usePreferences();
  return (
    <div>
      <p>{`${theme} ${soundEnabled ? 'on' : 'off'}`}</p>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setSoundEnabled(false)}>mute</button>
    </div>
  );
}

describe('PreferencesProvider', () => {
  it('saves a theme change, applies it to <html>, and rolls back when saving fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => delayedResponse({ theme: 'light' }))
      .mockImplementationOnce(() => delayedResponse({ error: 'nope' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    document.documentElement.dataset.theme = 'dark';
    render(
      <PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}>
        <Probe />
      </PreferencesProvider>
    );
    fireEvent.click(screen.getByText('light'));
    await waitFor(() => expect(screen.getByText('light on')).toBeInTheDocument());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'light' }),
    });

    fireEvent.click(screen.getByText('mute'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('light on')).toBeInTheDocument());
  });
});
