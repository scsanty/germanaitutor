'use client';

import { Fragment, useId, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
// I2: type-only, since lib/audio/transcript imports node:crypto.
import type { ParsedTranscript } from '@/lib/audio/transcript';

interface Span {
  start: number;
  end: number;
  questions: number[];
}

// The evidence ranges inside one line's text, merged where they overlap, in reading order.
export function evidenceSpans(text: string, lineIndex: number, evidence: (string | null)[], evidenceLines?: (number | null)[]): Span[] {
  const found: Span[] = [];
  evidence.forEach((e, qi) => {
    if (!e) return;
    // S5: the server says which line holds each evidence string; without that, any line containing it.
    const line = evidenceLines?.[qi];
    if (line !== undefined && line !== null && line !== lineIndex) return;
    if (line === null && evidenceLines) return;
    const start = text.indexOf(e);
    if (start >= 0) found.push({ start, end: start + e.length, questions: [qi + 1] });
  });
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of found) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      last.questions.push(...s.questions);
    } else merged.push({ ...s, questions: [...s.questions] });
  }
  for (const m of merged) m.questions.sort((a, b) => a - b);
  return merged;
}

// Spec: after answering, the transcript with every question's evidence highlighted. German content.
export function TranscriptReveal({
  transcript,
  evidence,
  evidenceLines,
}: {
  transcript: ParsedTranscript;
  evidence: (string | null)[];
  evidenceLines?: (number | null)[];
}) {
  const t = useTranslations('audio');
  const locale = useLocale();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <h3 id={headingId} className="text-sm font-semibold text-text-muted">
        {t('transcript')}
      </h3>
      <ol lang="de" className="flex flex-col gap-2 text-base leading-relaxed">
        {transcript.lines.map((line, li) => {
          const spans = evidenceSpans(line.text, li, evidence, evidenceLines);
          const parts: ReactNode[] = [];
          let at = 0;
          spans.forEach((s, si) => {
            if (s.start > at) parts.push(<Fragment key={`t${si}`}>{line.text.slice(at, s.start)}</Fragment>);
            parts.push(
              <Fragment key={`m${si}`}>
                <mark className="rounded bg-warning/25 px-0.5 text-foreground">{line.text.slice(s.start, s.end)}</mark>
                <sup className="ml-0.5 text-xs font-semibold text-text-muted">
                  {/* UI language inside the German transcript, so it isn't read with German pronunciation. */}
                  <span lang={locale} className="sr-only">
                    {t(s.questions.length > 1 ? 'evidenceForMany' : 'evidenceFor', { n: s.questions.join(', ') })}
                  </span>
                  <span aria-hidden>{s.questions.join(',')}</span>
                </sup>
              </Fragment>
            );
            at = s.end;
          });
          if (at < line.text.length) parts.push(<Fragment key="rest">{line.text.slice(at)}</Fragment>);
          return (
            <li key={li}>
              <span className="font-semibold">{line.label}:</span> {parts}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
