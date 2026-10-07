'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';

const SECTION = 'flex flex-col gap-3 rounded-2xl border border-border bg-surface px-5 py-5';
const FIELD = 'h-11 text-base';

// Adds a word the student typed (source 'manual'); the AI finds the lemma, so it needs a provider (S29).
export function AddWord({ aiAvailable, onAdded }: { aiAvailable: boolean; onAdded: () => void }) {
  const t = useTranslations('deck');
  const errorText = useApiErrorText();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!word.trim() || busy) return;
    setBusy(true);
    setSaved(null);
    setError(null);
    try {
      const res = await fetch('/api/flashcards/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), source: 'manual' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('saveFailed')));
        return;
      }
      setSaved(t('saved', { lemma: (data as { lemma: string }).lemma }));
      setWord('');
      onAdded();
    } catch {
      setError(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className={SECTION}>
      <label htmlFor="deck-add-word" className="font-heading text-lg font-bold">
        {t('addWord')}
      </label>
      {!aiAvailable && (
        <Alert role="alert">
          <AlertDescription>
            <span>{t('noAi')}</span>{' '}
            <Link href="/settings" className="font-medium underline">
              {t('openSettings')}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <p id="deck-add-hint" className="text-sm text-text-muted">
        {t('addHint')}
      </p>
      <div className="flex gap-2">
        <Input
          id="deck-add-word"
          lang="de"
          autoComplete="off"
          aria-describedby="deck-add-hint"
          className={FIELD}
          value={word}
          disabled={!aiAvailable}
          onChange={(e) => setWord(e.target.value)}
        />
        <Button type="submit" className="min-h-11" disabled={!aiAvailable || busy || !word.trim()}>
          {busy ? t('adding') : t('add')}
        </Button>
      </div>
      {saved && (
        <p role="status" className="text-sm text-success">
          {saved}
        </p>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

type Found = { itemId: number; lemma: string; meaning: LocalizedText };

// I14: nothing is fetched until the student types; the route returns a bare array.
export function WordSearch() {
  const t = useTranslations('deck');
  const locale = useLocale() as ContentLanguage;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      setFailed(false);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      fetch(`/api/flashcards/words?query=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as Found[];
          if (!stale) {
            setFound(data);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!stale) setFailed(true);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className={SECTION}>
      <label htmlFor="deck-search" className="font-heading text-lg font-bold">
        {t('search')}
      </label>
      <Input id="deck-search" type="search" lang="de" autoComplete="off" className={FIELD} value={query} onChange={(e) => setQuery(e.target.value)} />
      {failed && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('searchFailed')}</AlertDescription>
        </Alert>
      )}
      {found && found.length === 0 && <p className="text-sm text-text-muted">{t('noMatches')}</p>}
      {found && found.length > 0 && (
        <ul aria-label={t('search')} className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {found.map((w) => (
            <li key={w.itemId} className="flex flex-wrap gap-x-3 py-2">
              <span lang="de" className="font-medium">
                {w.lemma}
              </span>
              <span className="text-text-muted">{pickText(w.meaning, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The deck's own daily limits, saved on blur through PATCH /api/profile.
export function DeckLimits({ newWordsPerDay, deckReviewCap, onSaved }: { newWordsPerDay: number; deckReviewCap: number; onSaved: () => void }) {
  const t = useTranslations('deck');
  return (
    <section className={SECTION}>
      <h2 className="font-heading text-lg font-bold">{t('limits')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <LimitField id="deck-new-per-day" field="newWordsPerDay" label={t('newPerDay')} initial={newWordsPerDay} min={0} max={50} onSaved={onSaved} />
        <LimitField id="deck-review-cap" field="deckReviewCap" label={t('reviewLimit')} initial={deckReviewCap} min={1} max={500} onSaved={onSaved} />
      </div>
    </section>
  );
}

function LimitField(props: { id: string; field: 'newWordsPerDay' | 'deckReviewCap'; label: string; initial: number; min: number; max: number; onSaved: () => void }) {
  const { id, field, label, initial, min, max, onSaved } = props;
  const t = useTranslations('deck');
  const errorText = useApiErrorText();
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stored = useRef(initial);

  async function save() {
    const text = value.trim();
    if (text === String(stored.current)) return;
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The server validates the range; an empty or non-number entry goes as null and comes back as its error.
        body: JSON.stringify({ [field]: /^\d+$/.test(text) ? Number(text) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('limitFailed')));
        return;
      }
      stored.current = Number(text);
      setDone(true);
      onSaved();
    } catch {
      setError(t('limitFailed'));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className={FIELD}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setDone(false);
        }}
        onBlur={() => void save()}
      />
      {done && (
        <p role="status" className="text-sm text-text-muted">
          {t('limitSaved')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
