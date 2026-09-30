'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '@/lib/types';

interface Preferences {
  theme: Theme;
  soundEnabled: boolean;
  setTheme: (theme: Theme) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
}

const PreferencesContext = createContext<Preferences | null>(null);

async function save(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Spec: Theme selection. The server already rendered <html data-theme>; this keeps it in sync
// after a change, and puts the old value back if saving fails.
export function PreferencesProvider({ initial, children }: { initial: { theme: Theme; soundEnabled: boolean }; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial.theme);
  const [soundEnabled, setSoundState] = useState(initial.soundEnabled);

  const setTheme = useCallback(
    async (next: Theme) => {
      const previous = theme;
      setThemeState(next);
      document.documentElement.dataset.theme = next;
      if (!(await save({ theme: next }))) {
        setThemeState(previous);
        document.documentElement.dataset.theme = previous;
      }
    },
    [theme]
  );

  const setSoundEnabled = useCallback(
    async (next: boolean) => {
      const previous = soundEnabled;
      setSoundState(next);
      if (!(await save({ soundEnabled: next }))) setSoundState(previous);
    },
    [soundEnabled]
  );

  const value = useMemo(() => ({ theme, soundEnabled, setTheme, setSoundEnabled }), [theme, soundEnabled, setTheme, setSoundEnabled]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
