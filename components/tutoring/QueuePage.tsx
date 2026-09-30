'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DailyQueue, QueueItem } from '@/lib/tutoring/progressTypes';
import { ExerciseCard } from './ExerciseCard';
import { LessonChat, type AskAbout } from './LessonChat';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { ONWARD, ResultCard } from '@/components/focus/ResultCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, CircleCheck, Clock, Sparkles } from 'lucide-react';

// Spec: Pages and Navigation, `/queue` — due reviews one at a time, with the same grading and
// "Ask AI" as inside a lesson, then one suggested next lesson.
export function QueuePage() {
  const t = useTranslations('queue');
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [queue, setQueue] = useState<DailyQueue | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [answered, setAnswered] = useState(0);
  const [turn, setTurn] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [askAbout, setAskAbout] = useState<AskAbout | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutoring/queue')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as DailyQueue;
        if (cancelled) return;
        setQueue(data);
        setPending(data.items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function moveOn() {
    setTurn((n) => n + 1);
    setChatOpen(false);
    setAskAbout(null);
  }

  function next() {
    setPending((items) => items.slice(1));
    moveOn();
  }

  // A review whose free-text grading failed goes to the back of today's queue.
  function skip() {
    setPending((items) => (items.length > 1 ? [...items.slice(1), items[0]] : items));
    moveOn();
  }

  if (failed)
    return (
      <Alert variant="destructive" role="alert" className="mx-auto max-w-md">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  if (!queue)
    return (
      <div role="status" aria-label={tCommon('loading')} className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-8">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );

  const current = pending[0] ?? null;
  if (current) {
    // Focus mode. An empty or finished queue (below) has nothing at stake, so no FocusLayout.
    return (
      <FocusLayout
        progress={{ current: Math.max(1, queue.items.length - pending.length + 1), total: Math.max(1, queue.items.length) }}
        confirmExit={answered > 0}
        onExit={() => router.push('/')}
      >
        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex flex-col gap-1 text-sm text-text-muted">
            <p>{t('remaining', { count: pending.length })}</p>
            <p>{t('fromLesson', { lesson: current.lessonTitle })}</p>
          </div>
          <ExerciseCard
            key={turn}
            exercise={current.exercise}
            source="queue"
            onAnswered={() => setAnswered((n) => n + 1)}
            onNext={next}
            onSkip={skip}
            onAskAi={(exerciseId) => {
              setAskAbout({ kind: 'exercise', exerciseId, label: t('thisReview') });
              setChatOpen(true);
            }}
          />
          <LessonChat
            key={current.lessonId}
            lessonId={current.lessonId}
            open={chatOpen}
            onToggle={() => setChatOpen((open) => !open)}
            askAbout={askAbout}
            onClearAskAbout={() => setAskAbout(null)}
          />
        </div>
      </FocusLayout>
    );
  }
  const status = answered > 0 ? 'allDone' : queue.answeredToday >= queue.cap ? 'capReached' : 'nothingDue';
  const icon = status === 'allDone' ? CircleCheck : status === 'capReached' ? Clock : Sparkles;
  return (
    <div className="flex flex-col py-4 md:py-10">
      <ResultCard icon={icon} tone={status === 'allDone' ? 'success' : 'primary'}>
        <h1 className="text-3xl md:text-4xl">{t('title')}</h1>
        <p className="max-w-[40ch] text-text-muted">{t(status)}</p>
        <div className="mt-2 flex w-full flex-col gap-3 border-t border-border pt-5">
          <h2 className="text-lg">{t('nextLesson')}</h2>
          {queue.suggestedLesson ? (
            <Button asChild size="lg" className={ONWARD}>
              <Link href={`/lesson/${queue.suggestedLesson.id}`}>
                <BookOpen aria-hidden />
                {queue.suggestedLesson.title}
              </Link>
            </Button>
          ) : (
            <p className="text-text-muted">{t('noSuggestion')}</p>
          )}
          <nav className="flex flex-col">
            <Button asChild size="lg" variant={queue.suggestedLesson ? 'secondary' : 'default'} className={ONWARD}>
              <Link href="/">{t('backToTree')}</Link>
            </Button>
          </nav>
        </div>
      </ResultCard>
    </div>
  );
}
