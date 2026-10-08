'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// Until the Writing module's shared German keyboard helper lands.
const LETTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

// Buttons that type a German letter at the cursor of `box`. Shared by the chat and writing composers.
export function GermanLetters({
  box,
  value,
  onChange,
  disabled,
}: {
  box: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('freestyle');

  function insert(letter: string) {
    const el = box.current;
    const start = el?.selectionStart ?? value.length;
    const stop = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + letter + value.slice(stop));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + letter.length, start + letter.length);
    });
  }

  return (
    <div role="group" aria-label={t('germanLetters')} className="flex flex-wrap gap-1">
      {LETTERS.map((letter) => (
        <Button
          key={letter}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="min-h-11 min-w-11 px-0 text-base"
          // Keep the cursor in the text box.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(letter)}
        >
          {letter}
        </Button>
      ))}
    </div>
  );
}
