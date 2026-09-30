'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ProviderConnection, Profile, ProviderType, Theme } from '@/lib/types';
import type { ModelInfo } from '@/lib/providers/types';
import { useApiErrorText } from '@/components/useApiErrorText';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { CARD_GRID, SectionCard } from '@/components/SectionCard';
import { cn } from '@/lib/utils';
import { ArrowLeft, Download, Plus, RefreshCw, Trash2 } from 'lucide-react';

const PROVIDER_TYPES: ProviderType[] = ['anthropic', 'openai', 'gemini', 'ollama'];
const USAGE_WINDOW_DAYS = 7;
const BUTTON = 'min-h-11';
const SECONDARY = 'min-h-11 border border-border';

// Connection status as a badge: the word carries it, the colour backs it up.
const STATUS_BADGE: Record<ProviderConnection['lastValidatedStatus'], string> = {
  valid: 'border-success/50 bg-success/10 text-success',
  failing: 'border-warning/50 bg-warning/10 text-warning',
  invalid: 'border-danger/50 bg-danger/10 text-danger',
  untested: 'border-border text-text-muted',
};

function ErrorAlert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Alert variant="destructive" role="alert" className={className}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

interface UsageTotals {
  requestCount: number;
  tokenCount: number;
}

export function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const errorText = useApiErrorText();
  const fieldId = useId();
  const { theme, soundEnabled, setTheme, setSoundEnabled } = usePreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [adminSession, setAdminSession] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [usage, setUsage] = useState<Record<number, UsageTotals>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('anthropic');
  const [newApiKey, setNewApiKey] = useState('');
  const [newOllamaHost, setNewOllamaHost] = useState('http://localhost:11434');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedConnectionId, setAddedConnectionId] = useState<number | null>(null);
  const [newModels, setNewModels] = useState<ModelInfo[]>([]);
  const [newSelectedModel, setNewSelectedModel] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [capDraft, setCapDraft] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setProfile(await res.json());
      })
      .catch(() => setLoadFailed(true));
    // The Content Admin link is only offered with an admin session; a failed check just hides it.
    fetch('/api/admin/auth')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setAdminSession(data.authenticated === true);
      })
      .catch(() => setAdminSession(false));
    fetch('/api/providers')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setConnections(await res.json());
      })
      .catch(() => setProvidersFailed(true));
  }, []);

  // Powers the spec's "approaching your limit" view: a per-connection rollup of
  // the last week's requests/tokens, refreshed whenever the list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      connections.map(async (c) => {
        const res = await fetch(`/api/usage?connectionId=${c.id}&days=${USAGE_WINDOW_DAYS}`);
        // Usage is a quiet background display: a failed request shows zeros, not an alert.
        if (!res.ok) return [c.id, { requestCount: 0, tokenCount: 0 }] as const;
        const days = await res.json();
        const totals: UsageTotals = Array.isArray(days)
          ? days.reduce(
              (acc, d) => ({
                requestCount: acc.requestCount + (d.requestCount ?? 0),
                tokenCount: acc.tokenCount + (d.tokenCount ?? 0),
              }),
              { requestCount: 0, tokenCount: 0 }
            )
          : { requestCount: 0, tokenCount: 0 };
        return [c.id, totals] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setUsage(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setUsage({});
      });
    return () => {
      cancelled = true;
    };
  }, [connections]);

  async function refreshConnections() {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) throw new Error(String(res.status));
      setConnections(await res.json());
      setProvidersFailed(false);
    } catch {
      setProvidersFailed(true);
    }
  }

  // Provider buttons show an alert when their request fails, instead of silently doing nothing.
  async function providerAction(url: string, init: RequestInit) {
    setActionError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(t('actionFailed', { error: data.error ?? String(res.status) }));
      }
    } catch (err) {
      setActionError(t('actionFailed', { error: (err as Error).message }));
    }
    await refreshConnections();
  }

  function handleSetActive(id: number) {
    return providerAction('/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  function handleRetest(id: number) {
    return providerAction(`/api/providers/${id}/test`, { method: 'POST' });
  }

  function handleDelete(id: number) {
    return providerAction(`/api/providers/${id}`, { method: 'DELETE' });
  }

  function closeAddProvider() {
    setNewProviderType('anthropic');
    setNewApiKey('');
    setNewOllamaHost('http://localhost:11434');
    setAddError(null);
    setAddedConnectionId(null);
    setNewModels([]);
    setNewSelectedModel('');
    setModelsError(null);
    setModelsFailed(false);
    setModelSaveError(null);
    setShowAddProvider(false);
  }

  async function handleAddProvider() {
    setAdding(true);
    setAddError(null);
    const body =
      newProviderType === 'ollama'
        ? { providerType: newProviderType, ollamaHost: newOllamaHost }
        : { providerType: newProviderType, apiKey: newApiKey };
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setAddError(t('saveFailed'));
        return;
      }
      const created = await res.json();
      await refreshConnections();
      setAddedConnectionId(created.id);
      await loadModels(created.id);
    } catch {
      setAddError(t('saveFailed'));
    } finally {
      setAdding(false);
    }
  }

  // The provider may be unreachable (Ollama not running, bad key); the
  // connection is already saved, so degrade to "no models" instead of failing.
  async function loadModels(id: number) {
    setModelsError(null);
    setModelsFailed(false);
    try {
      const res = await fetch(`/api/providers/${id}/models`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNewModels([]);
        setModelsError(typeof data?.error === 'string' ? data.error : t('modelsFailed'));
        setModelsFailed(true);
        return;
      }
      const data = await res.json();
      setNewModels(data);
      setNewSelectedModel(data[0]?.id ?? '');
      if (data.length === 0) setModelsError(t('noModels'));
    } catch {
      setNewModels([]);
      setModelsError(t('modelsFailed'));
      setModelsFailed(true);
    }
  }

  async function handleSaveModel() {
    setModelSaveError(null);
    if (addedConnectionId !== null && newSelectedModel) {
      try {
        const res = await fetch(`/api/providers/${addedConnectionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedModel: newSelectedModel }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setModelSaveError(t('modelSaveFailed'));
        return;
      }
      await refreshConnections();
    }
    closeAddProvider();
  }

  async function handleProfileChange(patch: Partial<Profile>) {
    setProfileError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(t('profileSaveFailed', { error: errorText(data, String(res.status)) }));
        return;
      }
      setProfile(data);
    } catch (err) {
      setProfileError(t('profileSaveFailed', { error: (err as Error).message }));
    }
  }

  // Saved on blur, so typing "3" on the way to "30" doesn't save 3.
  async function saveDailyReviewCap() {
    if (capDraft === null || !profile) return;
    const value = Number(capDraft);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      setCapError(t('dailyReviewInvalid'));
      return;
    }
    setCapError(null);
    setCapDraft(null);
    if (value !== profile.dailyReviewCap) await handleProfileChange({ dailyReviewCap: value });
  }

  // The provider rolls a failed save back; it resolves false so the failure is visible here.
  async function saveTheme(next: Theme) {
    setPreferenceError(null);
    if (!(await setTheme(next))) setPreferenceError(t('preferenceSaveFailed'));
  }

  async function saveSound(next: boolean) {
    setPreferenceError(null);
    if (!(await setSoundEnabled(next))) setPreferenceError(t('preferenceSaveFailed'));
  }

  async function handleExport() {
    setBackupError(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'germanaitutor-backup.gaitbackup';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBackupError(t('exportFailed'));
    }
  }

  async function handleImport(file: File) {
    setBackupError(null);
    setImportMessage(null);
    try {
      const res = await fetch('/api/backup/import', { method: 'POST', body: file });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBackupError(t('importFailed', { error: data.error ?? String(res.status) }));
        return;
      }
      setImportMessage(t('importDone'));
    } catch (err) {
      setBackupError(t('importFailed', { error: (err as Error).message }));
    }
  }

  async function handleReset() {
    setResetError(null);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setResetError(t('resetFailed'));
      return;
    }
    setConfirmingReset(false);
    window.location.href = '/onboarding';
  }

  if (loadFailed) return <ErrorAlert>{t('loadFailed')}</ErrorAlert>;
  if (!profile)
    return (
      <div role="status" aria-label={tCommon('loading')} className={CARD_GRID}>
        <Skeleton className="h-11 w-40 md:col-span-2" />
        <Skeleton className="h-48 w-full md:col-span-2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  return (
    <div className={CARD_GRID}>
      <nav className="md:col-span-2">
        <Button asChild variant="ghost" className="-ml-3 min-h-11 text-text-muted hover:text-text">
          <Link href="/">
            <ArrowLeft aria-hidden />
            {t('backHome')}
          </Link>
        </Button>
      </nav>
      {profileError && <ErrorAlert className="md:col-span-2">{profileError}</ErrorAlert>}
      <SectionCard title={t('providers')} className="md:col-span-2">
        {providersFailed && <ErrorAlert>{t('providersLoadFailed')}</ErrorAlert>}
        {actionError && <ErrorAlert>{actionError}</ErrorAlert>}
        {connections.length > 0 && (
          <ul className="flex flex-col gap-3">
            {connections.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border bg-surface p-4 lg:flex-row lg:items-center lg:justify-between',
                  c.isActive ? 'border-primary/60' : 'border-border',
                )}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold break-words">
                    <span>
                      {c.providerType}
                      {c.selectedModel ? ` — ${c.selectedModel}` : ''}
                      {c.isActive ? ` ${t('activeMarker')}` : ''}
                    </span>
                    <Badge variant="outline" className={STATUS_BADGE[c.lastValidatedStatus]}>
                      {t(`connectionStatus.${c.lastValidatedStatus}`)}
                    </Badge>
                  </p>
                  <p className="text-sm text-text-muted tabular-nums">
                    {t('usage', {
                      requests: String(usage[c.id]?.requestCount ?? 0),
                      tokens: String(usage[c.id]?.tokenCount ?? 0),
                      days: String(USAGE_WINDOW_DAYS),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => handleSetActive(c.id)} disabled={c.isActive} className={SECONDARY}>
                    {t('makeActive')}
                  </Button>
                  <Button variant="secondary" onClick={() => handleRetest(c.id)} className={SECONDARY}>
                    <RefreshCw aria-hidden />
                    {t('retest')}
                  </Button>
                  <Button variant="destructive" onClick={() => handleDelete(c.id)} className={BUTTON}>
                    <Trash2 aria-hidden />
                    {t('remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!showAddProvider && (
          <Button variant="secondary" onClick={() => setShowAddProvider(true)} className={cn(SECONDARY, 'self-start')}>
            <Plus aria-hidden />
            {t('addProvider')}
          </Button>
        )}

        {showAddProvider && addedConnectionId === null && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
            <h3 className="text-base">{t('addProvider')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NativeSelect
                aria-label={t('newProviderType')}
                value={newProviderType}
                onChange={(e) => setNewProviderType(e.target.value as ProviderType)}
              >
                {PROVIDER_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
              {newProviderType === 'ollama' ? (
                <Input value={newOllamaHost} onChange={(e) => setNewOllamaHost(e.target.value)} placeholder={t('ollamaHost')} className="h-11" />
              ) : (
                <Input value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder={t('apiKey')} type="password" className="h-11" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAddProvider} disabled={adding} className={BUTTON}>
                {t('saveProvider')}
              </Button>
              <Button variant="secondary" onClick={closeAddProvider} className={SECONDARY}>
                {t('cancel')}
              </Button>
            </div>
            {addError && <ErrorAlert>{addError}</ErrorAlert>}
          </div>
        )}

        {showAddProvider && addedConnectionId !== null && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
            <h3 className="text-base">{t('chooseModel')}</h3>
            {newModels.length > 0 ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${fieldId}-model`} className="text-sm font-semibold">
                  {t('model')}
                </label>
                <NativeSelect id={`${fieldId}-model`} value={newSelectedModel} onChange={(e) => setNewSelectedModel(e.target.value)}>
                  {newModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : modelsFailed ? (
              <ErrorAlert>{modelsError}</ErrorAlert>
            ) : (
              <p className="text-sm text-text-muted">{modelsError ?? t('noModelsAvailable')}</p>
            )}
            <Button onClick={handleSaveModel} className={cn(BUTTON, 'self-start')}>
              {t('done')}
            </Button>
            {modelSaveError && <ErrorAlert>{modelSaveError}</ErrorAlert>}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('dailyReview')}>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${fieldId}-cap`} className="text-sm font-semibold">
            {t('dailyReviewLimit')}
          </label>
          <Input
            id={`${fieldId}-cap`}
            type="number"
            min={1}
            max={500}
            step={1}
            value={capDraft ?? String(profile.dailyReviewCap)}
            onChange={(e) => setCapDraft(e.target.value)}
            onBlur={saveDailyReviewCap}
            className="h-11 w-32 tabular-nums"
          />
        </div>
        <p className="text-sm text-text-muted">{t('dailyReviewHint')}</p>
        {capError && <ErrorAlert>{capError}</ErrorAlert>}
      </SectionCard>

      <SectionCard title={t('appearance')}>
        {preferenceError && <ErrorAlert>{preferenceError}</ErrorAlert>}
        <RadioGroup value={theme} onValueChange={(value) => saveTheme(value as Theme)} aria-label={t('theme')} className="grid gap-2 sm:grid-cols-3">
          {(['dark', 'light', 'system'] as const).map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-border bg-surface px-3 py-2 text-sm font-medium transition-colors sm:justify-center sm:px-2 duration-150 hover:border-primary/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 motion-reduce:transition-none"
            >
              <RadioGroupItem value={option} aria-label={t(`themeOption.${option}`)} />
              {t(`themeOption.${option}`)}
            </label>
          ))}
        </RadioGroup>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 text-sm font-medium">
          {t('sounds')}
          <Switch checked={soundEnabled} onCheckedChange={saveSound} aria-label={t('sounds')} />
        </label>
      </SectionCard>

      <SectionCard title={t('backup')}>
        <Button variant="secondary" onClick={handleExport} className={cn(SECONDARY, 'self-start')}>
          <Download aria-hidden />
          {t('exportBackup')}
        </Button>
        <Input
          type="file"
          accept=".gaitbackup"
          aria-label={t('importBackup')}
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          className="h-11 py-2 file:mr-3 file:rounded-md file:bg-surface-raised file:px-3"
        />
        {backupError && <ErrorAlert>{backupError}</ErrorAlert>}
        {importMessage && <p className="text-sm font-semibold text-success">{importMessage}</p>}
      </SectionCard>

      <SectionCard title={t('dangerZone')} className="border-danger/40">
        {confirmingReset ? (
          <>
            <p className="text-sm">{t('resetConfirm')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={handleReset} className={BUTTON}>
                {t('resetYes')}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingReset(false)} className={SECONDARY}>
                {t('cancel')}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="destructive" onClick={() => setConfirmingReset(true)} className={cn(BUTTON, 'self-start')}>
            <Trash2 aria-hidden />
            {t('reset')}
          </Button>
        )}
        {resetError && <ErrorAlert>{resetError}</ErrorAlert>}
      </SectionCard>

      {adminSession && (
        <SectionCard title={t('contentAdmin')}>
          <Button asChild variant="secondary" className={cn(SECONDARY, 'self-start')}>
            <Link href="/admin/curriculum">{t('contentAdmin')}</Link>
          </Button>
        </SectionCard>
      )}
    </div>
  );
}
