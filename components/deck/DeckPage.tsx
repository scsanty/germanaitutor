'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, Layers } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DeckCard, DeckView } from '@/lib/deck/deckViews';
import { AddWord, DeckLimits, WordSearch } from './DeckTools';
import { DeckReview } from './DeckReview';

// Spec: the vocabulary deck has its own queue, badge and daily limit, separate from the Daily Queue.
export function DeckPage() {
  const t = useTranslations('deck');
  const tCommon = useTranslations('common');
  const [deck, setDeck] = useState<DeckView | null>(null);
  const [failed, setFailed] = useState(false);
  // The cards still to review in this visit; a run takes them from the front.
  const [queue, setQueue] = useState<DeckCard[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [runTotal, setRunTotal] = useState(0);
  const [runAnswered, setRunAnswered] = useState(0);
  // In this visit (for the done message), and since the last load (the loaded answeredToday has the rest).
  const [reviewed, setReviewed] = useState(0);
  const [sinceLoad, setSinceLoad] = useState(0);
  // Why a card was skipped mid-run; shown on the next card, or on the overview when the run ended.
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/flashcards');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as DeckView;
      setDeck(data);
      setQueue(data.cards);
      setSinceLoad(0);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function start() {
    setNotice(null);
    setRunTotal(queue.length);
    setRunAnswered(0);
    setReviewing(true);
  }

  function next() {
    setRunAnswered((n) => n + 1);
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length === 0) setReviewing(false);
  }

  function rated() {
    setNotice(null);
    setReviewed((n) => n + 1);
    setSinceLoad((n) => n + 1);
    next();
  }

  // The card was not due any more: it leaves the run without counting as reviewed.
  function skipped(message: string) {
    setNotice(message);
    next();
  }

  // Outside a run only: a reload mid-run would swap the cards under the student.
  const refresh = useCallback(() => {
    if (!reviewing) void load();
  }, [reviewing, load]);

  if (failed && !deck)
    return (
      <Alert variant="destructive" role="alert" className="mx-auto max-w-md">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  if (!deck)
    return (
      <div role="status" aria-label={tCommon('loading')} className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );

  if (reviewing && queue[0]) {
    return (
      <DeckReview
        card={queue[0]}
        progress={{ current: runAnswered + 1, total: Math.max(1, runTotal) }}
        confirmExit={runAnswered > 0}
        notice={notice}
        onRated={rated}
        onSkipped={skipped}
        onExit={() => setReviewing(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-extrabold">{t('title')}</h1>
        <p className="text-text-muted">{t('intro')}</p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface px-5 py-5">
        {notice && (
          <Alert role="alert">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-sm">
            {t('dueNow', { count: queue.length })}
          </Badge>
          <Badge variant="outline" className="text-sm">
            {t('reviewedToday', { count: deck.answeredToday + sinceLoad })}
          </Badge>
        </div>
        {queue.length > 0 ? (
          <Button type="button" size="lg" className="min-h-12 w-full text-base font-semibold sm:w-auto sm:self-start" onClick={start}>
            <Layers aria-hidden />
            {t('startReview', { count: queue.length })}
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-text-muted">
            {reviewed > 0 && <CircleCheck aria-hidden className="size-5 text-success" />}
            {reviewed > 0 ? t('doneToday', { count: reviewed }) : t('nothingDue')}
          </p>
        )}
      </section>

      <AddWord aiAvailable={deck.aiAvailable} onAdded={refresh} />
      <WordSearch />
      <DeckLimits newWordsPerDay={deck.newWordsPerDay} deckReviewCap={deck.deckReviewCap} onSaved={refresh} />
    </div>
  );
}
