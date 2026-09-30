'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { GradeResult } from '@/lib/tutoring/grading';
import type { PracticeBatch, PracticeGradeOutcome } from '@/lib/tutoring/practiceViews';
import { ExerciseCard } from './ExerciseCard';
import type { ContentLanguage } from '@/lib/i18n/localizedText';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { Celebration } from '@/components/focus/Celebration';
import { useSound } from '@/lib/sound/useSound';
import { ONWARD, ResultCard, SCORE } from '@/components/focus/ResultCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dumbbell, LoaderCircle, Trophy } from 'lucide-react';

type Phase = 'idle' | 'loading' | 'running' | 'summary';

interface Tally {
  correct: number;
  almost: number;
  wrong: number;
  skipped: number;
}

const EMPTY_TALLY: Tally = { correct: 0, almost: 0, wrong: 0, skipped: 0 };

export interface PracticeRunProps {
  lessonId: string;
  contentLanguage?: ContentLanguage;
  onAskAi: (practiceExerciseId: string, answer: { answerText: string; result: GradeResult }) => void;
  // True from the moment a batch loads until its summary shows.
  onActiveChange?: (active: boolean) => void;
}

// Spec Phase 2: a batch of practice exercises, each shown once, no retry round, nothing recorded.
// When the batch ends the button comes back for more.
export function PracticeRun({ lessonId, contentLanguage, onAskAi, onActiveChange }: PracticeRunProps) {
  const t = useTranslations('practice');
  const errorText = useApiErrorText();
  const [phase, setPhase] = useState<Phase>('idle');
  const [exercises, setExercises] = useState<ExerciseView[]>([]);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [lastResult, setLastResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const playSound = useSound();

  useEffect(() => {
    onActiveChange?.(phase === 'running');
  }, [phase, onActiveChange]);

  // The batch is over: a short celebration (Motion and Sound).
  useEffect(() => {
    if (phase !== 'summary') return;
    playSound('complete');
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 1500);
    return () => clearTimeout(timer);
  }, [phase, playSound]);

  async function start() {
    setPhase('loading');
    setError(null);
    setGenerationError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lessonId}/practice`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = errorText(data, String(res.status));
        if (res.status === 502) setGenerationError(detail);
        else setError(t('genericError', { error: detail }));
        setPhase('idle');
        return;
      }
      setExercises((data as PracticeBatch).exercises);
      setIndex(0);
      setTally(EMPTY_TALLY);
      setLastResult(null);
      setTurn((n) => n + 1);
      setPhase('running');
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
      setPhase('idle');
    }
  }

  function advance(counted: keyof Tally) {
    setTally((current) => ({ ...current, [counted]: current[counted] + 1 }));
    setLastResult(null);
    setTurn((n) => n + 1);
    if (index + 1 >= exercises.length) setPhase('summary');
    else setIndex(index + 1);
  }

  const current = phase === 'running' ? exercises[index] : undefined;

  return (
    <section>
      <Celebration show={celebrate} />
      {current ? (
        <FocusLayout
          progress={{ current: index + 1, total: exercises.length }}
          confirmExit={index > 0}
          onExit={() => setPhase('idle')}
        >
          <p className="mb-2 text-sm text-text-muted">{t('counter', { current: index + 1, total: exercises.length })}</p>
          <ExerciseCard
            key={turn}
            exercise={current}
            source="lesson"
            mode="practice"
            contentLanguage={contentLanguage}
            onPracticeAnswered={(outcome: PracticeGradeOutcome) => setLastResult(outcome.result)}
            onNext={() => advance(lastResult ?? 'skipped')}
            onSkip={() => advance('skipped')}
            onAskAi={onAskAi}
          />
        </FocusLayout>
      ) : (
        <div className="flex flex-col gap-3">
          {phase === 'summary' ? (
            <ResultCard icon={Trophy} tone="success">
              {/* The score at a glance; the sentence below says the same for screen readers. */}
              <p aria-hidden className={SCORE}>
                {tally.correct}
                <span className="text-text-muted">/{exercises.length}</span>
              </p>
              <p className="font-semibold">
                <span>{t('summary', { correct: tally.correct, almost: tally.almost, wrong: tally.wrong })}</span>
                {tally.skipped > 0 && (
                  <>
                    {' · '}
                    <span className="text-text-muted">{t('summarySkipped', { skipped: tally.skipped })}</span>
                  </>
                )}
              </p>
              <Button type="button" size="lg" onClick={start} className={`${ONWARD} mt-2`}>
                <Dumbbell aria-hidden />
                {t('getMore')}
              </Button>
            </ResultCard>
          ) : (
            <Button type="button" size="lg" variant="secondary" disabled={phase === 'loading'} onClick={start} className="min-h-12 w-full text-base font-semibold md:w-auto">
              <Dumbbell aria-hidden />
              {t('getMore')}
            </Button>
          )}
          {phase === 'loading' && (
            <p role="status" className="flex items-center gap-2 text-sm text-text-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              {t('preparing')}
            </p>
          )}
          {generationError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                <p>
                  {t.rich('generationFailed', {
                    error: generationError,
                    link: (chunks) => (
                      <Link href="/settings" className="font-semibold underline underline-offset-2">
                        {chunks}
                      </Link>
                    ),
                  })}
                </p>
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}
