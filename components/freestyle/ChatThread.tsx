'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { differsByLanguage, isLocalizedText, pickText, type ContentLanguage, type LocalizedText } from '@/lib/i18n/localizedText';
import type { FreestyleMode } from '@/lib/freestyle/modes';
import type { SessionMessage } from '@/lib/freestyle/sessionViews';
import { cn } from '@/lib/utils';
import { CorrectionList, readCorrections } from './CorrectionList';
import { GermanLetters } from './GermanLetters';
import { TappableGerman } from './TappableGerman';

const VERDICTS = ['correct', 'almost', 'wrong'] as const;
type Verdict = (typeof VERDICTS)[number];
const VERDICT_STYLE: Record<Verdict, string> = {
  correct: 'border-success/40 bg-success/15 text-success',
  almost: 'border-warning/40 bg-warning/15 text-warning',
  wrong: 'border-danger/40 bg-danger/15 text-danger',
};

interface Props {
  mode: FreestyleMode;
  messages: SessionMessage[];
  onSend: (text: string) => Promise<void>;
}

export function ChatThread({ mode, messages, onSend }: Props) {
  const t = useTranslations('freestyle');
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view after every change. The sentinel sits after the sticky
  // composer, so the newest message lands above it, not underneath.
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView?.({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }, [messages.length]);

  return (
    <div data-mode={mode} className="flex flex-col gap-4">
      <ol aria-label={t('thread')} className="flex flex-col gap-3">
        {messages.map((message) =>
          message.role === 'assistant' ? (
            <AssistantMessage key={message.id} message={message} />
          ) : (
            <UserMessage key={message.id} message={message} />
          )
        )}
      </ol>
      <Composer onSend={onSend} />
      <div ref={end} aria-hidden className="scroll-mb-36 md:scroll-mb-0" />
    </div>
  );
}

// Holds the draft, so typing re-renders only the composer, not the thread.
function Composer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const t = useTranslations('freestyle');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // A ref as well as state: a second Enter can land before the re-render that disables sending.
  const sending = useRef(false);

  async function send() {
    const text = draft.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSend(text);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('sendFailed'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    // Phones: pinned above AppShell's bottom nav and floating buttons (as LessonPage does). From 768 px, at the bottom.
    <div className="sticky bottom-[8.75rem] z-[5] flex flex-col gap-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bottom-0 md:rounded-none md:border-x-0 md:border-b-0 md:px-0 md:pb-2">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <label htmlFor="freestyle-message" className="sr-only">
        {t('yourMessage')}
      </label>
      <Textarea
        id="freestyle-message"
        ref={box}
        lang="de"
        rows={2}
        value={draft}
        maxLength={2000}
        // The text being sent stays put until the reply lands (it is cleared then).
        readOnly={busy}
        aria-busy={busy}
        placeholder={t('yourMessage')}
        aria-describedby="freestyle-message-hint"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        className="min-h-16 resize-none text-base"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GermanLetters box={box} value={draft} onChange={setDraft} disabled={busy} />
        <Button type="button" onClick={() => void send()} disabled={busy || !draft.trim()} className="min-h-11 px-5">
          <Send aria-hidden />
          {t('send')}
        </Button>
      </div>
      <p id="freestyle-message-hint" className="text-xs text-text-muted">
        {busy ? t('sending') : t('enterHint')}
      </p>
    </div>
  );
}

const UserMessage = memo(function UserMessage({ message }: { message: SessionMessage }) {
  const corrections = readCorrections(message.extra?.corrections);
  return (
    <li className="flex flex-col items-end gap-2">
      <p lang="de" className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-2.5 leading-relaxed whitespace-pre-wrap">
        {message.content}
      </p>
      {corrections.length > 0 && (
        <CorrectionList corrections={corrections} className="w-full max-w-[85%] rounded-xl border border-border bg-surface px-4 py-3" />
      )}
    </li>
  );
});

const AssistantMessage = memo(function AssistantMessage({ message }: { message: SessionMessage }) {
  const t = useTranslations('exercise.practiceResult');
  const tFs = useTranslations('freestyle');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const verdict = VERDICTS.find((v) => v === message.extra?.verdict);
  const explanation: LocalizedText | null = isLocalizedText(message.extra?.explanation) ? message.extra.explanation : null;

  return (
    <li className="flex flex-col items-start gap-2">
      {verdict && (
        <div className="flex w-full max-w-[85%] flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Badge variant="outline" className={cn('text-sm', VERDICT_STYLE[verdict])}>
                {t(verdict)}
              </Badge>
              {explanation && <p className="text-sm leading-relaxed">{pickText(explanation, language)}</p>}
            </div>
            {explanation && differsByLanguage(explanation) && (
              <LanguageToggle value={language} onChange={setLanguage} label={tFs('explanationLanguage')} />
            )}
          </div>
        </div>
      )}
      <p lang="de" className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-4 py-2.5 leading-relaxed whitespace-pre-wrap">
        <TappableGerman text={message.content} />
      </p>
    </li>
  );
});
