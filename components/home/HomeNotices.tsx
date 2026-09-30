'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Compass, Sparkles, X } from 'lucide-react';

// Information notices: a default Alert with a primary edge. They are not urgent, so no alert role.
const NOTICE = 'border-primary/40 [&>svg]:text-primary';
const TEXT = 'text-base font-medium text-text';

export function HomeNotices({ onChange }: { onChange?: (profile: Profile) => void } = {}) {
  const t = useTranslations('notices');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(
        url,
        body === undefined
          ? { method: 'POST' }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error(String(res.status));
      const updated = (await res.json()) as Profile;
      setProfile(updated);
      onChange?.(updated);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (failed)
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('error')}</AlertDescription>
      </Alert>
    );
  if (!profile) return null;
  if (profile.placementStatus !== 'pending' && !profile.unlockNoticeLevel) return null;

  return (
    <div className="flex flex-col gap-3">
      {profile.placementStatus === 'pending' && (
        <Alert role={undefined} className={NOTICE}>
          <Compass aria-hidden />
          <AlertDescription className="gap-3">
            <p className={TEXT}>{t('placementPrompt')}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="min-h-11">
                <Link href="/placement">{t('takeTest')}</Link>
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => post('/api/placement/skip')} className="min-h-11 border border-border">
                {t('skip')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {profile.unlockNoticeLevel && (
        <Alert role={undefined} className={`${NOTICE} pr-14`}>
          <Sparkles aria-hidden />
          <AlertDescription className="gap-3">
            <p className={TEXT}>{t('unlocked', { level: profile.unlockNoticeLevel })}</p>
            <Button type="button" disabled={busy} onClick={() => post('/api/tutoring/unlock-notice', { action: 'switch' })} className="min-h-11">
              {t('switch')}
            </Button>
          </AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('dismiss')}
            disabled={busy}
            onClick={() => post('/api/tutoring/unlock-notice', { action: 'dismiss' })}
            className="absolute top-1.5 right-1.5 size-11 text-text-muted hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </Button>
        </Alert>
      )}
    </div>
  );
}
