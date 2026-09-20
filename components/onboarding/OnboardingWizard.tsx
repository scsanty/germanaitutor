'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'welcome' | 'provider' | 'track' | 'language';

const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
const TRACKS = ['generic', 'telc', 'goethe'] as const;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [providerType, setProviderType] = useState<(typeof PROVIDER_TYPES)[number]>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  const [validated, setValidated] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [track, setTrack] = useState<(typeof TRACKS)[number]>('generic');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('A1');
  const [uiLanguage, setUiLanguage] = useState<'en' | 'de'>('en');
  const [saving, setSaving] = useState(false);

  async function handleConnectAndTest() {
    setSaving(true);
    setTestError(null);
    const body = providerType === 'ollama' ? { providerType, ollamaHost } : { providerType, apiKey };
    const createRes = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const created = await createRes.json();
    const testRes = await fetch(`/api/providers/${created.id}/test`, { method: 'POST' });
    const result = await testRes.json();
    setSaving(false);
    if (result.ok) {
      setValidated(true);
      await fetch('/api/providers/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id }),
      });
    } else {
      setTestError(result.error ?? 'Connection failed');
    }
  }

  async function handleFinish() {
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeTrack: track, activeLevel: level, uiLanguage, onboardingComplete: true }),
    });
    router.push('/');
  }

  if (step === 'welcome') {
    return (
      <div>
        <h1>Welcome to German AI Tutor</h1>
        <button onClick={() => setStep('provider')}>Get started</button>
      </div>
    );
  }

  if (step === 'provider') {
    return (
      <div>
        <h2>Connect an AI provider</h2>
        <select value={providerType} onChange={(e) => setProviderType(e.target.value as typeof providerType)}>
          {PROVIDER_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {providerType === 'ollama' ? (
          <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="Ollama host" />
        ) : (
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" type="password" />
        )}
        <button onClick={handleConnectAndTest} disabled={saving}>
          Test connection
        </button>
        {testError && <p role="alert">{testError}</p>}
        {validated && <p>Connected!</p>}
        <button onClick={() => setStep('track')} disabled={!validated}>
          Next
        </button>
      </div>
    );
  }

  if (step === 'track') {
    return (
      <div>
        <h2>Choose your track and level</h2>
        <select value={track} onChange={(e) => setTrack(e.target.value as typeof track)}>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={() => setStep('language')}>Next</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Choose your interface language</h2>
      <select value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value as 'en' | 'de')}>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      <button onClick={handleFinish}>Finish</button>
    </div>
  );
}
