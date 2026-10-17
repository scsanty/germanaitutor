'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import type { AdminAudioStatus } from '@/lib/services/audioAdminService';
import { MAX_UPLOAD_BYTES } from '@/lib/audio/uploadLimit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BTN, FOCUS, HINT } from './adminStyles';

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
}

function describe(s: AdminAudioStatus): string {
  if (s.status === 'uploaded') return s.hasFile ? 'Uploaded recording' : 'The uploaded recording is missing; upload it again';
  if (s.status === 'failed') return `Generation failed${s.lastError ? `: ${s.lastError}` : ''}`;
  if (s.hasFile) return 'Generated audio ready';
  if (s.status === 'pending') return 'Queued for generation';
  return 'Not generated yet';
}

const FILE_INPUT = `min-h-11 max-w-full min-w-0 rounded-md border bg-transparent p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text ${FOCUS}`;

// Regenerate and Upload for one listening transcript. Only saved content can be acted on (S21), and
// regenerating over an uploaded recording needs a confirmation (Review Focus 2).
export function AudioActions({ transcript, label }: { transcript: string; label: string }) {
  const [status, setStatus] = useState<AdminAudioStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Waits for typing to pause before asking.
    const timer = setTimeout(() => {
      fetch('/api/admin/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) })
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            setStatus(null);
            setProblem(await errorOf(res));
            return;
          }
          setStatus((await res.json()) as AdminAudioStatus);
          setProblem(null);
        })
        .catch(() => {
          if (!cancelled) setProblem('Could not load the audio status');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transcript, reload]);

  async function run(action: () => Promise<Response>, done: string, onFail?: (res: Response) => Promise<boolean>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await action();
      if (!res.ok) {
        if (onFail && (await onFail(res))) return;
        setError(await errorOf(res));
        return;
      }
      setConfirming(false);
      setMessage(done);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function regenerate(replaceUpload: boolean) {
    if (!status) return;
    if (status.status === 'uploaded' && !replaceUpload) {
      setConfirming(true);
      return;
    }
    void run(
      () =>
        fetch(`/api/admin/audio/${status.hash}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replaceUpload ? { replaceUpload: true } : {}),
        }),
      'Queued',
      async (res) => {
        // Someone uploaded meanwhile: ask before replacing it.
        if (res.status !== 409) return false;
        setConfirming(true);
        setReload((n) => n + 1);
        return true;
      }
    );
  }

  function upload() {
    if (!status || !file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage(null);
      setError('The recording is larger than 20 MB');
      return;
    }
    void run(
      () => fetch(`/api/admin/audio/${status.hash}`, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }),
      'Uploaded'
    );
  }

  const disabled = busy || !status?.saved;

  return (
    <section aria-label={`${label} audio`} className="flex flex-col gap-2 rounded-lg border p-3">
      <h4 className="text-sm font-semibold">Audio</h4>
      {problem && <p className={HINT}>{problem}</p>}
      {status && (
        <p className="text-sm">
          {describe(status)}
          {!status.saved && <span className={HINT}> Save first to regenerate or upload this audio.</span>}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">This deletes the uploaded recording and generates speech instead.</span>
          <Button type="button" variant="destructive" className={BTN} disabled={busy} onClick={() => regenerate(true)}>
            Replace recording
          </Button>
          <Button type="button" variant="outline" className={BTN} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className={BTN} disabled={disabled} onClick={() => regenerate(false)}>
            <RefreshCw aria-hidden />
            Regenerate
          </Button>
          <input
            type="file"
            accept="audio/*"
            aria-label={`${label} recording`}
            disabled={disabled}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={FILE_INPUT}
          />
          <Button type="button" variant="outline" className={BTN} disabled={disabled || !file} onClick={upload}>
            <Upload aria-hidden />
            Upload
          </Button>
        </div>
      )}
      <p className={HINT}>A recording (mp3, ogg, wav or m4a, up to 20 MB) replaces the generated speech until you regenerate.</p>
      {message && <p role="status">{message}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
