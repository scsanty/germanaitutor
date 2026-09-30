'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LessonView } from '@/lib/tutoring/progressTypes';
import type { AttemptOutcome } from '@/lib/tutoring/lessonAnswers';
import { ExerciseCard } from './ExerciseCard';
import { PracticeRun } from './PracticeRun';
import type { GradeResult } from '@/lib/tutoring/grading';
import { LessonChat, type AskAbout } from './LessonChat';
import { useApiErrorText } from '@/components/useApiErrorText';

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

  function startRun(lesson: OpenLesson) {
    const practice = lesson.completed;
    const passed = new Set(lesson.passedExerciseIds);
    const pending = lesson.exercises.map((e) => e.id).filter((id) => practice || !passed.has(id));
    setRun({ pending, total: lesson.exercises.length, passed: lesson.exercises.length - pending.length, practice });
    setTurn((n) => n + 1);
  }

  function handleAnswered(outcome: AttemptOutcome) {
    setLastPassed(outcome.result !== 'wrong');
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

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (notFound) {
    return (
      <div>
        <p role="alert">{t('notFound')}</p>
        <Link href="/">{t('backToTree')}</Link>
      </div>
    );
  }
  if (!view) return <p>{tCommon('loading')}</p>;
  if (view.locked) {
    return (
      <div>
        <nav>
          <Link href="/">{t('backToTree')}</Link>
        </nav>
        <h1>{view.title}</h1>
        <p>{t('locked', { level: view.unlocksAfter })}</p>
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

  return (
    <div>
      <nav>
        <Link href="/">{t('backToTree')}</Link>
      </nav>
      <h1>{lesson.title}</h1>
      {lesson.prerequisites.length > 0 && (
        <p>
          {t('buildsOn')}{' '}
          {lesson.prerequisites.map((p, index) => (
            <span key={p.id}>
              {index > 0 && ', '}
              <Link href={`/lesson/${p.id}`}>{p.title}</Link> ({p.done ? t('prerequisiteDone') : t('prerequisiteNotDone')})
            </span>
          ))}
        </p>
      )}
      {lesson.explanation && <p>{lesson.explanation}</p>}
      {lesson.examples && lesson.examples.length > 0 && (
        <div>
          <h2>{t('examples')}</h2>
          <ul>
            {lesson.examples.map((example, index) => (
              <li key={index}>{example}</li>
            ))}
          </ul>
        </div>
      )}

      {lesson.exercises.length === 0 ? (
        lesson.completed ? (
          <p>{t('done')}</p>
        ) : (
          <div>
            <button type="button" disabled={marking} onClick={() => markDone(lesson)}>
              {t('markDone')}
            </button>
            {markError && <p role="alert">{markError}</p>}
          </div>
        )
      ) : !run ? (
        // A practice batch in progress is already marked seen; starting a lesson run would unmount it.
        !practiceActive && (
          <button type="button" onClick={() => startRun(lesson)}>
            {lesson.completed ? t('practiceAgain') : lesson.passedExerciseIds.length > 0 ? t('continue') : t('start')}
          </button>
        )
      ) : current ? (
        <div>
          <p>{t('progress', { passed: run.passed, total: run.total })}</p>
          {run.practice && <p>{t('practiceNote')}</p>}
          <ExerciseCard
            key={turn}
            exercise={current}
            source="lesson"
            onAnswered={handleAnswered}
            onNext={() => advance(lastPassed)}
            onSkip={() => advance(false)}
            onAskAi={askAi}
          />
        </div>
      ) : (
        <div>
          {run.practice ? (
            <p>{t('practiceFinished')}</p>
          ) : completedNow || lesson.completed ? (
            <p>{t('completedNow')}</p>
          ) : (
            // I-1: an admin deleted the lesson's remaining unpassed exercises, so this run
            // started with nothing pending; offer the same "Mark as done" path as an
            // exercise-less lesson instead of a dead-end "All exercises passed" message.
            <div>
              <button type="button" disabled={marking} onClick={() => markDone(lesson)}>
                {t('markDone')}
              </button>
              {markError && <p role="alert">{markError}</p>}
            </div>
          )}
          <Link href="/">{t('backToTree')}</Link> <Link href="/queue">{t('toQueue')}</Link>
        </div>
      )}

      {/* Spec Phase 2: practice only on a lesson the student has completed themselves, and not
          while a lesson run is showing an exercise. */}
      {lesson.completed && !current && <PracticeRun lessonId={lesson.id} onAskAi={practiceAskAi} onActiveChange={setPracticeActive} />}
      <LessonChat
        lessonId={lesson.id}
        open={chatOpen}
        onToggle={() => setChatOpen((open) => !open)}
        askAbout={askAbout}
        onClearAskAbout={() => setAskAbout(null)}
      />
    </div>
  );
}
