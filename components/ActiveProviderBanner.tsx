'use client';

import { useEffect, useState } from 'react';
import type { ProviderConnection } from '@/lib/types';

export function ActiveProviderBanner() {
  const [active, setActive] = useState<ProviderConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch('/api/providers/active');
      const data = await res.json();
      if (!cancelled) setActive(data);
    }
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!active || active.lastValidatedStatus !== 'failing') return null;

  return (
    <div role="alert">
      Your active provider ({active.providerType}) is having trouble: {active.lastError}. Visit Settings to fix it
      or switch providers.
    </div>
  );
}
