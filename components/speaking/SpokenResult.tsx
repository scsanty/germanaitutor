'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PronunciationBox } from '@/components/speech/PronunciationBox';
import { useScopeCleanup } from '@/components/speech/useScopeCleanup';
import { CriterionCards } from '@/components/writing/CriterionCards';
import type { PracticeResult } from '@/lib/exam/practiceViews';
import { differsByLanguage, pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { WritingRubric } from '@/lib/writing/rubric';
import { ConversationList } from './ConversationList';

// Spec: the spoken Teil result: the total, the criterion cards, the pronunciation estimate, the conversation with
// the student's lines marked up, and the summary. Leaving it deletes the attempt's recordings (the scores stay).
// A stored result (B2) has no conversation any more, and says so.
export function SpokenResult({ result, rubric, attemptId, partnerName }: { result: PracticeResult; rubric: WritingRubric; attemptId: number; partnerName?: string }) {
  const t = useTranslations('speaking');
  const tWriting = useTranslations('writing');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const id = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  useScopeCleanup(`teil:${attemptId}`);
  const { grade, turns } = result.spoken!;
  const tips = result.tips;
  const toggle = differsByLanguage(grade.summary) || grade.criteria.some((c) => differsByLanguage(c.justification)) || (tips ?? []).some(differsByLanguage);

  function play(clipId: string) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/api/speech/clip/${encodeURIComponent(clipId)}`;
    try {
      void Promise.resolve(audio.play()).catch(() => {});
    } catch {
      // ignored
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">{tWriting('points', { points: grade.points, max: grade.maxPoints, percent: grade.percent })}</p>
        {toggle && <LanguageToggle value={language} onChange={setLanguage} label={tWriting('feedbackLanguage')} />}
      </div>

      <CriterionCards rubric={rubric} criteria={grade.criteria} tips={tips} language={language} headingId={`${id}-criteria`} />

      {grade.estimate && <PronunciationBox estimate={grade.estimate} comment={grade.pronunciation ?? undefined} />}

      <section aria-labelledby={`${id}-conversation`} className="flex flex-col gap-3">
        <h3 id={`${id}-conversation`} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {t('conversation')}
        </h3>
        {turns.length === 0 ? (
          <p className="text-sm text-text-muted">{t('conversationDeleted')}</p>
        ) : (
          <>
            <ConversationList
              turns={turns}
              partnerName={partnerName ?? t('partnerLabel')}
              onPlay={play}
              canPlay={() => true}
              marksFor={(index) => grade.marks.filter((m) => m.turnIndex === index)}
            />
            {/* One player for every line; the line's text is its transcript. */}
            <audio ref={audioRef} className="hidden" />
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-summary`} className="flex flex-col gap-1">
        <h3 id={`${id}-summary`} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {tWriting('summary')}
        </h3>
        <p className="leading-relaxed">{pickText(grade.summary, language)}</p>
      </section>
    </div>
  );
}
