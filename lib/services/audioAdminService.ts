import type Database from 'better-sqlite3';
import { audioHash, parseTranscript } from '../audio/transcript';
import { hasAudio, isAudioHash } from '../audio/audioStore';
import type { AudioJobStatus } from './audioService';

// Admin audio tools (Regenerate, Upload). S21: an action is only taken on a hash that saved content
// owns, so a job always has the transcript it was made from.

function hashOf(transcript: unknown): string | null {
  if (typeof transcript !== 'string') return null;
  const parsed = parseTranscript(transcript);
  return 'error' in parsed ? null : audioHash(parsed);
}

function transcriptsOfContent(): { sql: string; pick: (content: unknown) => unknown }[] {
  const fromTask = (content: unknown) => (content as { transcript?: unknown } | null)?.transcript;
  return [
    { sql: "SELECT content FROM exercises WHERE type = 'audio_questions'", pick: fromTask },
    { sql: "SELECT content FROM practice_exercises WHERE type = 'audio_questions'", pick: fromTask },
    {
      sql: 'SELECT content FROM teil_sets',
      pick: (set) => {
        const s = set as { taskType?: unknown; content?: unknown } | null;
        return s?.taskType === 'audio_questions' ? fromTask(s.content) : undefined;
      },
    },
  ];
}

// The transcript of the lesson exercise, pool exercise or Teil set whose audio has this hash, or null.
export function findOwnedTranscript(db: Database.Database, hash: string): string | null {
  if (!isAudioHash(hash)) return null;
  for (const { sql, pick } of transcriptsOfContent()) {
    for (const row of db.prepare(sql).all() as { content: string }[]) {
      let transcript: unknown;
      try {
        transcript = pick(JSON.parse(row.content));
      } catch {
        continue;
      }
      if (typeof transcript === 'string' && hashOf(transcript) === hash) return transcript;
    }
  }
  return null;
}

export interface AdminAudioStatus {
  hash: string;
  // Null when no job exists yet.
  status: AudioJobStatus | null;
  hasFile: boolean;
  lastError: string | null;
  // False when no saved content has this transcript (it was edited and not saved yet).
  saved: boolean;
}

export class AudioTranscriptError extends Error {}

export function audioStatusFor(db: Database.Database, transcript: string): AdminAudioStatus {
  const parsed = typeof transcript === 'string' ? parseTranscript(transcript) : { error: 'the transcript is missing' };
  if ('error' in parsed) throw new AudioTranscriptError(`The transcript can't be rendered: ${parsed.error}`);
  const hash = audioHash(parsed);
  const job = db.prepare('SELECT status, last_error FROM audio_jobs WHERE hash = ?').get(hash) as
    | { status: AudioJobStatus; last_error: string | null }
    | undefined;
  return {
    hash,
    status: job?.status ?? null,
    hasFile: hasAudio(hash),
    lastError: job?.last_error ?? null,
    saved: findOwnedTranscript(db, hash) !== null,
  };
}
