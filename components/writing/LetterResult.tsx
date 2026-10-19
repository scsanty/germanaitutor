'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { differsByLanguage, pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import type { LetterGrade } from '@/lib/writing/letterGrading';
import type { WritingRubric } from '@/lib/writing/rubric';
import { cn } from '@/lib/utils';
import { MarkedText } from './MarkedText';

const criterionMax = (points: Partial<Record<string, number>>) => Math.max(0, ...Object.values(points).map((p) => p ?? 0));

// Spec: the result of a graded letter: the marked-up letter, the criterion cards, the total, the corrected
// version (side by side on wide screens), the summary, and optionally "Copy into free writing".
export function LetterResult({
  grade,
  text,
  rubric,
  tips,
  onCopyToFreestyle,
  copyBusy = false,
}: {
  grade: LetterGrade;
  text: string;
  rubric: WritingRubric;
  // I16: a Teil set's tip per criterion, in rubric order.
  tips?: LocalizedText[];
  onCopyToFreestyle?: () => void;
  copyBusy?: boolean;
}) {
  const t = useTranslations('writing');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const [showCorrected, setShowCorrected] = useState(false);
  const id = useId();
  const toggle =
    differsByLanguage(grade.summary) || grade.criteria.some((c) => differsByLanguage(c.justification)) || (tips ?? []).some(differsByLanguage);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">{t('points', { points: grade.points, max: grade.maxPoints, percent: grade.percent })}</p>
        {toggle && <LanguageToggle value={language} onChange={setLanguage} label={t('feedbackLanguage')} />}
      </div>

      <section aria-labelledby={`${id}-letter`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${id}-letter`} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            {t('yourLetter')}
          </h3>
          <Button type="button" variant="outline" size="sm" className="min-h-11" aria-pressed={showCorrected} onClick={() => setShowCorrected((on) => !on)}>
            {t('corrected')}
          </Button>
        </div>
        <div className={cn('grid gap-3', showCorrected && 'md:grid-cols-2')}>
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <MarkedText text={text.normalize('NFC')} marks={grade.marks} />
            {grade.marks.length === 0 && <p className="mt-2 text-sm text-text-muted">{t('noMarks')}</p>}
          </div>
          {showCorrected && (
            <div className="flex flex-col gap-1 rounded-xl border border-success/40 bg-success/5 px-4 py-3">
              <h3 className="text-xs font-semibold tracking-wide text-success uppercase">{t('corrected')}</h3>
              <p lang="de" className="leading-loose whitespace-pre-wrap">
                {grade.corrected}
              </p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby={`${id}-criteria`} className="flex flex-col gap-3">
        <h3 id={`${id}-criteria`} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {t('criteria')}
        </h3>
        <ul className="flex flex-col gap-3">
          {rubric.criteria.map((criterion, i) => {
            const graded = grade.criteria.find((c) => c.id === criterion.id);
            if (!graded) return null;
            const name = pickText(criterion.name, locale);
            const tip = tips?.[i] ? pickText(tips[i], language).trim() : '';
            return (
              <li key={criterion.id} aria-label={name} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{name}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{t('grade', { grade: graded.grade })}</Badge>
                    <span className="text-sm text-text-muted tabular-nums">
                      {t('criterionPoints', { points: criterion.points[graded.grade] ?? 0, max: criterionMax(criterion.points) })}
                    </span>
                  </span>
                </div>
                {pickText(graded.justification, language).trim() && <p className="text-sm leading-relaxed">{pickText(graded.justification, language)}</p>}
                {tip && <p className="text-sm leading-relaxed text-text-muted">{t('tip', { tip })}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={`${id}-summary`} className="flex flex-col gap-1">
        <h3 id={`${id}-summary`} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {t('summary')}
        </h3>
        <p className="leading-relaxed">{pickText(grade.summary, language)}</p>
      </section>

      {onCopyToFreestyle && (
        <Button type="button" variant="secondary" className="min-h-11 self-start" disabled={copyBusy} onClick={onCopyToFreestyle}>
          <Copy aria-hidden />
          {copyBusy ? t('copying') : t('copyToFreestyle')}
        </Button>
      )}
    </div>
  );
}
