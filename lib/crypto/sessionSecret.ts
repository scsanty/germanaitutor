import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultSessionSecretPath(): string {
  const dataDir = process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
  return join(dataDir, 'session.key');
}

export function loadOrCreateSessionSecret(secretPath: string = defaultSessionSecretPath()): Buffer {
  mkdirSync(dirname(secretPath), { recursive: true });
  if (existsSync(secretPath)) {
    return Buffer.from(readFileSync(secretPath, 'utf8'), 'hex');
  }
  const secret = randomBytes(32);
  writeFileSync(secretPath, secret.toString('hex'), { mode: 0o600 });
  chmodSync(secretPath, 0o600);
  return secret;
}
