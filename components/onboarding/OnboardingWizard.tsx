'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ModelInfo } from '@/lib/providers/types';
import type { Track } from '@/lib/types';
import { TRACKS } from '@/lib/tutoring/levels';
import { PlacementTest } from '@/components/placement/PlacementTest';
import { Logo } from '@/components/brand/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { CircleCheck } from 'lucide-react';

type Step = 'welcome' | 'provider' | 'track' | 'language' | 'placement';

const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
// The steps shown as dots. The placement test brings its own screens.
const DOT_STEPS: Step[] = ['welcome', 'provider', 'track', 'language', 'placement'];
const PRIMARY = 'min-h-12 w-full text-base font-semibold';
const FIELD_LABEL = 'text-sm font-semibold';

// Onboarding has no shell: one centred card with the full logo on top and the step dots below it.
function WizardCard({ step, children }: { step: Step; children: ReactNode }) {
  const current = DOT_STEPS.indexOf(step);
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md gap-6 px-5 py-8 sm:px-8">
        <Logo className="mx-auto w-full max-w-sm" />
        <ol aria-hidden className="flex items-center justify-center gap-2">
          {DOT_STEPS.map((dot, index) => (
            <li
              key={dot}
              className={cn(
                'h-2 rounded-full transition-all duration-200 motion-reduce:transition-none',
                index === current ? 'w-6 bg-primary' : index < current ? 'w-2 bg-primary/50' : 'w-2 bg-border',
              )}
            />
          ))}
        </ol>
        <div className="flex flex-col gap-5">{children}</div>
      </Card>
    </div>
  );
}

function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

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
  const fieldId = useId();

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
      <WizardCard step={step}>
        <h1 className="text-center text-3xl leading-tight">{t('welcomeTitle')}</h1>
        <Button size="lg" onClick={() => setStep('provider')} className={PRIMARY}>
          {t('getStarted')}
        </Button>
      </WizardCard>
    );
  }

  if (step === 'provider') {
    return (
      <WizardCard step={step}>
        <h2 className="text-2xl">{t('providerTitle')}</h2>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${fieldId}-type`} className={FIELD_LABEL}>
            {t('providerType')}
          </label>
          <NativeSelect
            id={`${fieldId}-type`}
            aria-label={t('providerType')}
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as typeof providerType)}
          >
            {PROVIDER_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </div>
        {providerType === 'ollama' ? (
          <Input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder={t('ollamaHost')} className="h-11" />
        ) : (
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('apiKey')} type="password" className="h-11" />
        )}
        <Button variant="secondary" size="lg" onClick={handleConnectAndTest} disabled={saving} className="min-h-11 w-full border border-border">
          {t('testConnection')}
        </Button>
        {testError && <ErrorAlert>{testError}</ErrorAlert>}
        {validated && (
          <p className="flex items-center gap-2 font-semibold text-success">
            <CircleCheck aria-hidden className="size-5 shrink-0" />
            {t('connected')}
          </p>
        )}
        {validated && models.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${fieldId}-model`} className={FIELD_LABEL}>
              {t('model')}
            </label>
            <NativeSelect id={`${fieldId}-model`} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {validated && modelsError && (modelsFailed ? <ErrorAlert>{modelsError}</ErrorAlert> : <p className="text-sm text-text-muted">{modelsError}</p>)}
        <Button size="lg" onClick={handleProviderNext} disabled={!validated} className={PRIMARY}>
          {t('next')}
        </Button>
        {providerNextError && <ErrorAlert>{providerNextError}</ErrorAlert>}
      </WizardCard>
    );
  }

  if (step === 'track') {
    return (
      <WizardCard step={step}>
        <h2 className="text-2xl">{t('trackTitle')}</h2>
        <NativeSelect aria-label={t('trackTitle')} value={track} onChange={(e) => setTrack(e.target.value as Track)}>
          {TRACKS.map((trackOption) => (
            <option key={trackOption} value={trackOption}>
              {tTracks(trackOption)}
            </option>
          ))}
        </NativeSelect>
        <Button size="lg" onClick={() => setStep('language')} className={PRIMARY}>
          {t('next')}
        </Button>
      </WizardCard>
    );
  }

  if (step === 'language') {
    return (
      <WizardCard step={step}>
        <h2 className="text-2xl">{t('languageTitle')}</h2>
        <NativeSelect
          aria-label={t('languageTitle')}
          value={uiLanguage}
          onChange={(e) => setUiLanguage(e.target.value as 'en' | 'de')}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </NativeSelect>
        <Button size="lg" onClick={handleLanguageNext} disabled={saving} className={PRIMARY}>
          {t('next')}
        </Button>
        {choicesError && <ErrorAlert>{choicesError}</ErrorAlert>}
      </WizardCard>
    );
  }

  // The placement test brings its own centred cards and, mid-test, the focus layout.
  return (
    <div className="flex min-h-dvh flex-col px-4">
      {finishError && (
        <div className="mx-auto mt-6 w-full max-w-md">
          <ErrorAlert>{finishError}</ErrorAlert>
        </div>
      )}
      <PlacementTest onFinished={finishOnboarding} onSkip={skipPlacement} />
    </div>
  );
}
