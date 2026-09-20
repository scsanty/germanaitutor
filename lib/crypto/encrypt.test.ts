import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './encrypt';

describe('encrypt/decrypt', () => {
  it('round-trips a plaintext string', () => {
    const key = randomBytes(32);
    const ciphertext = encrypt('sk-ant-super-secret', key);
    expect(ciphertext).not.toContain('sk-ant-super-secret');
    expect(decrypt(ciphertext, key)).toBe('sk-ant-super-secret');
  });

  it('fails to decrypt with the wrong key', () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const ciphertext = encrypt('secret', key);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});
