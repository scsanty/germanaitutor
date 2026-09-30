'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { TestOutAnswerOutcome, TestOutResult, TestOutRun, TestOutState } from '@/lib/tutoring/testOutViews';
import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { ExerciseCard, ExerciseHeading } from './ExerciseCard';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { ONWARD, ResultCard, ReviewBadge } from '@/components/focus/ResultCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CircleX, Clock, GraduationCap, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// Score, pass/fail and the per-question review of one finished attempt. `top` and `action` go
// inside the score card (the page heading above, the way onward below).
function ResultView({ result, top, action }: { result: TestOutResult; top?: ReactNode; action?: ReactNode }) {
  const t = useTranslations('testOut');
  const language: ContentLanguage = useLocale() === 'de' ? 'de' : 'en';
  return (
    <div className="flex flex-col gap-6">
      <ResultCard icon={result.passed ? Trophy : CircleX} tone={result.passed ? 'success' : 'danger'}>
        {top}
        <p className={cn('font-semibold', result.passed ? 'text-success' : 'text-danger')}>{result.passed ? t('passed') : t('failed')}</p>
        <p className="font-heading text-4xl leading-tight font-extrabold tracking-tight tabular-nums sm:text-5xl">
          {t('score', { score: result.score, maxScore: result.maxScore })}
        </p>
        {action}
      </ResultCard>
      <ol className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {result.review.map((item) => {
          return (
            <li key={item.exercise.id}>
              <Card className="gap-3 px-5 py-4">
                <ExerciseHeading exercise={item.exercise} language={language} />
                <ReviewBadge result={item.result}>{t(`result.${item.result}`)}</ReviewBadge>
                <div className="flex flex-col gap-1 text-sm">
                  <p className="break-words">{t('yourAnswer', { answer: item.answerText })}</p>
                  {item.result !== 'correct' && item.correctAnswer && (
                    <p className="font-semibold break-words text-success">{t('correctAnswer', { answer: item.correctAnswer })}</p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Spec: Student UI, test-out page. One question at a time, no feedback until the end.
export function TestOutPage({ milestoneId }: { milestoneId: string }) {
  const t = useTranslations('testOut');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const format = useFormatter();
  const errorText = useApiErrorText();
  const base = `/api/tutoring/milestones/${milestoneId}/testout`;
  const [state, setState] = useState<TestOutState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [questions, setQuestions] = useState<ExerciseView[] | null>(null);
  const [answered, setAnswered] = useState(0);
  const [result, setResult] = useState<TestOutResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadState() {
    fetch(base)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState((await res.json()) as TestOutState);
      })
      .catch(() => setLoadFailed(true));
  }

  useEffect(loadState, [base]);

  async function startOrResume() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(base, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409: the attempt was just settled elsewhere. The reload below shows its result.
        if (res.status !== 409) setError(t('genericError', { error: errorText(data, String(res.status)) }));
        setQuestions(null);
        loadState();
        return;
      }
      const run = data as TestOutRun;
      setQuestions(run.questions);
      setAnswered(run.answered);
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setStarting(false);
    }
  }

  function onAnswered(outcome: TestOutAnswerOutcome) {
    if (outcome.finished) setResult(outcome.result);
    else setAnswered(outcome.answered);
  }

  if (loadFailed)
    return (
      <Alert variant="destructive" role="alert" className="mx-auto max-w-md">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  if (!state)
    return (
      <div role="status" aria-label={tCommon('loading')} className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-8">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );

  const back = (primary: boolean) => (
    <Button asChild size="lg" variant={primary ? 'default' : 'secondary'} className={ONWARD}>
      <Link href="/">{t('backToTree')}</Link>
    </Button>
  );
  const title = t('title', { milestone: state.milestone.title });
  const heading = <h1 className="text-2xl md:text-3xl">{title}</h1>;
  const errorAlert = error && (
    <Alert variant="destructive" role="alert" className="text-left">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (result) {
    return (
      <div className="py-4 md:py-10">
        <ResultView result={result} top={heading} action={<div className="mt-2 w-full">{back(true)}</div>} />
      </div>
    );
  }

  const current = questions?.[answered];
  if (questions && current) {
    return (
      // Focus mode, but no right/wrong anywhere and no sounds: the card plays none in test mode.
      <FocusLayout
        progress={{ current: answered + 1, total: questions.length }}
        confirmExit={answered > 0}
        onExit={() => router.push('/')}
      >
        <div className="mb-4 flex flex-col gap-1">
          <h1 className="text-xl md:text-2xl">{title}</h1>
          <p className="text-sm text-text-muted">{t('progress', { current: answered + 1, total: questions.length })}</p>
        </div>
        <ExerciseCard
          key={current.id}
          exercise={current}
          source="lesson"
          mode="test"
          testMilestoneId={milestoneId}
          onTestAnswered={onAnswered}
          onTestStale={startOrResume}
          onNext={() => undefined}
          onSkip={() => undefined}
        />
        {errorAlert}
      </FocusLayout>
    );
  }

  const s = state.status;
  const canStart = s.status === 'available' || s.status === 'in_progress';
  return (
    <div className="flex flex-col gap-6 py-4 md:py-10">
      <ResultCard icon={s.status === 'cooldown' ? Clock : GraduationCap} tone={canStart ? 'highlight' : 'primary'}>
        {heading}
        {canStart && (
          <>
            <p className="max-w-[48ch] text-text-muted">{t('intro')}</p>
            <Button type="button" size="lg" disabled={starting} onClick={startOrResume} className={cn(ONWARD, 'mt-2')}>
              {s.status === 'available' ? t('start') : t('resume')}
            </Button>
          </>
        )}
        {s.status === 'cooldown' && (
          <p className="text-text-muted">{t('cooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
        )}
        {s.status === 'too_few_questions' && <p className="text-text-muted">{t('tooFew')}</p>}
        {s.status === 'none' && <p className="text-text-muted">{t('unavailable')}</p>}
        {errorAlert}
        <div className="w-full">{back(!canStart)}</div>
      </ResultCard>
      {(s.status === 'none' || s.status === 'cooldown') && state.lastResult && <ResultView result={state.lastResult} />}
    </div>
  );
}
