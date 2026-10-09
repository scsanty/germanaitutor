'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, MessageCircleQuestion, X } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { differsByLanguage, pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { ItemReview, PracticeResult, PracticeRun } from '@/lib/exam/practiceViews';
import type { MatchingView } from '@/lib/tasks/matching';
import type { PassageQuestionsView } from '@/lib/tasks/passageQuestions';
import { cn } from '@/lib/utils';

const QUESTION_LIMIT = 500;

export const percentOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0);

// What each reviewed item refers to: the question, the matching item, or the gap number.
function itemLabel(run: PracticeRun, index: number, gapLabel: (n: number) => string): string {
  const view = run.set.view;
  if (run.part.taskType === 'passage_questions') return (view as PassageQuestionsView).questions[index]?.question ?? '';
  if (run.part.taskType === 'matching') return (view as MatchingView).items[index] ?? '';
  return gapLabel(index + 1);
}

function AskAbout({ attemptId, itemIndex }: { attemptId: number; itemIndex: number }) {
  const t = useTranslations('exam');
  const errorText = useApiErrorText();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asking = useRef(false);

  async function ask() {
    if (asking.current || !question.trim()) return;
    asking.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/exam-practice/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, itemIndex, question: question.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('askFailed')));
        return;
      }
      setReply(String((data as { reply?: unknown }).reply ?? ''));
    } catch {
      setError(t('askFailed'));
    } finally {
      asking.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="min-h-11 self-start" onClick={() => setOpen(true)}>
        <MessageCircleQuestion aria-hidden />
        {t('askAbout')}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void ask();
      }}
    >
      <label htmlFor={`${id}-q`} className="text-sm font-medium">
        {t('question')}
      </label>
      <Textarea id={`${id}-q`} value={question} maxLength={QUESTION_LIMIT} onChange={(e) => setQuestion(e.target.value)} disabled={busy} rows={2} />
      <Button type="submit" size="sm" className="min-h-11 self-start" disabled={busy || !question.trim()}>
        {busy ? t('asking') : t('ask')}
      </Button>
      {/* I7: on failure the stored explanation stays; the error sits beside it. */}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {reply && <p className="rounded-lg bg-surface px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">{reply}</p>}
    </form>
  );
}

// Spec: the review after a Teil: score, overtime, and per item right/wrong with the stored explanation.
export function TeilReview({ result, run }: { result: PracticeResult; run: PracticeRun }) {
  const t = useTranslations('exam');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const toggle = result.review.some((r) => differsByLanguage(r.explanation));
  const none = run.part.taskType === 'matching';
  const shown = (text: string) => (text === '' ? t('unanswered') : none && text === 'x' ? t('none') : text);

  return (
    <section aria-labelledby="teil-review" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="teil-review" lang="de" className="font-heading text-xl font-bold">
            {run.part.title.de}
          </h2>
          <p className="text-lg font-semibold">
            {t('score', { score: result.score, max: result.maxScore, percent: percentOf(result.score, result.maxScore) })}
          </p>
          {result.overtimeSeconds > 0 && <p className="text-sm text-danger">{t('overtime', { minutes: Math.ceil(result.overtimeSeconds / 60) })}</p>}
        </div>
        {toggle && <LanguageToggle value={language} onChange={setLanguage} label={t('explanationLanguage')} />}
      </div>
      <ol className="flex flex-col gap-3">
        {result.review.map((item: ItemReview) => (
          <li
            key={item.index}
            className={cn('flex flex-col gap-2 rounded-xl border px-4 py-3', item.right ? 'border-success/50 bg-success/10' : 'border-danger/50 bg-danger/10')}
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 pt-0.5">
                {item.right ? <Check aria-hidden className="size-5 text-success" /> : <X aria-hidden className="size-5 text-danger" />}
                <span className="sr-only">{item.right ? t('right') : t('wrong')}</span>
              </span>
              <p lang="de" className="flex-1 font-medium leading-relaxed">
                {item.index + 1}. {itemLabel(run, item.index, (n) => t('gap', { n }))}
              </p>
            </div>
            <p className="text-sm">{t('yourAnswer', { answer: shown(item.answerText) })}</p>
            <p className={cn('text-sm', !item.right && 'font-semibold')}>{t('rightAnswer', { answer: shown(item.correct) })}</p>
            {pickText(item.explanation, language).trim() && (
              <p className="text-sm leading-relaxed text-text-muted">{pickText(item.explanation, language)}</p>
            )}
            <AskAbout attemptId={result.attemptId} itemIndex={item.index} />
          </li>
        ))}
      </ol>
    </section>
  );
}
