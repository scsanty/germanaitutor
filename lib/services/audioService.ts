import type Database from 'better-sqlite3';
import { audioHash, parseTranscript, PAUSE_MS, type ParsedTranscript } from '../audio/transcript';
import { audioPath, deleteAudio, hasAudio, isAudioHash, readAudio, writeAudio } from '../audio/audioStore';
import { getSpeechProvider, isUnreachableError, SpeechServiceError, type SpeechProvider } from '../speech/speechProvider';

// Admin notifications (Task 4 implements them). I7: a sink may be async; it is never awaited and
// its failures are swallowed, so a notification problem can't break rendering.
export interface NotificationSink {
  raise(kind: string, problemKey: string, title: string, body: string): void | Promise<void>;
  resolve(problemKey: string): void | Promise<void>;
}

export interface AudioServiceDeps {
  provider?: SpeechProvider;
  now?: () => Date;
  notify?: NotificationSink;
}

export type AudioJobStatus = 'pending' | 'done' | 'failed' | 'uploaded';

interface JobRow {
  hash: string;
  transcript: string;
  status: AudioJobStatus;
  attempts: number;
  last_error: string | null;
}

export const MAX_ATTEMPTS = 5;
// A render that times out or loses its connection while the service is healthy waits this long before
// its next try (not an attempt), so it can't hold the head of the queue.
export const UNREACHABLE_BACKOFF_MS = 5 * 60_000;

const NO_NOTIFY: NotificationSink = { raise() {}, resolve() {} };

// S15: one render per file at a time in this process, shared by the worker and on-demand requests.
const inflight = new Map<string, Promise<Buffer>>();

const failedKey = (hash: string) => `audio_failed:${hash}`;

function renderInput(parsed: ParsedTranscript) {
  return { segments: parsed.lines.map((l) => ({ text: l.text, voice: l.voice })), filter: parsed.filter, pauseMs: PAUSE_MS };
}

function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

export function createAudioService(db: Database.Database, deps: AudioServiceDeps = {}) {
  // Resolved lazily, so enqueuing (which only writes rows) never needs the provider.
  let provider: SpeechProvider | undefined = deps.provider;
  const speech = () => (provider ??= getSpeechProvider(db));
  const notify = deps.notify ?? NO_NOTIFY;
  const nowDate = () => (deps.now ?? (() => new Date()))();
  const now = () => nowDate().toISOString();

  const safely = (send: () => void | Promise<void>) => {
    try {
      void Promise.resolve(send()).catch((err) => console.error('Audio notification failed:', err));
    } catch (err) {
      console.error('Audio notification failed:', err);
    }
  };

  const getJob = (hash: string) => db.prepare('SELECT hash, transcript, status, attempts, last_error FROM audio_jobs WHERE hash = ?').get(hash) as JobRow | undefined;
  const statusOf = (hash: string) => getJob(hash)?.status;

  function markDone(job: JobRow): void {
    // Only a job still waiting moves to done: an upload or regenerate during the render wins.
    db.prepare(
      "UPDATE audio_jobs SET status = 'done', attempts = 0, last_error = NULL, next_try_at = NULL, updated_at = ? WHERE hash = ? AND status IN ('pending','failed','done')"
    ).run(now(), job.hash);
    if (job.last_error !== null || job.status === 'failed') safely(() => notify.resolve(failedKey(job.hash)));
  }

  function markFailed(hash: string, error: string): void {
    db.prepare("UPDATE audio_jobs SET status = 'failed', last_error = ?, next_try_at = NULL, updated_at = ? WHERE hash = ? AND status = 'pending'").run(
      error,
      now(),
      hash
    );
    safely(() => notify.raise('audio_failed', failedKey(hash), 'Audio generation failed', error));
  }

  // Renders and writes the file, unless an admin upload arrived meanwhile (Review Focus 2): then the
  // upload stays and is returned. Concurrent callers for the same hash share one render.
  function renderShared(hash: string, parsed: ParsedTranscript): Promise<Buffer> {
    const key = audioPath(hash);
    const running = inflight.get(key);
    if (running) return running;
    const job = (async () => {
      const buf = await speech().render(renderInput(parsed));
      if (statusOf(hash) === 'uploaded') return readAudio(hash) ?? buf;
      writeAudio(hash, buf);
      return buf;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  function enqueue(transcript: string): string | null {
    if (typeof transcript !== 'string') return null;
    const parsed = parseTranscript(transcript);
    if ('error' in parsed) return null;
    const hash = audioHash(parsed);
    const at = now();
    db.prepare("INSERT OR IGNORE INTO audio_jobs (hash, transcript, status, attempts, updated_at) VALUES (?, ?, 'pending', 0, ?)").run(hash, transcript, at);
    // S21: a job created by an upload had no transcript; the content now supplies it.
    db.prepare("UPDATE audio_jobs SET transcript = ? WHERE hash = ? AND transcript = ''").run(transcript, hash);
    const job = getJob(hash)!;
    const cached = hasAudio(hash);
    if (cached && job.status === 'pending') {
      db.prepare("UPDATE audio_jobs SET status = 'done', updated_at = ? WHERE hash = ? AND status = 'pending'").run(at, hash);
    } else if (!cached && job.status === 'done') {
      // The file went missing (a wiped cache, an old backup): render it again.
      db.prepare("UPDATE audio_jobs SET status = 'pending', attempts = 0, last_error = NULL, next_try_at = NULL, updated_at = ? WHERE hash = ?").run(at, hash);
    }
    return hash;
  }

  function enqueueFromContent(type: string, content: unknown): string | null {
    if (type !== 'audio_questions' || !content || typeof content !== 'object') return null;
    const transcript = (content as { transcript?: unknown }).transcript;
    return typeof transcript === 'string' ? enqueue(transcript) : null;
  }

  // Spec: the worker renders due jobs. S1: with the service down nothing is attempted or raised; only a
  // real render error counts. A render that times out or loses its connection is not an attempt either,
  // but the job is pushed back (next_try_at, updated_at) so it can't block the jobs behind it.
  async function processPending(limit = 3): Promise<void> {
    const due = db
      .prepare(
        `SELECT hash, transcript, status, attempts, last_error FROM audio_jobs
         WHERE status = 'pending' AND (next_try_at IS NULL OR next_try_at <= ?) ORDER BY updated_at, hash LIMIT ?`
      )
      .all(now(), limit) as JobRow[];
    if (due.length === 0) return;
    if (!(await speech().health()).ok) return;

    for (const job of due) {
      // The row may have changed while an earlier job rendered (an upload, a regenerate).
      const current = getJob(job.hash);
      if (!current || current.status !== 'pending') continue;
      if (hasAudio(job.hash)) {
        markDone(current);
        continue;
      }
      const parsed = parseTranscript(current.transcript);
      if ('error' in parsed) {
        // S21: a transcript that can't be parsed never will be; no retries.
        markFailed(job.hash, `The transcript can't be rendered: ${parsed.error}`);
        continue;
      }
      try {
        await renderShared(job.hash, parsed);
        markDone(current);
      } catch (err) {
        const error = messageOf(err);
        if (isUnreachableError(err)) {
          const next = new Date(nowDate().getTime() + UNREACHABLE_BACKOFF_MS).toISOString();
          db.prepare("UPDATE audio_jobs SET next_try_at = ?, updated_at = ? WHERE hash = ? AND status = 'pending'").run(next, now(), job.hash);
          // The service went down mid-run: stop here. Still up: this job was the problem, go on.
          if (!(await speech().health()).ok) return;
          continue;
        }
        const attempts = current.attempts + 1;
        // A 4xx (a request the service refuses, or one too large to send) can never succeed.
        const permanent = err instanceof SpeechServiceError && err.status >= 400 && err.status < 500;
        if (permanent || attempts >= MAX_ATTEMPTS) {
          db.prepare('UPDATE audio_jobs SET attempts = ? WHERE hash = ?').run(attempts, job.hash);
          markFailed(job.hash, error);
        } else {
          const next = new Date(nowDate().getTime() + 2 ** attempts * 60_000).toISOString();
          db.prepare("UPDATE audio_jobs SET attempts = ?, last_error = ?, next_try_at = ?, updated_at = ? WHERE hash = ? AND status = 'pending'").run(
            attempts,
            error,
            next,
            now(),
            job.hash
          );
        }
      }
    }
  }

  // The cached file, or one render now for a known job. Never renders over an upload, and never
  // renders a hash no content has queued. The health check (3 s) comes first, so a down or
  // unreachable service answers fast instead of waiting out the render timeout.
  async function getOrRender(hash: string): Promise<Buffer | null> {
    if (!isAudioHash(hash)) return null;
    const cached = readAudio(hash);
    if (cached) return cached;
    const job = getJob(hash);
    if (!job || job.status === 'uploaded') return null;
    const parsed = parseTranscript(job.transcript);
    if ('error' in parsed) return null;
    if (!(await speech().health()).ok) return null;
    // A worker render may have finished during the health check.
    const ready = readAudio(hash);
    if (ready) return ready;
    try {
      const buf = await renderShared(hash, parsed);
      if (statusOf(hash) !== 'uploaded') markDone(job);
      return buf;
    } catch {
      return null;
    }
  }

  // When the clip for a hash last changed (render, upload, regenerate); part of the route's ETag.
  function version(hash: string): string | null {
    const row = db.prepare('SELECT updated_at FROM audio_jobs WHERE hash = ?').get(hash) as { updated_at: string } | undefined;
    return row?.updated_at ?? null;
  }

  // Explicit admin action: drop the file (an upload included) and queue a fresh render.
  function regenerate(hash: string): void {
    if (!isAudioHash(hash)) throw new Error(`Invalid audio hash: ${hash}`);
    deleteAudio(hash);
    db.prepare("UPDATE audio_jobs SET status = 'pending', attempts = 0, last_error = NULL, next_try_at = NULL, updated_at = ? WHERE hash = ?").run(now(), hash);
  }

  // An admin recording replaces the clip for this hash; the worker never touches it afterwards.
  async function upload(hash: string, data: Buffer): Promise<void> {
    if (!isAudioHash(hash)) throw new Error(`Invalid audio hash: ${hash}`);
    const converted = await speech().convert(data);
    writeAudio(hash, converted);
    db.prepare(
      `INSERT INTO audio_jobs (hash, transcript, status, attempts, updated_at) VALUES (?, '', 'uploaded', 0, ?)
       ON CONFLICT(hash) DO UPDATE SET status = 'uploaded', attempts = 0, last_error = NULL, next_try_at = NULL, updated_at = excluded.updated_at`
    ).run(hash, now());
    safely(() => notify.resolve(failedKey(hash)));
  }

  // S19: at worker start and after a backup import. Queues every listening transcript (content loaded
  // before this queue existed has no job), and puts done or uploaded jobs whose file is gone back in
  // the queue. A lost upload is reported once, since only the admin has the recording.
  function sweep(): { queued: number; requeued: number; lostUploads: number } {
    const contents: { type: string; content: string }[] = [
      ...(db.prepare("SELECT type, content FROM exercises WHERE type = 'audio_questions'").all() as { type: string; content: string }[]),
      ...(db.prepare("SELECT type, content FROM practice_exercises WHERE type = 'audio_questions' AND review_status <> 'rejected'").all() as {
        type: string;
        content: string;
      }[]),
    ];
    for (const row of db.prepare("SELECT content FROM teil_sets WHERE status NOT IN ('reserved','rejected')").all() as { content: string }[]) {
      try {
        const set = JSON.parse(row.content) as { taskType?: string; content?: unknown };
        if (set.taskType === 'audio_questions') contents.push({ type: set.taskType, content: JSON.stringify(set.content) });
      } catch {
        // an unreadable set is reported by the content checks, not here
      }
    }
    let queued = 0;
    const run = db.transaction(() => {
      for (const row of contents) {
        try {
          if (enqueueFromContent(row.type, JSON.parse(row.content))) queued += 1;
        } catch {
          // as above
        }
      }
    });
    run();

    let requeued = 0;
    let lostUploads = 0;
    for (const job of db.prepare("SELECT hash, transcript, status FROM audio_jobs WHERE status IN ('done','uploaded')").all() as JobRow[]) {
      if (!isAudioHash(job.hash) || hasAudio(job.hash)) continue;
      if (job.status === 'uploaded') lostUploads += 1;
      // An upload for a hash no content owns has no transcript to synthesize; it stays lost until re-uploaded.
      if (job.transcript === '') continue;
      db.prepare("UPDATE audio_jobs SET status = 'pending', attempts = 0, last_error = NULL, next_try_at = NULL, updated_at = ? WHERE hash = ?").run(now(), job.hash);
      requeued += 1;
    }
    if (lostUploads > 0) {
      safely(() =>
        notify.raise(
          'content_issues',
          'audio_upload_lost',
          'Uploaded recordings are missing',
          `${lostUploads} uploaded recording(s) are no longer in the audio folder. Those with a transcript are queued for speech synthesis; upload them again to restore the recordings.`
        )
      );
    }
    return { queued, requeued, lostUploads };
  }

  return { enqueue, enqueueFromContent, processPending, getOrRender, version, regenerate, upload, sweep };
}

export type AudioService = ReturnType<typeof createAudioService>;
