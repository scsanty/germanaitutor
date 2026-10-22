'use client';

import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatClock } from './useCountdown';

// The Teil runners' top bar: the part's German title, "Part n of m" in a mock, and the soft timer.
export function RunnerHeader({
  title,
  progress,
  secondsLeft,
  overtime,
}: {
  title: string;
  progress: { current: number; total: number } | null;
  secondsLeft: number;
  overtime: boolean;
}) {
  const t = useTranslations('exam');
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <h1 lang="de" className="truncate font-heading text-base font-bold md:text-lg">{title}</h1>
        {progress && <p className="text-xs text-text-muted">{t('mockPart', progress)}</p>}
      </div>
      <div
        role="timer"
        aria-label={t('timer')}
        className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-base tabular-nums', overtime ? 'border-danger/60 bg-danger/10 text-danger' : 'border-border')}
      >
        <Timer aria-hidden className="size-4" />
        {formatClock(secondsLeft)}
      </div>
      {/* The timer itself isn't live (it would speak every second); this announces each minute. */}
      <span aria-live="polite" className="sr-only">
        {overtime ? '' : t('minutesLeft', { minutes: Math.ceil(secondsLeft / 60) })}
      </span>
    </div>
  );
}
