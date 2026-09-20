import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateMasterKey } from './keyfile';

describe('loadOrCreateMasterKey', () => {
  it('creates a 32-byte key with restricted permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-key-'));
    const keyPath = join(dir, 'master.key');
    const key = loadOrCreateMasterKey(keyPath);
    expect(key).toHaveLength(32);
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  it('returns the same key on repeated calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-key-'));
    const keyPath = join(dir, 'master.key');
    const first = loadOrCreateMasterKey(keyPath);
    const second = loadOrCreateMasterKey(keyPath);
    expect(first).toEqual(second);
  });
});
