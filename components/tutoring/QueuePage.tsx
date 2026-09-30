'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DailyQueue, QueueItem } from '@/lib/tutoring/progressTypes';
import { ExerciseCard } from './ExerciseCard';
import { LessonChat, type AskAbout } from './LessonChat';

// Spec: Pages and Navigation, `/queue` — due reviews one at a time, with the same grading and
// "Ask AI" as inside a lesson, then one suggested next lesson.
export function QueuePage() {
  const t = useTranslations('queue');
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

  if (failed) return <p role="alert">{t('loadFailed')}</p>;
  if (!queue) return <p>{tCommon('loading')}</p>;

  const current = pending[0] ?? null;
  return (
    <div>
      <nav>
        <Link href="/">{t('backToTree')}</Link>
      </nav>
      <h1>{t('title')}</h1>
      {current ? (
        <div>
          <p>{t('remaining', { count: pending.length })}</p>
          <p>{t('fromLesson', { lesson: current.lessonTitle })}</p>
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
      ) : (
        <p>{answered > 0 ? t('allDone') : queue.answeredToday >= queue.cap ? t('capReached') : t('nothingDue')}</p>
      )}
      <h2>{t('nextLesson')}</h2>
      {queue.suggestedLesson ? (
        <Link href={`/lesson/${queue.suggestedLesson.id}`}>{queue.suggestedLesson.title}</Link>
      ) : (
        <p>{t('noSuggestion')}</p>
      )}
    </div>
  );
}
