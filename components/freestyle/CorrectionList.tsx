'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { differsByLanguage, isLocalizedText, pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { Correction } from '@/lib/freestyle/replies';
import { cn } from '@/lib/utils';

// Reads `extra.corrections` from a stored message; anything malformed is dropped.
export function readCorrections(value: unknown): Correction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is Correction =>
      !!c && typeof c === 'object' && typeof c.wrong === 'string' && typeof c.right === 'string' && isLocalizedText(c.reason)
  );
}

// S22: shared by ChatThread and the writing screen. One language toggle per list (S20: only when a reason differs).
export function CorrectionList({ corrections, className }: { corrections: Correction[]; className?: string }) {
  const t = useTranslations('freestyle');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  if (corrections.length === 0) return null;
  const toggle = corrections.some((c) => differsByLanguage(c.reason));

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <ul aria-label={t('corrections')} className="flex min-w-0 flex-1 flex-col gap-2">
        {corrections.map((c, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-sm leading-relaxed">
            <span>
              <s className="text-danger decoration-2">{c.wrong}</s>
              <span className="mx-1.5 text-text-muted">→</span>
              <strong className="font-semibold text-success">{c.right}</strong>
            </span>
            <span className="text-text-muted">{pickText(c.reason, language)}</span>
          </li>
        ))}
      </ul>
      {toggle && <LanguageToggle value={language} onChange={setLanguage} label={t('correctionLanguage')} />}
    </div>
  );
}
