'use client';

import { useCallback } from 'react';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { playTone, type ToneKind } from './sounds';

// A no-op when sounds are off (Settings) or the browser has no WebAudio.
export function useSound(): (kind: ToneKind) => void {
  const { soundEnabled } = usePreferences();
  return useCallback(
    (kind: ToneKind) => {
      if (!soundEnabled || typeof window === 'undefined' || !('AudioContext' in window)) return;
      try {
        playTone(kind);
      } catch {
        // Audio is a nicety; never break the exercise.
      }
    },
    [soundEnabled]
  );
}
