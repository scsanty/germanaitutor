'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardView } from '@/lib/tutoring/dashboardViews';
import { Heatmap } from './Heatmap';
import { SkillProgress } from './SkillProgress';

export function DashboardPage() {
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
  if (!view) return <Skeleton className="h-64 w-full" aria-label={t('loading')} />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <h1 className="md:col-span-2 text-3xl">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('continueTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.continueLesson ? (
            <Link className="text-primary font-semibold" href={`/lesson/${view.continueLesson.id}`}>
              {t('continue', { title: view.continueLesson.title })}
            </Link>
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
            <Link className="text-primary font-semibold" href="/queue">
              {t('startReviews', { count: view.reviewsDue })}
            </Link>
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
