'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

  // 'invalid' comes from a failed re-test in Settings, 'failing' from a runtime
  // failure recorded by providerService.recordFailure — both need the banner.
  if (!active || (active.lastValidatedStatus !== 'invalid' && active.lastValidatedStatus !== 'failing')) {
    return null;
  }

  return (
    <div role="alert">
      Your active provider ({active.providerType}) is having trouble: {active.lastError}.{' '}
      <Link href="/settings">Visit Settings</Link> to fix it or switch providers.
    </div>
  );
}
