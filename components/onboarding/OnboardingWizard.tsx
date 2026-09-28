'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ModelInfo } from '@/lib/providers/types';
import type { Track } from '@/lib/types';
import { TRACKS } from '@/lib/tutoring/levels';
import { PlacementTest } from '@/components/placement/PlacementTest';

type Step = 'welcome' | 'provider' | 'track' | 'language' | 'placement';

const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function OnboardingWizard({ initialStep = 'welcome' }: { initialStep?: Step }) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const tTracks = useTranslations('tracks');
  const [step, setStep] = useState<Step>(initialStep);
  const [providerType, setProviderType] = useState<(typeof PROVIDER_TYPES)[number]>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  const [validated, setValidated] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [track, setTrack] = useState<Track>('generic');
  const [uiLanguage, setUiLanguage] = useState<'en' | 'de'>('en');
  const [saving, setSaving] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [providerNextError, setProviderNextError] = useState<string | null>(null);

  async function handleConnectAndTest() {
    setSaving(true);
    setTestError(null);
    try {
      const body = providerType === 'ollama' ? { providerType, ollamaHost } : { providerType, apiKey };
      const createRes = await fetch('/api/providers', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!createRes.ok) {
        setTestError(t('saveFailed'));
        return;
      }
      const created = await createRes.json();
      const testRes = await fetch(`/api/providers/${created.id}/test`, { method: 'POST' });
      if (!testRes.ok) {
        setTestError(t('connectionFailed'));
        return;
      }
      const result = await testRes.json();
      if (!result.ok) {
        setTestError(result.error ?? t('connectionFailed'));
        return;
      }
      const activeRes = await fetch('/api/providers/active', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: created.id }),
      });
      if (!activeRes.ok) {
        setTestError(t('saveFailed'));
        return;
      }
      setValidated(true);
      setConnectionId(created.id);
      await loadModels(created.id);
    } catch {
      setTestError(t('connectionFailed'));
    } finally {
      setSaving(false);
    }
  }

  // A provider can be unreachable even after a successful test (e.g. Ollama
  // stopped in between), so a failure here degrades to "no models" rather than
  // blocking onboarding.
  async function loadModels(id: number) {
    setModelsError(null);
    setModelsFailed(false);
    try {
      const res = await fetch(`/api/providers/${id}/models`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModels([]);
        setModelsError(typeof data?.error === 'string' ? data.error : t('modelsFailed'));
        setModelsFailed(true);
        return;
      }
      const data = await res.json();
      setModels(data);
      setSelectedModel(data[0]?.id ?? '');
      if (data.length === 0) setModelsError(t('noModels'));
    } catch {
      setModels([]);
      setModelsError(t('modelsFailed'));
      setModelsFailed(true);
    }
  }

  async function handleProviderNext() {
    setProviderNextError(null);
    if (connectionId !== null && selectedModel) {
      try {
        const res = await fetch(`/api/providers/${connectionId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ selectedModel }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setProviderNextError(t('modelSaveFailed'));
        return;
      }
    }
    setStep('track');
  }

  // Saved before the placement test so leaving mid-test can resume there.
  async function handleLanguageNext() {
    setSaving(true);
    setChoicesError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ activeTrack: track, uiLanguage, onboardingChoicesSaved: true }),
      });
      if (!res.ok) {
        setChoicesError(t('saveChoicesFailed'));
        return;
      }
      router.refresh();
      setStep('placement');
    } catch {
      setChoicesError(t('saveChoicesFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function finishOnboarding() {
    setFinishError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ onboardingComplete: true }),
      });
      if (!res.ok) {
        setFinishError(t('finishFailed'));
        return;
      }
      router.push('/');
    } catch {
      setFinishError(t('finishFailed'));
    }
  }

  async function skipPlacement() {
    setFinishError(null);
    try {
      const res = await fetch('/api/placement/skip', { method: 'POST' });
      if (!res.ok) {
        setFinishError(t('finishFailed'));
        return;
      }
      await finishOnboarding();
    } catch {
      setFinishError(t('finishFailed'));
    }
  }

  if (step === 'welcome') {
    return (
      <div>
        <h1>{t('welcomeTitle')}</h1>
        <button onClick={() => setStep('provider')}>{t('getStarted')}</button>
      </div>
    );
  }

  if (step === 'provider') {
    return (
      <div>
        <h2>{t('providerTitle')}</h2>
        <select
          aria-label={t('providerType')}
          value={providerType}
          onChange={(e) => setProviderType(e.target.value as typeof providerType)}
        >
          {PROVIDER_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {providerType === 'ollama' ? (
          <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder={t('ollamaHost')} />
        ) : (
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('apiKey')} type="password" />
        )}
        <button onClick={handleConnectAndTest} disabled={saving}>
          {t('testConnection')}
        </button>
        {testError && <p role="alert">{testError}</p>}
        {validated && <p>{t('connected')}</p>}
        {validated && models.length > 0 && (
          <label>
            {t('model')}
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {validated && modelsError && (modelsFailed ? <p role="alert">{modelsError}</p> : <p>{modelsError}</p>)}
        <button onClick={handleProviderNext} disabled={!validated}>
          {t('next')}
        </button>
        {providerNextError && <p role="alert">{providerNextError}</p>}
      </div>
    );
  }

  if (step === 'track') {
    return (
      <div>
        <h2>{t('trackTitle')}</h2>
        <select aria-label={t('trackTitle')} value={track} onChange={(e) => setTrack(e.target.value as Track)}>
          {TRACKS.map((trackOption) => (
            <option key={trackOption} value={trackOption}>
              {tTracks(trackOption)}
            </option>
          ))}
        </select>
        <button onClick={() => setStep('language')}>{t('next')}</button>
      </div>
    );
  }

  if (step === 'language') {
    return (
      <div>
        <h2>{t('languageTitle')}</h2>
        <select
          aria-label={t('languageTitle')}
          value={uiLanguage}
          onChange={(e) => setUiLanguage(e.target.value as 'en' | 'de')}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
        <button onClick={handleLanguageNext} disabled={saving}>
          {t('next')}
        </button>
        {choicesError && <p role="alert">{choicesError}</p>}
      </div>
    );
  }

  return (
    <div>
      {finishError && <p role="alert">{finishError}</p>}
      <PlacementTest onFinished={finishOnboarding} onSkip={skipPlacement} />
    </div>
  );
}
