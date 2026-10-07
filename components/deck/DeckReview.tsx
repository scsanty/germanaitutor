'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { useExerciseShortcuts } from '@/components/focus/useExerciseShortcuts';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { differsByLanguage, pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { DeckCard } from '@/lib/deck/deckViews';
import { useSound } from '@/lib/sound/useSound';

const RATINGS = ['knew', 'sort_of', 'didnt_know'] as const;
type Rating = (typeof RATINGS)[number];

// Spec: the deck's own review. Front = the lemma; the back = plural, meaning (toggle when it differs), example.
// Graded Knew / Sort of / Didn't know; keys: Enter flips, 1–3 rate once flipped (I4).
export function DeckReview({
  card,
  progress,
  confirmExit,
  onRated,
  onExit,
}: {
  card: DeckCard;
  progress: { current: number; total: number };
  confirmExit: boolean;
  onRated: () => void;
  onExit: () => void;
}) {
  return (
    <FocusLayout progress={progress} confirmExit={confirmExit} onExit={onExit}>
      {/* Keyed by card, so the flip and the language reset for each card. */}
      <CardFace key={card.itemId} card={card} onRated={onRated} />
    </FocusLayout>
  );
}

function CardFace({ card, onRated }: { card: DeckCard; onRated: () => void }) {
  const t = useTranslations('deck');
  const tExercise = useTranslations('exercise');
  const tFocus = useTranslations('focus');
  const errorText = useApiErrorText();
  const play = useSound();
  const locale = useLocale() as ContentLanguage;
  const [flipped, setFlipped] = useState(false);
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref as well as state: a key and a click can both land before the re-render that disables rating.
  const sending = useRef(false);

  async function rate(rating: Rating) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/flashcards/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: card.itemId, rating }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(errorText(data, t('rateFailed')));
        return;
      }
      play(rating === 'didnt_know' ? 'wrong' : 'correct');
      onRated();
    } catch {
      setError(t('rateFailed'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  useExerciseShortcuts({
    onPick: (index) => {
      // I4: key 4 has no rating; nothing rates before the card is flipped.
      if (flipped && index < RATINGS.length) void rate(RATINGS[index]);
    },
    onEnter: () => {
      if (!flipped) setFlipped(true);
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 pt-2">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-6 text-center shadow-sm">
        <p lang="de" className="font-heading text-3xl font-extrabold break-words">
          {card.lemma}
        </p>
        {flipped && (
          <div className="flex animate-rise-in flex-col gap-3 border-t border-border pt-4">
            {card.plural && (
              <p lang="de" className="text-text-muted">
                {t('plural', { plural: card.plural })}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <p className="text-lg">{pickText(card.meaning, language)}</p>
              {differsByLanguage(card.meaning) && <LanguageToggle value={language} onChange={setLanguage} label={t('meaningLanguage')} />}
            </div>
            {card.example && (
              <p lang="de" className="text-text-muted italic">
                {card.example}
              </p>
            )}
          </div>
        )}
      </div>
      {/* FocusLayout hides the shell chrome, so the actions sit at the very bottom on a phone too. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pt-3 pb-1">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {flipped ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RATINGS.map((rating, i) => (
              <Button
                key={rating}
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void rate(rating)}
                className="min-h-12 border border-border"
              >
                <kbd aria-hidden className="hidden rounded border border-border px-1.5 text-xs text-text-muted lg:inline">
                  {i + 1}
                </kbd>
                {tExercise(`rating.${rating}`)}
              </Button>
            ))}
          </div>
        ) : (
          <Button type="button" size="lg" onClick={() => setFlipped(true)} className="min-h-12 w-full text-base font-semibold">
            {t('showAnswer')}
          </Button>
        )}
        <p className="hidden text-center text-xs text-text-muted lg:block">{tFocus('keysHint')}</p>
      </div>
    </div>
  );
}
