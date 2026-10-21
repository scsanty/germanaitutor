'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useUmlautRow } from './useUmlautRow';

const LETTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

type Field = HTMLInputElement | HTMLTextAreaElement;

// Inserts at the caret of `el`, replacing any selection, and keeps focus there. React's onChange fires
// because the value is set through the prototype setter (past React's own value tracker).
export function insertAtCaret(el: Field, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  if (el.maxLength >= 0 && next.length > el.maxLength) return;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  setter.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  el.setSelectionRange(start + text.length, start + text.length);
}

export function UmlautRow({ target, disabled }: { target: () => Field | null; disabled?: boolean }) {
  const t = useTranslations('typing');
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('umlauts')}>
      {LETTERS.map((letter) => (
        <Button
          key={letter}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={t('insert', { letter })}
          className="min-h-11 min-w-11 px-0 text-base"
          // Keep the caret in the field: stop the button taking focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = target();
            if (el) insertAtCaret(el, letter);
          }}
        >
          {letter}
        </Button>
      ))}
    </div>
  );
}

// The "äöü" toggle and, when open, the letter row. One per field, or one shared by several (cloze gaps).
export function UmlautControls({ target, disabled }: { target: () => Field | null; disabled?: boolean }) {
  const [open, toggle] = useUmlautRow();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={open}
        disabled={disabled}
        className="min-h-11 min-w-11"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        äöü
      </Button>
      {open && <UmlautRow target={target} disabled={disabled} />}
    </div>
  );
}
