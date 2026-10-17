'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, RotateCcw, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const REWIND_SECONDS = 5;
const SLOW_RATE = 0.75;

function readPlays(key: string | undefined): number {
  if (!key) return 0;
  try {
    const n = Number(window.sessionStorage.getItem(key));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writePlays(key: string | undefined, n: number) {
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, String(n));
  } catch {
    // Private mode or blocked storage: the count lives in memory for this page only.
  }
}

// Spec: Replay rules. Custom controls only (no native `controls`, so an exam can't seek).
// - exam: Play/Pause, plays counted on the client per attempt. A play counts when playback starts from
//   the beginning; a resume after a pause doesn't (Review Focus 4). After `replays` plays, Play is disabled.
// - lesson: Play/Pause, −5 s and a 0.75× toggle, unlimited replays.
// `playsKey` (exam) keeps the count in sessionStorage, so a reload within the same attempt keeps it.
export function AudioPlayer({
  hash,
  available,
  mode,
  replays,
  playsKey,
}: {
  hash: string;
  available: boolean;
  mode: 'lesson' | 'exam';
  replays?: number;
  playsKey?: string;
}) {
  const t = useTranslations('audio');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [plays, setPlays] = useState(() => (mode === 'exam' ? readPlays(playsKey) : 0));
  // A counted play that hasn't ended yet: pausing inside it may resume it, even on the last play.
  const [midPlay, setMidPlay] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const exam = mode === 'exam';
  const max = Math.max(1, replays ?? 1);
  // Read inside the media listeners, which are attached once. `plays` is only ever changed there.
  const live = useRef({ plays, max, exam, playsKey });
  useEffect(() => {
    live.current = { ...live.current, max, exam, playsKey };
  }, [max, exam, playsKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => {
      const s = live.current;
      if (s.exam && audio.currentTime === 0) {
        // A fresh play from the start. Past the limit (say, from the OS media keys) it's stopped at once.
        if (s.plays >= s.max) {
          audio.pause();
          return;
        }
        const next = s.plays + 1;
        live.current.plays = next;
        setPlays(next);
        writePlays(s.playsKey, next);
        setMidPlay(true);
      }
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setMidPlay(false);
      // Back to the start, so the next Play counts as a new play.
      audio.currentTime = 0;
    };
    const onError = () => {
      setPlaying(false);
      setFailed(true);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [available, hash]);

  if (!available || failed) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <VolumeX aria-hidden className="size-4 shrink-0" />
        {t('unavailable')}
      </p>
    );
  }

  const usedUp = exam && plays >= max && !midPlay;

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (usedUp) return;
    // A rejected play (autoplay policy, a broken file) leaves the button as it was.
    void Promise.resolve(audio.play()).catch(() => setPlaying(false));
  }

  function back() {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - REWIND_SECONDS);
  }

  function toggleSlow() {
    const audio = audioRef.current;
    const next = !slow;
    setSlow(next);
    if (audio) audio.playbackRate = next ? SLOW_RATE : 1;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <audio ref={audioRef} src={`/api/audio/${hash}`} preload="auto" />
      <Button type="button" size="lg" className="min-h-11 min-w-32" onClick={toggle} disabled={!playing && usedUp}>
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        {playing ? t('pause') : t('play')}
      </Button>
      {!exam && (
        <>
          <Button type="button" variant="secondary" size="lg" className="min-h-11" onClick={back} aria-label={t('back5')}>
            <RotateCcw aria-hidden />
            <span aria-hidden>−5 s</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className={cn('min-h-11 tabular-nums', slow && 'bg-primary/15 text-primary')}
            aria-pressed={slow}
            onClick={toggleSlow}
          >
            {t('slow')}
          </Button>
        </>
      )}
      {exam && (
        // Polite: a new count is read out after whatever the screen reader is saying.
        <p aria-live="polite" className="text-sm text-text-muted tabular-nums">
          {t('played', { n: plays, max })}
        </p>
      )}
    </div>
  );
}
