'use client';

import { useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRecorder, type TranscribeResult } from './useRecorder';

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Tap to start, tap to stop and send. The transcript goes to `onTranscript`.
export function MicButton({
  scope,
  onTranscript,
  disabled,
}: {
  scope: string;
  onTranscript: (result: TranscribeResult) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('speech');
  const { state, seconds, start, stop, retry, error, denied, canRetry } = useRecorder({ scope, onAutoStop: (r) => onTranscript(r) });
  const busy = useRef(false);
  const recording = state === 'recording';
  const uploading = state === 'uploading';

  const send = async (run: () => Promise<TranscribeResult | null>) => {
    // A second tap while the first is still in flight does nothing.
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await run();
      if (result) onTranscript(result);
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {recording && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-destructive/30 motion-reduce:animate-none" />}
        <Button
          type="button"
          size="icon"
          variant={recording ? 'destructive' : 'default'}
          className="relative size-20 rounded-full"
          aria-label={recording ? t('stop') : t('start')}
          disabled={disabled || uploading}
          onClick={() => void (recording ? send(stop) : start())}
        >
          {recording ? <Square className="size-8" aria-hidden /> : <Mic className="size-8" aria-hidden />}
        </Button>
      </div>
      {recording && (
        <p className="font-mono text-sm tabular-nums text-text-muted" aria-live="off">
          {clock(seconds)}
        </p>
      )}
      {uploading && (
        <p role="status" className="text-sm text-text-muted">
          {t('transcribing')}
        </p>
      )}
      {denied && (
        <Alert variant="destructive">
          <AlertDescription>{t('micDenied')}</AlertDescription>
        </Alert>
      )}
      {error && !denied && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canRetry && (
        <Button type="button" variant="outline" onClick={() => void send(retry)}>
          {t('tryAgain')}
        </Button>
      )}
    </div>
  );
}
