'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PenLine, Send } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { differsByLanguage, isLocalizedText, pickText, type ContentLanguage } from '@/lib/i18n/localizedText';
import type { SessionMessage, SessionView } from '@/lib/freestyle/sessionViews';
import { CorrectionList, readCorrections } from './CorrectionList';
import { GermanLetters } from './GermanLetters';
import { TappableGerman } from './TappableGerman';

interface Version {
  student: SessionMessage;
  reply: SessionMessage | null;
}

// Each submission is a student message followed by the AI's corrected version.
function pairVersions(messages: SessionMessage[]): Version[] {
  const versions: Version[] = [];
  for (const m of messages) {
    if (m.role === 'user') versions.push({ student: m, reply: null });
    else if (versions.length > 0 && !versions[versions.length - 1].reply) versions[versions.length - 1].reply = m;
  }
  return versions;
}

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// Spec: free writing is AI correction, not in exam format. Versions are stacked, newest last (I15).
export function WritingSession({ session, onMessages }: { session: SessionView; onMessages: (messages: SessionMessage[]) => void }) {
  const t = useTranslations('freestyle');
  const errorText = useApiErrorText();
  const versions = pairVersions(session.messages);
  const prompt = typeof session.setup.prompt === 'string' ? session.setup.prompt.trim() : '';
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const newest = useRef<HTMLLIElement>(null);
  const shown = useRef(versions.length);
  // A ref as well as state: a second click can land before the re-render that disables submitting.
  const sending = useRef(false);

  // Bring a newly added version into view; opening a session with versions leaves the page at the top.
  useEffect(() => {
    if (versions.length > shown.current) newest.current?.scrollIntoView?.({ block: 'start' });
    shown.current = versions.length;
  }, [versions.length]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/freestyle/free_writing/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorText(data, t('submitFailed')));
        return;
      }
      setDraft('');
      onMessages((data as { messages: SessionMessage[] }).messages);
    } catch {
      setError(t('submitFailed'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  // Stable, so typing in the box does not re-render the versions above it.
  const revise = useCallback((text: string) => {
    setDraft(text);
    requestAnimationFrame(() => {
      box.current?.scrollIntoView?.({ block: 'center' });
      box.current?.focus();
    });
  }, []);

  const words = countWords(draft);

  return (
    <div className="flex flex-col gap-6">
      {prompt && (
        <p className="text-text-muted">
          {t('topic')}: <span lang="de" className="font-medium text-text">{prompt}</span>
        </p>
      )}

      {versions.length > 0 && (
        <ol aria-label={t('versions')} className="flex flex-col gap-5">
          {versions.map((v, i) => (
            <li key={v.student.id} ref={i === versions.length - 1 ? newest : undefined} className="scroll-mt-24">
              <VersionCard
                n={i + 1}
                student={v.student}
                reply={v.reply}
                canRevise={i === versions.length - 1 && v.reply !== null}
                onRevise={revise}
                busy={busy}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <label htmlFor="freestyle-writing" className="text-sm font-medium">
          {t('yourText')}
        </label>
        <Textarea
          id="freestyle-writing"
          ref={box}
          lang="de"
          rows={8}
          value={draft}
          maxLength={6000}
          readOnly={busy}
          aria-busy={busy}
          aria-describedby="freestyle-writing-count"
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-48 text-base leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GermanLetters box={box} value={draft} onChange={setDraft} disabled={busy} />
          <div className="flex items-center gap-3">
            <span id="freestyle-writing-count" className="text-sm text-text-muted tabular-nums">
              {t('words', { count: words })}
            </span>
            <Button type="button" className="min-h-11 px-5" disabled={busy || words === 0} onClick={() => void submit()}>
              <Send aria-hidden />
              {t('submit')}
            </Button>
          </div>
        </div>
        <p role="status" className="min-h-5 text-xs text-text-muted">
          {busy ? t('submitting') : ''}
        </p>
      </div>
    </div>
  );
}

const VersionCard = memo(function VersionCard({
  n,
  student,
  reply,
  canRevise,
  onRevise,
  busy,
}: Version & {
  n: number;
  canRevise: boolean;
  onRevise: (text: string) => void;
  busy: boolean;
}) {
  const t = useTranslations('freestyle');
  const locale = useLocale() as ContentLanguage;
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const corrections = readCorrections(reply?.extra?.corrections);
  const comment = isLocalizedText(reply?.extra?.comment) ? reply.extra.comment : null;

  return (
    <section aria-labelledby={`fw-version-${student.id}`} className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`fw-version-${student.id}`} className="font-heading text-lg font-bold">
          {t('version', { n })}
        </h2>
        {canRevise && (
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onRevise(student.content)}>
            <PenLine aria-hidden />
            {t('revise')}
          </Button>
        )}
      </div>
      {/* I15: on wide screens, what the student wrote and the corrected text sit side by side. */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{t('yourVersion')}</h3>
          <p lang="de" className="leading-relaxed whitespace-pre-wrap">
            {student.content}
          </p>
        </div>
        {reply && (
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-success uppercase">{t('corrected')}</h3>
            <p data-testid="corrected" lang="de" className="rounded-lg bg-surface-raised px-3 py-2 leading-relaxed whitespace-pre-wrap">
              <TappableGerman text={reply.content} />
            </p>
          </div>
        )}
      </div>
      {corrections.length > 0 && <CorrectionList corrections={corrections} className="border-t border-border pt-3" />}
      {comment && (
        <div className="flex items-start gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{t('comment')}</h3>
            <p className="leading-relaxed">{pickText(comment, language)}</p>
          </div>
          {differsByLanguage(comment) && <LanguageToggle value={language} onChange={setLanguage} label={t('commentLanguage')} />}
        </div>
      )}
    </section>
  );
});
