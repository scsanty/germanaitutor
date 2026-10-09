'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ReadinessView } from '@/lib/exam/practiceViews';

const PASS_MARK = 60;

// Recent average per Teil against the 60% pass mark. Quietly absent when there is no format or the load fails.
export function ReadinessCard() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [view, setView] = useState<ReadinessView | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/exam-practice/readiness')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ReadinessView;
        if (!cancelled) setView(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view || !Array.isArray(view.parts) || view.parts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('readinessTitle', { format: view.formatName })}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {view.parts.map((part) => {
            const percent = part.averagePercent;
            const status =
              percent === null
                ? t('readinessNone')
                : (percent >= PASS_MARK ? t('readinessOnTrack', { percent }) : t('readinessBelow', { percent })) +
                  (part.overtime ? t('readinessOvertime') : '');
            return (
              <li key={part.partId} className="flex flex-col gap-1.5">
                <div>
                  <p lang="de" className="font-medium">{part.title.de}</p>
                  {locale === 'en' && part.title.en !== part.title.de && <p className="text-sm text-text-muted">{part.title.en}</p>}
                </div>
                <div className="relative">
                  <Progress value={percent ?? 0} aria-label={part.title.de} />
                  <span aria-hidden className="absolute inset-y-[-2px] w-0.5 bg-foreground" style={{ left: `${PASS_MARK}%` }} />
                </div>
                <p className="text-sm text-text-muted">{status}</p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
