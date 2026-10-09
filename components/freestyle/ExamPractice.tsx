'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { TeilReview } from '@/components/exam/TeilReview';
import { TeilRunner } from '@/components/exam/TeilRunner';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExamPart } from '@/lib/exam/formats';
import type { MockRun, PracticeOverview, PracticeResult, PracticeRun } from '@/lib/exam/practiceViews';
import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { MockResult } from './MockResult';

type Screen =
  | { kind: 'overview' }
  | { kind: 'run'; run: PracticeRun }
  | { kind: 'review'; run: PracticeRun; result: PracticeResult }
  | { kind: 'mock'; mock: MockRun; index: number; results: PracticeResult[] }
  | { kind: 'mockResult'; mock: MockRun; results: PracticeResult[] };

const MODULE_OF: Partial<Record<ExamPart['skill'], 'listening' | 'writing' | 'speaking'>> = {
  listening: 'listening',
  writing: 'writing',
  speaking: 'speaking',
};

// Spec: Freestyle's exam practice. Single Teile against the clock, or a full mock of the written
// parts under one timer. Works without AI (S11): only "Ask about this" and pool generation need it.
export function ExamPractice() {
  const t = useTranslations('exam');
  const locale = useLocale() as ContentLanguage;
  const errorText = useApiErrorText();
  const [overview, setOverview] = useState<PracticeOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [screen, setScreen] = useState<Screen>({ kind: 'overview' });
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startGuard = useRef(false);

  useEffect(() => {
    let stale = false;
    fetch('/api/exam-practice')
      .then(async (res) => {
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as PracticeOverview;
        if (!stale) setOverview(data);
      })
      .catch(() => {
        if (!stale) setLoadFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [reload]);

  function back() {
    setScreen({ kind: 'overview' });
    setError(null);
    setReload((n) => n + 1);
  }

  // S20: Practise and Full mock start once, however often they're clicked.
  async function start(key: string, url: string, body: unknown, open: (data: unknown) => void) {
    if (startGuard.current) return;
    startGuard.current = true;
    setStarting(key);
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('startFailed')));
        return;
      }
      open(data);
    } catch {
      setError(t('startFailed'));
    } finally {
      startGuard.current = false;
      setStarting(null);
    }
  }

  if (screen.kind === 'run') {
    return <TeilRunner key={screen.run.attemptId} run={screen.run} onExit={back} onFinished={(result) => setScreen({ kind: 'review', run: screen.run, result })} />;
  }
  if (screen.kind === 'mock') {
    const { mock, index, results } = screen;
    const run = mock.runs[index];
    return (
      <TeilRunner
        key={run.attemptId}
        // The mock has one clock: the shared start and the sum of its parts' minutes.
        run={{ ...run, minutes: mock.minutes }}
        progress={{ current: index + 1, total: mock.runs.length }}
        onExit={back}
        onFinished={(result) => {
          const all = [...results, result];
          setScreen(index + 1 < mock.runs.length ? { kind: 'mock', mock, index: index + 1, results: all } : { kind: 'mockResult', mock, results: all });
        }}
      />
    );
  }

  const backButton = (
    <Button variant="ghost" className="min-h-11 self-start" onClick={back}>
      <ArrowLeft aria-hidden />
      {t('back')}
    </Button>
  );
  if (screen.kind === 'review') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6">
        <TeilReview result={screen.result} run={screen.run} />
        {backButton}
      </div>
    );
  }
  if (screen.kind === 'mockResult') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6">
        {overview?.format && <MockResult format={overview.format} mock={screen.mock} results={screen.results} />}
        {backButton}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  if (!overview) {
    return (
      <div role="status" aria-label={t('loading')} className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const format = overview.format;
  if (!format) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('noFormat')}</p>
      </div>
    );
  }

  const written = format.blocks.find((b) => b.id === 'written');
  const mockParts = overview.parts.filter((p) => (p.runnable || p.mockOnly) && written?.partIds.includes(p.part.id));
  const mockMinutes = mockParts.reduce((s, p) => s + p.part.minutes, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{format.name}</p>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {mockParts.length > 0 && (
        <Card className="flex-row items-center gap-4 px-5 py-4">
          <ClipboardCheck aria-hidden className="size-6 shrink-0 text-primary" />
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="text-lg font-semibold">{t('fullMock')}</h2>
            <p className="text-sm text-text-muted">{t('fullMockBody', { minutes: mockMinutes })}</p>
          </div>
          <Button
            className="min-h-11"
            disabled={starting !== null}
            onClick={() => start('mock', '/api/exam-practice/mock/start', { formatId: format.id }, (data) => setScreen({ kind: 'mock', mock: data as MockRun, index: 0, results: [] }))}
          >
            {starting === 'mock' ? t('starting') : t('fullMock')}
          </Button>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {overview.parts.map(({ part, runnable, mockOnly, lastPercent }) => {
          const mod = MODULE_OF[part.skill];
          const hint = runnable ? null : mockOnly ? t('mockOnly') : mod ? t('comingSoon', { module: t(`modules.${mod}`) }) : null;
          return (
            <li key={part.id}>
              <Card className="flex-row items-center gap-4 px-5 py-4">
                <div className="flex flex-1 flex-col gap-1">
                  {/* Part names are the exam's own (German); the English one follows when it differs. */}
                  <h2 lang="de" className="font-semibold">{part.title.de}</h2>
                  {locale === 'en' && part.title.en !== part.title.de && <p className="text-sm text-text-muted">{part.title.en}</p>}
                  <p className="text-sm text-text-muted">
                    {t('minutes', { minutes: part.minutes })}
                    {lastPercent !== null && <> · {t('lastScore', { percent: lastPercent })}</>}
                  </p>
                  {hint && <p className="text-sm text-text-muted">{hint}</p>}
                </div>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={!runnable || starting !== null}
                  onClick={() => start(part.id, '/api/exam-practice/start', { formatId: format.id, partId: part.id }, (data) => setScreen({ kind: 'run', run: data as PracticeRun }))}
                >
                  {starting === part.id ? t('starting') : t('practise')}
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
