'use client';

import { useEffect, useState } from 'react';
import type { ProviderConnection, Profile, ProviderType } from '@/lib/types';
import type { ModelInfo } from '@/lib/providers/types';

const PROVIDER_TYPES: ProviderType[] = ['anthropic', 'openai', 'gemini', 'ollama'];
const USAGE_WINDOW_DAYS = 7;

interface UsageTotals {
  requestCount: number;
  tokenCount: number;
}

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
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

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then(setProfile);
    fetch('/api/providers').then((r) => r.json()).then(setConnections);
  }, []);

  // Powers the spec's "approaching your limit" view: a per-connection rollup of
  // the last week's requests/tokens, refreshed whenever the list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      connections.map(async (c) => {
        const res = await fetch(`/api/usage?connectionId=${c.id}&days=${USAGE_WINDOW_DAYS}`);
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
    const res = await fetch('/api/providers');
    setConnections(await res.json());
  }

  async function handleSetActive(id: number) {
    await fetch('/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await refreshConnections();
  }

  async function handleRetest(id: number) {
    await fetch(`/api/providers/${id}/test`, { method: 'POST' });
    await refreshConnections();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    await refreshConnections();
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
      setAddError('Failed to save provider connection');
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
        if (data.length === 0) setModelsError('No models reported by this provider');
      } else {
        setNewModels([]);
        setModelsError(data?.error ?? 'Could not load models');
      }
    } catch {
      setNewModels([]);
      setModelsError('Could not load models');
    }
  }

  async function handleSaveModel() {
    if (addedConnectionId !== null && newSelectedModel) {
      await fetch(`/api/providers/${addedConnectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModel: newSelectedModel }),
      });
      await refreshConnections();
    }
    closeAddProvider();
  }

  async function handleProfileChange(patch: Partial<Profile>) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setProfile(await res.json());
  }

  async function handleExport() {
    const res = await fetch('/api/backup/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'germanaitutor-backup.gaitbackup';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    await fetch('/api/backup/import', { method: 'POST', body: file });
  }

  async function handleReset() {
    await fetch('/api/reset', { method: 'POST' });
    setConfirmingReset(false);
    window.location.href = '/onboarding';
  }

  if (!profile) return <p>Loading...</p>;

  return (
    <div>
      <section>
        <h2>Providers</h2>
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              {c.providerType} ({c.lastValidatedStatus}){c.selectedModel ? ` — ${c.selectedModel}` : ''}
              {c.isActive ? ' — active' : ''}
              <button onClick={() => handleSetActive(c.id)} disabled={c.isActive}>
                Make active
              </button>
              <button onClick={() => handleRetest(c.id)}>Re-test</button>
              <button onClick={() => handleDelete(c.id)}>Remove</button>
              <span>
                {' '}
                {usage[c.id]?.requestCount ?? 0} requests, {usage[c.id]?.tokenCount ?? 0} tokens (last{' '}
                {USAGE_WINDOW_DAYS} days)
              </span>
            </li>
          ))}
        </ul>

        {!showAddProvider && <button onClick={() => setShowAddProvider(true)}>Add provider</button>}

        {showAddProvider && addedConnectionId === null && (
          <div>
            <h3>Add provider</h3>
            <select
              aria-label="New provider type"
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
                placeholder="Ollama host"
              />
            ) : (
              <input
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="API key"
                type="password"
              />
            )}
            <button onClick={handleAddProvider} disabled={adding}>
              Save provider
            </button>
            <button onClick={closeAddProvider}>Cancel</button>
            {addError && <p role="alert">{addError}</p>}
          </div>
        )}

        {showAddProvider && addedConnectionId !== null && (
          <div>
            <h3>Choose a model</h3>
            {newModels.length > 0 ? (
              <label>
                Model
                <select value={newSelectedModel} onChange={(e) => setNewSelectedModel(e.target.value)}>
                  {newModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{modelsError ?? 'No models available'}</p>
            )}
            <button onClick={handleSaveModel}>Done</button>
          </div>
        )}
      </section>

      <section>
        <h2>Track & level</h2>
        <select
          value={profile.activeTrack}
          onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Profile['activeTrack'] })}
        >
          <option value="generic">Generic</option>
          <option value="telc">TELC</option>
          <option value="goethe">Goethe</option>
        </select>
        <select
          value={profile.activeLevel}
          onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
        >
          {['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2>Language</h2>
        <select
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </section>

      <section>
        <h2>Freestyle mode</h2>
        <label>
          <input
            type="checkbox"
            checked={profile.freestyleDefault}
            onChange={(e) => handleProfileChange({ freestyleDefault: e.target.checked })}
          />
          Default to freestyle mode
        </label>
      </section>

      <section>
        <h2>Backup</h2>
        <button onClick={handleExport}>Export backup</button>
        <input
          type="file"
          accept=".gaitbackup"
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
        />
      </section>

      <section>
        <h2>Danger zone</h2>
        {confirmingReset ? (
          <>
            <p>This deletes all local data permanently. Are you sure?</p>
            <button onClick={handleReset}>Yes, reset everything</button>
            <button onClick={() => setConfirmingReset(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmingReset(true)}>Reset app data</button>
        )}
      </section>
    </div>
  );
}
