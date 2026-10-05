'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type {
  PlacementAnswer,
  PlacementOutcome,
  PlacementQuestionView,
  PlacementState,
} from '@/lib/tutoring/placementTypes';
import { pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { useExerciseShortcuts } from '@/components/focus/useExerciseShortcuts';
import { ONWARD, ResultCard, ReviewBadge, SCORE } from '@/components/focus/ResultCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Compass } from 'lucide-react';

// The same task size and thumb-zone footer as the exercise card (components/tutoring/ExerciseCard).
const TASK = 'text-xl leading-snug font-semibold whitespace-pre-line';
const FOOTER = 'sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pt-3 pb-1';

type Phase = 'intro' | 'question' | 'result';

export function PlacementTest({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) {
  const t = useTranslations('placement');
  const errorText = useApiErrorText();
  const tToggle = useTranslations('languageToggle');
  const [language, setLanguage] = useState<ContentLanguage>(useLocale() as ContentLanguage);
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<PlacementQuestionView | null>(null);
  const [outcome, setOutcome] = useState<PlacementOutcome | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradingErrorDetail, setGradingErrorDetail] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);

  function applyState(state: PlacementState) {
    setError(null);
    setGradingErrorDetail(null);
    if (state.status === 'finished') {
      setOutcome(state.outcome);
      setQuestion(null);
      setPhase('result');
      return;
    }
    setQuestion(state.question);
    setSelectedIndex(null);
    setText('');
    setPhase('question');
  }

  async function send(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    setGradingErrorDetail(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applyState(data as PlacementState);
      } else {
        const detail = errorText(data, String(res.status));
        if (res.status === 502) {
          setGradingErrorDetail(detail);
        } else if (res.status === 409 && url !== '/api/placement/start') {
          // The attempt is gone (restarted elsewhere, or an admin replaced the exam): start over.
          setQuestion(null);
          setPhase('intro');
          setError(t('sessionLost'));
        } else {
          setError(t('genericError', { error: detail }));
        }
      }
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  async function switchToOffer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutoring/unlock-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch' }),
      });
      if (!res.ok) {
        setError(t('genericError', { error: String(res.status) }));
        return;
      }
      setSwitched(true);
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function errorAlert() {
    if (gradingErrorDetail) {
      return (
        <Alert variant="destructive" role="alert" className="text-left">
          <AlertDescription>
            <p>
              {t.rich('gradingFailed', {
                error: gradingErrorDetail,
                link: (chunks) => (
                  <Link href="/settings" className="font-semibold underline underline-offset-2">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </AlertDescription>
        </Alert>
      );
    }
    if (error)
      return (
        <Alert variant="destructive" role="alert" className="text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    return null;
  }

  function currentAnswer(): PlacementAnswer | null {
    if (!question) return null;
    if (question.type === 'multiple_choice') {
      return selectedIndex === null ? null : { type: 'multiple_choice', selectedIndex };
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return question.type === 'fill_blank' ? { type: 'fill_blank', text: trimmed } : { type: 'free_text', text: trimmed };
  }

  // Shortcuts in the question phase: 1-4 pick an option, Enter sends the answer. No sounds and
  // no progress bar: a placement test shows no feedback and its length depends on the answers.
  useExerciseShortcuts({
    onPick: (index) => {
      if (phase === 'question' && question?.type === 'multiple_choice' && index < question.options.length) setSelectedIndex(index);
    },
    onEnter: () => {
      const ready = currentAnswer();
      if (phase === 'question' && question && ready && !busy) send('/api/placement/answer', { questionId: question.id, answer: ready });
    },
  });

  if (phase === 'intro') {
    return (
      <div className="py-4 md:py-10">
        <ResultCard icon={Compass}>
          <h2 className="text-3xl">{t('title')}</h2>
          <p className="max-w-[48ch] text-text-muted">{t('intro')}</p>
          <div className="mt-2 flex w-full flex-col gap-3">
            <Button type="button" size="lg" onClick={() => send('/api/placement/start')} disabled={busy} className={ONWARD}>
              {t('start')}
            </Button>
            {onSkip && (
              <Button type="button" size="lg" variant="secondary" onClick={onSkip} disabled={busy} className={ONWARD}>
                {t('skip')}
              </Button>
            )}
            {errorAlert()}
          </div>
        </ResultCard>
      </div>
    );
  }

  if (phase === 'question' && question) {
    const answer = currentAnswer();
    return (
      <FocusLayout
        progress={null}
        confirmExit
        onExit={() => {
          setQuestion(null);
          setSelectedIndex(null);
          setText('');
          setPhase('intro');
        }}
      >
        <div className="flex flex-1 flex-col gap-6">
          {/* The toggle switches only the instruction (the tested German never changes), so a
              question without one has nothing to toggle. */}
          {question.instruction && (
            <>
              <div className="flex justify-end">
                <LanguageToggle value={language} onChange={setLanguage} label={tToggle('placement')} />
              </div>
              <p className="text-sm text-text-muted">{pickText(question.instruction, language)}</p>
            </>
          )}
          {question.type === 'multiple_choice' && (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className={cn(TASK, 'mb-4 p-0')}>{question.question}</legend>
              <RadioGroup
                value={selectedIndex === null ? '' : String(selectedIndex)}
                onValueChange={(value) => setSelectedIndex(Number(value))}
                className="gap-2.5"
              >
                {question.options.map((option, index) => {
                  const id = `placement-${question.id}-option-${index}`;
                  return (
                    <div
                      key={index}
                      className="relative flex min-h-14 items-center gap-3 rounded-xl border-2 border-border bg-surface-raised px-4 py-2 transition-colors duration-150 hover:border-primary/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none"
                    >
                      {index < 4 && (
                        <kbd aria-hidden className="hidden size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-sans text-xs font-bold text-text-muted lg:flex">
                          {index + 1}
                        </kbd>
                      )}
                      {/* The label's ::after stretches over the row, so the whole row is the tap target. */}
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-base font-medium after:absolute after:inset-0 after:content-['']">
                        {option}
                      </label>
                      <RadioGroupItem id={id} value={String(index)} className="size-5 focus-visible:ring-0" />
                    </div>
                  );
                })}
              </RadioGroup>
            </fieldset>
          )}
          {question.type === 'fill_blank' && (
            <div className="flex flex-col gap-4">
              <p className={TASK}>{question.textWithBlank}</p>
              <Input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className="h-12 text-lg md:text-lg" />
            </div>
          )}
          {question.type === 'free_text' && (
            <div className="flex flex-col gap-4">
              <p className={TASK}>{question.prompt}</p>
              <Textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="min-h-32 text-base md:text-base" />
            </div>
          )}
          <div className={FOOTER}>
            {errorAlert()}
            <Button
              type="button"
              size="lg"
              disabled={busy || answer === null}
              onClick={() => answer && send('/api/placement/answer', { questionId: question.id, answer })}
              className="min-h-12 w-full text-base font-semibold"
            >
              {busy ? t('submitting') : t('submit')}
            </Button>
            <Button type="button" size="lg" variant="secondary" disabled={busy} onClick={() => send('/api/placement/stop')} className="min-h-11 w-full">
              {t('beyond')}
            </Button>
          </div>
        </div>
      </FocusLayout>
    );
  }

  if (!outcome) return null;
  return (
    <div className="flex flex-col gap-6 py-4 md:py-10">
      <ResultCard>
        <h2 className="text-xl text-text-muted">{t('resultTitle')}</h2>
        {/* The level at a glance; the sentence below says it for screen readers. */}
        <p aria-hidden className={cn(SCORE, 'text-primary')}>
          {outcome.placedLevel}
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{t('placedAt', { level: outcome.placedLevel })}</p>
          <p className="tabular-nums">{t('score', { score: outcome.score, max: outcome.maxScore })}</p>
          <p className="text-sm text-text-muted">{t(`stopReason.${outcome.stopReason}`)}</p>
        </div>
        {outcome.unlockOffer &&
          (switched ? (
            <p className="font-semibold text-success">{t('switched', { level: outcome.unlockOffer })}</p>
          ) : (
            <Alert role={undefined} className="text-left">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-text">
                <p>{t('switchOffer', { level: outcome.unlockOffer })}</p>
                <Button type="button" variant="secondary" disabled={busy} onClick={switchToOffer} className="min-h-11 border border-border">
                  {t('switch')}
                </Button>
              </AlertDescription>
            </Alert>
          ))}
        {errorAlert()}
        <Button type="button" size="lg" onClick={onFinished} className={cn(ONWARD, 'mt-2')}>
          {t('continue')}
        </Button>
      </ResultCard>
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <h3 className="text-lg">{t('review')}</h3>
        <ol className="flex flex-col gap-3">
          {outcome.answers.map((a) => (
            <li key={a.questionId}>
              <Card className="gap-3 px-5 py-4">
                {a.instruction && <p className="text-sm text-text-muted">{pickText(a.instruction, language)}</p>}
                {a.question && <p className="text-lg leading-snug font-semibold whitespace-pre-line">{a.question}</p>}
                <ReviewBadge result={a.result}>{t(`result.${a.result}`)}</ReviewBadge>
                <div className="flex flex-col gap-1 text-sm">
                  <p className="break-words">{t('given', { answer: a.given || t('noAnswer') })}</p>
                  <p className={cn('break-words', a.result !== 'correct' && 'font-semibold text-success')}>
                    {a.type === 'free_text'
                      ? t('modelAnswer', { answer: a.correctAnswer })
                      : t('correctAnswer', { answer: a.correctAnswer })}
                  </p>
                  {a.feedback && <p className="text-text-muted">{t('feedback', { feedback: pickText(a.feedback, language) })}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
