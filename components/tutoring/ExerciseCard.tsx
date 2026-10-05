'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import type { AttemptOutcome, AttemptSource, FlashcardRating, LessonAnswer } from '@/lib/tutoring/lessonAnswers';
import type { GradeResult } from '@/lib/tutoring/grading';
import type { PracticeGradeOutcome } from '@/lib/tutoring/practiceViews';
import type { TestOutAnswerOutcome } from '@/lib/tutoring/testOutViews';
import { LanguageToggle } from '@/components/LanguageToggle';
import { differsByLanguage, pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import { useApiErrorText } from '@/components/useApiErrorText';
import { useExerciseShortcuts } from '@/components/focus/useExerciseShortcuts';
import { useSound } from '@/lib/sound/useSound';
import { Check, CircleAlert, MessageCircle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const RATINGS: FlashcardRating[] = ['knew', 'sort_of', 'didnt_know'];

// The task text: 1.25rem, the loudest thing on the card.
const TASK = 'text-xl leading-snug font-semibold whitespace-pre-line';
// Check / Next / Show answer: full width, in the thumb zone at the bottom of the focus layout.
const PRIMARY = 'min-h-12 w-full text-base font-semibold';
// The action area stays at the bottom of the screen while a long task scrolls.
const FOOTER = 'sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pt-3 pb-1';

const RESULT_STYLE: Record<GradeResult, { icon: typeof Check; box: string; text: string }> = {
  correct: { icon: Check, box: 'border-success/50 bg-success/10', text: 'text-success' },
  almost: { icon: CircleAlert, box: 'border-warning/50 bg-warning/10', text: 'text-warning' },
  wrong: { icon: X, box: 'border-danger/50 bg-danger/10', text: 'text-danger' },
};

export interface ExerciseCardProps {
  exercise: ExerciseView;
  source: AttemptSource;
  contentLanguage?: ContentLanguage;
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
  feedback: LocalizedText | null;
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

export function instructionText(exercise: ExerciseView, language: ContentLanguage): string | null {
  return 'instruction' in exercise && exercise.instruction ? pickText(exercise.instruction, language) : null;
}

// The instruction (in the given language) followed by the stimulus text when there is one.
export function ExerciseHeading({ exercise, language }: { exercise: ExerciseView; language: ContentLanguage }) {
  const instruction = instructionText(exercise, language);
  const task = taskText(exercise);
  return (
    <div className="flex flex-col gap-2">
      {instruction && <p className="text-sm text-text-muted">{instruction}</p>}
      {task && <p className={TASK}>{task}</p>}
    </div>
  );
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
  contentLanguage,
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
  const tFocus = useTranslations('focus');
  const playSound = useSound();
  const errorText = useApiErrorText();
  const locale = useLocale() as ContentLanguage;
  const tToggle = useTranslations('languageToggle');
  const language = contentLanguage ?? locale;
  const [feedbackLanguage, setFeedbackLanguage] = useState<ContentLanguage>(locale);
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
        // Sound only where feedback is shown; 'almost' counts as correct.
        const graded = (data as { result: GradeResult }).result;
        playSound(graded === 'wrong' ? 'wrong' : 'correct');
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
      // 400 bad_request: not the next question (another tab moved the attempt on).
      if (test && (res.status === 404 || res.status === 409 || (res.status === 400 && data?.code === 'bad_request'))) {
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

  const instruction = instructionText(exercise, language);

  // Focus-mode shortcuts (1-4 pick an option, Enter checks or continues). Esc belongs to FocusLayout.
  useExerciseShortcuts({
    onPick: (index) => {
      if (!shown && exercise.type === 'multiple_choice' && index < exercise.options.length) setSelectedIndex(index);
    },
    onEnter: () => {
      if (shown) onNext();
      else if (exercise.type === 'flashcard') {
        if (!revealed) setRevealed(true);
      } else if (!busy) {
        const ready = currentAnswer();
        if (ready) submit(ready);
      }
    },
  });
  const keysHint = <p className="hidden text-center text-xs text-text-muted lg:block">{tFocus('keysHint')}</p>;

  const alerts = (
    <>
      {gradingError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p>
              {t.rich('gradingFailed', {
                error: gradingError,
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
    </>
  );

  if (shown) {
    // Practice (spec Phase 2): the right answer only when the student missed it. Lessons keep
    // Phase 1's rule of also showing the model answer for correct free text.
    const showAnswer =
      exercise.type !== 'flashcard' &&
      shown.correctAnswer !== null &&
      (shown.result !== 'correct' || (mode === 'lesson' && exercise.type === 'free_text'));
    const style = RESULT_STYLE[shown.result];
    const ResultIcon = style.icon;
    return (
      <div className="flex flex-1 flex-col gap-6">
        <ExerciseHeading exercise={exercise} language={language} />
        {exercise.type === 'flashcard' && <p className="rounded-xl border border-border bg-surface p-4 text-lg">{exercise.back}</p>}
        <div className={FOOTER}>
          {/* The result rises from the bottom (200 ms; none under reduced motion). */}
          <div className={cn('flex animate-rise-in flex-col gap-2 rounded-2xl border-2 p-4', style.box)}>
            <p className={cn('flex items-center gap-2 font-heading text-lg font-extrabold', style.text)}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-current/15">
                <ResultIcon aria-hidden className="size-4" strokeWidth={3} />
              </span>
              <span>{mode === 'practice' ? t(`practiceResult.${shown.result}`) : t(`result.${shown.result}`)}</span>
            </p>
            {showAnswer && (
              <p className="font-semibold">
                {exercise.type === 'free_text'
                  ? t('modelAnswer', { answer: shown.correctAnswer ?? '' })
                  : t('correctAnswer', { answer: shown.correctAnswer ?? '' })}
              </p>
            )}
            {shown.feedback && (
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm leading-relaxed">{t('feedback', { feedback: pickText(shown.feedback, feedbackLanguage) })}</p>
                {/* Legacy plain-text feedback and English-only feedback read the same either way. */}
                {differsByLanguage(shown.feedback) && <LanguageToggle value={feedbackLanguage} onChange={setFeedbackLanguage} label={tToggle('feedback')} />}
              </div>
            )}
          </div>
          {exercise.type !== 'flashcard' && onAskAi && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onAskAi(exercise.id, { answerText: shown.answerText, result: shown.result })}
              className="min-h-11 w-full"
            >
              <MessageCircle aria-hidden />
              {t('askAi')}
            </Button>
          )}
          <Button type="button" size="lg" onClick={onNext} className={PRIMARY}>
            {t('next')}
          </Button>
          {keysHint}
        </div>
      </div>
    );
  }

  if (exercise.type === 'flashcard') {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-6 text-center shadow-sm">
          <p className="font-heading text-2xl font-extrabold">{exercise.front}</p>
          {revealed && (
            <p className="animate-rise-in border-t border-border pt-3 text-lg text-text-muted">{exercise.back}</p>
          )}
        </div>
        <div className={FOOTER}>
          {revealed ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {RATINGS.map((rating) => (
                <Button key={rating} type="button" variant="secondary" disabled={busy} onClick={() => submit({ type: 'flashcard', rating })} className="min-h-12 border border-border">
                  {t(`rating.${rating}`)}
                </Button>
              ))}
            </div>
          ) : (
            <Button type="button" size="lg" onClick={() => setRevealed(true)} className={PRIMARY}>
              {t('showAnswer')}
            </Button>
          )}
          {alerts}
          {keysHint}
        </div>
      </div>
    );
  }

  const answer = currentAnswer();
  return (
    <div className="flex flex-1 flex-col gap-6">
      {instruction && <p className="text-sm text-text-muted">{instruction}</p>}
      {exercise.type === 'multiple_choice' && (
        <fieldset aria-label={exercise.question ? undefined : (instruction ?? undefined)} className="m-0 min-w-0 border-0 p-0">
          {exercise.question && <legend className={cn(TASK, 'mb-4 p-0')}>{exercise.question}</legend>}
          <RadioGroup
            value={selectedIndex === null ? '' : String(selectedIndex)}
            onValueChange={(value) => setSelectedIndex(Number(value))}
            className="gap-2.5"
          >
            {exercise.options.map((option, index) => {
              const id = `exercise-${exercise.id}-option-${index}`;
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
      {exercise.type === 'fill_blank' && (
        <div className="flex flex-col gap-4">
          <p className={TASK}>{exercise.textWithBlank}</p>
          <Input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className="h-12 text-lg md:text-lg" />
        </div>
      )}
      {exercise.type === 'free_text' && (
        <div className="flex flex-col gap-4">
          <p className={TASK}>{exercise.prompt}</p>
          <Textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="min-h-32 text-base md:text-base" />
        </div>
      )}
      <div className={FOOTER}>
        {alerts}
        <Button type="button" size="lg" disabled={busy || answer === null} onClick={() => answer && submit(answer)} className={PRIMARY}>
          {busy ? t('submitting') : t('submit')}
        </Button>
        {/* M-4: a lesson run has its own retry round for a plain error, but the Daily Queue and a
            practice batch do not, so any error there — not only a grading failure — needs a way
            forward. */}
        {mode !== 'test' && (gradingError || ((source === 'queue' || mode === 'practice') && error)) && (
          <Button type="button" variant="secondary" onClick={onSkip} className="min-h-11 w-full">
            {t('skipForNow')}
          </Button>
        )}
        {keysHint}
      </div>
    </div>
  );
}
