'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Play, Repeat } from 'lucide-react';
import type { DashboardView } from '@/lib/tutoring/dashboardViews';
import { Logo } from '@/components/brand/Logo';
import { Heatmap } from './Heatmap';
import { SkillProgress } from './SkillProgress';

// A large hero logo heads the dashboard, wide enough (≥ 540px on desktop, full width on phone) for the tagline to read.
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <Logo className="mx-auto w-full sm:w-[36rem]" />
      <DashboardContent />
    </div>
  );
}

function DashboardContent() {
  const t = useTranslations('dashboard');
  const [view, setView] = useState<DashboardView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/tutoring/dashboard')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setView((await res.json()) as DashboardView);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  if (!view)
    return (
      <div role="status" aria-label={t('loading')} className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-9 w-48 md:col-span-2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <h1 className="text-3xl md:col-span-2 md:text-4xl">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('continueTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.continueLesson ? (
            <Button asChild size="lg" className="h-auto min-h-12 w-full justify-start py-3 text-left text-base font-semibold whitespace-normal">
              <Link href={`/lesson/${view.continueLesson.id}`}>
                <Play aria-hidden />
                {t('continue', { title: view.continueLesson.title })}
              </Link>
            </Button>
          ) : (
            <p className="text-text-muted">{t('nothingToContinue')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('reviewsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.reviewsDue > 0 ? (
            <div className="flex flex-col gap-4">
              {/* The count at a glance; the button says it in words. */}
              <p aria-hidden className="font-heading text-5xl leading-none font-extrabold text-primary tabular-nums">
                {view.reviewsDue}
              </p>
              <Button asChild size="lg" variant="secondary" className="h-auto min-h-12 w-full justify-start border border-border py-3 text-left text-base font-semibold whitespace-normal">
                <Link href="/queue">
                  <Repeat aria-hidden />
                  {t('startReviews', { count: view.reviewsDue })}
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-text-muted">{t('noReviews')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('skillsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillProgress skills={view.skills} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('activity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap days={view.activity} />
        </CardContent>
      </Card>
    </div>
  );
}
