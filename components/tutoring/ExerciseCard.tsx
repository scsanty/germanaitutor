'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptOutcome, AttemptSource, FlashcardRating, LessonAnswer } from '@/lib/tutoring/lessonAnswers';
import { useApiErrorText } from '@/components/useApiErrorText';

const RATINGS: FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

export interface ExerciseCardProps {
  exercise: ExerciseView;
  source: AttemptSource;
  onAnswered: (outcome: AttemptOutcome) => void;
  onNext: () => void;
  onSkip: () => void;
  onAskAi?: (exerciseId: string) => void;
}

function taskText(exercise: ExerciseView): string {
  switch (exercise.type) {
    case 'multiple_choice':
      return exercise.question;
    case 'fill_blank':
      return exercise.textWithBlank;
    case 'flashcard':
      return exercise.front;
    case 'free_text':
      return exercise.prompt;
  }
}

export function ExerciseCard({ exercise, source, onAnswered, onNext, onSkip, onAskAi }: ExerciseCardProps) {
  const t = useTranslations('exercise');
  const errorText = useApiErrorText();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);

  async function submit(answer: LessonAnswer) {
    setBusy(true);
    setError(null);
    setGradingError(null);
    try {
      const res = await fetch('/api/tutoring/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: exercise.id, answer, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOutcome(data as AttemptOutcome);
        onAnswered(data as AttemptOutcome);
        return;
      }
      const detail = errorText(data, String(res.status));
      // 502: the AI could not grade the answer (spec: AI Behavior).
      if (res.status === 502) setGradingError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function currentAnswer(): LessonAnswer | null {
    if (exercise.type === 'multiple_choice') {
      return selectedIndex === null ? null : { type: 'multiple_choice', selectedIndex };
    }
    if (exercise.type === 'flashcard') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    return exercise.type === 'fill_blank' ? { type: 'fill_blank', text: trimmed } : { type: 'free_text', text: trimmed };
  }

  const alerts = (
    <>
      {gradingError && (
        <p role="alert">
          {t.rich('gradingFailed', {
            error: gradingError,
            link: (chunks) => <Link href="/settings">{chunks}</Link>,
          })}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );

  if (outcome) {
    const showAnswer =
      exercise.type !== 'flashcard' &&
      outcome.correctAnswer !== null &&
      (outcome.result !== 'correct' || exercise.type === 'free_text');
    return (
      <div>
        <p>{taskText(exercise)}</p>
        {exercise.type === 'flashcard' && <p>{exercise.back}</p>}
        <p>{t(`result.${outcome.result}`)}</p>
        {showAnswer && (
          <p>
            {exercise.type === 'free_text'
              ? t('modelAnswer', { answer: outcome.correctAnswer ?? '' })
              : t('correctAnswer', { answer: outcome.correctAnswer ?? '' })}
          </p>
        )}
        {outcome.feedback && <p>{t('feedback', { feedback: outcome.feedback })}</p>}
        {exercise.type !== 'flashcard' && onAskAi && (
          <button type="button" onClick={() => onAskAi(exercise.id)}>
            {t('askAi')}
          </button>
        )}
        <button type="button" onClick={onNext}>
          {t('next')}
        </button>
      </div>
    );
  }

  if (exercise.type === 'flashcard') {
    return (
      <div>
        <p>{exercise.front}</p>
        {revealed ? (
          <div>
            <p>{exercise.back}</p>
            {RATINGS.map((rating) => (
              <button key={rating} type="button" disabled={busy} onClick={() => submit({ type: 'flashcard', rating })}>
                {t(`rating.${rating}`)}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setRevealed(true)}>
            {t('showAnswer')}
          </button>
        )}
        {alerts}
      </div>
    );
  }

  const answer = currentAnswer();
  return (
    <div>
      {exercise.type === 'multiple_choice' && (
        <fieldset>
          <legend>{exercise.question}</legend>
          {exercise.options.map((option, index) => (
            <label key={index}>
              <input
                type="radio"
                name={`exercise-${exercise.id}`}
                checked={selectedIndex === index}
                onChange={() => setSelectedIndex(index)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      )}
      {exercise.type === 'fill_blank' && (
        <div>
          <p>{exercise.textWithBlank}</p>
          <input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {exercise.type === 'free_text' && (
        <div>
          <p>{exercise.prompt}</p>
          <textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <button type="button" disabled={busy || answer === null} onClick={() => answer && submit(answer)}>
        {busy ? t('submitting') : t('submit')}
      </button>
      {/* M-4: a lesson run has its own retry round for a plain error, but the Daily Queue does
          not, so any error there — not only a grading failure — needs a way forward. */}
      {(gradingError || (source === 'queue' && error)) && (
        <button type="button" onClick={onSkip}>
          {t('skipForNow')}
        </button>
      )}
      {alerts}
    </div>
  );
}
