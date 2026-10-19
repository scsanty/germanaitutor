'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, RotateCcw, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const REWIND_SECONDS = 5;
const SLOW_RATE = 0.75;
// The OS media controls (lock screen, Control Center, Now Playing) can seek an element without `controls`.
const SEEK_ACTIONS = ['seekto', 'seekbackward', 'seekforward'] as const;

function setSeekHandlers(handler: (() => void) | null) {
  try {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    for (const action of SEEK_ACTIONS) session?.setActionHandler(action, handler);
  } catch {
    // An action this browser doesn't know: nothing to block.
  }
}

// Spec: Replay rules. Custom controls only (no native `controls`, so an exam can't seek).
// - exam: Play/Pause, plays counted on the client for this attempt (the runner is keyed by attempt, so a
//   new attempt starts at 0). A play is new only when nothing has played yet or the previous play reached
//   `ended`; any pause before that, even at 0 while the clip still loads, is resumed and not counted
//   (Review Focus 4). After `replays` plays have ended, Play is disabled.
// - lesson: Play/Pause, −5 s and a 0.75× toggle, unlimited replays.
export function AudioPlayer({ hash, available, mode, replays }: { hash: string; available: boolean; mode: 'lesson' | 'exam'; replays?: number }) {
  const t = useTranslations('audio');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [plays, setPlays] = useState(0);
  // A counted play that hasn't ended yet: pausing inside it resumes it, even on the last play.
  const [inProgress, setInProgress] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const exam = mode === 'exam';
  const max = Math.max(1, replays ?? 1);
  // Read and written inside the media listeners, which are attached once per element.
  const live = useRef({ plays: 0, inProgress: false, max, exam, position: 0, snapping: false });
  useEffect(() => {
    live.current.max = max;
    live.current.exam = exam;
  }, [max, exam]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const s = live.current;
    const onPlay = () => {
      if (s.exam && !s.inProgress) {
        // Past the limit (say, from the OS media keys) a fresh play is stopped at once, uncounted.
        if (s.plays >= s.max) {
          audio.pause();
          return;
        }
        s.plays += 1;
        s.inProgress = true;
        setPlays(s.plays);
        setInProgress(true);
      }
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      s.inProgress = false;
      s.position = 0;
      setPlaying(false);
      setInProgress(false);
      // Back to the start, ready for the next play.
      s.snapping = true;
      audio.currentTime = 0;
    };
    const onTimeUpdate = () => {
      if (!s.snapping) s.position = audio.currentTime;
    };
    // Exam: no seeking, from anywhere. A seek away from the playback position snaps back.
    const onSeeking = () => {
      if (s.snapping) {
        s.snapping = false;
        return;
      }
      if (s.exam && Math.abs(audio.currentTime - s.position) > 0.5) {
        s.snapping = true;
        audio.currentTime = s.position;
      }
    };
    const onError = () => {
      setPlaying(false);
      setFailed(true);
    };
    // Final review M3: after a retry the fresh element starts at 0 s. Put it back where the broken-off
    // play was, so an exam retry resumes instead of replaying for free. Our own seek is not snapped back.
    const restorePosition = () => {
      if (s.position > 0 && Math.abs(audio.currentTime - s.position) > 0.5) {
        s.snapping = true;
        audio.currentTime = s.position;
      }
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('loadedmetadata', restorePosition);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('error', onError);
    if (audio.readyState >= 1) restorePosition();
    if (s.exam) setSeekHandlers(() => {});
    return () => {
      audio.removeEventListener('loadedmetadata', restorePosition);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('error', onError);
      if (s.exam) setSeekHandlers(null);
    };
  }, [available, hash, failed]);

  // T6: a retry mounts a fresh element at 1×; keep it in step with the 0.75× toggle. The default rate
  // too, since loading a source resets playbackRate to it.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const rate = slow ? SLOW_RATE : 1;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }, [slow, available, hash, failed]);

  if (!available) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <VolumeX aria-hidden className="size-4 shrink-0" />
        {t('unavailable')}
      </p>
    );
  }

  if (failed) {
    // A transient failure (say, a 503 while the clip renders) shouldn't cost the whole part: a retry
    // mounts a fresh element. The count, any play in progress and its position are kept, so it resumes
    // uncounted from where it stopped.
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p role="status" className="flex flex-1 items-center gap-2 text-sm text-text-muted">
          <VolumeX aria-hidden className="size-4 shrink-0" />
          {t('unavailable')}
        </p>
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => setFailed(false)}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const usedUp = exam && plays >= max && !inProgress;

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
    if (audio) {
      audio.defaultPlaybackRate = next ? SLOW_RATE : 1;
      audio.playbackRate = next ? SLOW_RATE : 1;
    }
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
