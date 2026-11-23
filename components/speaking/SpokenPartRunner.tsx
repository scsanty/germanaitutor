'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FocusLayout } from '@/components/focus/FocusLayout';
import { RunnerHeader } from '@/components/exam/RunnerHeader';
import { useCountdown } from '@/components/exam/useCountdown';
import { MicButton } from '@/components/speech/MicButton';
import { useScopeCleanup } from '@/components/speech/useScopeCleanup';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { PracticeResult, PracticeRun, SpokenState, SpokenTurnView } from '@/lib/exam/practiceViews';
import { ConversationList } from './ConversationList';

type Phase = 'idle' | 'sending' | 'grading';

// Keeps the speaker labels the client already has: the server rebuilds earlier lines from their clips, and a
// mid-way examiner line comes back as the partner's after its own turn.
const mergeTurns = (known: SpokenTurnView[], next: SpokenTurnView[]) => next.map((turn, i) => (known[i]?.clipId === turn.clipId ? known[i] : turn));

// Spec: the spoken Teil. The task sheet, the conversation (partner and examiner lines play as they arrive),
// tap-to-talk on the student's turn, Finish after the first turn, and the part's minutes as a soft timer.
export function SpokenPartRunner({
  run,
  onFinished,
  onExit,
  progress = null,
  clockOffsetMs = 0,
}: {
  run: PracticeRun;
  onFinished: (result: PracticeResult) => void;
  onExit?: () => void;
  progress?: { current: number; total: number } | null;
  clockOffsetMs?: number;
}) {
  const t = useTranslations('speaking');
  const tExam = useTranslations('exam');
  const tSpeech = useTranslations('speech');
  const errorText = useApiErrorText();
  const spoken = run.spoken!;
  const set = spoken.set;
  const scope = `teil:${run.attemptId}`;
  const [turns, setTurns] = useState<SpokenTurnView[]>(spoken.turns);
  const [state, setState] = useState<SpokenState>(spoken.state);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<{ clipId: string; text: string } | null>(null);
  const [failedTurn, setFailedTurn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const played = useRef(new Set<string>());
  const sheetId = useId();
  const conversationId = useId();
  const { secondsLeft, overtime } = useCountdown(run.startedAt, run.minutes, clockOffsetMs);
  // Leaving mid-conversation deletes the recordings; a finished one keeps them for its result screen.
  useScopeCleanup(scope, () => finished.current);

  const studentTurns = turns.filter((x) => x.speaker === 'student').length;

  function play(clipId: string) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/api/speech/clip/${encodeURIComponent(clipId)}`;
    try {
      void Promise.resolve(audio.play()).catch(() => {});
    } catch {
      // Autoplay refused: the line's play button is there.
    }
  }

  // A partner or examiner line plays once, as it arrives.
  useEffect(() => {
    const last = turns.at(-1);
    if (!last || last.speaker === 'student' || !last.audio || played.current.has(last.clipId)) return;
    played.current.add(last.clipId);
    play(last.clipId);
  }, [turns]);

  async function finish() {
    if (busy.current) return;
    busy.current = true;
    setPhase('grading');
    // Fix round 1 (I2): Finish closes the conversation (the server adds the examiner's closing line), so even if
    // grading fails only Finish is offered again, never another turn.
    setState('closing');
    setError(null);
    try {
      const res = await fetch('/api/exam-practice/spoken/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: run.attemptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('finishFailed')));
        return;
      }
      finished.current = true;
      onFinished(data as PracticeResult);
    } catch {
      setError(t('finishFailed'));
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  }

  async function sendTurn(clipId: string, text: string) {
    if (busy.current) return;
    busy.current = true;
    setPhase('sending');
    setPending({ clipId, text });
    setFailedTurn(false);
    setError(null);
    let closing = false;
    try {
      const res = await fetch('/api/exam-practice/spoken/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: run.attemptId, clipId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('turnFailed')));
        setFailedTurn(true);
        return;
      }
      const next = data as { turns: SpokenTurnView[]; state: SpokenState };
      setTurns((known) => mergeTurns(known, next.turns));
      setState(next.state);
      setPending(null);
      closing = next.state === 'closing';
    } catch {
      setError(t('turnFailed'));
      setFailedTurn(true);
    } finally {
      busy.current = false;
      setPhase('idle');
    }
    // S19: once the examiner has closed, the conversation is graded.
    if (closing) await finish();
  }

  const status = phase === 'sending' ? t('answering', { name: set.partner.name }) : phase === 'grading' ? t('grading') : state === 'closing' ? t('closing') : '';

  return (
    <FocusLayout
      progress={null}
      confirmExit={studentTurns > 0}
      onExit={onExit ?? (() => window.history.back())}
      header={<RunnerHeader title={run.part.title.de} progress={progress} secondsLeft={secondsLeft} overtime={overtime} />}
      wide
    >
      <div className="grid flex-1 gap-6 lg:min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]">
        <section aria-labelledby={sheetId} className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <h2 id={sheetId} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            {t('taskSheet')}
          </h2>
          <div lang="de" className="flex flex-col gap-3 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed">
            <p className="font-medium">{run.part.instructions}</p>
            <p>{set.situation}</p>
            {set.materials.map((m) => (
              <div key={m.title} className="flex flex-col gap-1">
                <h3 className="font-semibold">{m.title}</h3>
                <ul className="list-disc pl-5">
                  {m.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-text-muted">{t('partner', { name: set.partner.name })}</p>
        </section>

        <section aria-labelledby={conversationId} className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <h2 id={conversationId} className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            {t('conversation')}
          </h2>
          <ConversationList turns={turns} partnerName={set.partner.name} onPlay={play} canPlay={(x) => x.speaker !== 'student'} pending={pending?.text} />
          {/* One player for every line; the line's text above is its transcript. */}
          <audio ref={audioRef} className="hidden" />
        </section>
      </div>

      <div className="sticky bottom-0 z-[5] mt-4 flex flex-col items-center gap-3 bg-background pt-3 pb-2">
        {overtime && (
          <p role="status" className="w-full rounded-xl border border-danger/50 bg-danger/10 px-4 py-2 text-sm">
            {tExam('overtimeNotice')}
          </p>
        )}
        {error && (
          <Alert variant="destructive" role="alert" className="w-full">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p role="status" className={status ? 'text-sm text-text-muted' : 'sr-only'}>
          {status}
        </p>
        {failedTurn && pending && phase === 'idle' && (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void sendTurn(pending.clipId, pending.text)}>
            {tSpeech('tryAgain')}
          </Button>
        )}
        {state === 'student' && (
          <>
            {phase === 'idle' && !failedTurn && <p className="text-sm font-medium">{t('yourTurn')}</p>}
            <MicButton scope={scope} disabled={phase !== 'idle'} onTranscript={(r) => void sendTurn(r.clipId, r.text)} />
          </>
        )}
        <Button size="lg" className="min-h-11 w-full lg:ml-auto lg:w-auto" onClick={() => void finish()} disabled={studentTurns === 0 || phase !== 'idle'}>
          {phase === 'grading' ? t('grading') : t('finish')}
        </Button>
      </div>
    </FocusLayout>
  );
}
