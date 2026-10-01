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
  // A grid needs rows: each week (seven days) is one row, drawn as a column.
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div role="grid" aria-label={t('activity')} className="flex gap-1">
      {weeks.map((week) => (
        <div key={week[0].date} role="row" className="flex flex-col gap-1">
          {week.map((day) => {
            const label = t('activityCell', { date: format.dateTime(new Date(`${day.date}T12:00:00`), { dateStyle: 'medium' }), count: day.count });
            return <div key={day.date} role="gridcell" aria-label={label} title={label} className={cn('size-3.5 rounded-sm', shade(day.count))} />;
          })}
        </div>
      ))}
    </div>
  );
}
