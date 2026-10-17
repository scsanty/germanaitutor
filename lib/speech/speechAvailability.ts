import type Database from 'better-sqlite3';
import type { SpeechProvider } from './speechProvider';
import { getSpeechUrl } from './speechProvider';
import { createLocalSpeechProvider } from './localSpeechProvider';

// Spec: availability rules ask "is the speech service up?" once per request; the answer is
// memoized in-process for 30 s (S7), keyed by URL so a changed `speech_url` is checked afresh.
export const HEALTH_MEMO_MS = 30_000;

export interface SpeechAvailability {
  isUp(url: string): Promise<boolean>;
  // The worker's 60 s health tick refreshes the memo with what it saw.
  record(url: string, ok: boolean): void;
  clear(): void;
}

export interface SpeechAvailabilityOptions {
  provider?: (url: string) => Pick<SpeechProvider, 'health'>;
  now?: () => number;
  ttlMs?: number;
}

export function createSpeechAvailability(opts: SpeechAvailabilityOptions = {}): SpeechAvailability {
  const providerFor = opts.provider ?? createLocalSpeechProvider;
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? HEALTH_MEMO_MS;
  const memo = new Map<string, { ok: boolean; at: number }>();
  // Concurrent requests share one health call per URL.
  const pending = new Map<string, Promise<boolean>>();

  function record(url: string, ok: boolean): void {
    memo.set(url, { ok, at: now() });
  }

  function isUp(url: string): Promise<boolean> {
    const hit = memo.get(url);
    if (hit && now() - hit.at < ttl) return Promise.resolve(hit.ok);
    const running = pending.get(url);
    if (running) return running;
    const check = (async () => {
      let ok = false;
      try {
        ok = (await providerFor(url).health()).ok;
      } catch {
        ok = false;
      }
      record(url, ok);
      return ok;
    })().finally(() => pending.delete(url));
    pending.set(url, check);
    return check;
  }

  return { isUp, record, clear: () => memo.clear() };
}

// One memo per process. Next can load this module in more than one bundle (instrumentation and
// routes), so the instance lives on globalThis and the worker's refresh reaches the routes.
const KEY = Symbol.for('nadoch.speechAvailability');

export function sharedSpeechAvailability(): SpeechAvailability {
  const g = globalThis as unknown as Record<symbol, SpeechAvailability | undefined>;
  return (g[KEY] ??= createSpeechAvailability());
}

export function isSpeechUp(db: Database.Database): Promise<boolean> {
  return sharedSpeechAvailability().isUp(getSpeechUrl(db));
}
