import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createNotificationService, recordProviderFailure, recordProviderSuccess } from './notificationService';

function setup(failMail = false) {
  const db = createDbClient(':memory:');
  const mailer = { send: vi.fn(async () => { if (failMail) throw new Error('SMTP auth failed'); }) };
  return { db, mailer, service: createNotificationService(db, { mailer, now: () => new Date('2026-09-29T10:00:00Z') }) };
}

describe('notificationService', () => {
  it('raises a problem once, emails on raise and on resolve only', async () => {
    const { service, mailer } = setup();
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'Cannot reach http://localhost:5002');
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'again');
    expect(service.list({ openProblems: true })).toHaveLength(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    await service.resolve('speech_down');
    await service.resolve('speech_down');
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenLastCalledWith('Resolved: Speech service is down', expect.any(String));
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'down again');
    expect(service.list({ openProblems: true })).toHaveLength(1);
  });

  it('keeps pool items in-app, one unread row per day with a running count', async () => {
    const { service, mailer } = setup();
    await service.info('pool_items', 'New pool items', '1 new item to review');
    await service.info('pool_items', 'New pool items', '1 new item to review');
    const rows = service.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('2 new items to review');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('records an email failure instead of throwing', async () => {
    const { service } = setup(true);
    await expect(service.raise('provider_errors', 'provider_errors', 'AI provider errors', 'x')).resolves.toBeUndefined();
    expect(service.list({})[0].emailError).toBe('SMTP auth failed');
  });

  it('records "Email is not set up" when no SMTP settings exist (default mailer)', async () => {
    const db = createDbClient(':memory:');
    const service = createNotificationService(db);
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'x');
    expect(service.list({})[0].emailError).toBe('Email is not set up');
  });

  it('starts a new pool row once the day changes or the row was read, and tracks unread', async () => {
    const db = createDbClient(':memory:');
    let now = new Date('2026-09-29T10:00:00Z');
    const service = createNotificationService(db, { mailer: { send: async () => {} }, now: () => now });
    await service.info('pool_items', 'New pool items', '3 new items to review');
    expect(service.unreadCount()).toBe(1);
    expect(service.markAllRead()).toBe(1);
    expect(service.unreadCount()).toBe(0);
    await service.info('pool_items', 'New pool items', '1 new item to review');
    now = new Date('2026-09-30T10:00:00Z');
    await service.info('pool_items', 'New pool items', '1 new item to review');
    const rows = service.list({});
    expect(rows.map((r) => r.body)).toEqual(['1 new item to review', '1 new item to review', '3 new items to review']);
    expect(service.list({ unreadOnly: true })).toHaveLength(2);
  });

  it('never emails informational kinds, even when raised with a key', async () => {
    const { service, mailer } = setup();
    await service.raise('content_issues', 'audio_upload_lost', 'Uploaded recordings are missing', 'x');
    await service.info('content_issues', 'Content issues', 'y');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(service.list({ openProblems: true })).toHaveLength(0);
    expect(service.list({})).toHaveLength(2);
  });

  it('never rejects, even on a closed database', async () => {
    const { db, service } = setup();
    db.close();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(service.raise('speech_down', 'speech_down', 't', 'b')).resolves.toBeUndefined();
      await expect(service.resolve('speech_down')).resolves.toBeUndefined();
      await expect(service.info('pool_items', 't', '1 new item to review')).resolves.toBeUndefined();
    } finally {
      error.mockRestore();
    }
  });
});

describe('provider failures', () => {
  it('raises provider_errors at 3 failures within 10 minutes, and a success resolves it', async () => {
    const db = createDbClient(':memory:');
    const mailer = { send: vi.fn(async () => {}) };
    let now = new Date('2026-09-29T10:00:00Z');
    const deps = { mailer, now: () => now };
    const open = () => createNotificationService(db, deps).list({ openProblems: true });

    await recordProviderFailure(db, deps);
    now = new Date('2026-09-29T10:11:00Z'); // the first one falls out of the window
    await recordProviderFailure(db, deps);
    await recordProviderFailure(db, deps);
    expect(open()).toHaveLength(0);
    await recordProviderFailure(db, deps);
    expect(open().map((r) => r.problemKey)).toEqual(['provider_errors']);
    await recordProviderFailure(db, deps);
    expect(mailer.send).toHaveBeenCalledTimes(1);

    await recordProviderSuccess(db, deps);
    expect(open()).toHaveLength(0);
    expect(mailer.send).toHaveBeenLastCalledWith('Resolved: AI provider errors', expect.any(String));
    // The count starts again after a success.
    await recordProviderFailure(db, deps);
    expect(open()).toHaveLength(0);
  });
});
