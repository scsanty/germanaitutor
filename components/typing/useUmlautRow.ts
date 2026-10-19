'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'nadoch.umlautRow';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

// Whether the umlaut row is open, remembered across fields and visits. The server snapshot is
// closed, so the first client render matches the server and the stored value applies after hydration.
export function useUmlautRow(): [open: boolean, toggle: () => void] {
  const open = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      if (read()) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, 'open');
    } catch {
      // Storage is unavailable: the choice just isn't remembered.
    }
    listeners.forEach((l) => l());
  }, []);
  return [open, toggle];
}
