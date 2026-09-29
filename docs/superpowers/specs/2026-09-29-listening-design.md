# Listening Module — Design Spec

## Overview

Listening gives the app real audio. It adds:
- a local **speech sidecar**: Piper TTS plus ffmpeg, in Docker, with an HTTP API;
- the **speech provider layer**, which Speaking extends with speech-to-text;
- **generated, cached audio** built from speaker-tagged transcripts;
- an **`audio_questions`** task type for lessons and Teil sets.

It converts the 38 listening lessons, whose "Hörtext" is printed today, into real audio exercises. It writes starter sets for every listening part of the 15 formats. It also introduces two things the rest of the app reuses: **admin notifications** and **SMTP email alerts**.

### In scope

- **Sidecar:** `speech/`, a small Python service (FastAPI) wrapping Piper voices and ffmpeg, plus `docker-compose.yml`. Settings (Owner/admin) hold the service URL, which defaults to `http://localhost:5002`.
- **The speech provider:** a `SpeechProvider` interface with `synthesize` (render) and `health`. There's one local adapter now; cloud adapters come later.
- **Audio:**
  - transcript format, voices per speaker, ambience filters;
  - a render cache in `<data dir>/audio/<hash>.ogg`;
  - a background generation queue, with on-demand fallback;
  - `GET /api/audio/[hash]` to stream it;
  - **backups include the audio files**.
- **`audio_questions` task type:** a transcript plus questions (multiple choice or Richtig/Falsch), per-question `evidence` for highlighting, and grading as for passages. It's used by lessons (converted and new) and by Teil sets (listening parts).
- **Replay rules:**
  - Teil practice follows the format part's `replays` (1 or 2) and has no scrubbing;
  - lessons have unlimited replays, an optional 0.75× speed and a 5-second rewind;
  - the transcript is shown only after answering, with each question's evidence highlighted.
- **Sidecar down:**
  - cached audio still plays;
  - lesson exercises whose audio is missing are dropped from the run and from the completion requirement while they're missing;
  - Teil parts and mocks whose set audio isn't all cached become non-runnable (hidden, with a notice);
  - the admin is notified in the panel and by email.
- **Admin notifications:** a `admin_notifications` table, a notification list and bell in the admin area. The sources:
  - speech service down or back up;
  - audio generation failures;
  - new AI-pool items awaiting review (Phase 2 practice pool and Teil pool);
  - repeated AI provider errors (3 failures within 10 minutes);
  - content issues (new flashcard-rule violations, missing translations): a daily check.
- **Email:** SMTP settings in Content Admin (host, port, TLS, user, password encrypted with the master key, from, to) and a **Send test email** button. Problem notifications (speech service down, audio failures, provider errors) email **once when they start and once when they're resolved**. Informational notifications (pool items, content issues) are in-app only.
- **Content:**
  - the 38 listening lessons converted (the Hörtext moves into a transcript with speaker tags, and is removed from the question), plus the telc B1 expansion's listening lessons;
  - 3 starter sets per listening part for all 15 formats, with transcripts, evidence and explanations;
  - listening parts of the formats get their runtime details (`replays`, filters).

### Out of scope

- Speech-to-text (Speaking).
- Cloud TTS adapters (later; the interface allows them).
- Uploading real recordings in this release. The admin **can** regenerate a clip; uploads come with the Level exams if needed. (The earlier decision "admin can regenerate or upload" is met in part: regenerate now, upload is noted as a follow-up in the Level exams spec.)

## Speech Sidecar

`speech/` holds a `Dockerfile` (Python 3.12-slim, `piper-tts`, `ffmpeg`, FastAPI and uvicorn), the German Piper voice models, which are downloaded at image build time, and `server.py`:

```
GET  /health  → { ok: true, voices: ["thorsten", "karlsson", "kerstin", "ramona", "eva_k", "pavoque"] }
POST /render  { segments: [{ text, voice }], filter: "none" | "phone" | "station" | "radio", pauseMs: 600 }
              → audio/ogg (opus, mono, 24 kHz)
```

- **Rendering:** each segment is synthesized with its voice. Segments are joined with `pauseMs` of silence, and the filter is applied with ffmpeg:
  - `phone`: band-pass 300–3400 Hz, light compression;
  - `station`: a hall reverb (`aecho`), a low room-noise bed and a chime at the start;
  - `radio`: a mild band-pass and compression.
- **`docker-compose.yml`** at the repo root has a `speech` service on port 5002, which Speaking extends with faster-whisper.
- **Setup docs** are in `speech/README.md`: `docker compose up -d speech`.

## Speech Provider (app side)

```ts
interface SpeechProvider {
  health(): Promise<{ ok: boolean; voices: string[] }>;
  render(input: { segments: { text: string; voice: string }[]; filter: AudioFilter; pauseMs: number }): Promise<Buffer>;
}
```

- `createLocalSpeechProvider(baseUrl)` has timeouts: health 3 s, render 60 s.
- The URL is stored in a new `app_settings` key/value table (`speech_url`).
- `getSpeechProvider(db)` returns the configured adapter.

## Transcripts and Audio

**Transcript format** (a string, one line per utterance):

```
@filter phone
[Anrufer m] Hallo, hier ist Thomas. Unser Treffen heute Abend muss leider ausfallen …
[Ansage f] Bitte beachten Sie: Der Zug nach Köln fährt heute von Gleis 7.
```

- **Speaker tag:** `[<label> <m|f>]`. The label is shown in the transcript view, and `m` or `f` picks the voice pool.
- **Voice choice:**
  - the first distinct `m` speaker gets `thorsten`, then `karlsson`, then `pavoque`;
  - the first distinct `f` speaker gets `kerstin`, then `ramona`, then `eva_k`;
  - each speaker keeps one voice for the whole transcript.
- **The filter line** is optional and defaults to `none`.
- **Parsing:** `parseTranscript` yields `{ filter, lines: { speaker, gender, text }[] }` and rejects untagged lines.

**Cache and generation:**
- **Cache key:** `sha256(JSON of { segments with voices, filter, pauseMs, rendererVersion })`, and the file is `<data dir>/audio/<hash>.ogg`.
- **Jobs table:** `audio_jobs(hash PRIMARY KEY, transcript, status: 'pending' | 'done' | 'failed', attempts, last_error, updated_at)`.
- **When jobs are queued:**
  - when content is loaded or edited: seed loading, admin lesson save, Teil set upload or save, and pool generation;
  - for every audio transcript whose file is missing.
- **Background worker** (`instrumentation.ts`, Node runtime only):
  - every 5 s it renders up to 3 pending jobs through the provider;
  - failures retry with backoff, up to 5 attempts, then `failed` plus a notification;
  - every 60 s it checks `health`, and a change of state raises or resolves the "speech service down" notification.
- **On demand:** `GET /api/audio/[hash]` serves the file if it exists. If it doesn't, it renders now (if the service is up) and caches the result. Otherwise it answers 503 `{ code: 'audio_unavailable' }`.
- **Admin:** each lesson or set with audio has a **Regenerate audio** action, which deletes the file and requeues it.

## `audio_questions` Task Type

```ts
interface AudioQuestionsContent {
  instruction?: LocalizedText;
  transcript: string;                                   // speaker-tagged, German
  questions: { question: string; options: string[]; correctIndex: number; evidence?: string }[];
}
```

- **View:** `{ instruction?, audio: { hash: string; available: boolean }, questions: { question, options }[] }`. The transcript and evidence are **never** in the view before answering.
- **Answer and grading:** the same as `passage_questions`. Lessons use the ≥ 80% / ≥ 50% rule.
- **After answering:** the lesson answer outcome, and the Teil review, return `transcript` and `evidence` per question. The UI shows the transcript with each evidence sentence highlighted.
- **Test-outs:** the type is eligible only when its audio is cached.
- **Practice generation (Phase 2):** it learns the shape. Transcripts are German-only at the level, and the generated audio is queued.

## Player

`AudioPlayer({ hash, mode: 'lesson' | 'exam', replays? })`:
- **Exam:** play/pause only. There's no seeking, and plays are counted: after the part's `replays`, the button is disabled and reads "Played {n} of {n} times". Counting is client-side and per attempt.
- **Lesson:** play/pause, **−5 s**, a **0.75×** toggle, and unlimited replays.
- **Missing audio:** "Audio unavailable" (no error styling in lessons, where the exercise is dropped).

## Lessons and Availability

- **Lesson view:** the server filters out `audio_questions` exercises whose audio isn't cached while the service is down, and it reports `unavailableAudio: number`. The page shows "Some listening exercises are unavailable right now".
- **Completion:** the rule counts only the exercises available at that moment, so a lesson can still complete. Exercises that appear later enter review normally, when first answered.
- **Teil parts:** a part (or a mock) is runnable only if every set it would serve has cached audio, **or** the service is up.

## Admin Notifications and Email

```sql
CREATE TABLE admin_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- 'speech_down' | 'audio_failed' | 'pool_items' | 'provider_errors' | 'content_issues'
  problem_key TEXT,                -- set for ongoing problems (one open row per key)
  severity TEXT NOT NULL CHECK (severity IN ('problem','info')),
  title TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL, resolved_at TEXT, read_at TEXT
);
CREATE UNIQUE INDEX idx_admin_notifications_open ON admin_notifications(problem_key) WHERE resolved_at IS NULL;
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- speech_url, smtp (JSON, password encrypted)
```

- **Problems** (`speech_down`, `provider_errors`, `audio_failed` per item) are raised with `raise(problemKey, …)`, which is idempotent while open, and closed with `resolve(problemKey)`. Email goes out on raise and on resolve.
- **Info notifications** (`pool_items`, `content_issues`) are appended. There's at most one unread `pool_items` row per day: the count is updated in place.
- **Email** uses nodemailer with the SMTP settings. A send failure is logged on the notification (`email_error`) and never throws into the caller.
- **UI:** `/admin/notifications` lists them with filters (open problems, unread). The admin sub-nav shows a bell with the unread count. "Mark all read".

## Backups

The backup envelope becomes **version 2**. It adds `audio: { [fileName]: base64 }`, holding every file in the audio directory. Import restores them. Version 1 archives still import, and their audio is regenerated as needed.

## Content

1. **Lesson conversion:** in each listening lesson (all tracks), every exercise that prints a Hörtext ("Hörtext (2x): '…' - Aufgabe: …", "Gleicher Hörtext: …") becomes an `audio_questions` exercise:
   - the Hörtext goes into a speaker-tagged `transcript`, with a filter fitting the situation (announcement → station, voicemail → phone, radio → radio);
   - the task becomes the question;
   - consecutive exercises about the same Hörtext merge into one exercise with several questions;
   - `evidence` is added per question.
   Exercises without a Hörtext stay.
2. **Starter sets:** 3 per listening part for all 15 formats, in the exact part format (number of texts, items, Richtig/Falsch or multiple choice). Each has speaker-tagged transcripts at the level, evidence, and explanations in en and de.
3. **Format details:** `replays` for every listening part, taken from the Modellsätze.

## Error Handling

- **Render failure:** retried, then notified. The student sees "Audio unavailable", never a crash.
- **SMTP failure:** recorded on the notification, and shown in the admin list.
- **Test email:** shows the SMTP error text when it fails.

## Testing

- **Pure:** `parseTranscript` (tags, voice assignment, filter line, rejection); cache key stability; the `audio_questions` view, grading and evidence; the replay counter logic; the notification raise/resolve state machine (idempotence, email on transitions only).
- **Sidecar:** a Python test (`speech/test_server.py`, pytest) that renders two segments with each filter and checks the output is Ogg and non-empty. It runs in the Docker build.
- **Services** (with a fake `SpeechProvider`):
  - job queue processing, retry and backoff, and the failed notification;
  - health transitions → raise and resolve, plus email;
  - the audio route (serve, render on demand, 503);
  - lesson availability (filtering, completion on available exercises);
  - Teil runnability;
  - backup v2 round trip, and v1 import still works;
  - SMTP settings (password encrypted at rest; test email uses the stored settings).
- **Client:** `AudioPlayer` (exam replay limit, no seeking; lesson rewind and speed); the transcript reveal with highlights; the admin notifications list and bell; the SMTP settings form with the test button.
- **Content:** set validation extended to `audio_questions` (evidence must be a substring of the transcript); each listening lesson has at least one `audio_questions` exercise and no Hörtext left in a question.

## Decisions (2026-09-29)

- **TTS:** local Piper TTS in a Docker sidecar, behind a provider interface.
- **Audio:** distinct voices per speaker, light ambience, pre-generated in the background with on-demand fallback. Backups include audio.
- **Existing lessons:** the listening lessons are converted; the transcript is hidden until after answering, with evidence highlighted.
- **Replays:** Teil practice follows the real replay rules. Lessons get unlimited replays, 0.75× speed and a 5-second rewind.
- **Sidecar down:** cached audio plays, exercises with missing audio are removed, and graded activities that depend on them are hidden. The admin is notified in the panel and by email.
- **Admin notifications** cover the speech service, audio failures, pool items, provider errors and content issues. SMTP is set up in Content Admin, and emails go out once at the start and once at the resolution of each problem.
