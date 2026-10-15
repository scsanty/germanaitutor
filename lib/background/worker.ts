import type Database from 'better-sqlite3';
import { createAudioService } from '../services/audioService';

const started = Symbol.for('nadoch.worker');

export const JOB_TICK_MS = 5000;

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

// Spec: renders queued audio every 5 s (Task 4 adds the 60 s health check). Once per process.
// S19: a sweep at start queues listening content that has no job yet and files that went missing.
export function startBackgroundWorker(getDb: () => Database.Database): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[started]) return;
  g[started] = true;
  try {
    createAudioService(getDb()).sweep();
  } catch (err) {
    console.error('Background audio sweep failed:', err);
  }
  const jobs = createTick('audio', () => createAudioService(getDb()).processPending());
  setInterval(() => void jobs(), JOB_TICK_MS).unref();
}
