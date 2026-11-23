'use client';

import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkedText, type TextMark } from '@/components/writing/MarkedText';
import type { SpokenTurnView } from '@/lib/exam/practiceViews';
import { cn } from '@/lib/utils';

// A spoken Teil conversation, line by line: who spoke, what was said (German), and a play button for lines
// that have audio. Lines without audio say so (B3).
export function ConversationList({
  turns,
  partnerName,
  onPlay,
  canPlay,
  marksFor,
  pending,
}: {
  turns: SpokenTurnView[];
  partnerName: string;
  onPlay: (clipId: string) => void;
  // Which lines get a play button.
  canPlay: (turn: SpokenTurnView) => boolean;
  // The result: marks on a student line, by its index in `turns`.
  marksFor?: (index: number) => TextMark[];
  // A student line sent but not answered yet.
  pending?: string | null;
}) {
  const t = useTranslations('speaking');
  const tAudio = useTranslations('audio');
  const label = (speaker: SpokenTurnView['speaker']) => (speaker === 'student' ? t('you') : speaker === 'examiner' ? t('examiner') : partnerName);
  return (
    <ol className="flex flex-col gap-3">
      {turns.map((turn, i) => {
        const student = turn.speaker === 'student';
        const marks = student && marksFor ? marksFor(i) : [];
        return (
          <li key={turn.clipId} className={cn('flex flex-col gap-1 rounded-xl border px-4 py-3', student ? 'ml-6 border-primary/40 bg-primary/5' : 'mr-6 border-border bg-surface')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">{label(turn.speaker)}</span>
              {turn.audio && canPlay(turn) && (
                <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t('play', { n: i + 1, speaker: label(turn.speaker) })} onClick={() => onPlay(turn.clipId)}>
                  <Play aria-hidden />
                </Button>
              )}
            </div>
            {marks.length > 0 ? (
              <MarkedText text={turn.text.normalize('NFC')} marks={marks} />
            ) : (
              <p lang="de" className="leading-relaxed">{turn.text}</p>
            )}
            {!turn.audio && !student && <p className="text-xs text-text-muted">{tAudio('unavailable')}</p>}
          </li>
        );
      })}
      {pending && (
        <li className="ml-6 flex flex-col gap-1 rounded-xl border border-dashed border-primary/40 px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">{t('you')}</span>
          <p lang="de" className="leading-relaxed">{pending}</p>
        </li>
      )}
    </ol>
  );
}
