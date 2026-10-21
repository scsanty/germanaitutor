'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { differsByLanguage, pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import { cn } from '@/lib/utils';
// Type-only: the grading module is shared with the server.
import type { MarkType } from '@/lib/writing/letterGrading';

// What a mark needs to be shown: offsets into the text (from locateMarks), the fix and why.
export interface TextMark {
  start: number;
  end: number;
  original: string;
  correction: string;
  type?: MarkType;
  reason: LocalizedText;
}

// Spec: grammar danger, vocabulary warning, spelling primary, register highlight.
const TYPE_STYLE: Record<MarkType, { line: string; label: string }> = {
  grammar: { line: 'decoration-danger', label: 'text-danger' },
  vocabulary: { line: 'decoration-warning', label: 'text-warning' },
  spelling: { line: 'decoration-primary', label: 'text-primary' },
  register: { line: 'decoration-highlight', label: 'text-highlight' },
};

type Segment = { text: string; mark?: number };

// The plain text between marks, and each mark in place. Marks that overlap an earlier one or fall
// outside the text are left out rather than garbling it.
function segmentsOf(text: string, marks: TextMark[]): Segment[] {
  const order = marks.map((m, i) => ({ m, i })).sort((a, b) => a.m.start - b.m.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const { m, i } of order) {
    if (m.start < cursor || m.end > text.length || m.end <= m.start) continue;
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start) });
    out.push({ text: text.slice(m.start, m.end), mark: i });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

// Spec: the marked-up letter. Each mark is a button underlined in its type's colour; tapping it opens
// one shared popover with the correction, the type and the reason (with the language toggle).
export function MarkedText({ text, marks, className }: { text: string; marks: TextMark[]; className?: string }) {
  const t = useTranslations('writing');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const [picked, setPicked] = useState<number | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const segments = useMemo(() => segmentsOf(text, marks), [text, marks]);
  const mark = picked === null ? null : marks[picked];
  const style = TYPE_STYLE[mark?.type ?? 'grammar'];

  return (
    <Popover open={mark !== null} onOpenChange={(open) => !open && setPicked(null)}>
      <p lang="de" className={cn('leading-loose whitespace-pre-wrap', className)}>
        {segments.map((s, i) =>
          s.mark === undefined ? (
            <span key={i}>{s.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={picked === s.mark}
              onClick={(e) => {
                anchor.current = e.currentTarget;
                setPicked(s.mark!);
              }}
              className={cn(
                'inline cursor-pointer rounded-sm px-0.5 underline decoration-2 underline-offset-4 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-ring',
                TYPE_STYLE[marks[s.mark].type ?? 'grammar'].line,
                picked === s.mark && 'bg-surface-raised'
              )}
            >
              {s.text}
            </button>
          )
        )}
      </p>
      <PopoverAnchor virtualRef={anchor} />
      {mark && (
        <PopoverContent
          aria-label={mark.original}
          className="flex flex-col gap-2"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            anchor.current?.focus();
          }}
        >
          {mark.type && <p className={cn('text-xs font-bold tracking-wide uppercase', style.label)}>{t(`markType.${mark.type}`)}</p>}
          <p lang="de" className="text-sm leading-relaxed">
            <s className="text-danger decoration-2">{mark.original}</s>
            <span aria-hidden className="mx-1.5 text-text-muted">→</span>
            <strong className="font-semibold text-success">{mark.correction}</strong>
          </p>
          {pickText(mark.reason, language).trim() && <p className="text-sm leading-relaxed text-text-muted">{pickText(mark.reason, language)}</p>}
          {differsByLanguage(mark.reason) && <LanguageToggle value={language} onChange={setLanguage} label={t('reasonLanguage')} />}
        </PopoverContent>
      )}
    </Popover>
  );
}
