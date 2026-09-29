'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/types';

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

  if (failed) return <p role="alert">{t('error')}</p>;
  if (!profile) return null;
  if (profile.placementStatus !== 'pending' && !profile.unlockNoticeLevel) return null;

  return (
    <div>
      {profile.placementStatus === 'pending' && (
        <div>
          <p>{t('placementPrompt')}</p>
          <Link href="/placement">{t('takeTest')}</Link>{' '}
          <button type="button" disabled={busy} onClick={() => post('/api/placement/skip')}>
            {t('skip')}
          </button>
        </div>
      )}
      {profile.unlockNoticeLevel && (
        <div>
          <p>{t('unlocked', { level: profile.unlockNoticeLevel })}</p>
          <button type="button" disabled={busy} onClick={() => post('/api/tutoring/unlock-notice', { action: 'switch' })}>
            {t('switch')}
          </button>
          <button
            type="button"
            aria-label={t('dismiss')}
            disabled={busy}
            onClick={() => post('/api/tutoring/unlock-notice', { action: 'dismiss' })}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
