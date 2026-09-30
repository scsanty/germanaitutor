'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HomeNotices } from './HomeNotices';
import { CurriculumTree } from '@/components/tutoring/CurriculumTree';
import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';

// Switching to an unlocked level changes which tree to show, so a notice action reloads it.
export function HomeScreen() {
  const t = useTranslations('home');
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <HomeNotices onChange={() => setReloadKey((key) => key + 1)} />
      <Button asChild variant="secondary" className="min-h-11 self-start border border-border">
        <Link href="/dashboard">
          <LayoutDashboard aria-hidden />
          {t('dashboardButton')}
        </Link>
      </Button>
      <CurriculumTree reloadKey={reloadKey} />
    </div>
  );
}
