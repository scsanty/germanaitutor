'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { pronunciationBand } from '@/lib/speaking/pronunciation';

// The pronunciation estimate from speech recognition, always labelled as an estimate.
export function PronunciationBox({ estimate, comment }: { estimate: { score: number; unclear: string[] }; comment?: string }) {
  const t = useTranslations('speech');
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
      <h3 id={headingId} className="text-sm font-semibold text-text-muted">
        {t('pronunciation')}
      </h3>
      <p className="text-base font-medium">{t(`band.${pronunciationBand(estimate.score)}`)}</p>
      {estimate.unclear.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-muted">{t('unclearWords')}</p>
          <ul lang="de" className="flex flex-wrap gap-1.5">
            {estimate.unclear.map((w) => (
              <li key={w}>
                <Badge variant="outline">{w}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      {comment && <p className="text-sm leading-relaxed">{comment}</p>}
      <p className="text-xs text-text-muted">{t('estimateNote')}</p>
    </section>
  );
}
