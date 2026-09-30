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
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CARD_GRID, SectionCard } from '@/components/SectionCard';

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

  if (loadFailed)
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  if (!profile)
    return (
      <div role="status" aria-label={tCommon('loading')} className={CARD_GRID}>
        <Skeleton className="h-9 w-40 md:col-span-2" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );

  return (
    <div className={CARD_GRID}>
      <h1 className="text-3xl md:col-span-2 md:text-4xl">{tProfile('title')}</h1>
      {profileError && (
        <Alert variant="destructive" role="alert" className="md:col-span-2">
          <AlertDescription>{profileError}</AlertDescription>
        </Alert>
      )}
      <SectionCard title={tProfile('name')}>
        <Input
          aria-label={tProfile('nameLabel')}
          defaultValue={profile.displayName}
          onBlur={(e) => e.target.value !== profile.displayName && handleProfileChange({ displayName: e.target.value })}
          className="h-11"
        />
      </SectionCard>

      <SectionCard title={t('trackLevel')}>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <NativeSelect
            aria-label={t('trackLabel')}
            value={profile.activeTrack}
            onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Track })}
          >
            {TRACKS.map((track) => (
              <option key={track} value={track}>
                {tTracks(track)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('levelLabel')}
            value={profile.activeLevel}
            onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
          >
            {levelsUpTo(profile.highestUnlockedLevel).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </NativeSelect>
        </div>
        {profile.highestUnlockedLevel !== 'C1' && <p className="text-sm text-text-muted">{t('levelHint', { level: profile.highestUnlockedLevel })}</p>}
      </SectionCard>

      <SectionCard title={t('placement')}>
        {placementFailed && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('placementLoadFailed')}</AlertDescription>
          </Alert>
        )}
        {placementBest === null && <p className="text-text-muted">{t('placementNone')}</p>}
        {placementBest && (
          <div className="flex items-center gap-4">
            {/* The level at a glance; the sentence beside it says it in words. */}
            <span aria-hidden className="font-heading text-4xl leading-none font-extrabold text-primary">
              {placementBest.placedLevel}
            </span>
            <p className="min-w-0 text-sm">
              {t('placementBest', {
                level: placementBest.placedLevel,
                score: placementBest.score,
                max: placementBest.maxScore,
                date: placementBest.takenAt.slice(0, 10),
              })}
            </p>
          </div>
        )}
        {placementBest !== undefined && (
          <Button asChild variant="secondary" size="lg" className="min-h-11 w-full border border-border sm:w-auto sm:self-start">
            <Link href="/placement">{placementBest ? t('placementRetake') : t('placementTake')}</Link>
          </Button>
        )}
      </SectionCard>

      <SectionCard title={t('language')}>
        <NativeSelect
          aria-label={t('language')}
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </NativeSelect>
      </SectionCard>
    </div>
  );
}
