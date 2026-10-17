import type Database from 'better-sqlite3';
import { audioHash, parseTranscript } from './transcript';
import { hasAudio } from './audioStore';
import { isSpeechUp } from '../speech/speechAvailability';

// Spec: availability rules. A listening item can be served when its audio file is cached, or when
// the speech service is up (the audio route renders it on demand). Server-only (reads the cache).

// Services take these optionally; tests inject fakes instead of a real speech service (S7).
export interface AudioAvailabilityDeps {
  speechUp?: () => Promise<boolean>;
  cached?: (hash: string) => boolean;
}

// The audio hash of a listening item's transcript; null for other types or a transcript that doesn't parse.
export function audioHashOf(type: string, content: unknown): string | null {
  if (type !== 'audio_questions' || !content || typeof content !== 'object') return null;
  const transcript = (content as { transcript?: unknown }).transcript;
  if (typeof transcript !== 'string') return null;
  const parsed = parseTranscript(transcript);
  return 'error' in parsed ? null : audioHash(parsed);
}

export interface AudioGate {
  // Whether the speech service was found up (false when no check was needed).
  speechUp: boolean;
  // Whether a clip can be played now: cached, or renderable on demand.
  playable(hash: string): boolean;
  // Whether an item can be served now. Items of other types always can.
  usable(type: string, content: unknown): boolean;
}

// One availability snapshot per request. The service is asked (through the 30 s memo) only when
// some listening item has no cached file, so pages without listening never wait on it.
export async function resolveAudioGate(
  db: Database.Database,
  items: readonly { type: string; content: unknown }[],
  deps: AudioAvailabilityDeps = {}
): Promise<AudioGate> {
  const cachedFn = deps.cached ?? hasAudio;
  const known = new Map<string, boolean>();
  const isCached = (hash: string) => {
    let hit = known.get(hash);
    if (hit === undefined) known.set(hash, (hit = cachedFn(hash)));
    return hit;
  };
  const hashes = items.map((i) => audioHashOf(i.type, i.content)).filter((h): h is string => h !== null);
  const needsService = hashes.some((h) => !isCached(h));
  const speechUp = needsService ? await (deps.speechUp ?? (() => isSpeechUp(db)))() : false;
  const playable = (hash: string) => isCached(hash) || speechUp;
  return {
    speechUp,
    playable,
    usable(type, content) {
      if (type !== 'audio_questions') return true;
      const hash = audioHashOf(type, content);
      return hash !== null && playable(hash);
    },
  };
}
