import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';

const { listModels, testConnection } = vi.hoisted(() => ({ listModels: vi.fn(), testConnection: vi.fn() }));

vi.mock('@/lib/providers/registry', () => ({
  getAdapter: () => ({
    testConnection,
    listModels,
    generateText: vi.fn(),
  }),
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { POST as testRoute } from './[id]/test/route';
import { GET as modelsRoute } from './[id]/models/route';
import { GET as getActive, PUT as setActive } from './active/route';

async function createConnection(body: Record<string, unknown>) {
  const res = await POST(
    new Request('http://localhost/api/providers', { method: 'POST', body: JSON.stringify(body) })
  );
  return res.json();
}

describe('/api/providers', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    listModels.mockReset();
    testConnection.mockReset();
    testConnection.mockResolvedValue({ ok: true });
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

    const testRes = await testRoute(new Request('http://localhost'), { params: Promise.resolve({ id: String(created.id) }) });
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
      { params: Promise.resolve({ id: String(created.id) }) }
    );
    expect((await updateRes.json()).label).toBe('Work account');

    const deleteRes = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ id: String(created.id) }) });
    expect(deleteRes.status).toBe(204);
  });

  it('re-tests the connection with the new model when PATCH changes it', async () => {
    const created = await createConnection({ providerType: 'gemini', apiKey: 'gm-test' });
    testConnection.mockResolvedValue({ ok: false, error: 'Gemini model gemini-gone returned 404' });
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ selectedModel: 'gemini-gone' }) }),
      { params: Promise.resolve({ id: String(created.id) }) }
    );
    expect(testConnection).toHaveBeenLastCalledWith({ apiKey: 'gm-test', host: undefined }, { model: 'gemini-gone' });
    const body = await res.json();
    expect(body.lastValidatedStatus).toBe('invalid');
    expect(body.lastError).toBe('Gemini model gemini-gone returned 404');
  });

  it('does not re-test when PATCH changes only the label', async () => {
    const created = await createConnection({ providerType: 'gemini', apiKey: 'gm-test' });
    await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ label: 'Work' }) }),
      { params: Promise.resolve({ id: String(created.id) }) }
    );
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('lists the models available to a connection', async () => {
    const created = await createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    listModels.mockResolvedValue([{ id: 'claude-x', label: 'Claude X' }]);

    const res = await modelsRoute(new Request('http://localhost'), { params: Promise.resolve({ id: String(created.id) }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'claude-x', label: 'Claude X' }]);
    expect(listModels).toHaveBeenCalledWith({ apiKey: 'sk-ant-test', host: undefined });
  });

  it('passes the Ollama host through when listing models', async () => {
    const created = await createConnection({ providerType: 'ollama', ollamaHost: 'http://localhost:11434' });
    listModels.mockResolvedValue([]);

    await modelsRoute(new Request('http://localhost'), { params: Promise.resolve({ id: String(created.id) }) });

    expect(listModels).toHaveBeenCalledWith({ apiKey: undefined, host: 'http://localhost:11434' });
  });

  it('returns 502 instead of throwing when the provider is unreachable', async () => {
    const created = await createConnection({ providerType: 'ollama', ollamaHost: 'http://localhost:11434' });
    listModels.mockRejectedValue(new Error('fetch failed'));

    const res = await modelsRoute(new Request('http://localhost'), { params: Promise.resolve({ id: String(created.id) }) });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('fetch failed');
  });

  it('returns 404 when listing models for an unknown connection', async () => {
    const res = await modelsRoute(new Request('http://localhost'), { params: Promise.resolve({ id: '999' }) });
    expect(res.status).toBe(404);
  });
});
