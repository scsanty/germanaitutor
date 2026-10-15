import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { dataDir } from '../db/client';

// The audio cache: one ogg/opus file per audio hash, under <data dir>/audio.
const HASH = /^[0-9a-f]{64}$/;
const FILE = /^[0-9a-f]{64}\.ogg$/;

export function isAudioHash(hash: unknown): hash is string {
  return typeof hash === 'string' && HASH.test(hash);
}

export function audioDir(): string {
  return join(dataDir(), 'audio');
}

// The hash is validated so a request-supplied value never becomes a free path.
export function audioPath(hash: string): string {
  if (!isAudioHash(hash)) throw new Error(`Invalid audio hash: ${String(hash)}`);
  return join(audioDir(), `${hash}.ogg`);
}

export function hasAudio(hash: string): boolean {
  return existsSync(audioPath(hash));
}

export function readAudio(hash: string): Buffer | null {
  try {
    return readFileSync(audioPath(hash));
  } catch {
    return null;
  }
}

export function statAudio(hash: string): { size: number; mtimeMs: number } | null {
  try {
    const s = statSync(audioPath(hash));
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

// S15: a unique temp name per write, then an atomic rename, so two writers of one hash never mix bytes.
export function writeAudio(hash: string, buf: Buffer): void {
  const target = audioPath(hash);
  mkdirSync(audioDir(), { recursive: true });
  const tmp = join(audioDir(), `${hash}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, buf);
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

export function deleteAudio(hash: string): void {
  rmSync(audioPath(hash), { force: true });
}

export function listAudioFiles(): { name: string; path: string }[] {
  const dir = audioDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => FILE.test(name))
    .sort()
    .map((name) => ({ name, path: join(dir, name) }));
}
