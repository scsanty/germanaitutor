'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { LessonView } from '@/lib/tutoring/progressTypes';
import type { AttemptOutcome } from '@/lib/tutoring/lessonAnswers';
import { ExerciseCard } from './ExerciseCard';
import { PracticeRun } from './PracticeRun';
import type { GradeResult } from '@/lib/tutoring/grading';
import { LessonChat, type AskAbout } from './LessonChat';
import { pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { Celebration } from '@/components/focus/Celebration';
import { useSound } from '@/lib/sound/useSound';
import { ArrowLeft, Check, Circle, CircleCheck, Lock, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type OpenLesson = Extract<LessonView, { locked: false }>;

// One run through the lesson's exercises. Exercises not passed yet move to the end (the retry
// round) until every one has passed (spec: Pages and Navigation, `/lesson/[id]`).
interface Run {
  pending: string[];
  total: number;
  passed: number;
  practice: boolean;
}

export function LessonPage({ lessonId }: { lessonId: string }) {
  const t = useTranslations('lesson');
  const tCommon = useTranslations('common');
  const errorText = useApiErrorText();
  const locale = useLocale() as ContentLanguage;
  const tToggle = useTranslations('languageToggle');
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  // Spec: the toggle starts in the UI language every time a lesson opens (Review Focus 2).
  useEffect(() => setLanguage(locale), [lessonId, locale]);
  const [view, setView] = useState<LessonView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [turn, setTurn] = useState(0);
  const [lastPassed, setLastPassed] = useState(false);
  const [completedNow, setCompletedNow] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [askAbout, setAskAbout] = useState<AskAbout | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [practiceActive, setPracticeActive] = useState(false);
  const [answeredThisRun, setAnsweredThisRun] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const playSound = useSound();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutoring/lessons/${lessonId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LessonView;
        if (!cancelled) setView(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  // The run is over and the lesson was just completed: a short celebration (Motion and Sound).
  const finishedNow = Boolean(run && !run.practice && run.pending.length === 0 && completedNow);
  useEffect(() => {
    if (!finishedNow) return;
    playSound('complete');
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 1500);
    return () => clearTimeout(timer);
  }, [finishedNow, playSound]);

  function startRun(lesson: OpenLesson) {
    const practice = lesson.completed;
    const passed = new Set(lesson.passedExerciseIds);
    const pending = lesson.exercises.map((e) => e.id).filter((id) => practice || !passed.has(id));
    setRun({ pending, total: lesson.exercises.length, passed: lesson.exercises.length - pending.length, practice });
    setAnsweredThisRun(0);
    setTurn((n) => n + 1);
  }

  function handleAnswered(outcome: AttemptOutcome) {
    setLastPassed(outcome.result !== 'wrong');
    setAnsweredThisRun((n) => n + 1);
    if (outcome.justCompleted) setCompletedNow(true);
    setView((current) =>
      current && !current.locked
        ? { ...current, passedExerciseIds: outcome.passedExerciseIds, completed: outcome.lessonCompleted }
        : current
    );
  }

  function advance(passed: boolean) {
    setRun((current) => {
      if (!current || current.pending.length === 0) return current;
      const [head, ...rest] = current.pending;
      return {
        ...current,
        pending: passed ? rest : [...rest, head],
        passed: current.passed + (passed ? 1 : 0),
      };
    });
    setLastPassed(false);
    setTurn((n) => n + 1);
  }

  async function markDone(lesson: OpenLesson) {
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lesson.id}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMarkError(t('markFailed', { error: errorText(data, String(res.status)) }));
        return;
      }
      setView({ ...lesson, completed: true });
    } catch (err) {
      setMarkError(t('markFailed', { error: (err as Error).message }));
    } finally {
      setMarking(false);
    }
  }

  if (loadFailed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  if (notFound) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('notFound')}</AlertDescription>
        </Alert>
        <BackLink label={t('backToTree')} />
      </div>
    );
  }
  if (!view) {
    return (
      <div role="status" aria-label={tCommon('loading')} className="mx-auto flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (view.locked === 'level' || view.locked === 'lesson') {
    const locked = view;
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4">
        <nav>
          <BackLink label={t('backToTree')} />
        </nav>
        <Card className="w-full gap-4 bg-surface px-5 py-6 md:px-8">
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-text-muted">
            <Lock aria-hidden className="size-6" />
          </span>
          <h1 className="text-2xl md:text-3xl">{locked.title}</h1>
          {locked.locked === 'level' ? (
            <p className="text-text-muted">{t('locked', { level: locked.unlocksAfter })}</p>
          ) : locked.reason === 'milestone' ? (
            <p className="text-text-muted">{t('lockedMilestone', { milestone: locked.milestone.title })}</p>
          ) : (
            <>
              <p className="text-text-muted">{t('lockedPrerequisites')}</p>
              <ul className="flex flex-col gap-2">
                {locked.missingPrerequisites.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/lesson/${p.id}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    );
  }

  const lesson = view;
  const currentId = run?.pending[0];
  const current = currentId ? (lesson.exercises.find((e) => e.id === currentId) ?? null) : null;

  function askAi(exerciseId: string) {
    const number = lesson.exercises.findIndex((e) => e.id === exerciseId) + 1;
    setAskAbout({ kind: 'exercise', exerciseId, label: t('exerciseLabel', { number }) });
    setChatOpen(true);
  }

  function practiceAskAi(practiceExerciseId: string, answer: { answerText: string; result: GradeResult }) {
    setAskAbout({ kind: 'practice', practiceExerciseId, ...answer, label: t('practiceExerciseLabel') });
    setChatOpen(true);
  }

  if (run && current) {
    // Focus mode: the exercise run hides the shell. The explanation stays in the normal page.
    return (
      <FocusLayout
        progress={{ current: Math.min(run.passed + 1, run.total), total: run.total }}
        confirmExit={answeredThisRun > 0}
        onExit={() => setRun(null)}
      >
        <div className="mb-2 flex flex-col gap-1 text-sm text-text-muted">
          <p>{t('progress', { passed: run.passed, total: run.total })}</p>
          {run.practice && <p>{t('practiceNote')}</p>}
        </div>
        <ExerciseCard
          key={turn}
          exercise={current}
          source="lesson"
          contentLanguage={language}
          onAnswered={handleAnswered}
          onNext={() => advance(lastPassed)}
          onSkip={() => advance(false)}
          onAskAi={askAi}
        />
        <LessonChat
          lessonId={lesson.id}
          open={chatOpen}
          onToggle={() => setChatOpen((open) => !open)}
          askAbout={askAbout}
          onClearAskAbout={() => setAskAbout(null)}
        />
      </FocusLayout>
    );
  }

  const startLabel = lesson.completed ? t('practiceAgain') : lesson.passedExerciseIds.length > 0 ? t('continue') : t('start');
  const markDoneBlock = (
    <div className="flex flex-col items-start gap-3">
      <Button type="button" size="lg" disabled={marking} onClick={() => markDone(lesson)} className="min-h-12 w-full md:w-auto">
        <Check aria-hidden />
        {t('markDone')}
      </Button>
      {markError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{markError}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* A practice batch runs in focus mode: the lesson page waits, hidden, behind it. */}
      <div hidden={practiceActive} className="flex flex-col gap-6">
        <nav>
          <BackLink label={t('backToTree')} />
        </nav>
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="min-w-0 flex-1 text-3xl leading-tight md:text-4xl">{pickText(lesson.title, language)}</h1>
          <LanguageToggle value={language} onChange={setLanguage} label={tToggle('lesson')} />
        </header>
        {lesson.prerequisites.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-text-muted">{t('buildsOn')}</span>
            {lesson.prerequisites.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                <Link href={`/lesson/${p.id}`} className="inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-primary underline-offset-4 hover:underline">
                  {p.title}
                </Link>
                <Badge variant="outline" className={p.done ? 'border-success/60 text-success' : 'text-text-muted'}>
                  {p.done ? <Check aria-hidden /> : <Circle aria-hidden />}
                  {p.done ? t('prerequisiteDone') : t('prerequisiteNotDone')}
                </Badge>
              </span>
            ))}
          </div>
        )}
        {lesson.explanation && (
          <p className="max-w-[65ch] text-base leading-[1.6] whitespace-pre-line md:text-lg md:leading-[1.6]">{pickText(lesson.explanation, language)}</p>
        )}
        {lesson.examples && lesson.examples.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl">{t('examples')}</h2>
            <ul className="flex flex-col gap-3">
              {lesson.examples.map((example, index) => (
                <li key={index}>
                  <blockquote className="relative rounded-xl border border-border bg-surface py-3 pr-4 pl-12 text-lg leading-snug font-semibold">
                    <span aria-hidden className="absolute top-1 left-3 font-heading text-4xl leading-none font-extrabold text-primary">
                      „
                    </span>
                    {pickText(example, language)}
                  </blockquote>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lesson.exercises.length === 0 ? (
          lesson.completed ? (
            <p className="flex items-center gap-2 font-semibold text-success">
              <CircleCheck aria-hidden className="size-5 shrink-0" />
              {t('done')}
            </p>
          ) : (
            markDoneBlock
          )
        ) : !run ? (
          // A practice batch in progress is already marked seen; starting a lesson run would unmount it.
          // Phones: pinned above the floating buttons, in the thumb zone. From 768 px it sits in the flow.
          !practiceActive && (
            <div className="sticky bottom-[8.75rem] z-[5] md:static">
              <Button type="button" size="lg" onClick={() => startRun(lesson)} className="min-h-12 w-full text-base font-semibold shadow-lg md:w-auto md:px-8 md:shadow-none">
                <Play aria-hidden />
                {startLabel}
              </Button>
            </div>
          )
        ) : (
          <Card className="gap-4 px-5 py-5 md:px-6">
            {run.practice ? (
              <p className="font-semibold">{t('practiceFinished')}</p>
            ) : completedNow || lesson.completed ? (
              <p className="flex items-start gap-2 font-semibold text-success">
                <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
                <span>{t('completedNow')}</span>
              </p>
            ) : (
              // I-1: an admin deleted the lesson's remaining unpassed exercises, so this run
              // started with nothing pending; offer the same "Mark as done" path as an
              // exercise-less lesson instead of a dead-end "All exercises passed" message.
              markDoneBlock
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="lg" className="min-h-11">
                <Link href="/queue">{t('toQueue')}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-11">
                <Link href="/">{t('backToTree')}</Link>
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Spec Phase 2: practice only on a lesson the student has completed themselves, and not
          while a lesson run is showing an exercise. */}
      {lesson.completed && <PracticeRun lessonId={lesson.id} contentLanguage={language} onAskAi={practiceAskAi} onActiveChange={setPracticeActive} />}
      <LessonChat
        lessonId={lesson.id}
        open={chatOpen}
        onToggle={() => setChatOpen((open) => !open)}
        askAbout={askAbout}
        onClearAskAbout={() => setAskAbout(null)}
      />
      <Celebration show={celebrate} />
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Button asChild variant="ghost" className="-ml-3 min-h-11 text-text-muted hover:text-text">
      <Link href="/">
        <ArrowLeft aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
