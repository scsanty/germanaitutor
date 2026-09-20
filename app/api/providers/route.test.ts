import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';

vi.mock('@/lib/providers/registry', () => ({
  getAdapter: () => ({
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    listModels: vi.fn(),
    generateText: vi.fn(),
  }),
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { POST as testRoute } from './[id]/test/route';
import { GET as getActive, PUT as setActive } from './active/route';

describe('/api/providers', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('creates, lists, tests, and activates a connection', async () => {
    const createRes = await POST(
      new Request('http://localhost/api/providers', {
        method: 'POST',
        body: JSON.stringify({ providerType: 'anthropic', apiKey: 'sk-ant-test' }),
      })
    );
    const created = await createRes.json();
    expect(created.providerType).toBe('anthropic');

    const listRes = await GET();
    expect(await listRes.json()).toHaveLength(1);

    const testRes = await testRoute(new Request('http://localhost'), { params: { id: String(created.id) } });
    expect((await testRes.json()).ok).toBe(true);

    await setActive(
      new Request('http://localhost/api/providers/active', {
        method: 'PUT',
        body: JSON.stringify({ id: created.id }),
      })
    );
    const activeRes = await getActive();
    expect((await activeRes.json()).id).toBe(created.id);
  });

  it('updates and deletes a connection', async () => {
    const createRes = await POST(
      new Request('http://localhost/api/providers', {
        method: 'POST',
        body: JSON.stringify({ providerType: 'openai', apiKey: 'sk-test' }),
      })
    );
    const created = await createRes.json();

    const updateRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ label: 'Work account' }) }),
      { params: { id: String(created.id) } }
    );
    expect((await updateRes.json()).label).toBe('Work account');

    const deleteRes = await DELETE(new Request('http://localhost'), { params: { id: String(created.id) } });
    expect(deleteRes.status).toBe(204);
  });
});
