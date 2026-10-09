'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { PracticeResult, PracticeRun } from '@/lib/exam/practiceViews';
import type { TaskAnswer } from '@/lib/tasks/taskTypes';
import { cn } from '@/lib/utils';
import { answeredCount, emptyAnswer, TaskInputs } from './TaskInputs';
import { formatClock, useCountdown } from './useCountdown';

type Tab = 'text' | 'tasks';

// Spec: the timed Teil runner, in focus mode. The clock is the server's (startedAt + minutes); at
// zero the attempt carries on and is marked as overtime by the server.
export function TeilRunner({
  run,
  onFinished,
  onExit,
  progress = null,
}: {
  run: PracticeRun;
  onFinished: (result: PracticeResult) => void;
  onExit?: () => void;
  progress?: { current: number; total: number } | null;
}) {
  const t = useTranslations('exam');
  const errorText = useApiErrorText();
  const type = run.part.taskType as 'passage_questions' | 'matching' | 'cloze';
  const [answer, setAnswer] = useState<TaskAnswer>(() => emptyAnswer(type, run.set.view));
  const [tab, setTab] = useState<Tab>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { secondsLeft, overtime } = useCountdown(run.startedAt, run.minutes);
  // A cloze is one flowing text with its gaps, so it isn't split into columns.
  const split = type !== 'cloze';

  async function submit() {
    // S20: a double click submits once.
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/exam-practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: run.attemptId, answers: answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('submitFailed')));
        return;
      }
      onFinished(data as PracticeResult);
    } catch {
      setError(t('submitFailed'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const header = (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <h1 lang="de" className="truncate font-heading text-base font-bold md:text-lg">{run.part.title.de}</h1>
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

  const instructions = (
    <p lang="de" className="rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
      {run.part.instructions}
    </p>
  );
  const inputs = (pane: 'text' | 'tasks' | 'all') => (
    <TaskInputs type={type} view={run.set.view} value={answer} onChange={setAnswer} disabled={busy} pane={pane} />
  );
  // Desktop: both columns scroll on their own; phone: one pane at a time, switched by the bottom tabs.
  const column = 'flex flex-col gap-4 lg:h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:pr-2';

  return (
    <FocusLayout progress={progress} confirmExit={answeredCount(answer) > 0} onExit={onExit ?? (() => window.history.back())} header={header} wide>
      {split ? (
        <div className="grid flex-1 gap-6 lg:grid-cols-2">
          <section aria-label={t('textTab')} className={cn(column, tab !== 'text' && 'hidden lg:flex')}>
            {inputs('text')}
          </section>
          <section aria-label={t('tasksTab')} className={cn(column, tab !== 'tasks' && 'hidden lg:flex')}>
            {instructions}
            {inputs('tasks')}
          </section>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
          {instructions}
          {inputs('all')}
        </div>
      )}

      <div className="sticky bottom-0 z-[5] mt-4 flex flex-col gap-3 bg-background pt-3 pb-2">
        {overtime && (
          <p role="status" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-2 text-sm">
            {t('overtimeNotice')}
          </p>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-3">
          {split && (
            <div className="flex flex-1 rounded-full border border-border p-0.5 lg:hidden">
              {(['text', 'tasks'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                  className={cn('min-h-11 flex-1 rounded-full px-3 text-sm font-semibold', tab === id ? 'bg-primary text-primary-foreground' : 'text-text-muted')}
                >
                  {id === 'text' ? t('textTab') : t('tasksTab')}
                </button>
              ))}
            </div>
          )}
          <Button size="lg" className="min-h-11 flex-1 lg:ml-auto lg:flex-none" onClick={submit} disabled={busy}>
            {busy ? t('submitting') : t('submit')}
          </Button>
        </div>
      </div>
    </FocusLayout>
  );
}
