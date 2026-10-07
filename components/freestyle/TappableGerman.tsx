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

// Two letters or more: a lone letter (z in "z.B.", a list's "a") is not worth saving.
const WORD = /\p{L}[\p{L}'’-]*\p{L}/gu;
const SENTENCE_END = /[.!?…]+["'“”»«)]*/gu;
// A full stop after one of these, or after a number ("am 3. Mai"), does not end the sentence.
const ABBREVIATIONS = new Set(['z.b.', 'dr.', 'usw.', 'bzw.', 'ca.', 'd.h.', 'u.a.']);

function endsSentence(text: string, index: number, length: number): boolean {
  const after = text[index + length];
  if (after !== undefined && !/\s/u.test(after)) return false; // "3.5", "www.example.de"
  if (text[index] !== '.' || length > 1) return true;
  const chunk = text.slice(0, index + 1).match(/[^\s"'“”„»«(]+$/u)?.[0] ?? '';
  return !ABBREVIATIONS.has(chunk.toLowerCase()) && !/^\d+\.$/u.test(chunk);
}

export function splitSentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let start = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    if (!endsSentence(text, m.index, m[0].length)) continue;
    const end = m.index + m[0].length;
    out.push({ start, end, text: text.slice(start, end).trim() });
    start = end;
  }
  if (text.slice(start).trim()) out.push({ start, end: text.length, text: text.slice(start).trim() });
  return out;
}

// Splits text into words and the plain text between them (spaces, punctuation, digits).
function tokenize(text: string, sentence?: string): Token[] {
  const sentences = splitSentences(text);
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
  // Set when the popover closes because the student tapped elsewhere: focus then stays where they went.
  const closedByOutside = useRef(false);
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
        onInteractOutside={() => {
          closedByOutside.current = true;
        }}
        onCloseAutoFocus={(e) => {
          // No Radix trigger here, so on Escape we hand focus back to the tapped word ourselves.
          e.preventDefault();
          if (!closedByOutside.current) anchor.current?.focus();
          closedByOutside.current = false;
        }}
      >
        {picked !== null && <p lang="de" className="font-heading text-lg font-bold">{tokens[picked].text}</p>}
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
