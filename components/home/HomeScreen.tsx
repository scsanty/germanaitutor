'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HomeNotices } from './HomeNotices';
import { CurriculumTree } from '@/components/tutoring/CurriculumTree';

// Switching to an unlocked level changes which tree to show, so a notice action reloads it.
export function HomeScreen() {
  const t = useTranslations('home');
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <HomeNotices onChange={() => setReloadKey((key) => key + 1)} />
      <Link href="/dashboard">{t('dashboardButton')}</Link>
      <CurriculumTree reloadKey={reloadKey} />
    </>
  );
}
