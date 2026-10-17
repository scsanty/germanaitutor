'use client';

import { useEffect, useRef, useState } from 'react';
import type { SmtpSettingsDisplay } from '@/lib/services/mailService';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BTN, FIELD_LABEL, HINT, INPUT } from './adminStyles';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
}

// One request at a time per form; a double click never sends a second one.
function useBusy() {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  async function run(task: () => Promise<void>) {
    if (ref.current) return;
    ref.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      ref.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

// Admin-only, English. Spec: SMTP settings for the admin emails, and the speech service address.
export function SystemSettingsAdmin() {
  return (
    <div className="flex flex-col gap-6">
      <SmtpSettingsCard />
      <SpeechSettingsCard />
    </div>
  );
}

interface SmtpForm {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
}

const EMPTY_SMTP: SmtpForm = { host: '', port: '587', secure: false, user: '', password: '', from: '', to: '' };

function toForm(s: SmtpSettingsDisplay | null): SmtpForm {
  return s ? { host: s.host, port: String(s.port), secure: s.secure, user: s.user, password: '', from: s.from, to: s.to } : EMPTY_SMTP;
}

function SmtpSettingsCard() {
  const [form, setForm] = useState<SmtpForm | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const { busy, run } = useBusy();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings/smtp')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const { settings } = (await res.json()) as { settings: SmtpSettingsDisplay | null };
        if (cancelled) return;
        setForm(toForm(settings));
        setHasPassword(settings?.hasPassword ?? false);
        setSaved(settings !== null);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch: Partial<SmtpForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = () =>
    run(async () => {
      if (!form) return;
      setError(null);
      setMessage(null);
      setTest(null);
      try {
        const res = await fetch('/api/admin/settings/smtp', {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...form, port: Number(form.port), clearPassword }),
        });
        if (!res.ok) {
          setError(await errorOf(res));
          return;
        }
        const { settings } = (await res.json()) as { settings: SmtpSettingsDisplay };
        setForm(toForm(settings));
        setHasPassword(settings.hasPassword);
        setClearPassword(false);
        setSaved(true);
        setMessage('Saved');
      } catch (err) {
        setError((err as Error).message);
      }
    });

  const sendTest = () =>
    run(async () => {
      setError(null);
      setMessage(null);
      setTest(null);
      try {
        const res = await fetch('/api/admin/settings/smtp/test', { method: 'POST' });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        setTest(data.ok === true ? { ok: true } : { ok: false, error: data.error ?? `Request failed (${res.status})` });
      } catch (err) {
        setTest({ ok: false, error: (err as Error).message });
      }
    });

  return (
    <Card className="min-w-0 gap-4">
      <CardHeader>
        <h2 className="text-lg leading-tight">Email (SMTP)</h2>
        <p className={HINT}>Problem notifications are emailed to the admin address. Without these settings they only show in Notifications.</p>
      </CardHeader>
      <CardContent>
        {loadFailed && (
          <Alert variant="destructive">
            <AlertDescription>Could not load the email settings</AlertDescription>
          </Alert>
        )}
        {!loadFailed && !form && <p className="text-text-muted">Loading...</p>}
        {form && (
          <form
            aria-label="Email settings"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
              <label className={FIELD_LABEL}>
                Host
                <Input className={INPUT} value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.example.com" autoComplete="off" />
              </label>
              <label className={FIELD_LABEL}>
                Port
                <Input className={INPUT} inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value })} />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="smtp-secure" checked={form.secure} onCheckedChange={(secure) => set({ secure })} aria-describedby="smtp-secure-hint" />
              <label htmlFor="smtp-secure" className="text-sm font-medium">
                TLS from the start (port 465)
              </label>
            </div>
            <p id="smtp-secure-hint" className={`${HINT} -mt-2`}>
              Off: the connection must switch to TLS with STARTTLS (port 587), so the password is never sent unencrypted.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={FIELD_LABEL}>
                User
                <Input className={INPUT} value={form.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" />
              </label>
              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL}>
                  Password
                  <Input
                    className={INPUT}
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    disabled={clearPassword}
                    placeholder={hasPassword ? '••••••' : ''}
                    aria-describedby="smtp-password-hint"
                    onChange={(e) => set({ password: e.target.value })}
                  />
                </label>
                <p id="smtp-password-hint" className={HINT}>
                  {hasPassword ? 'A password is set. Leave the field empty to keep it.' : 'No password is set.'}
                </p>
                {hasPassword && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox checked={clearPassword} onCheckedChange={(v) => setClearPassword(v === true)} />
                    Remove the stored password
                  </label>
                )}
              </div>
              <label className={FIELD_LABEL}>
                From
                <Input className={INPUT} value={form.from} onChange={(e) => set({ from: e.target.value })} placeholder="NaDoch! <nadoch@example.com>" />
              </label>
              <label className={FIELD_LABEL}>
                To
                <Input className={INPUT} value={form.to} onChange={(e) => set({ to: e.target.value })} placeholder="admin@example.com" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className={BTN} disabled={busy}>
                Save
              </Button>
              <Button type="button" variant="outline" className={BTN} disabled={busy || !saved} onClick={() => void sendTest()}>
                Send test email
              </Button>
              <span className={HINT}>The test uses the saved settings.</span>
            </div>
            {message && <p role="status">{message}</p>}
            {test?.ok && <p role="status">Test email sent.</p>}
            {test && !test.ok && (
              <Alert variant="destructive">
                <AlertDescription>The test email failed: {test.error}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

interface SpeechInfo {
  url: string;
  defaultUrl: string;
  isDefault: boolean;
  health?: { ok: boolean; voices: string[] };
}

function SpeechSettingsCard() {
  const [info, setInfo] = useState<SpeechInfo | null>(null);
  const [url, setUrl] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; voices: string[] } | null>(null);
  const { busy, run } = useBusy();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings/speech')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SpeechInfo;
        if (cancelled) return;
        setInfo(data);
        setUrl(data.isDefault ? '' : data.url);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = () =>
    run(async () => {
      setError(null);
      setMessage(null);
      setHealth(null);
      try {
        const res = await fetch('/api/admin/settings/speech', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ url }) });
        if (!res.ok) {
          setError(await errorOf(res));
          return;
        }
        const data = (await res.json()) as SpeechInfo;
        setInfo(data);
        setUrl(data.isDefault ? '' : data.url);
        setMessage('Saved');
      } catch (err) {
        setError((err as Error).message);
      }
    });

  const check = () =>
    run(async () => {
      setError(null);
      setMessage(null);
      setHealth(null);
      try {
        const res = await fetch('/api/admin/settings/speech?check=1');
        if (!res.ok) {
          setError(await errorOf(res));
          return;
        }
        const data = (await res.json()) as SpeechInfo;
        setHealth(data.health ?? { ok: false, voices: [] });
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <Card className="min-w-0 gap-4">
      <CardHeader>
        <h2 className="text-lg leading-tight">Speech service</h2>
        <p className={HINT}>The local service that turns listening transcripts into audio.</p>
      </CardHeader>
      <CardContent>
        {loadFailed && (
          <Alert variant="destructive">
            <AlertDescription>Could not load the speech settings</AlertDescription>
          </Alert>
        )}
        {!loadFailed && !info && <p className="text-text-muted">Loading...</p>}
        {info && (
          <form
            aria-label="Speech service settings"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className={`${FIELD_LABEL} md:max-w-md`}>
              Address
              <Input
                className={INPUT}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={info.defaultUrl}
                inputMode="url"
                aria-describedby="speech-url-hint"
              />
            </label>
            <p id="speech-url-hint" className={`${HINT} -mt-2`}>
              Scheme, host and port only, like {info.defaultUrl}. Leave it empty for the default. Now in use: {info.url}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className={BTN} disabled={busy}>
                Save
              </Button>
              <Button type="button" variant="outline" className={BTN} disabled={busy} onClick={() => void check()}>
                Check
              </Button>
              <span className={HINT}>Check tests the saved address.</span>
            </div>
            {message && <p role="status">{message}</p>}
            {health?.ok && (
              <p role="status">
                The speech service is running.{' '}
                {health.voices.length > 0 ? `Voices: ${health.voices.join(', ')}.` : 'It reported no voices.'}
              </p>
            )}
            {health && !health.ok && (
              <Alert variant="destructive">
                <AlertDescription>The speech service is not reachable at {info.url}.</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
