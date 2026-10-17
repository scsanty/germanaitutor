import type Database from 'better-sqlite3';
import type { AudioFilter } from '../audio/transcript';
import { deleteSetting, getSetting, setSetting } from '../services/appSettings';
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

export class SpeechUrlError extends Error {}

// The speech service address is an origin only: http or https, a host and an optional port. Credentials,
// a path, a query or a fragment are refused, so the stored value is always `<scheme>://<host>[:port]`.
export function normalizeSpeechUrl(input: string): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SpeechUrlError('Enter a full address like http://127.0.0.1:5002');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SpeechUrlError('The address must start with http:// or https://');
  if (url.username || url.password) throw new SpeechUrlError('The address must not contain a user name or password');
  if (url.pathname !== '/') throw new SpeechUrlError('The address must not have a path');
  // An empty `?` or `#` leaves search and hash empty, so the raw text is checked as well.
  if (url.search || url.hash || /[?#]/.test(raw)) throw new SpeechUrlError('The address must not have a query or fragment');
  return url.origin;
}

// An empty value goes back to the default address. Returns the address now in use.
export function saveSpeechUrl(db: Database.Database, input: string): string {
  if (typeof input === 'string' && input.trim() === '') {
    deleteSetting(db, 'speech_url');
    return DEFAULT_SPEECH_URL;
  }
  const url = normalizeSpeechUrl(input);
  setSetting(db, 'speech_url', url);
  return url;
}
