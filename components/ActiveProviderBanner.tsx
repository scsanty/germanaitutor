'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ProviderConnection } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TriangleAlert } from 'lucide-react';

export function ActiveProviderBanner() {
  const t = useTranslations('banner');
  const [active, setActive] = useState<ProviderConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch('/api/providers/active');
      if (!res.ok) return;
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
    <Alert variant="destructive" role="alert" className="border-danger/50">
      <TriangleAlert aria-hidden />
      <AlertDescription className="break-words">
        <p>
          {t.rich('providerTrouble', {
            provider: active.providerType,
            error: active.lastError ?? '',
            link: (chunks) => (
              <Link href="/settings" className="font-semibold underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </AlertDescription>
    </Alert>
  );
}
