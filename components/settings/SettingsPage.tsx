'use client';

import { useEffect, useState } from 'react';
import type { ProviderConnection, Profile } from '@/lib/types';

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then(setProfile);
    fetch('/api/providers').then((r) => r.json()).then(setConnections);
  }, []);

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
              {c.providerType} ({c.lastValidatedStatus}){c.isActive ? ' — active' : ''}
              <button onClick={() => handleSetActive(c.id)} disabled={c.isActive}>
                Make active
              </button>
              <button onClick={() => handleRetest(c.id)}>Re-test</button>
              <button onClick={() => handleDelete(c.id)}>Remove</button>
            </li>
          ))}
        </ul>
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
