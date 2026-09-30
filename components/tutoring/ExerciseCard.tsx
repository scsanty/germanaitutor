'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptOutcome, AttemptSource, FlashcardRating, LessonAnswer } from '@/lib/tutoring/lessonAnswers';
import type { GradeResult } from '@/lib/tutoring/grading';
import type { PracticeGradeOutcome } from '@/lib/tutoring/practiceViews';
import type { TestOutAnswerOutcome } from '@/lib/tutoring/testOutViews';
import { useApiErrorText } from '@/components/useApiErrorText';

const RATINGS: FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

export interface ExerciseCardProps {
  exercise: ExerciseView;
  source: AttemptSource;
  mode?: 'lesson' | 'practice' | 'test';
  testMilestoneId?: string;
  onTestAnswered?: (outcome: TestOutAnswerOutcome) => void;
  onTestStale?: () => void;
  onAnswered?: (outcome: AttemptOutcome) => void;
  onPracticeAnswered?: (outcome: PracticeGradeOutcome) => void;
  onNext: () => void;
  onSkip: () => void;
  onAskAi?: (exerciseId: string, answer: { answerText: string; result: GradeResult }) => void;
}

// What the card shows after an answer, in lesson or practice mode.
interface Shown {
  result: GradeResult;
  correctAnswer: string | null;
  feedback: string | null;
  answerText: string;
}

export function taskText(exercise: ExerciseView): string {
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

function answerTextOf(exercise: ExerciseView, answer: LessonAnswer): string {
  switch (answer.type) {
    case 'multiple_choice':
      return exercise.type === 'multiple_choice' ? (exercise.options[answer.selectedIndex] ?? '') : '';
    case 'fill_blank':
    case 'free_text':
      return answer.text;
    case 'flashcard':
      return answer.rating;
  }
}

export function ExerciseCard({
  exercise,
  source,
  mode = 'lesson',
  onAnswered,
  onPracticeAnswered,
  testMilestoneId,
  onTestAnswered,
  onTestStale,
  onNext,
  onSkip,
  onAskAi,
}: ExerciseCardProps) {
  const t = useTranslations('exercise');
  const errorText = useApiErrorText();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  async function submit(answer: LessonAnswer) {
    setBusy(true);
    setError(null);
    setGradingError(null);
    try {
      const practice = mode === 'practice';
      const test = mode === 'test';
      const url = test
        ? `/api/tutoring/milestones/${testMilestoneId}/testout/answer`
        : practice
          ? '/api/tutoring/practice/answer'
          : '/api/tutoring/attempts';
      const payload = test
        ? { exerciseId: exercise.id, answer }
        : practice
          ? { practiceExerciseId: exercise.id, answer }
          : { exerciseId: exercise.id, answer, source };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (test) {
          // Spec: no feedback during a test-out; the page moves on to the next question.
          onTestAnswered?.(data as TestOutAnswerOutcome);
          return;
        }
        const answerText = answerTextOf(exercise, answer);
        if (practice) {
          const outcome = data as PracticeGradeOutcome;
          setShown({ result: outcome.result, correctAnswer: outcome.correctAnswer, feedback: null, answerText });
          onPracticeAnswered?.(outcome);
        } else {
          const outcome = data as AttemptOutcome;
          setShown({ result: outcome.result, correctAnswer: outcome.correctAnswer, feedback: outcome.feedback, answerText });
          onAnswered?.(outcome);
        }
        return;
      }
      if (test && (res.status === 404 || res.status === 409)) {
        onTestStale?.();
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

  if (shown) {
    // Practice (spec Phase 2): the right answer only when the student missed it. Lessons keep
    // Phase 1's rule of also showing the model answer for correct free text.
    const showAnswer =
      exercise.type !== 'flashcard' &&
      shown.correctAnswer !== null &&
      (shown.result !== 'correct' || (mode === 'lesson' && exercise.type === 'free_text'));
    return (
      <div>
        <p>{taskText(exercise)}</p>
        {exercise.type === 'flashcard' && <p>{exercise.back}</p>}
        <p>{mode === 'practice' ? t(`practiceResult.${shown.result}`) : t(`result.${shown.result}`)}</p>
        {showAnswer && (
          <p>
            {exercise.type === 'free_text'
              ? t('modelAnswer', { answer: shown.correctAnswer ?? '' })
              : t('correctAnswer', { answer: shown.correctAnswer ?? '' })}
          </p>
        )}
        {shown.feedback && <p>{t('feedback', { feedback: shown.feedback })}</p>}
        {exercise.type !== 'flashcard' && onAskAi && (
          <button type="button" onClick={() => onAskAi(exercise.id, { answerText: shown.answerText, result: shown.result })}>
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
      {/* M-4: a lesson run has its own retry round for a plain error, but the Daily Queue and a
          practice batch do not, so any error there — not only a grading failure — needs a way
          forward. */}
      {mode !== 'test' && (gradingError || ((source === 'queue' || mode === 'practice') && error)) && (
        <button type="button" onClick={onSkip}>
          {t('skipForNow')}
        </button>
      )}
      {alerts}
    </div>
  );
}
