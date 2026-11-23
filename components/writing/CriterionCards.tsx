'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import type { Grade, WritingRubric } from '@/lib/writing/rubric';

const criterionMax = (points: Partial<Record<string, number>>) => Math.max(0, ...Object.values(points).map((p) => p ?? 0));

// One card per rubric criterion: the grade, its points, the justification and the set's tip. Shared by the
// letter and the spoken results (S16).
export function CriterionCards({
  rubric,
  criteria,
  tips,
  language,
  headingId,
}: {
  rubric: WritingRubric;
  criteria: { id: string; grade: Grade; justification: LocalizedText }[];
  // I16: a Teil set's tip per criterion, in rubric order.
  tips?: LocalizedText[];
  // The feedback language the result's toggle chose.
  language: ContentLanguage;
  headingId: string;
}) {
  const t = useTranslations('writing');
  const locale = useLocale() as ContentLanguage;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
        {t('criteria')}
      </h3>
      <ul className="flex flex-col gap-3">
        {rubric.criteria.map((criterion, i) => {
          const graded = criteria.find((c) => c.id === criterion.id);
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
  );
}
