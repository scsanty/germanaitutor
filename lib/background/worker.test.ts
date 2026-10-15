// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { setSetting } from '../services/appSettings';
import { createTick, startBackgroundWorker, JOB_TICK_MS } from './worker';

const started = Symbol.for('nadoch.worker');

describe('background worker', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as Record<symbol, boolean>)[started];
  });

  it('a failing tick is logged, never rejected, and never overlaps itself (S2)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let release!: () => void;
      const run = vi.fn(() => new Promise<void>((r) => (release = r)));
      const tick = createTick('test', run);
      const first = tick();
      await tick();
      expect(run).toHaveBeenCalledTimes(1);
      release();
      await first;

      const failing = createTick('test', async () => {
        throw new Error('The database connection is not open');
      });
      await expect(failing()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith('Background test tick failed:', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it('starts once per process and resolves the database on every tick, so a closed handle is left behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-worker-'));
    process.env.GAIT_DATA_DIR = dir;
    vi.useFakeTimers();
    try {
      const first = createDbClient(':memory:');
      setSetting(first, 'speech_url', 'http://127.0.0.1:9');
      let current = first;
      const getDb = vi.fn(() => current);
      startBackgroundWorker(getDb);
      startBackgroundWorker(getDb);
      expect(getDb).toHaveBeenCalledTimes(1); // the start-up sweep, once

      // A backup import closes the old handle and opens a new one.
      first.close();
      current = createDbClient(':memory:');
      setSetting(current, 'speech_url', 'http://127.0.0.1:9');
      await vi.advanceTimersByTimeAsync(JOB_TICK_MS);
      expect(getDb).toHaveBeenCalledTimes(2);
      expect(getDb.mock.results[1].value).toBe(current);
    } finally {
      delete process.env.GAIT_DATA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
