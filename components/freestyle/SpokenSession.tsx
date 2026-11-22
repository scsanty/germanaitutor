'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import { MicButton } from '@/components/speech/MicButton';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { SessionMessage, SessionView } from '@/lib/freestyle/sessionViews';
import { CorrectionList, readCorrections } from './CorrectionList';
import { TappableGerman } from './TappableGerman';

const SCOPE = 'freestyle:spoken';
const clipOf = (message: SessionMessage) => (typeof message.extra?.clipId === 'string' ? message.extra.clipId : null);

// Spoken conversation: tap to talk, the transcript with its corrections, and the partner's reply as text with
// its audio (played as it arrives). The recordings live in the `freestyle:spoken` scope until End.
export function SpokenSession({ session, onMessages }: { session: SessionView; onMessages: (added: SessionMessage[]) => void }) {
  const t = useTranslations('freestyle');
  const tSpeech = useTranslations('speech');
  const tAudio = useTranslations('audio');
  const errorText = useApiErrorText();
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<{ clipId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only a failure that can succeed on a second try (not a 400 about this recording) offers Try again.
  const [retryable, setRetryable] = useState(false);
  const busy = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const played = useRef(new Set<string>());
  const end = useRef<HTMLDivElement>(null);
  const { messages } = session;

  function play(clipId: string) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/api/speech/clip/${encodeURIComponent(clipId)}`;
    try {
      void Promise.resolve(audio.play()).catch(() => {});
    } catch {
      // Autoplay refused: the reply's play button is there.
    }
  }

  // The newest reply plays once, as it arrives (an opener or a resumed session never autoplays).
  const seeded = useRef(false);
  useEffect(() => {
    const last = messages.at(-1);
    const clipId = last && last.role === 'assistant' && last.extra?.audio === true ? clipOf(last) : null;
    if (!seeded.current) {
      seeded.current = true;
      if (clipId) played.current.add(clipId);
      return;
    }
    if (clipId && !played.current.has(clipId)) {
      played.current.add(clipId);
      play(clipId);
    }
  }, [messages]);

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView?.({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }, [messages.length, pending]);

  async function send(clipId: string, text: string) {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setPending({ clipId, text });
    setError(null);
    setRetryable(false);
    try {
      const res = await fetch('/api/freestyle/spoken/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('sendFailed')));
        setRetryable(res.status !== 400);
        if (res.status === 400) setPending(null);
        return;
      }
      setPending(null);
      onMessages((data as { messages: SessionMessage[] }).messages);
    } catch {
      setError(t('sendFailed'));
      setRetryable(true);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  let replies = 0;
  return (
    <div data-mode="spoken" className="flex flex-col gap-4">
      <ol aria-label={t('thread')} className="flex flex-col gap-3">
        {messages.map((message) => {
          if (message.role === 'user') {
            const corrections = readCorrections(message.extra?.corrections);
            return (
              <li key={message.id} className="flex flex-col items-end gap-2">
                <p lang="de" className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-2.5 leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                {corrections.length > 0 && <CorrectionList corrections={corrections} className="w-full max-w-[85%] rounded-xl border border-border bg-surface px-4 py-3" />}
              </li>
            );
          }
          replies += 1;
          const clipId = message.extra?.audio === true ? clipOf(message) : null;
          const noAudio = message.extra !== null && message.extra.audio === false;
          return (
            <li key={message.id} className="flex flex-col items-start gap-1">
              <div className="flex max-w-[85%] items-start gap-2">
                <p lang="de" className="rounded-2xl rounded-bl-sm bg-surface-raised px-4 py-2.5 leading-relaxed whitespace-pre-wrap">
                  <TappableGerman text={message.content} />
                </p>
                {clipId && (
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t('playReply', { n: replies })} onClick={() => play(clipId)}>
                    <Play aria-hidden />
                  </Button>
                )}
              </div>
              {noAudio && <p className="text-xs text-text-muted">{tAudio('unavailable')}</p>}
            </li>
          );
        })}
        {pending && (
          <li className="flex flex-col items-end">
            <p lang="de" className="max-w-[85%] rounded-2xl rounded-br-sm border border-dashed border-primary/40 px-4 py-2.5 leading-relaxed">
              {pending.text}
            </p>
          </li>
        )}
      </ol>
      {/* One player for every reply. */}
      <audio ref={audioRef} className="hidden" />
      <div className="sticky bottom-[8.75rem] z-[5] flex flex-col items-center gap-3 rounded-xl border border-border bg-background/95 p-3 backdrop-blur md:bottom-0 md:rounded-none md:border-x-0 md:border-b-0">
        {error && (
          <Alert variant="destructive" role="alert" className="w-full">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p role="status" className={sending ? 'text-sm text-text-muted' : 'sr-only'}>
          {sending ? t('replying') : ''}
        </p>
        {error && pending && retryable && !sending && (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void send(pending.clipId, pending.text)}>
            {tSpeech('tryAgain')}
          </Button>
        )}
        {!sending && <p className="text-sm font-medium">{t('speakYourTurn')}</p>}
        {/* Recording again is always possible; a new recording replaces a failed one. */}
        <MicButton
          scope={SCOPE}
          disabled={sending}
          onTranscript={(r) => {
            setPending(null);
            void send(r.clipId, r.text);
          }}
        />
      </div>
      <div ref={end} aria-hidden className="scroll-mb-40 md:scroll-mb-0" />
    </div>
  );
}
