'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { TestOutAnswerOutcome, TestOutResult, TestOutRun, TestOutState } from '@/lib/tutoring/testOutViews';
import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { ExerciseCard, ExerciseHeading } from './ExerciseCard';

// Score, pass/fail and the per-question review of one finished attempt.
function ResultView({ result }: { result: TestOutResult }) {
  const t = useTranslations('testOut');
  const language: ContentLanguage = useLocale() === 'de' ? 'de' : 'en';
  return (
    <>
      <p>{result.passed ? t('passed') : t('failed')}</p>
      <p>{t('score', { score: result.score, maxScore: result.maxScore })}</p>
      <ol>
        {result.review.map((item) => (
          <li key={item.exercise.id}>
            <ExerciseHeading exercise={item.exercise} language={language} />
            <p>{t(`result.${item.result}`)}</p>
            <p>{t('yourAnswer', { answer: item.answerText })}</p>
            {item.result !== 'correct' && item.correctAnswer && <p>{t('correctAnswer', { answer: item.correctAnswer })}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

// Spec: Student UI, test-out page. One question at a time, no feedback until the end.
export function TestOutPage({ milestoneId }: { milestoneId: string }) {
  const t = useTranslations('testOut');
  const tCommon = useTranslations('common');
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

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (!state) return <p>{tCommon('loading')}</p>;

  const back = <Link href="/">{t('backToTree')}</Link>;
  const heading = <h1>{t('title', { milestone: state.milestone.title })}</h1>;

  if (result) {
    return (
      <div>
        {heading}
        <ResultView result={result} />
        {back}
      </div>
    );
  }

  const current = questions?.[answered];
  if (questions && current) {
    return (
      <div>
        {heading}
        <p>{t('progress', { current: answered + 1, total: questions.length })}</p>
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
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  const s = state.status;
  return (
    <div>
      {heading}
      {(s.status === 'available' || s.status === 'in_progress') && (
        <>
          <p>{t('intro')}</p>
          <button type="button" disabled={starting} onClick={startOrResume}>
            {s.status === 'available' ? t('start') : t('resume')}
          </button>
        </>
      )}
      {s.status === 'cooldown' && (
        <p>{t('cooldown', { time: format.dateTime(new Date(s.retryAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
      )}
      {s.status === 'too_few_questions' && <p>{t('tooFew')}</p>}
      {s.status === 'none' && <p>{t('unavailable')}</p>}
      {error && <p role="alert">{error}</p>}
      {(s.status === 'none' || s.status === 'cooldown') && state.lastResult && <ResultView result={state.lastResult} />}
      <p>{back}</p>
    </div>
  );
}
