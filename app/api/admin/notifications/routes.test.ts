import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createNotificationService } from '@/lib/services/notificationService';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn() }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { GET, POST } from './route';
import { GET as count } from './count/route';

const list = async (filter?: string) =>
  (await GET(new Request(`http://localhost/api/admin/notifications${filter ? `?filter=${filter}` : ''}`))).json();

describe('/api/admin/notifications', () => {
  beforeEach(async () => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-notify-'));
    vi.mocked(isAdminSessionValid).mockResolvedValue(true);
    const failing = { send: vi.fn(async () => Promise.reject(new Error('Email is not set up'))) };
    const service = createNotificationService(getDb(), { mailer: failing });
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'No answer from http://127.0.0.1:5002');
    await service.raise('audio_failed', 'audio_failed:x', 'Audio generation failed', 'bad voice');
    await service.resolve('audio_failed:x');
    await service.info('pool_items', 'Practice pool', '2 new items to review');
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 without an admin session', async () => {
    vi.mocked(isAdminSessionValid).mockResolvedValue(false);
    expect((await GET(new Request('http://localhost/api/admin/notifications'))).status).toBe(401);
    expect((await POST()).status).toBe(401);
    expect((await count()).status).toBe(401);
  });

  it('lists all, open problems and unread, with the email error per row', async () => {
    const all = await list();
    expect(all.map((n: { title: string }) => n.title).sort()).toEqual(['Audio generation failed', 'Practice pool', 'Speech service is down']);
    const down = all.find((n: { kind: string }) => n.kind === 'speech_down');
    expect(down.emailError).toBe('Email is not set up');

    const open = await list('open');
    expect(open.map((n: { kind: string }) => n.kind)).toEqual(['speech_down']);
    expect((await list('unread')).length).toBe(3);
    expect((await GET(new Request('http://localhost/api/admin/notifications?filter=nope'))).status).toBe(400);
  });

  it('counts unread and marks all read', async () => {
    expect(await (await count()).json()).toEqual({ unread: 3 });
    expect(await (await POST()).json()).toEqual({ marked: 3 });
    expect(await (await count()).json()).toEqual({ unread: 0 });
    expect(await list('unread')).toEqual([]);
  });
});
