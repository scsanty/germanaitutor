'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useApiErrorText } from '@/components/useApiErrorText';

interface Token {
  text: string;
  // Set for a word: the sentence it sits in, saved with it as the example.
  sentence?: string;
}

const WORD = /\p{L}(?:[\p{L}'’-]*\p{L})?/gu;
const SENTENCE = /[^.!?…]*(?:[.!?…]+["'“”»«)]*|$)/gu;

// Splits text into words and the plain text between them (spaces, punctuation, digits).
function tokenize(text: string, sentence?: string): Token[] {
  const sentences: { start: number; end: number; text: string }[] = [];
  for (const m of text.matchAll(SENTENCE)) {
    if (m[0]) sentences.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() });
  }
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index) });
    const own = sentences.find((s) => m.index >= s.start && m.index < s.end)?.text ?? text;
    tokens.push({ text: m[0], sentence: sentence ?? own });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

type SaveState = { saving: boolean; saved?: string; error?: string };

// Spec: every German word in an AI message is a tap target that saves it to the deck.
// I9: one shared popover, anchored to whichever word was tapped, rather than one per word.
export function TappableGerman({ text, sentence }: { text: string; sentence?: string }) {
  const t = useTranslations('deck');
  const errorText = useApiErrorText();
  const tokens = useMemo(() => tokenize(text, sentence), [text, sentence]);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const request = useRef(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [state, setState] = useState<SaveState>({ saving: false });

  function pick(index: number, button: HTMLButtonElement) {
    anchor.current = button;
    request.current += 1;
    setPicked(index);
    setState({ saving: false });
  }

  async function save() {
    if (picked === null) return;
    const { text: word, sentence: example } = tokens[picked];
    const id = ++request.current;
    setState({ saving: true });
    try {
      const res = await fetch('/api/flashcards/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, sentence: example, source: 'freestyle' }),
      });
      const data = await res.json().catch(() => ({}));
      if (id !== request.current) return;
      if (res.ok) setState({ saving: false, saved: (data as { lemma?: string }).lemma ?? word });
      else setState({ saving: false, error: errorText(data, t('saveFailed')) });
    } catch {
      if (id === request.current) setState({ saving: false, error: t('saveFailed') });
    }
  }

  return (
    <Popover open={picked !== null} onOpenChange={(open) => !open && setPicked(null)}>
      <PopoverAnchor virtualRef={anchor} />
      <span>
        {tokens.map((token, i) =>
          token.sentence === undefined ? (
            <span key={i}>{token.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={picked === i}
              onClick={(e) => pick(i, e.currentTarget)}
              className="cursor-pointer rounded-sm underline decoration-text-muted/40 decoration-dotted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-expanded:bg-primary/15 aria-expanded:text-primary motion-reduce:transition-none"
            >
              {token.text}
            </button>
          )
        )}
      </span>
      <PopoverContent
        className="flex w-60 flex-col gap-2 p-3"
        aria-label={picked !== null ? tokens[picked].text : undefined}
        onCloseAutoFocus={(e) => {
          // No Radix trigger here, so hand focus back to the tapped word ourselves.
          e.preventDefault();
          anchor.current?.focus();
        }}
      >
        {picked !== null && <p className="font-heading text-lg font-bold">{tokens[picked].text}</p>}
        {state.saved ? (
          <p role="status" className="text-sm font-medium text-success">
            {t('saved', { lemma: state.saved })}
          </p>
        ) : (
          <Button size="sm" className="min-h-11" disabled={state.saving} onClick={() => void save()}>
            {state.saving ? t('saving') : t('saveToDeck')}
          </Button>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
