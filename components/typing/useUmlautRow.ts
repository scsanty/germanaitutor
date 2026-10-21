'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'nadoch.umlautRow';
const listeners = new Set<() => void>();
// The state for this page load when storage is blocked: the choice isn't remembered, but the row still works.
let fallback = false;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return fallback;
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
    const next = !read();
    fallback = next;
    try {
      if (next) localStorage.setItem(KEY, 'open');
      else localStorage.removeItem(KEY);
    } catch {
      // Storage is unavailable: the choice just isn't remembered.
    }
    listeners.forEach((l) => l());
  }, []);
  return [open, toggle];
}
