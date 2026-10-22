'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';

export interface SpeechWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}
export interface TranscribeResult {
  clipId: string;
  text: string;
  words: SpeechWord[];
  duration: number;
}
export type RecorderState = 'idle' | 'recording' | 'uploading' | 'error';

const PREFERRED_TYPE = 'audio/webm;codecs=opus';

// Tap-to-talk: record with MediaRecorder, then send the raw clip to the transcription route.
// A failed upload keeps the recording in memory so `retry` can send it again (S27).
export function useRecorder({ scope }: { scope: string }) {
  const t = useTranslations('speech');
  const errorText = useApiErrorText();
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keptRef = useRef<{ blob: Blob; mimeType: string } | null>(null);
  const chosenTypeRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef<Promise<TranscribeResult | null> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      stopTimer();
      releaseStream();
    },
    []
  );

  const upload = useCallback(async (): Promise<TranscribeResult | null> => {
    const kept = keptRef.current;
    if (!kept) return null;
    setState('uploading');
    setError(null);
    try {
      const res = await fetch(`/api/speech/transcribe?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        headers: { 'Content-Type': kept.mimeType },
        body: kept.blob,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(data, t('uploadFailed')));
      keptRef.current = null;
      setState('idle');
      return data as TranscribeResult;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('uploadFailed'));
      setState('error');
      return null;
    }
  }, [scope, errorText, t]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    keptRef.current = null;
    setError(null);
    setDenied(false);
    // An insecure origin has no mediaDevices at all.
    if (!navigator.mediaDevices?.getUserMedia) {
      setDenied(true);
      setState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chosen = MediaRecorder.isTypeSupported?.(PREFERRED_TYPE) ? PREFERRED_TYPE : undefined;
      const recorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      chosenTypeRef.current = chosen;
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState('recording');
    } catch (e) {
      releaseStream();
      recorderRef.current = null;
      const name = e instanceof DOMException || e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'NotFoundError') setDenied(true);
      else setError(t('uploadFailed'));
      setState('error');
    }
  }, [t]);

  const stop = useCallback((): Promise<TranscribeResult | null> => {
    if (inFlightRef.current) return inFlightRef.current;
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);
    const promise = new Promise<TranscribeResult | null>((resolve) => {
      recorder.onstop = () => {
        stopTimer();
        releaseStream();
        recorderRef.current = null;
        const mimeType = recorder.mimeType || chosenTypeRef.current || 'audio/webm';
        keptRef.current = { blob: new Blob(chunksRef.current, { type: mimeType }), mimeType };
        resolve(upload());
      };
      recorder.stop();
    }).finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [upload]);

  // Sends the kept recording again, without recording it again.
  const retry = useCallback((): Promise<TranscribeResult | null> => {
    if (inFlightRef.current) return inFlightRef.current;
    const promise = upload().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [upload]);

  return { state, seconds, start, stop, retry, error, denied, canRetry: state === 'error' && keptRef.current !== null };
}
