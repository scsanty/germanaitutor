'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ChatMessageView } from '@/lib/tutoring/lessonChat';

export interface AskAbout {
  exerciseId: string;
  label: string;
}

export interface LessonChatProps {
  lessonId: string;
  open: boolean;
  onToggle: () => void;
  askAbout: AskAbout | null;
  onClearAskAbout: () => void;
}

export function LessonChat({ lessonId, open, onToggle, askAbout, onClearAskAbout }: LessonChatProps) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // The thread loads the first time the panel opens.
  useEffect(() => {
    if (!open || messages !== null || loadFailed) return;
    let cancelled = false;
    fetch(`/api/tutoring/lessons/${lessonId}/chat`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages);
        setAiAvailable(data.aiAvailable);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lessonId, messages, loadFailed]);

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/tutoring/lessons/${lessonId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, exerciseId: askAbout?.exerciseId ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages((previous) => [...(previous ?? []), ...(data.messages as ChatMessageView[])]);
        setDraft('');
        onClearAskAbout();
        return;
      }
      const detail = typeof data.error === 'string' ? data.error : String(res.status);
      if (res.status === 502) setAiError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  const settingsLink = (chunks: ReactNode) => <Link href="/settings">{chunks}</Link>;

  return (
    <section>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        {open ? t('hide') : t('show')}
      </button>
      {open && (
        <div>
          {loadFailed && <p role="alert">{t('loadFailed')}</p>}
          {!loadFailed && messages === null && <p>{tCommon('loading')}</p>}
          {messages && messages.length === 0 && <p>{t('empty')}</p>}
          {messages && messages.length > 0 && (
            <ul>
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.role === 'user' ? `${t('you')}:` : `${t('tutor')}:`}</strong>{' '}
                  {m.exerciseId && <em>{t('aboutExercise')} </em>}
                  {m.content}
                </li>
              ))}
            </ul>
          )}
          {messages && !aiAvailable && <p>{t.rich('unavailable', { link: settingsLink })}</p>}
          {askAbout && (
            <p>
              {t('askingAbout', { label: askAbout.label })}{' '}
              <button type="button" aria-label={t('clearAskAbout')} onClick={onClearAskAbout}>
                ×
              </button>
            </p>
          )}
          <textarea
            aria-label={t('messageLabel')}
            value={draft}
            disabled={!aiAvailable || busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" disabled={!aiAvailable || busy || messages === null || !draft.trim()} onClick={send}>
            {busy ? t('sending') : t('send')}
          </button>
          {aiError && <p role="alert">{t.rich('aiFailed', { error: aiError, link: settingsLink })}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
