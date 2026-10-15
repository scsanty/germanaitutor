// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import nodemailer from 'nodemailer';
import { setSetting } from '../services/appSettings';
import { saveSmtpSettings } from '../services/mailService';
import { createTick, startBackgroundWorker, JOB_TICK_MS, HEALTH_TICK_MS } from './worker';

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

  it('raises one speech_down, with one email, over repeated failed 60 s checks (Review Focus 1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-worker-'));
    process.env.GAIT_DATA_DIR = dir;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // No network: every health request is refused, and the SMTP transport is a fake.
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const sendMail = vi.fn(async () => ({}));
    const transport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    try {
      const db = createDbClient(':memory:');
      setSetting(db, 'speech_url', 'http://127.0.0.1:9');
      saveSmtpSettings(db, { host: 'smtp.example.org', port: 465, secure: true, user: '', password: null, from: 'a@example.org', to: 'b@example.org' });
      startBackgroundWorker(() => db);
      for (let i = 1; i <= 3; i++) {
        await vi.advanceTimersByTimeAsync(HEALTH_TICK_MS);
        // Wait until this tick's health check ran, then let its raise (and any email) settle.
        await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(i));
        await Promise.allSettled(fetchSpy.mock.results.map((r) => r.value));
        for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
      }
      expect(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE kind = 'speech_down'").get()).toEqual({ n: 1 });
      const row = db.prepare("SELECT body, resolved_at, email_error FROM admin_notifications WHERE kind = 'speech_down'").get();
      expect(row).toEqual({ body: expect.stringContaining('http://127.0.0.1:9'), resolved_at: null, email_error: null });
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: '[NaDoch!] Speech service is down' }));
      expect(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE kind = 'audio_failed'").get()).toEqual({ n: 0 });
    } finally {
      transport.mockRestore();
      vi.unstubAllGlobals();
      delete process.env.GAIT_DATA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
