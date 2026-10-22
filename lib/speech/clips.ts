import { join } from 'node:path';
import { dataDir } from '../db/client';

// Speech clips live only in `speech_clips` and this folder; backups skip both.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const CLIP_MAX_AGE_HOURS = 6;

export function speechTmpDir(): string {
  return join(dataDir(), 'speech-tmp');
}

// lesson:<lessonId>, freestyle:spoken, teil:<attemptId>, placement
export const SCOPE_PATTERN = /^(lesson:[\w-]+|freestyle:spoken|teil:\d+|placement)$/;

export function isValidScope(scope: unknown): scope is string {
  return typeof scope === 'string' && SCOPE_PATTERN.test(scope);
}

// The upload keeps its container: ffmpeg in the speech service reads all three.
const EXTENSIONS: Record<string, string> = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a' };
const CONTENT_TYPES: Record<string, string> = { '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

// `audio/webm;codecs=opus` → `.webm`; an unknown or missing type → null.
export function extensionFor(contentType: string | null | undefined): string | null {
  const base = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] ?? null;
}

export function contentTypeFor(file: string): string {
  const dot = file.lastIndexOf('.');
  return CONTENT_TYPES[dot >= 0 ? file.slice(dot) : ''] ?? 'application/octet-stream';
}
