'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/components/useApiErrorText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FREESTYLE_MODES, type FreestyleMode } from '@/lib/freestyle/modes';
import type { SessionMessage, SessionView } from '@/lib/freestyle/sessionViews';
import type { CefrLevel } from '@/lib/types';
import { ChatThread } from './ChatThread';
import { SessionSetup } from './SessionSetup';

interface SetupData {
  levels: CefrLevel[];
  activeLevel: CefrLevel;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

// Opens a mode: resumes its open session, or shows the setup to start one.
export function FreestyleSession({ mode }: { mode: FreestyleMode }) {
  const t = useTranslations('freestyle');
  const errorText = useApiErrorText();
  // undefined while loading; null when no session is open.
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [topicsFailed, setTopicsFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const topicsFor = useRef<CefrLevel | null>(null);

  // S16: the drill topics depend on the level picked in the setup; only the latest request counts.
  const loadTopics = useCallback(
    (level: CefrLevel) => {
      if (mode !== 'grammar_drill') return;
      topicsFor.current = level;
      setTopicsFailed(false);
      getJson<{ grammarTopics: string[] }>(`/api/freestyle/topics?level=${level}`)
        .then((data) => {
          if (topicsFor.current === level) setTopics(data.grammarTopics);
        })
        .catch(() => {
          if (topicsFor.current !== level) return;
          setTopics([]);
          setTopicsFailed(true);
        });
    },
    [mode]
  );

  useEffect(() => {
    let stale = false;
    (async () => {
      const { session: open } = await getJson<{ session: SessionView | null }>(`/api/freestyle/${mode}/session`);
      if (stale) return;
      if (open) {
        setSession(open);
        return;
      }
      const overview = await getJson<SetupData>('/api/freestyle');
      if (stale) return;
      setSetupData({ levels: overview.levels, activeLevel: overview.activeLevel });
      setSession(null);
      loadTopics(overview.levels.includes(overview.activeLevel) ? overview.activeLevel : overview.levels[0]);
    })().catch(() => {
      if (!stale) setFailed(true);
    });
    return () => {
      stale = true;
      topicsFor.current = null;
    };
  }, [mode, loadTopics]);

  async function send(text: string) {
    let res: Response;
    try {
      res = await fetch(`/api/freestyle/${mode}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      throw new Error(t('sendFailed'));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errorText(data, t('sendFailed')));
    const added = (data as { messages: SessionMessage[] }).messages;
    setSession((current) => (current ? { ...current, messages: [...current.messages, ...added] } : current));
  }

  const labelKey = FREESTYLE_MODES.find((m) => m.mode === mode)?.labelKey ?? 'conversation';

  let body: React.ReactNode;
  if (failed) {
    body = (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  } else if (session === undefined) {
    body = (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-3">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-12 w-1/2" />
      </div>
    );
  } else if (session === null && setupData) {
    body = (
      <>
        {topicsFailed && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('topicsFailed')}</AlertDescription>
          </Alert>
        )}
        <SessionSetup
          mode={mode}
          levels={setupData.levels}
          activeLevel={setupData.activeLevel}
          grammarTopics={topics}
          onStarted={setSession}
          onLevelChange={loadTopics}
        />
      </>
    );
  } else if (session && (mode === 'conversation' || mode === 'grammar_drill')) {
    body = <ChatThread mode={mode} messages={session.messages} onSend={send} />;
  }
  // free_reading and free_writing: Task 9 adds their screens here.

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* S15: the title and the level only; Task 10 adds End to this header. */}
      <header className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-extrabold">{t(`modes.${labelKey}`)}</h1>
        {session && (
          <Badge variant="secondary" className="text-sm">
            <span className="sr-only">{t('level')} </span>
            {session.level}
          </Badge>
        )}
      </header>
      {body}
    </div>
  );
}
