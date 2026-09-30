'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// 12 weeks as columns of 7 days. Colour steps are shades of the primary token.
function shade(count: number): string {
  if (count === 0) return 'bg-surface-raised';
  if (count < 5) return 'bg-primary/30';
  if (count < 15) return 'bg-primary/60';
  return 'bg-primary';
}

export function Heatmap({ days }: { days: { date: string; count: number }[] }) {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  return (
    <div role="grid" aria-label={t('activity')} className="grid grid-flow-col grid-rows-7 gap-1">
      {days.map((day) => {
        const label = t('activityCell', { date: format.dateTime(new Date(`${day.date}T12:00:00`), { dateStyle: 'medium' }), count: day.count });
        return <div key={day.date} role="gridcell" aria-label={label} title={label} className={cn('size-3.5 rounded-sm', shade(day.count))} />;
      })}
    </div>
  );
}
