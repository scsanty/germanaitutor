import type Database from 'better-sqlite3';
import { createAudioService } from '../services/audioService';
import { createNotificationService } from '../services/notificationService';
import { getSpeechProvider, getSpeechUrl } from '../speech/speechProvider';
import { runHealthCheck } from './healthCheck';
import { runContentCheck } from './contentCheck';

const started = Symbol.for('nadoch.worker');

export const JOB_TICK_MS = 5000;
export const HEALTH_TICK_MS = 60_000;
// The content check limits itself to once per 24 h (stored), so an hourly tick survives restarts.
export const CONTENT_TICK_MS = 60 * 60_000;

// One tick: never throws, never overlaps itself. S2: the DB is resolved per tick, so a backup import
// that closes and reopens the database doesn't leave the worker on a closed handle.
export function createTick(name: string, run: () => Promise<void>): () => Promise<void> {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      await run();
    } catch (err) {
      console.error(`Background ${name} tick failed:`, err);
    } finally {
      busy = false;
    }
  };
}

// Spec: renders queued audio every 5 s, checks the speech service every 60 s (speech_down raise and
// resolve) and runs the daily content check. Once per process.
// S19: a sweep at start queues listening content that has no job yet and files that went missing.
export function startBackgroundWorker(getDb: () => Database.Database): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[started]) return;
  g[started] = true;
  try {
    const db = getDb();
    createAudioService(db, { notify: createNotificationService(db) }).sweep();
  } catch (err) {
    console.error('Background audio sweep failed:', err);
  }
  const jobs = createTick('audio', () => {
    const db = getDb();
    return createAudioService(db, { notify: createNotificationService(db) }).processPending();
  });
  const health = createTick('health', async () => {
    const db = getDb();
    await runHealthCheck(getSpeechProvider(db), createNotificationService(db), getSpeechUrl(db));
  });
  const content = createTick('content', async () => {
    await runContentCheck(getDb());
  });
  setInterval(() => void jobs(), JOB_TICK_MS).unref();
  setInterval(() => void health(), HEALTH_TICK_MS).unref();
  setInterval(() => void content(), CONTENT_TICK_MS).unref();
}
