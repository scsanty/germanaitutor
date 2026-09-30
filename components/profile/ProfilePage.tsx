'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Profile, Track } from '@/lib/types';
import type { PlacementBestResult } from '@/lib/tutoring/placementTypes';
import { levelsUpTo, TRACKS } from '@/lib/tutoring/levels';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Input } from '@/components/ui/input';

export function ProfilePage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tProfile = useTranslations('profile');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const errorText = useApiErrorText();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [placementBest, setPlacementBest] = useState<PlacementBestResult | null | undefined>(undefined);
  const [placementFailed, setPlacementFailed] = useState(false);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setProfile(await res.json());
      })
      .catch(() => setLoadFailed(true));
    fetch('/api/placement')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setPlacementBest(data.best ?? null);
      })
      .catch(() => setPlacementFailed(true));
  }, []);

  async function handleProfileChange(patch: Partial<Profile>) {
    setProfileError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(t('profileSaveFailed', { error: errorText(data, String(res.status)) }));
        return;
      }
      setProfile(data);
      // The interface language is applied by the server layout, so re-render it.
      if (patch.uiLanguage) router.refresh();
    } catch (err) {
      setProfileError(t('profileSaveFailed', { error: (err as Error).message }));
    }
  }

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (!profile) return <p>{tCommon('loading')}</p>;

  return (
    <div>
      <h1>{tProfile('title')}</h1>
      {profileError && <p role="alert">{profileError}</p>}
      <section>
        <h2>{tProfile('name')}</h2>
        <Input
          aria-label={tProfile('nameLabel')}
          defaultValue={profile.displayName}
          onBlur={(e) => e.target.value !== profile.displayName && handleProfileChange({ displayName: e.target.value })}
        />
      </section>

      <section>
        <h2>{t('trackLevel')}</h2>
        <select
          aria-label={t('trackLabel')}
          value={profile.activeTrack}
          onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Track })}
        >
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {tTracks(track)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('levelLabel')}
          value={profile.activeLevel}
          onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
        >
          {levelsUpTo(profile.highestUnlockedLevel).map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        {profile.highestUnlockedLevel !== 'C1' && <p>{t('levelHint', { level: profile.highestUnlockedLevel })}</p>}
      </section>

      <section>
        <h2>{t('placement')}</h2>
        {placementFailed && <p role="alert">{t('placementLoadFailed')}</p>}
        {placementBest === null && <p>{t('placementNone')}</p>}
        {placementBest && (
          <p>
            {t('placementBest', {
              level: placementBest.placedLevel,
              score: placementBest.score,
              max: placementBest.maxScore,
              date: placementBest.takenAt.slice(0, 10),
            })}
          </p>
        )}
        {placementBest !== undefined && (
          <Link href="/placement">{placementBest ? t('placementRetake') : t('placementTake')}</Link>
        )}
      </section>

      <section>
        <h2>{t('language')}</h2>
        <select
          aria-label={t('language')}
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </section>
    </div>
  );
}
