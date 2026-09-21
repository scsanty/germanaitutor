import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateSessionSecret } from './sessionSecret';

describe('loadOrCreateSessionSecret', () => {
  it('creates a 32-byte secret with restricted permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-session-'));
    const secretPath = join(dir, 'session.key');
    const secret = loadOrCreateSessionSecret(secretPath);
    expect(secret).toHaveLength(32);
    expect(existsSync(secretPath)).toBe(true);
    expect(statSync(secretPath).mode & 0o777).toBe(0o600);
  });

  it('returns the same secret on repeated calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-session-'));
    const secretPath = join(dir, 'session.key');
    const first = loadOrCreateSessionSecret(secretPath);
    const second = loadOrCreateSessionSecret(secretPath);
    expect(first).toEqual(second);
  });
});
