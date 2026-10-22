import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIP_MAX_AGE_HOURS, extensionFor, isValidScope, sniffExtension, speechTmpDir } from '../speech/clips';
import { getSpeechProvider, isUnreachableError, SpeechServiceError, type SpeechProvider, type TranscribedWord, type WhisperModel } from '../speech/speechProvider';
import { errorBodyFor, type ApiErrorBody, type ErrorCode } from '../tutoring/errorCodes';
import { getSetting } from './appSettings';

export type SpeechClipErrorKind = 'bad_request' | 'not_found' | 'unavailable';
const STATUS: Record<SpeechClipErrorKind, number> = { bad_request: 400, not_found: 404, unavailable: 503 };
const CODE: Record<SpeechClipErrorKind, ErrorCode> = { bad_request: 'bad_request', not_found: 'not_found', unavailable: 'speech_unavailable' };

export class SpeechClipError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: SpeechClipErrorKind, code?: ErrorCode) {
    super(message);
    this.name = 'SpeechClipError';
    this.code = code ?? CODE[kind];
  }
}

export function toSpeechClipErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof SpeechClipError)) return null;
  return { status: STATUS[err.kind], body: errorBodyFor(err) };
}

export interface SpeechClipDeps {
  provider?: SpeechProvider;
  now?: () => Date;
  // Where the files go; defaults to <data dir>/speech-tmp.
  dir?: string;
}

export interface SpeechClip {
  id: string;
  scope: string;
  role: 'student' | 'partner';
  // Absolute path; null when the partner audio could not be rendered.
  path: string | null;
  transcript: string | null;
  words: TranscribedWord[];
  createdAt: string;
}

interface ClipRow {
  id: string;
  scope: string;
  role: 'student' | 'partner';
  file: string | null;
  transcript: string | null;
  words: string | null;
  created_at: string;
}

export function whisperModel(db: Database.Database): WhisperModel {
  return getSetting(db, 'whisper_model') === 'medium' ? 'medium' : 'small';
}

// A failure of the speech service, as the error the routes answer with.
function mapProviderError(err: unknown): SpeechClipError | null {
  if (err instanceof SpeechServiceError) {
    if (err.status === 400 && /longer than 5 minutes/i.test(err.message)) {
      return new SpeechClipError('That recording is too long (max. 5 minutes)', 'bad_request', 'audio_too_long');
    }
    if (err.status >= 500) return new SpeechClipError("The speech service isn't available right now", 'unavailable');
    return new SpeechClipError('The recording could not be read', 'bad_request');
  }
  if (isUnreachableError(err)) return new SpeechClipError("The speech service isn't available right now", 'unavailable');
  return null;
}

export function createSpeechClipService(db: Database.Database, deps: SpeechClipDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const dir = () => deps.dir ?? speechTmpDir();
  const provider = () => deps.provider ?? getSpeechProvider(db);

  function insert(id: string, scope: string, role: 'student' | 'partner', file: string | null, transcript: string | null, words: TranscribedWord[] | null): void {
    db.prepare('INSERT INTO speech_clips (id, scope, role, file, transcript, words, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, scope, role, file, transcript, words ? JSON.stringify(words) : null, now().toISOString()
    );
  }

  // The file goes first; a failed insert takes it back out.
  function store(scope: string, role: 'student' | 'partner', audio: Buffer | null, ext: string, transcript: string, words: TranscribedWord[] | null): string {
    const id = randomUUID();
    const file = audio ? writeFile(id, ext, audio) : null;
    try {
      insert(id, scope, role, file, transcript, words);
    } catch (err) {
      removeFile(file);
      throw err;
    }
    return id;
  }

  function writeFile(id: string, ext: string, audio: Buffer): string {
    mkdirSync(dir(), { recursive: true });
    const file = `${id}${ext}`;
    writeFileSync(join(dir(), file), audio);
    return file;
  }

  function removeFile(file: string | null): void {
    if (file) rmSync(join(dir(), file), { force: true });
  }

  // S3: a Teil recording needs an open attempt, a placement one an open session. (That the attempt's part
  // is a spoken one is checked by the Teil runner, which owns that knowledge.)
  function assertScopeOpen(scope: string): void {
    if (scope.startsWith('teil:')) {
      const row = db.prepare('SELECT finished_at FROM teil_attempts WHERE id = ?').get(Number(scope.slice(5))) as { finished_at: string | null } | undefined;
      if (!row || row.finished_at) throw new SpeechClipError('This attempt is not open', 'bad_request');
    } else if (scope === 'placement') {
      if (!db.prepare('SELECT 1 FROM placement_session WHERE id = 1').get()) throw new SpeechClipError('No placement test is open', 'bad_request');
    }
  }

  return {
    // Transcribes an upload and keeps it (file + row) until its scope ends or 6 h pass.
    // `contentType` is the upload's; the raw container is stored as sent.
    async transcribeForScope(scope: string, audio: Buffer, contentType?: string | null) {
      if (!isValidScope(scope)) throw new SpeechClipError('Invalid scope', 'bad_request');
      assertScopeOpen(scope);
      if (audio.length === 0) throw new SpeechClipError('The recording is empty', 'bad_request');
      const ext = extensionFor(contentType) ?? sniffExtension(audio);
      if (!ext) throw new SpeechClipError('Unsupported recording format', 'bad_request');
      let result;
      try {
        result = await provider().transcribe(audio, whisperModel(db));
      } catch (err) {
        const mapped = mapProviderError(err);
        if (mapped) throw mapped;
        throw err;
      }
      const id = store(scope, 'student', audio, ext, result.text, result.words);
      return { clipId: id, text: result.text, words: result.words, duration: result.duration };
    },

    // The partner's line: the ogg when it was rendered, `null` when the text-to-speech failed (text only).
    savePartnerClip(scope: string, audioOgg: Buffer | null, transcript: string): string {
      if (!isValidScope(scope)) throw new SpeechClipError('Invalid scope', 'bad_request');
      return store(scope, 'partner', audioOgg, '.ogg', transcript, null);
    },

    getClip(id: string): SpeechClip | null {
      const row = db.prepare('SELECT * FROM speech_clips WHERE id = ?').get(id) as ClipRow | undefined;
      if (!row) return null;
      let words: TranscribedWord[] = [];
      try {
        words = row.words ? (JSON.parse(row.words) as TranscribedWord[]) : [];
      } catch {
        words = [];
      }
      return {
        id: row.id,
        scope: row.scope,
        role: row.role,
        path: row.file ? join(dir(), row.file) : null,
        transcript: row.transcript,
        words,
        createdAt: row.created_at,
      };
    },

    // Removes a scope's rows and files; returns how many clips went.
    deleteScope(scope: string): number {
      const rows = db.prepare('SELECT id, file FROM speech_clips WHERE scope = ?').all(scope) as { id: string; file: string | null }[];
      db.prepare('DELETE FROM speech_clips WHERE scope = ?').run(scope);
      for (const row of rows) removeFile(row.file);
      return rows.length;
    },

    // Clips older than `hours` go, and so do files in the folder that no row owns (left by a crash).
    cleanupOlderThan(hours = CLIP_MAX_AGE_HOURS): number {
      const cutoff = new Date(now().getTime() - hours * 3600_000);
      const old = db.prepare('SELECT id, file FROM speech_clips WHERE created_at < ?').all(cutoff.toISOString()) as { id: string; file: string | null }[];
      db.prepare('DELETE FROM speech_clips WHERE created_at < ?').run(cutoff.toISOString());
      for (const row of old) removeFile(row.file);
      if (existsSync(dir())) {
        const owned = new Set((db.prepare('SELECT file FROM speech_clips WHERE file IS NOT NULL').all() as { file: string }[]).map((r) => r.file));
        for (const name of readdirSync(dir())) {
          if (owned.has(name)) continue;
          try {
            if (statSync(join(dir(), name)).mtimeMs < cutoff.getTime()) rmSync(join(dir(), name), { force: true });
          } catch {
            // gone already
          }
        }
      }
      return old.length;
    },
  };
}
