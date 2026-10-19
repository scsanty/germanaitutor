'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { TopMistakeItem } from '@/app/api/tutoring/mistakes/route';

// The most frequent mistakes of the last 30 days. Quietly absent when there are none or the load fails.
export function TopMistakesCard() {
  const t = useTranslations('dashboard');
  const language = useLocale() as ContentLanguage;
  const [items, setItems] = useState<TopMistakeItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/mistakes')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { items?: TopMistakeItem[] };
        if (!cancelled) setItems(Array.isArray(body.items) ? body.items : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mistakesTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const label = pickText(item.label, language);
            return (
              <li key={item.categoryId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{label}</p>
                  <Badge variant="secondary">{t('times', { count: item.count })}</Badge>
                </div>
                <p lang="de" className="text-sm">
                  <s className="text-text-muted">{item.example.wrong}</s> → {item.example.right}
                </p>
                <Link
                  href={item.lesson ? `/lesson/${item.lesson.id}` : `/freestyle/grammar_drill?topic=${encodeURIComponent(item.drillTopic ?? label)}`}
                  className="text-sm font-medium text-primary underline underline-offset-2"
                >
                  {item.lesson ? item.lesson.title : t('practiseInFreestyle')}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
