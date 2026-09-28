'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ProviderConnection, Profile, ProviderType, Track } from '@/lib/types';
import type { ModelInfo } from '@/lib/providers/types';
import type { PlacementBestResult } from '@/lib/tutoring/placementTypes';
import { levelsUpTo, TRACKS } from '@/lib/tutoring/levels';

const PROVIDER_TYPES: ProviderType[] = ['anthropic', 'openai', 'gemini', 'ollama'];
const USAGE_WINDOW_DAYS = 7;

interface UsageTotals {
  requestCount: number;
  tokenCount: number;
}

export function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [placementBest, setPlacementBest] = useState<PlacementBestResult | null | undefined>(undefined);
  const [placementFailed, setPlacementFailed] = useState(false);
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
    fetch('/api/placement')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setPlacementBest(data.best ?? null);
      })
      .catch(() => setPlacementFailed(true));
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
    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (!res.ok) {
      setAddError(t('saveFailed'));
      return;
    }
    const created = await res.json();
    await refreshConnections();
    setAddedConnectionId(created.id);
    await loadModels(created.id);
  }

  // The provider may be unreachable (Ollama not running, bad key); the
  // connection is already saved, so degrade to "no models" instead of failing.
  async function loadModels(id: number) {
    setModelsError(null);
    try {
      const res = await fetch(`/api/providers/${id}/models`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setNewModels(data);
        setNewSelectedModel(data[0]?.id ?? '');
        if (data.length === 0) setModelsError(t('noModels'));
      } else {
        setNewModels([]);
        setModelsError(data?.error ?? t('modelsFailed'));
      }
    } catch {
      setNewModels([]);
      setModelsError(t('modelsFailed'));
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
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(t('profileSaveFailed', { error: data.error ?? String(res.status) }));
      return;
    }
    setProfile(data);
    // The interface language is applied by the server layout, so re-render it.
    if (patch.uiLanguage) router.refresh();
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

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (!profile) return <p>{tCommon('loading')}</p>;

  return (
    <div>
      <nav>
        <Link href="/">{t('backHome')}</Link>
      </nav>
      {profileError && <p role="alert">{profileError}</p>}
      <section>
        <h2>{t('providers')}</h2>
        {providersFailed && <p role="alert">{t('providersLoadFailed')}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              {c.providerType} (<span>{t(`connectionStatus.${c.lastValidatedStatus}`)}</span>)
              {c.selectedModel ? ` — ${c.selectedModel}` : ''}
              {c.isActive ? ` ${t('activeMarker')}` : ''}
              <button onClick={() => handleSetActive(c.id)} disabled={c.isActive}>
                {t('makeActive')}
              </button>
              <button onClick={() => handleRetest(c.id)}>{t('retest')}</button>
              <button onClick={() => handleDelete(c.id)}>{t('remove')}</button>
              <span>
                {' '}
                {t('usage', {
                  requests: String(usage[c.id]?.requestCount ?? 0),
                  tokens: String(usage[c.id]?.tokenCount ?? 0),
                  days: String(USAGE_WINDOW_DAYS),
                })}
              </span>
            </li>
          ))}
        </ul>

        {!showAddProvider && <button onClick={() => setShowAddProvider(true)}>{t('addProvider')}</button>}

        {showAddProvider && addedConnectionId === null && (
          <div>
            <h3>{t('addProvider')}</h3>
            <select
              aria-label={t('newProviderType')}
              value={newProviderType}
              onChange={(e) => setNewProviderType(e.target.value as ProviderType)}
            >
              {PROVIDER_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {newProviderType === 'ollama' ? (
              <input
                value={newOllamaHost}
                onChange={(e) => setNewOllamaHost(e.target.value)}
                placeholder={t('ollamaHost')}
              />
            ) : (
              <input
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={t('apiKey')}
                type="password"
              />
            )}
            <button onClick={handleAddProvider} disabled={adding}>
              {t('saveProvider')}
            </button>
            <button onClick={closeAddProvider}>{t('cancel')}</button>
            {addError && <p role="alert">{addError}</p>}
          </div>
        )}

        {showAddProvider && addedConnectionId !== null && (
          <div>
            <h3>{t('chooseModel')}</h3>
            {newModels.length > 0 ? (
              <label>
                {t('model')}
                <select value={newSelectedModel} onChange={(e) => setNewSelectedModel(e.target.value)}>
                  {newModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{modelsError ?? t('noModelsAvailable')}</p>
            )}
            <button onClick={handleSaveModel}>{t('done')}</button>
            {modelSaveError && <p role="alert">{modelSaveError}</p>}
          </div>
        )}
      </section>

      <section>
        <h2>{t('trackLevel')}</h2>
        <select
          aria-label={t('trackLabel')}
          value={profile.activeTrack}
          onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Track })}
        >
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {tTracks(track)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('levelLabel')}
          value={profile.activeLevel}
          onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
        >
          {levelsUpTo(profile.highestUnlockedLevel).map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        {profile.highestUnlockedLevel !== 'C1' && <p>{t('levelHint', { level: profile.highestUnlockedLevel })}</p>}
      </section>

      <section>
        <h2>{t('dailyReview')}</h2>
        <label>
          {t('dailyReviewLimit')}{' '}
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={capDraft ?? String(profile.dailyReviewCap)}
            onChange={(e) => setCapDraft(e.target.value)}
            onBlur={saveDailyReviewCap}
          />
        </label>
        <p>{t('dailyReviewHint')}</p>
        {capError && <p role="alert">{capError}</p>}
      </section>

      <section>
        <h2>{t('placement')}</h2>
        {placementFailed && <p role="alert">{t('placementLoadFailed')}</p>}
        {placementBest === null && <p>{t('placementNone')}</p>}
        {placementBest && (
          <p>
            {t('placementBest', {
              level: placementBest.placedLevel,
              score: placementBest.score,
              max: placementBest.maxScore,
              date: placementBest.takenAt.slice(0, 10),
            })}
          </p>
        )}
        {placementBest !== undefined && (
          <Link href="/placement">{placementBest ? t('placementRetake') : t('placementTake')}</Link>
        )}
      </section>

      <section>
        <h2>{t('language')}</h2>
        <select
          aria-label={t('language')}
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </section>

      <section>
        <h2>{t('freestyle')}</h2>
        <label>
          <input
            type="checkbox"
            checked={profile.freestyleDefault}
            onChange={(e) => handleProfileChange({ freestyleDefault: e.target.checked })}
          />
          {t('freestyleDefault')}
        </label>
      </section>

      <section>
        <h2>{t('backup')}</h2>
        <button onClick={handleExport}>{t('exportBackup')}</button>
        <input
          type="file"
          accept=".gaitbackup"
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
        />
        {backupError && <p role="alert">{backupError}</p>}
        {importMessage && <p>{importMessage}</p>}
      </section>

      <section>
        <h2>{t('dangerZone')}</h2>
        {confirmingReset ? (
          <>
            <p>{t('resetConfirm')}</p>
            <button onClick={handleReset}>{t('resetYes')}</button>
            <button onClick={() => setConfirmingReset(false)}>{t('cancel')}</button>
          </>
        ) : (
          <button onClick={() => setConfirmingReset(true)}>{t('reset')}</button>
        )}
        {resetError && <p role="alert">{resetError}</p>}
      </section>
    </div>
  );
}
