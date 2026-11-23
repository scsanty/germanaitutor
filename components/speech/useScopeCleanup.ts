'use client';

import { useEffect, useRef } from 'react';

// Deletes a speech scope's recordings when the component goes away (spec: Retention), unless `keep()` says the
// recordings are still needed. The delete waits a tick, so React's StrictMode remount (unmount then mount again
// at once) cancels it instead of deleting a live conversation. Best effort: the worker removes leftovers after 6 h.
export function useScopeCleanup(scope: string, keep: () => boolean = () => false) {
  const keepRef = useRef(keep);
  keepRef.current = keep;
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    return () => {
      pending.current = setTimeout(() => {
        pending.current = null;
        if (keepRef.current()) return;
        try {
          void fetch(`/api/speech/scope?scope=${encodeURIComponent(scope)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        } catch {
          // ignored
        }
      }, 0);
    };
  }, [scope]);
}
