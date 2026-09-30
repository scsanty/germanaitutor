'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { CircleCheck, Clock, Lock, Play } from 'lucide-react';
import type { CurriculumTree as CurriculumTreeData, TreeMilestone } from '@/lib/tutoring/progressTypes';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MilestoneGrid } from './MilestoneGrid';

// Spec: Student UI. Milestones in rank order, each a band; inside it, lessons are round nodes
// on the branch grid with connectors drawn behind them. Locked lessons aren't links.
export function CurriculumTree({ reloadKey }: { reloadKey: number }) {
  const t = useTranslations('tree');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const [tree, setTree] = useState<CurriculumTreeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/tree')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as CurriculumTreeData;
        if (!cancelled) {
          setTree(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (failed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  if (!tree) {
    return (
      <div role="status" aria-label={tCommon('loading')} className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  const empty = tree.milestones.every((m) => m.lessons.length === 0);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h2 className="text-2xl md:text-3xl">{t('heading', { track: tTracks(tree.track), level: tree.level })}</h2>
      {empty && <p className="text-text-muted">{t('empty')}</p>}
      {tree.milestones.map((milestone) => (
        <MilestoneBand key={milestone.id} milestone={milestone} />
      ))}
    </div>
  );
}

const STATE_ICON = { locked: Lock, open: Play, complete: CircleCheck } as const;

function MilestoneBand({ milestone }: { milestone: TreeMilestone }) {
  const t = useTranslations('tree');
  const lineId = useId();
  const done = milestone.lessons.filter((l) => l.status === 'complete' || l.status === 'covered').length;
  const total = milestone.lessons.length;
  const StateIcon = STATE_ICON[milestone.state];
  const locked = milestone.state === 'locked';
  return (
    <Card className={cn('gap-4 py-5', locked && 'bg-surface')}>
      <CardHeader className="gap-3 px-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xl leading-tight">{milestone.title}</h3>
            <Badge
              id={lineId}
              variant={milestone.state === 'open' ? 'default' : 'outline'}
              className={cn(
                'whitespace-normal',
                milestone.state === 'complete' && 'border-success text-success',
                locked && 'text-text-muted',
              )}
            >
              <StateIcon aria-hidden />
              <span>
                {t('milestoneLine', {
                  rank: milestone.rank,
                  state: t(`milestoneState.${milestone.state}`),
                  done,
                  total,
                })}
              </span>
            </Badge>
          </div>
          <TestOut milestone={milestone} />
        </div>
        {milestone.description && <p className="max-w-[65ch] text-sm text-text-muted">{milestone.description}</p>}
        <Progress
          aria-labelledby={lineId}
          value={total ? (done / total) * 100 : 0}
          className={cn('h-1.5', milestone.state === 'complete' && '[&>*]:bg-success bg-success/20')}
        />
      </CardHeader>
      <CardContent className="px-0">
        <MilestoneGrid milestone={milestone} />
      </CardContent>
    </Card>
  );
}

function TestOut({ milestone }: { milestone: TreeMilestone }) {
  const t = useTranslations('tree');
  const format = useFormatter();
  const s = milestone.testOut;
  const href = `/milestone/${milestone.id}/test-out`;
  // Dark text on the orange gradient in both themes: text is dark in light, background is dark in dark.
  const cta = 'min-h-11 bg-highlight-gradient px-5 font-semibold text-text shadow-sm hover:opacity-90 dark:text-background';
  switch (s.status) {
    case 'available':
      return (
        <Button asChild className={cta}>
          <Link href={href}>{t('testOutStart')}</Link>
        </Button>
      );
    case 'in_progress':
      return (
        <Button asChild className={cn(cta, 'whitespace-normal')}>
          <Link href={href}>{t('testOutResume', { answered: s.answered, total: s.total })}</Link>
        </Button>
      );
    case 'cooldown':
      return (
        <p className="flex items-center gap-1.5 text-sm text-text-muted">
          <Clock aria-hidden className="size-4 shrink-0" />
          <span>{t('testOutCooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
        </p>
      );
    case 'too_few_questions':
      return <p className="text-sm text-text-muted">{t('testOutTooFew')}</p>;
    case 'none':
      return null;
  }
}
