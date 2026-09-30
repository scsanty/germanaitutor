'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessageView } from '@/lib/tutoring/lessonChat';
import type { GradeResult } from '@/lib/tutoring/grading';
import { useApiErrorText } from '@/components/useApiErrorText';
import { MessageCircle, Send, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

export type AskAbout =
  | { kind: 'exercise'; exerciseId: string; label: string }
  | { kind: 'practice'; practiceExerciseId: string; answerText: string; result: GradeResult; label: string };

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
  const errorText = useApiErrorText();
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const wide = useMediaQuery('(min-width: 768px)');

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

  // Phase 2 leftover: a failed load is retried the next time the panel opens.
  useEffect(() => {
    if (!open) setLoadFailed(false);
  }, [open]);

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
        body: JSON.stringify(
          askAbout?.kind === 'exercise'
            ? { message, exerciseId: askAbout.exerciseId }
            : askAbout?.kind === 'practice'
              ? {
                  message,
                  practiceExerciseId: askAbout.practiceExerciseId,
                  practiceAnswer: { answerText: askAbout.answerText, result: askAbout.result },
                }
              : { message, exerciseId: null }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages((previous) => [...(previous ?? []), ...(data.messages as ChatMessageView[])]);
        setDraft('');
        // The exercise stays attached for follow-up questions until the student clears it (×)
        // or asks about another one (Phase 2 leftover).
        return;
      }
      const detail = errorText(data, String(res.status));
      if (res.status === 502) setAiError(detail);
      else setError(t('genericError', { error: detail }));
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  const settingsLink = (chunks: ReactNode) => (
    <Link href="/settings" className="font-semibold underline underline-offset-2">
      {chunks}
    </Link>
  );

  // Spec (design pass): a Sheet from the bottom on phones, from the right from 768 px.
  return (
    <>
      <Button type="button" variant="secondary" aria-expanded={open} onClick={onToggle} className="min-h-11 self-start">
        <MessageCircle aria-hidden />
        {open ? t('hide') : t('show')}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !next && onToggle()}>
        <SheetContent
          side={wide ? 'right' : 'bottom'}
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            'gap-0 bg-surface data-[state=closed]:duration-200 data-[state=open]:duration-250',
            wide ? 'w-full sm:max-w-md' : 'max-h-[85dvh] rounded-t-2xl'
          )}
        >
          <SheetHeader className="flex-row items-center justify-between border-b border-border py-2 pr-2 pl-4">
            <SheetTitle className="flex items-center gap-2 font-heading text-lg font-extrabold">
              <MessageCircle aria-hidden className="size-5 text-primary" />
              {t('tutor')}
            </SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('hide')} className="size-11">
                <X aria-hidden />
              </Button>
            </SheetClose>
          </SheetHeader>
          <div className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {loadFailed && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{t('loadFailed')}</AlertDescription>
              </Alert>
            )}
            {!loadFailed && messages === null && (
              <div role="status" aria-label={tCommon('loading')} className="flex flex-col gap-3">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="ml-auto h-10 w-2/3" />
              </div>
            )}
            {messages && messages.length === 0 && <p className="m-auto text-center text-sm text-text-muted">{t('empty')}</p>}
            {messages && messages.length > 0 && (
              <ul className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      m.role === 'user'
                        ? 'self-end rounded-br-md bg-primary/15 text-text'
                        : 'self-start rounded-bl-md border border-border bg-surface-raised text-text'
                    )}
                  >
                    <strong className="block text-xs font-semibold text-text-muted">{m.role === 'user' ? `${t('you')}:` : `${t('tutor')}:`}</strong>{' '}
                    {(m.exerciseId || m.practiceExerciseId) && <em className="text-text-muted">{t('aboutExercise')} </em>}
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
            {messages && !aiAvailable && (
              <Alert role={undefined}>
                <AlertDescription>{t.rich('unavailable', { link: settingsLink })}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {askAbout && (
              <p className="flex items-center gap-1 self-start rounded-full bg-primary/15 py-0.5 pl-3 text-sm">
                {t('askingAbout', { label: askAbout.label })}{' '}
                <Button type="button" variant="ghost" size="icon" aria-label={t('clearAskAbout')} onClick={onClearAskAbout} className="size-11 rounded-full">
                  <X aria-hidden />
                </Button>
              </p>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                aria-label={t('messageLabel')}
                value={draft}
                disabled={!aiAvailable || busy}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                className="max-h-40 min-h-11 bg-background"
              />
              <Button type="button" disabled={!aiAvailable || busy || messages === null || !draft.trim()} onClick={send} className="min-h-11 px-4">
                <Send aria-hidden />
                {busy ? t('sending') : t('send')}
              </Button>
            </div>
            {aiError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{t.rich('aiFailed', { error: aiError, link: settingsLink })}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
