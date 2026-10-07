'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, RefreshCw, X } from 'lucide-react';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { SessionView } from '@/lib/freestyle/sessionViews';
import { cn } from '@/lib/utils';
import { TappableGerman } from './TappableGerman';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
}

interface Article {
  title: string;
  text: string;
  questions: Question[];
}

// Reads `setup.article`, written by the server; anything malformed shows no article.
function readArticle(value: unknown): Article | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  if (typeof a.title !== 'string' || typeof a.text !== 'string' || !Array.isArray(a.questions)) return null;
  const questions = a.questions.filter(
    (q): q is Question =>
      !!q &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.every((o: unknown) => typeof o === 'string') &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length
  );
  return { title: a.title, text: a.text, questions };
}

// Spec: free reading is an AI article with questions, not in exam format. Answers are checked here, not on the server.
export function ReadingSession({ session, onSession }: { session: SessionView; onSession: (view: SessionView) => void }) {
  const t = useTranslations('freestyle');
  const errorText = useApiErrorText();
  const article = readArticle(session.setup.article);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLHeadingElement>(null);

  async function another() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/freestyle/free_reading/article', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('articleFailed')));
        return;
      }
      setAnswers({});
      setChecked(false);
      onSession(data as SessionView);
      top.current?.scrollIntoView?.({ block: 'start' });
    } catch {
      setError(t('articleFailed'));
    } finally {
      setBusy(false);
    }
  }

  const questions = article?.questions ?? [];
  const wrong = questions.filter((q, i) => answers[i] !== q.correctIndex).length;

  return (
    <div className="flex flex-col gap-6">
      {article && (
        <article lang="de" className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4">
          <h2 ref={top} className="scroll-mt-24 font-heading text-xl font-bold">
            <TappableGerman text={article.title} />
          </h2>
          <div data-testid="article" className="flex flex-col gap-3 text-base leading-relaxed">
            {article.text
              .split(/\n\s*\n/)
              .filter((p) => p.trim())
              .map((paragraph, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  <TappableGerman text={paragraph.trim()} />
                </p>
              ))}
          </div>
        </article>
      )}

      {questions.length > 0 && (
        <section aria-labelledby="fr-questions" className="flex flex-col gap-4">
          <h2 id="fr-questions" className="font-heading text-lg font-bold">
            {t('questions')}
          </h2>
          <ol className="flex flex-col gap-4">
            {questions.map((q, qi) => {
              const right = answers[qi] === q.correctIndex;
              return (
                <li
                  key={`${article?.title}-${qi}`}
                  className={cn(
                    'flex flex-col gap-2 rounded-xl border border-border px-4 py-3',
                    checked && (right ? 'border-success/50 bg-success/10' : 'border-danger/50 bg-danger/10')
                  )}
                >
                  <div className="flex items-start gap-2">
                    <p id={`fr-q${qi}`} lang="de" className="flex-1 font-medium leading-relaxed">
                      <TappableGerman text={q.question} />
                    </p>
                    {checked && (
                      <span className="shrink-0">
                        {right ? <Check aria-hidden className="size-5 text-success" /> : <X aria-hidden className="size-5 text-danger" />}
                        <span className="sr-only">{right ? t('answerRight') : t('answerWrong')}</span>
                      </span>
                    )}
                  </div>
                  <RadioGroup
                    aria-labelledby={`fr-q${qi}`}
                    value={answers[qi] === undefined ? '' : String(answers[qi])}
                    onValueChange={(v) => setAnswers((a) => ({ ...a, [qi]: Number(v) }))}
                    disabled={checked || busy}
                    className="gap-1"
                  >
                    {q.options.map((option, oi) => (
                      <div key={oi} className="flex items-center gap-3">
                        <RadioGroupItem id={`fr-q${qi}-o${oi}`} value={String(oi)} className="size-5" />
                        <label htmlFor={`fr-q${qi}-o${oi}`} lang="de" className="flex-1 py-2 text-base">
                          {option}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                  {checked && !right && (
                    <p className="text-sm font-medium text-danger">
                      {t('rightAnswer', { option: q.options[q.correctIndex] })}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <p role="status" className="min-h-6 font-medium">
          {busy ? t('loadingArticle') : checked ? (wrong === 0 ? t('allRight') : t('wrongCount', { wrong, total: questions.length })) : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {questions.length > 0 && !checked && (
            <Button type="button" className="min-h-11 px-5" disabled={busy} onClick={() => setChecked(true)}>
              {t('checkAnswers')}
            </Button>
          )}
          <Button
            type="button"
            variant={checked || questions.length === 0 ? 'default' : 'outline'}
            className="min-h-11 px-5"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void another()}
          >
            <RefreshCw aria-hidden className={cn(busy && 'animate-spin motion-reduce:animate-none')} />
            {t('anotherArticle')}
          </Button>
        </div>
      </div>
    </div>
  );
}
