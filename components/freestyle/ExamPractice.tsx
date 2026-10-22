'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ClipboardCheck, Mic } from 'lucide-react';
import { TeilReview } from '@/components/exam/TeilReview';
import { TeilRunner } from '@/components/exam/TeilRunner';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExamPart } from '@/lib/exam/formats';
import type { MockRun, OralMockRun, PracticeOverview, PracticeResult, PracticeRun } from '@/lib/exam/practiceViews';
import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { MockResult } from './MockResult';

type Screen =
  | { kind: 'overview' }
  | { kind: 'run'; run: PracticeRun; offsetMs: number }
  | { kind: 'review'; run: PracticeRun; result: PracticeResult }
  | { kind: 'mock'; mock: MockRun; index: number; results: PracticeResult[]; offsetMs: number }
  | { kind: 'mockResult'; mock: MockRun; results: PracticeResult[] }
  // B4: the oral block, started from the written block's result, with its own clock and result.
  | { kind: 'oral'; oral: OralMockRun; minutes: number; index: number; results: PracticeResult[]; offsetMs: number }
  | { kind: 'oralResult'; oral: OralMockRun; results: PracticeResult[] };

const MODULE_OF: Partial<Record<ExamPart['skill'], 'listening' | 'writing' | 'speaking'>> = {
  listening: 'listening',
  writing: 'writing',
  speaking: 'speaking',
};

// Spec: Freestyle's exam practice. Single Teile against the clock, or a full mock of the written
// parts under one timer. Works without AI (S11): only "Ask about this" and pool generation need it.

// The server stamps startedAt just before it answers, so this is (about) server minus client clock.
const offsetOf = (startedAt: string) => Date.parse(startedAt) - Date.now();
export function ExamPractice() {
  const t = useTranslations('exam');
  const tSpeaking = useTranslations('speaking');
  const locale = useLocale() as ContentLanguage;
  const errorText = useApiErrorText();
  const [overview, setOverview] = useState<PracticeOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [screen, setScreen] = useState<Screen>({ kind: 'overview' });
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startGuard = useRef(false);
  const cardId = useId();

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
    return <TeilRunner key={screen.run.attemptId} run={screen.run} clockOffsetMs={screen.offsetMs} onExit={back} onFinished={(result) => setScreen({ kind: 'review', run: screen.run, result })} />;
  }
  if (screen.kind === 'mock') {
    const { mock, index, results, offsetMs } = screen;
    const run = mock.runs[index];
    return (
      <TeilRunner
        key={run.attemptId}
        // The mock has one clock: the shared start and the sum of its parts' minutes.
        run={{ ...run, minutes: mock.minutes }}
        progress={{ current: index + 1, total: mock.runs.length }}
        clockOffsetMs={offsetMs}
        onExit={back}
        onFinished={(result) => {
          const all = [...results, result];
          setScreen(index + 1 < mock.runs.length ? { kind: 'mock', mock, index: index + 1, results: all, offsetMs } : { kind: 'mockResult', mock, results: all });
        }}
      />
    );
  }

  if (screen.kind === 'oral') {
    const { oral, minutes, index, results, offsetMs } = screen;
    const run = oral.runs[index];
    return (
      <TeilRunner
        key={run.attemptId}
        run={{ ...run, minutes }}
        progress={{ current: index + 1, total: oral.runs.length }}
        clockOffsetMs={offsetMs}
        onExit={back}
        onFinished={(result) => {
          const all = [...results, result];
          setScreen(index + 1 < oral.runs.length ? { kind: 'oral', oral, minutes, index: index + 1, results: all, offsetMs } : { kind: 'oralResult', oral, results: all });
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
    const { oral } = screen.mock;
    const oralMinutes = (overview?.format?.parts ?? []).filter((p) => oral?.partIds.includes(p.id)).reduce((sum, p) => sum + p.minutes, 0);
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6">
        {overview?.format && <MockResult format={overview.format} mock={screen.mock} results={screen.results} />}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {oral && (
          <Card className="flex-row items-center gap-4 px-5 py-4">
            <Mic aria-hidden className="size-6 shrink-0 text-primary" />
            <div className="flex flex-1 flex-col gap-1">
              <h2 className="text-lg font-semibold">{tSpeaking('oralPart')}</h2>
              <p className="text-sm text-text-muted">{tSpeaking('oralPartBody', { minutes: oralMinutes })}</p>
              {!oral.runnable && <p className="text-sm text-text-muted">{t('speechUnavailable')}</p>}
            </div>
            <Button
              className="min-h-11"
              disabled={!oral.runnable || starting !== null}
              onClick={() => start('oral', '/api/exam-practice/mock/oral', { mockId: screen.mock.mockId }, (data) => {
                const run = data as OralMockRun;
                const minutes = run.runs.reduce((sum, r) => sum + r.part.minutes, 0);
                setScreen({ kind: 'oral', oral: run, minutes, index: 0, results: [], offsetMs: offsetOf(run.runs[0]?.startedAt ?? '') || 0 });
              })}
            >
              {starting === 'oral' ? t('starting') : tSpeaking('startOral')}
            </Button>
          </Card>
        )}
        {backButton}
      </div>
    );
  }
  if (screen.kind === 'oralResult') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6">
        {overview?.format && <MockResult format={overview.format} mock={screen.oral} results={screen.results} block="oral" />}
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
  const mockParts = overview.parts.filter((p) => (p.runnable || p.mockOnly || p.audioUnavailable) && written?.partIds.includes(p.part.id));
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
            {!overview.mockRunnable && <p className="text-sm text-text-muted">{t('mockAudioUnavailable')}</p>}
          </div>
          <Button
            className="min-h-11"
            disabled={!overview.mockRunnable || starting !== null}
            onClick={() => start('mock', '/api/exam-practice/mock/start', { formatId: format.id }, (data) => {
              const mock = data as MockRun;
              setScreen({ kind: 'mock', mock, index: 0, results: [], offsetMs: offsetOf(mock.runs[0]?.startedAt ?? '') || 0 });
            })}
          >
            {starting === 'mock' ? t('starting') : t('fullMock')}
          </Button>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {overview.parts.map(({ part, runnable, mockOnly, audioUnavailable, speechUnavailable, lastPercent }) => {
          const mod = MODULE_OF[part.skill];
          const hint = runnable
            ? null
            : audioUnavailable
              ? t('audioUnavailable')
              : speechUnavailable
                ? t('speechUnavailable')
                : mockOnly
                  ? t('mockOnly')
                  : mod
                    ? t('comingSoon', { module: t(`modules.${mod}`) })
                    : null;
          // NEEDS_USER5: letters and spoken parts are graded by the AI; warn before starting when none is set up.
          const aiWarning = !overview.aiReady && (runnable || speechUnavailable) && (part.taskType === 'letter' || part.taskType === 'spoken');
          return (
            <li key={part.id}>
              <Card className="flex-row items-center gap-4 px-5 py-4">
                <div className="flex flex-1 flex-col gap-1">
                  {/* Part names are the exam's own (German); the English one follows when it differs. */}
                  <h2 id={`${cardId}-${part.id}`} lang="de" className="font-semibold">{part.title.de}</h2>
                  {locale === 'en' && part.title.en !== part.title.de && <p className="text-sm text-text-muted">{part.title.en}</p>}
                  <p className="text-sm text-text-muted">
                    {t('minutes', { minutes: part.minutes })}
                    {lastPercent !== null && <> · {t('lastScore', { percent: lastPercent })}</>}
                  </p>
                  {hint && <p className="text-sm text-text-muted">{hint}</p>}
                  {aiWarning && <p className="text-sm text-warning">{t('aiMissing')}</p>}
                </div>
                <Button
                  variant="outline"
                  aria-describedby={`${cardId}-${part.id}`}
                  className="min-h-11"
                  disabled={!runnable || starting !== null}
                  onClick={() => start(part.id, '/api/exam-practice/start', { formatId: format.id, partId: part.id }, (data) => {
                    const run = data as PracticeRun;
                    setScreen({ kind: 'run', run, offsetMs: offsetOf(run.startedAt) || 0 });
                  })}
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
