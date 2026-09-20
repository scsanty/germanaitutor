// lib/services/providerService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProviderService } from './providerService';

vi.mock('../providers/registry', () => ({
  getAdapter: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    listModels: vi.fn(),
    generateText: vi.fn(),
  })),
}));

function setup() {
  const db = createDbClient(':memory:');
  const keyFilePath = join(mkdtempSync(join(tmpdir(), 'gait-')), 'master.key');
  return createProviderService(db, keyFilePath);
}

describe('providerService', () => {
  it('creates a connection with an encrypted API key and decrypts it back on demand', () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    expect(created.providerType).toBe('anthropic');
    expect(service.getDecryptedApiKey(created.id)).toBe('sk-ant-test');
  });

  it('only allows one active connection at a time', () => {
    const service = setup();
    const a = service.createConnection({ providerType: 'anthropic', apiKey: 'a' });
    const b = service.createConnection({ providerType: 'openai', apiKey: 'b' });
    service.setActiveConnection(a.id);
    service.setActiveConnection(b.id);
    expect(service.getActiveConnection()?.id).toBe(b.id);
  });

  it('updates last_validated_status after testConnection', async () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    const result = await service.testConnection(created.id);
    expect(result.ok).toBe(true);
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('valid');
  });

  it('records failures and successes', () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    service.recordFailure(created.id, 'quota exceeded');
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('failing');
    service.recordSuccess(created.id);
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('valid');
  });
});
