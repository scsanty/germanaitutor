import type Database from 'better-sqlite3';
import type { AudioFilter } from '../audio/transcript';
import { getSetting } from '../services/appSettings';
import { createLocalSpeechProvider } from './localSpeechProvider';

// The body of the sidecar's POST /render (speech/server.py).
export interface RenderInput {
  segments: { text: string; voice: string }[];
  filter: AudioFilter;
  pauseMs: number;
}

export interface SpeechProvider {
  health(): Promise<{ ok: boolean; voices: string[] }>;
  render(input: RenderInput): Promise<Buffer>;
  // An uploaded recording, converted to the app's format (ogg/opus).
  convert(data: Buffer): Promise<Buffer>;
}

export { SpeechServiceError, SpeechUnreachableError, isUnreachableError } from './speechErrors';

// The sidecar binds loopback (docker-compose `127.0.0.1:5002`); an IP avoids `localhost` resolving to ::1.
export const DEFAULT_SPEECH_URL = 'http://127.0.0.1:5002';

export function getSpeechUrl(db: Database.Database): string {
  return getSetting(db, 'speech_url') || DEFAULT_SPEECH_URL;
}

export function getSpeechProvider(db: Database.Database): SpeechProvider {
  return createLocalSpeechProvider(getSpeechUrl(db));
}
