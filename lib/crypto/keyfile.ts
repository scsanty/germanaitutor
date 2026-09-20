import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultKeyFilePath(): string {
  const dataDir = process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
  return join(dataDir, 'master.key');
}

export function loadOrCreateMasterKey(keyFilePath: string = defaultKeyFilePath()): Buffer {
  mkdirSync(dirname(keyFilePath), { recursive: true });
  if (existsSync(keyFilePath)) {
    return Buffer.from(readFileSync(keyFilePath, 'utf8'), 'hex');
  }
  const key = randomBytes(32);
  writeFileSync(keyFilePath, key.toString('hex'), { mode: 0o600 });
  chmodSync(keyFilePath, 0o600);
  return key;
}
