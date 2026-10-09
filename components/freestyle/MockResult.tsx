'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TeilReview } from '@/components/exam/TeilReview';
import type { ExamFormat } from '@/lib/exam/formats';
import type { MockRun, PracticeResult } from '@/lib/exam/practiceViews';
import { pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import { cn } from '@/lib/utils';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Spec: the mock result: each part's points, then the total against the written block's pass ratio.
// I17: the mock holds only the parts with a runner, so the verdict is labelled "so far".
export function MockResult({ format, mock, results }: { format: ExamFormat; mock: MockRun; results: PracticeResult[] }) {
  const t = useTranslations('exam');
  const locale = useLocale() as ContentLanguage;
  const block = format.blocks.find((b) => b.id === 'written');
  const score = round2(results.reduce((s, r) => s + r.score, 0));
  const max = round2(results.reduce((s, r) => s + r.maxScore, 0));
  const passed = max > 0 && score / max >= (block?.passRatio ?? 0.6);
  const params = { block: block ? pickText(block.title, locale) : format.name, score, max };

  return (
    <section aria-labelledby="mock-result" className="flex flex-col gap-4">
      <h1 id="mock-result" className="text-2xl font-semibold">
        {t('mockResultTitle')}
      </h1>
      <ul className="flex flex-col gap-1">
        {results.map((r, i) => (
          <li key={r.attemptId}>{t('mockPartScore', { part: mock.runs[i]?.part.title.de ?? '', score: r.score, max: r.maxScore })}</li>
        ))}
      </ul>
      <p className={cn('rounded-xl border px-4 py-3 text-lg font-semibold', passed ? 'border-success/50 bg-success/10' : 'border-danger/50 bg-danger/10')}>
        {passed ? t('mockPassed', params) : t('mockFailed', params)}
      </p>
      <p className="text-sm text-text-muted">{t('mockSoFar')}</p>
      {results.map((r, i) =>
        mock.runs[i] ? (
          <details key={r.attemptId} className="rounded-xl border border-border px-4 py-3">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              {t('review')}: <span lang="de">{mock.runs[i].part.title.de}</span>
            </summary>
            <div className="pt-3">
              <TeilReview result={r} run={mock.runs[i]} />
            </div>
          </details>
        ) : null
      )}
    </section>
  );
}
