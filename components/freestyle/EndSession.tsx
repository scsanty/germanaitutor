'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { differsByLanguage, pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import type { FreestyleMode } from '@/lib/freestyle/modes';
import type { SessionSummary } from '@/lib/freestyle/sessionViews';

type Phase = 'closed' | 'confirm' | 'ending' | 'failed' | 'summary';
type WordResult = { kind: 'saved' | 'already' | 'failed'; text: string };

// Spec: End shows the summary once (what went well, recurring mistakes, words to save), then the session is gone.
export function EndSession({ mode, onEnded }: { mode: FreestyleMode; onEnded: () => void }) {
  const t = useTranslations('freestyle');
  const tDeck = useTranslations('deck');
  const errorText = useApiErrorText();
  const locale = useLocale() as ContentLanguage;
  const [phase, setPhase] = useState<Phase>('closed');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, WordResult>>({});
  const [saving, setSaving] = useState(false);
  // A ref as well as state: a second click can land before the re-render that disables the buttons.
  const busy = useRef(false);

  async function end(skipSummary: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPhase('ending');
    setError(null);
    try {
      const res = await fetch(`/api/freestyle/${mode}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skipSummary ? { skipSummary: true } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('endFailed')));
        setPhase('failed');
        return;
      }
      const result = (data as { summary?: SessionSummary | null }).summary ?? null;
      if (!result) {
        onEnded();
        return;
      }
      setSummary(result);
      setChosen(new Set(result.words.map((w) => w.lemma)));
      setPhase('summary');
    } catch {
      setError(t('endFailed'));
      setPhase('failed');
    } finally {
      busy.current = false;
    }
  }

  async function saveSelected() {
    if (!summary || busy.current) return;
    busy.current = true;
    setSaving(true);
    // In sequence: each word goes through the AI, and the deck checks duplicates one at a time.
    for (const { lemma } of summary.words) {
      if (!chosen.has(lemma) || results[lemma]?.kind === 'saved' || results[lemma]?.kind === 'already') continue;
      let result: WordResult;
      try {
        const res = await fetch('/api/flashcards/words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: lemma, source: 'freestyle' }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) result = { kind: 'saved', text: tDeck('saved', { lemma: (data as { lemma?: string }).lemma ?? lemma }) };
        else if (res.status === 409) result = { kind: 'already', text: t('alreadyIn', { lemma }) };
        else result = { kind: 'failed', text: t('saveWordFailed', { lemma, error: errorText(data, tDeck('saveFailed')) }) };
      } catch {
        result = { kind: 'failed', text: t('saveWordFailed', { lemma, error: tDeck('saveFailed') }) };
      }
      setResults((current) => ({ ...current, [lemma]: result }));
    }
    busy.current = false;
    setSaving(false);
  }

  function onOpenChange(open: boolean) {
    if (open) return;
    // The session is gone once the summary shows; closing it is the same as Done.
    if (phase === 'summary') {
      if (!saving) onEnded();
    } else if (phase === 'confirm' || phase === 'failed') setPhase('closed');
  }

  const items: LocalizedText[] = summary ? [...summary.wentWell, ...summary.mistakes] : [];
  const toggle = items.some(differsByLanguage);
  const pending = summary?.words.filter((w) => chosen.has(w.lemma) && !['saved', 'already'].includes(results[w.lemma]?.kind ?? '')) ?? [];

  return (
    <>
      <Button type="button" variant="outline" className="ml-auto min-h-11" onClick={() => setPhase('confirm')}>
        {t('end')}
      </Button>
      <AlertDialog open={phase !== 'closed'} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          {phase !== 'summary' || !summary ? (
            <>
              <AlertDialogTitle>{t('endTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('endBody')}</AlertDialogDescription>
              {phase === 'failed' && error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                {phase === 'failed' ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => void end(true)}>
                      {t('endWithoutSummary')}
                    </Button>
                    <Button type="button" onClick={() => void end(false)}>
                      {t('tryAgain')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" disabled={phase === 'ending'} onClick={() => setPhase('closed')}>
                      {t('cancel')}
                    </Button>
                    <Button type="button" disabled={phase === 'ending'} onClick={() => void end(false)}>
                      {phase === 'ending' ? t('ending') : t('endConfirm')}
                    </Button>
                  </>
                )}
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <AlertDialogTitle>{t('summaryTitle')}</AlertDialogTitle>
                {toggle && <LanguageToggle value={language} onChange={setLanguage} label={t('summaryLanguage')} />}
              </div>
              <AlertDialogDescription className="sr-only">{t('endBody')}</AlertDialogDescription>
              <SummaryList title={t('wentWell')} items={summary.wentWell} language={language} />
              <SummaryList title={t('mistakes')} items={summary.mistakes} language={language} />
              <section className="flex flex-col gap-2">
                <h3 className="font-heading text-base font-bold">{t('wordsToSave')}</h3>
                {summary.words.length === 0 ? (
                  <p className="text-sm text-text-muted">{t('noWordsToSave')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {summary.words.map((w, i) => {
                      const result = results[w.lemma];
                      const settled = result?.kind === 'saved' || result?.kind === 'already';
                      return (
                        <li key={w.lemma} className="flex flex-col gap-1">
                          <div className="flex min-h-11 items-center gap-3">
                            <Checkbox
                              id={`end-word-${i}`}
                              checked={chosen.has(w.lemma)}
                              disabled={saving || settled}
                              onCheckedChange={(checked) =>
                                setChosen((current) => {
                                  const next = new Set(current);
                                  if (checked === true) next.add(w.lemma);
                                  else next.delete(w.lemma);
                                  return next;
                                })
                              }
                            />
                            <label htmlFor={`end-word-${i}`} className="flex flex-wrap gap-x-2">
                              <span lang="de" className="font-medium">
                                {w.lemma}
                              </span>
                              <span className="text-text-muted">{w.meaningEn}</span>
                            </label>
                          </div>
                          {result && (
                            <p className={result.kind === 'failed' ? 'text-sm text-danger' : 'text-sm text-text-muted'}>{result.text}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <AlertDialogFooter>
                {summary.words.length > 0 && (
                  <Button type="button" variant="outline" disabled={saving || pending.length === 0} onClick={() => void saveSelected()}>
                    {saving ? tDeck('saving') : t('saveSelected')}
                  </Button>
                )}
                <Button type="button" disabled={saving} onClick={onEnded}>
                  {t('done')}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SummaryList({ title, items, language }: { title: string; items: LocalizedText[]; language: ContentLanguage }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-heading text-base font-bold">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i}>{pickText(item, language)}</li>
        ))}
      </ul>
    </section>
  );
}
