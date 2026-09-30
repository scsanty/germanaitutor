'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HomeIntro() {
  const t = useTranslations('home');
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h1 className="min-w-0 text-3xl leading-tight md:text-4xl">{t('title')}</h1>
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href="/queue" aria-label={t('dailyQueue')} title={t('dailyQueue')}>
            <CalendarCheck aria-hidden className="size-5" />
          </Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/settings">
            <Settings aria-hidden />
            {t('settings')}
          </Link>
        </Button>
      </nav>
    </div>
  );
}
