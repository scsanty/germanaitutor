# Listening Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 9–11 are content tasks.

**Goal:**
- Real listening: a local Piper TTS sidecar, cached generated audio from speaker-tagged transcripts, the `audio_questions` task type, and replay rules.
- Converted listening lessons, and listening starter sets for all 15 formats.
- Admin notifications and SMTP email alerts.

**Architecture:**
- **Sidecar:** a Python FastAPI service in Docker (`speech/`), exposing `/health`, `/render` and `/convert`.
- **App side:** a `SpeechProvider` adapter; an audio store under the data dir; an `audio_jobs` queue worked by a background loop started from `instrumentation.ts`; and a streaming audio route that renders on demand.
- **Task type:** `audio_questions` is the fourth set task type, graded like passages.
- **Notifications:** a raise/resolve state machine emails on transitions.

**Tech Stack:** Next.js 16, better-sqlite3, nodemailer, vitest 5; Python 3.12, FastAPI, piper-tts, ffmpeg, pytest (sidecar).

**Spec:** `docs/superpowers/specs/2026-09-29-listening-design.md`

**Precondition:** everything up to and including Reading is merged.

## Global Constraints

- **Transcripts:**
  - lines are `[<label> <m|f>] text`; an optional first line `@filter none|phone|station|radio` sets the filter;
  - voices come from the pools `m: thorsten, karlsson, pavoque` and `f: kerstin, ramona, eva_k`, in order of first appearance, and each speaker keeps its voice;
  - `pauseMs` is 600, and `RENDERER_VERSION` is 1.
- **Audio:**
  - the file is `<data dir>/audio/<sha256 hash>.ogg`, and the hash covers the segments, voices, filter, pauseMs and renderer version;
  - uploaded recordings (`status 'uploaded'`) are never overwritten by the worker.
- **Transcripts in views:** never before answering; revealed with the evidence after.
- **Replays:**
  - Exam: the format part's `replays`, with no seeking, counted per attempt on the client.
  - Lesson: unlimited replays, −5 s, and 0.75×.
- **Availability:**
  - a lesson drops `audio_questions` exercises that have no cached file while the speech service is down, and completion counts only the available exercises;
  - a Teil part is runnable when the service is up or every usable set's audio is cached.
- **Notifications:**
  - problem kinds (`speech_down`, `provider_errors`, `audio_failed`) have one open row per `problem_key`, and email goes out on raise and on resolve only;
  - info kinds (`pool_items`, `content_issues`) are in-app only;
  - an email failure never throws into the caller.
- **Secrets:** the SMTP password is encrypted with the master key (`encrypt`/`decrypt`), and never returned by an API.
- **Backups:** the envelope is version 2 and includes the audio files. Version 1 still imports.
- **Existing rules:** `res.ok` and `role="alert"`; `delayedResponse`; student text in en and de; admin in English.

## Review Focus

1. **Missing Docker:** the speech service URL isn't reachable at all (Docker not running). The app starts, cached audio plays, and one `speech_down` problem is raised, not one per health check (Task 4).
2. **Overwriting an upload:** regenerating a lesson's audio after an admin uploaded a recording must be an explicit action. The background worker never replaces an `uploaded` file (Task 3).
3. **Evidence not in the transcript:** a set whose `evidence` isn't a substring of its transcript fails validation (Task 1).
4. **Playing again after the limit:** in exam mode, the play button stays disabled after the allowed plays, even if the student pauses and resumes mid-play. A resume doesn't count as a new play (Task 6).
5. **Backup size:** exporting with hundreds of audio files still works. The archive is streamed through gzip in one pass, not held twice in memory (Task 8).

## Task Order

1. Transcripts, the cache key, and the `audio_questions` task type (pure)
2. The speech sidecar (Python, Docker, tests)
3. App settings, speech provider, audio store, jobs worker, and audio routes
4. Admin notifications and SMTP email
5. `audio_questions` in lessons, Teil sets, test-outs and practice; availability rules
6. AudioPlayer and the transcript reveal
7. Admin UI: notifications, SMTP and speech settings, regenerate and upload
8. Backups version 2
9. Content: format replays and the listening lesson conversion
10. Content: telc listening starter sets
11. Content: Goethe and NaDoch listening starter sets

---

### Task 1: Transcripts, cache key, and `audio_questions` (pure)

**Files:**
- Create: `lib/audio/transcript.ts`, `lib/audio/transcript.test.ts`, `lib/tasks/audioQuestions.ts`
- Modify: `lib/tasks/taskTypes.ts`, `lib/tasks/tasks.test.ts`, `lib/exam/teilSets.ts` (evidence check)

**Interfaces:**
- Produces:
  - `AudioFilter = 'none' | 'phone' | 'station' | 'radio'`
  - `ParsedTranscript { filter: AudioFilter; lines: { label: string; gender: 'm' | 'f'; text: string; voice: string }[] }`
  - `parseTranscript(text): ParsedTranscript | { error: string }`
  - `audioHash(parsed): string`, `RENDERER_VERSION = 1`, `PAUSE_MS = 600`
  - `AudioQuestionsContent { instruction?; transcript: string; questions: { question; options; correctIndex; evidence?: string }[] }`
  - `AudioQuestionsView { instruction?; audio: { hash: string; available: boolean }; questions: { question; options }[] }`. `viewAudioQuestions(content, available: (hash) => boolean)` builds it.
  - `audioReveal(content): { transcript: ParsedTranscript; evidence: (string | null)[] }`
  - `SetTaskType` gains `'audio_questions'`, and `taskTypes` dispatches it. Validation includes "evidence must appear in the transcript".

- [ ] **Step 1: Write the failing tests**

Create `lib/audio/transcript.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { audioHash, parseTranscript } from './transcript';

const T = `@filter phone
[Anrufer m] Hallo, hier ist Thomas.
[Mailbox f] Bitte sprechen Sie nach dem Ton.
[Anrufer m] Ich rufe später noch einmal an.
[Kollege m] Und ich auch.`;

describe('parseTranscript', () => {
  it('reads the filter, the speakers, and gives each speaker one voice from their pool', () => {
    const parsed = parseTranscript(T);
    expect(parsed).toMatchObject({ filter: 'phone' });
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.label, l.voice])).toEqual([
      ['Anrufer', 'thorsten'],
      ['Mailbox', 'kerstin'],
      ['Anrufer', 'thorsten'],
      ['Kollege', 'karlsson'],
    ]);
  });

  it('defaults to no filter and rejects untagged lines and unknown filters', () => {
    expect(parseTranscript('[A f] Hallo.')).toMatchObject({ filter: 'none' });
    expect(parseTranscript('Hallo ohne Sprecher.')).toEqual({ error: 'line 1 needs a speaker tag like [Name m]' });
    expect(parseTranscript('@filter echo\n[A f] Hallo.')).toEqual({ error: 'unknown filter echo' });
  });

  it('hashes stably, and differently when anything audible changes', () => {
    const a = parseTranscript(T);
    const b = parseTranscript(T);
    const c = parseTranscript(T.replace('phone', 'station'));
    if ('error' in a || 'error' in b || 'error' in c) throw new Error('parse');
    expect(audioHash(a)).toBe(audioHash(b));
    expect(audioHash(a)).not.toBe(audioHash(c));
    expect(audioHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

Append to `lib/tasks/tasks.test.ts`:

```ts
describe('audio_questions', () => {
  const content = {
    transcript: '[Ansage f] Der Zug nach Köln fährt heute von Gleis 7.',
    questions: [{ question: 'Der Zug fährt von Gleis 5.', options: ['Richtig', 'Falsch'], correctIndex: 1, evidence: 'fährt heute von Gleis 7' }],
  };

  it('validates, including that evidence appears in the transcript (Review Focus 3)', () => {
    expect(validateTask('audio_questions', content)).toEqual([]);
    expect(validateTask('audio_questions', { ...content, questions: [{ ...content.questions[0], evidence: 'Gleis 9' }] })).toEqual([
      'question 1: evidence must appear in the transcript',
    ]);
    expect(validateTask('audio_questions', { ...content, transcript: 'no tag' })).toEqual(['transcript: line 1 needs a speaker tag like [Name m]']);
  });

  it('never puts the transcript or evidence in the view, and grades like a passage', () => {
    const view = viewTask('audio_questions', content, () => true);
    expect(JSON.stringify(view)).not.toMatch(/Gleis 7|transcript|evidence|correctIndex/);
    expect(view).toMatchObject({ audio: { available: true } });
    expect(gradeTask('audio_questions', content, { type: 'audio_questions', selected: [1] }).itemResults).toEqual([true]);
  });
});
```

`viewTask` gains an optional third argument, `available(hash)`, used only by `audio_questions`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/audio lib/tasks`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/audio/transcript.ts`:

```ts
import { createHash } from 'node:crypto';

export type AudioFilter = 'none' | 'phone' | 'station' | 'radio';
const FILTERS: AudioFilter[] = ['none', 'phone', 'station', 'radio'];
const VOICES = { m: ['thorsten', 'karlsson', 'pavoque'], f: ['kerstin', 'ramona', 'eva_k'] } as const;
export const RENDERER_VERSION = 1;
export const PAUSE_MS = 600;

export interface ParsedTranscript {
  filter: AudioFilter;
  lines: { label: string; gender: 'm' | 'f'; text: string; voice: string }[];
}

const LINE = /^\[(.+?)\s+([mf])\]\s*(.+)$/;

export function parseTranscript(text: string): ParsedTranscript | { error: string } {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let filter: AudioFilter = 'none';
  if (rows[0]?.startsWith('@filter')) {
    const name = rows.shift()!.slice('@filter'.length).trim();
    if (!FILTERS.includes(name as AudioFilter)) return { error: `unknown filter ${name}` };
    filter = name as AudioFilter;
  }
  if (rows.length === 0) return { error: 'the transcript is empty' };
  const voiceOf = new Map<string, string>();
  const used = { m: 0, f: 0 };
  const lines: ParsedTranscript['lines'] = [];
  for (const [i, row] of rows.entries()) {
    const m = LINE.exec(row);
    if (!m) return { error: `line ${i + 1} needs a speaker tag like [Name m]` };
    const [, label, gender, said] = m as unknown as [string, string, 'm' | 'f', string];
    const key = `${label}|${gender}`;
    if (!voiceOf.has(key)) {
      const pool = VOICES[gender];
      voiceOf.set(key, pool[used[gender] % pool.length]);
      used[gender] += 1;
    }
    lines.push({ label, gender, text: said, voice: voiceOf.get(key)! });
  }
  return { filter, lines };
}

export function audioHash(parsed: ParsedTranscript): string {
  const payload = JSON.stringify({
    segments: parsed.lines.map((l) => ({ text: l.text, voice: l.voice })),
    filter: parsed.filter,
    pauseMs: PAUSE_MS,
    rendererVersion: RENDERER_VERSION,
  });
  return createHash('sha256').update(payload).digest('hex');
}
```

Create `lib/tasks/audioQuestions.ts`, mirroring `passageQuestions.ts`:
- `validateAudioQuestions`:
  - parses the transcript and prefixes any error with `transcript: `;
  - validates the questions like passages;
  - checks `evidence` (when present) with `transcript.includes(evidence)`, else `question n: evidence must appear in the transcript`.
- `viewAudioQuestions(content, available)`: computes `hash = audioHash(parseTranscript(content.transcript))` and returns `{ instruction?, audio: { hash, available: available(hash) }, questions }`.
- The parse, grade and correct-text functions are the same as passages, with `type: 'audio_questions'`.
- `audioReveal(content)` returns the parsed transcript and each question's `evidence ?? null`.

`lib/tasks/taskTypes.ts`:
- add `'audio_questions'` to `SetTaskType` and each dispatcher;
- give `viewTask` its third parameter, `available: (hash: string) => boolean = () => false`.

`lib/exam/formats.ts`: add `'audio_questions'` to `RUNTIME_TASK_TYPES` in Task 5, not here.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/audio lib/tasks && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/audio lib/tasks lib/exam/teilSets.ts
git commit -m "feat: add speaker-tagged transcripts, audio hashes, and the audio_questions task type"
```

---

### Task 2: The speech sidecar

**Files:**
- Create: `speech/Dockerfile`, `speech/requirements.txt`, `speech/server.py`, `speech/test_server.py`, `speech/README.md`, `docker-compose.yml`

**Interfaces:**
- `GET /health` → `{ "ok": true, "voices": [...] }`
- `POST /render` with JSON `{ segments: [{ text, voice }], filter, pauseMs }` → `audio/ogg`
- `POST /convert` with raw audio bytes (any format ffmpeg reads) → `audio/ogg`
- Errors: 400 `{ "error": "..." }` (unknown voice or filter, empty segments), 500 on synthesis failure.

- [ ] **Step 1: Write the service and its test**

`speech/requirements.txt`:

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
piper-tts==1.2.*
pytest==8.*
httpx==0.28.*
```

`speech/server.py`:

```python
"""NaDoch! speech sidecar: German TTS with Piper, and audio conversion, via ffmpeg.

POST /render joins synthesized segments with pauses and applies a situational filter.
POST /convert turns an uploaded recording into the app's audio format (ogg/opus, mono, 24 kHz).
"""
import io
import os
import subprocess
import tempfile
import wave

from fastapi import FastAPI, HTTPException, Request, Response
from piper import PiperVoice
from pydantic import BaseModel

VOICE_DIR = os.environ.get("VOICE_DIR", "/voices")
VOICE_FILES = {
    "thorsten": "de_DE-thorsten-high.onnx",
    "karlsson": "de_DE-karlsson-low.onnx",
    "pavoque": "de_DE-pavoque-low.onnx",
    "kerstin": "de_DE-kerstin-low.onnx",
    "ramona": "de_DE-ramona-low.onnx",
    "eva_k": "de_DE-eva_k-x_low.onnx",
}
FILTERS = {
    "none": None,
    "phone": "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3",
    "station": "aecho=0.8:0.7:60|120:0.35|0.2,highpass=f=120",
    "radio": "highpass=f=150,lowpass=f=6000,acompressor=threshold=-20dB:ratio=2.5",
}

app = FastAPI()
_voices: dict[str, PiperVoice] = {}


def voice(name: str) -> PiperVoice:
    if name not in VOICE_FILES:
        raise HTTPException(400, detail={"error": f"unknown voice {name}"})
    if name not in _voices:
        _voices[name] = PiperVoice.load(os.path.join(VOICE_DIR, VOICE_FILES[name]))
    return _voices[name]


def synth_wav(text: str, name: str) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        voice(name).synthesize(text, wav)
    return buf.getvalue()


def ffmpeg(args: list[str], data: bytes | None = None) -> bytes:
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", *args], input=data, capture_output=True)
    if result.returncode != 0:
        raise HTTPException(500, detail={"error": result.stderr.decode()[:500]})
    return result.stdout


class Segment(BaseModel):
    text: str
    voice: str


class RenderRequest(BaseModel):
    segments: list[Segment]
    filter: str = "none"
    pauseMs: int = 600


@app.get("/health")
def health():
    return {"ok": True, "voices": sorted(VOICE_FILES)}


@app.post("/render")
def render(req: RenderRequest):
    if not req.segments:
        raise HTTPException(400, detail={"error": "no segments"})
    if req.filter not in FILTERS:
        raise HTTPException(400, detail={"error": f"unknown filter {req.filter}"})
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        silence = os.path.join(tmp, "silence.wav")
        ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", str(req.pauseMs / 1000), silence])
        for i, seg in enumerate(req.segments):
            path = os.path.join(tmp, f"{i}.wav")
            with open(path, "wb") as f:
                f.write(synth_wav(seg.text, seg.voice))
            parts += [path, silence]
        listing = os.path.join(tmp, "list.txt")
        with open(listing, "w") as f:
            f.writelines(f"file '{p}'\n" for p in parts[:-1])
        chain = ["-f", "concat", "-safe", "0", "-i", listing]
        if FILTERS[req.filter]:
            chain += ["-af", FILTERS[req.filter]]
        audio = ffmpeg([*chain, "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"])
    return Response(content=audio, media_type="audio/ogg")


@app.post("/convert")
async def convert(request: Request):
    data = await request.body()
    if not data:
        raise HTTPException(400, detail={"error": "empty upload"})
    audio = ffmpeg(["-i", "pipe:0", "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"], data)
    return Response(content=audio, media_type="audio/ogg")
```

`speech/test_server.py`:

```python
from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_health_lists_voices():
    body = client.get("/health").json()
    assert body["ok"] is True
    assert "thorsten" in body["voices"] and "kerstin" in body["voices"]


def test_render_each_filter_returns_ogg():
    for name in ["none", "phone", "station", "radio"]:
        res = client.post("/render", json={
            "segments": [{"text": "Hallo, hier ist Thomas.", "voice": "thorsten"}, {"text": "Guten Tag.", "voice": "kerstin"}],
            "filter": name,
            "pauseMs": 300,
        })
        assert res.status_code == 200, res.text
        assert res.content[:4] == b"OggS"


def test_render_rejects_unknown_voice_and_filter():
    assert client.post("/render", json={"segments": [{"text": "x", "voice": "nope"}]}).status_code == 400
    assert client.post("/render", json={"segments": [{"text": "x", "voice": "thorsten"}], "filter": "echo"}).status_code == 400


def test_convert_turns_a_recording_into_ogg():
    wav = client.post("/render", json={"segments": [{"text": "Test.", "voice": "thorsten"}]}).content
    res = client.post("/convert", content=wav)
    assert res.status_code == 200 and res.content[:4] == b"OggS"
```

`speech/Dockerfile`:

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ENV VOICE_DIR=/voices
RUN mkdir -p /voices && cd /voices && for v in \
      de/de_DE/thorsten/high/de_DE-thorsten-high de/de_DE/karlsson/low/de_DE-karlsson-low \
      de/de_DE/pavoque/low/de_DE-pavoque-low de/de_DE/kerstin/low/de_DE-kerstin-low \
      de/de_DE/ramona/low/de_DE-ramona-low de/de_DE/eva_k/x_low/de_DE-eva_k-x_low; do \
      n=$(basename $v); \
      curl -fsSL -o $n.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx"; \
      curl -fsSL -o $n.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx.json"; \
    done
COPY server.py test_server.py ./
RUN python -m pytest -q test_server.py
EXPOSE 5002
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5002"]
```

`docker-compose.yml`:

```yaml
services:
  speech:
    build: ./speech
    ports:
      - "5002:5002"
    restart: unless-stopped
```

`speech/README.md`: what the service does, `docker compose up -d speech`, and how to check it (`curl localhost:5002/health`). The app's Settings → Content Admin → Speech service URL defaults to `http://localhost:5002`.

- [ ] **Step 2: Build it (this runs the tests)**

Run: `docker compose build speech`
Expected: the build succeeds, with 4 passed tests in the pytest step.

If a voice URL has moved, find the current path in the `rhasspy/piper-voices` repository's `voices.json` and update the Dockerfile. If a voice isn't available at the listed quality, use the closest one available and update `VOICE_FILES`. Report both.

Then: `docker compose up -d speech && curl -s localhost:5002/health`.

- [ ] **Step 3: Commit**

```bash
git add speech docker-compose.yml
git commit -m "feat: add the local speech sidecar (Piper TTS, ffmpeg filters, conversion)"
```

---

### Task 3: App settings, speech provider, audio store, jobs worker, and audio routes

**Files:**
- Create:
  - `lib/services/appSettings.ts`
  - `lib/speech/speechProvider.ts`, `lib/speech/localSpeechProvider.ts`
  - `lib/audio/audioStore.ts`
  - `lib/services/audioService.ts`, `lib/services/audioService.test.ts`
  - `lib/background/worker.ts`, `instrumentation.ts`
  - `app/api/audio/[hash]/route.ts`, `app/api/audio/routes.test.ts`
- Modify: `lib/db/schema.ts`, `lib/services/curriculumSeedLoader.ts`, `lib/services/teilSetService.ts`, `lib/services/lessonAdminService.ts` (enqueue on save)

**Interfaces:**
- Produces:
  - `getSetting(db, key): string | null` and `setSetting(db, key, value)` (table `app_settings`)
  - `SpeechProvider { health(): Promise<{ ok: boolean; voices: string[] }>; render(input): Promise<Buffer>; convert(data: Buffer): Promise<Buffer> }`
  - `createLocalSpeechProvider(baseUrl: string): SpeechProvider`
  - `getSpeechProvider(db): SpeechProvider`, using setting `speech_url`, default `http://localhost:5002`
  - `audioPath(hash)`, `hasAudio(hash)`, `writeAudio(hash, buf)`, `deleteAudio(hash)`, `listAudioFiles()` (under `<data dir>/audio`)
  - `createAudioService(db, deps?: { provider?: SpeechProvider; now?: () => Date; notify?: NotificationSink })` →
    - `enqueue(transcript: string): string | null` (the hash, or `null` if the transcript is invalid)
    - `enqueueFromContent(type, content)`
    - `processPending(limit = 3): Promise<void>`
    - `getOrRender(hash): Promise<Buffer | null>`
    - `regenerate(hash)`
    - `upload(hash, data): Promise<void>`
  - `NotificationSink { raise(kind, problemKey, title, body): void; resolve(problemKey): void }` (implemented in Task 4; a no-op default here)
  - `startBackgroundWorker(db)`: 5 s job ticks, and a 60 s health check (the health check lands in Task 4). It's guarded to start once per process.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/audioService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createAudioService } from './audioService';
import { hasAudio } from '../audio/audioStore';

const T = '@filter phone\n[Anrufer m] Hallo, hier ist Thomas.';

function fakeProvider(ok = true) {
  return {
    health: vi.fn(async () => ({ ok, voices: [] })),
    render: vi.fn(async () => {
      if (!ok) throw new Error('connect ECONNREFUSED');
      return Buffer.from('OggS-fake');
    }),
    convert: vi.fn(async (b: Buffer) => Buffer.concat([Buffer.from('OggS-'), b])),
  };
}

describe('audioService', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-audio-'));
  });

  it('queues a transcript once, renders it in the background, and serves it from the cache', async () => {
    const db = createDbClient(':memory:');
    const provider = fakeProvider();
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    expect(service.enqueue(T)).toBe(hash);
    await service.processPending();
    expect(hasAudio(hash)).toBe(true);
    expect(provider.render).toHaveBeenCalledWith({ segments: [{ text: 'Hallo, hier ist Thomas.', voice: 'thorsten' }], filter: 'phone', pauseMs: 600 });
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-fake');
    expect(provider.render).toHaveBeenCalledTimes(1);
  });

  it('retries failures with backoff and marks the job failed after 5 attempts, raising a problem', async () => {
    const db = createDbClient(':memory:');
    const notify = { raise: vi.fn(), resolve: vi.fn() };
    let now = new Date('2026-09-29T10:00:00Z');
    const service = createAudioService(db, { provider: fakeProvider(false), notify, now: () => now });
    const hash = service.enqueue(T)!;
    for (let i = 0; i < 5; i++) {
      await service.processPending();
      now = new Date(now.getTime() + 3_600_000);
    }
    expect(db.prepare('SELECT status, attempts FROM audio_jobs WHERE hash = ?').get(hash)).toEqual({ status: 'failed', attempts: 5 });
    expect(notify.raise).toHaveBeenCalledWith('audio_failed', `audio_failed:${hash}`, expect.any(String), expect.stringContaining('ECONNREFUSED'));
  });

  // Review Focus 2
  it('never lets the worker replace an uploaded recording; regenerate is explicit', async () => {
    const db = createDbClient(':memory:');
    const provider = fakeProvider();
    const service = createAudioService(db, { provider });
    const hash = service.enqueue(T)!;
    await service.upload(hash, Buffer.from('mine'));
    service.enqueue(T);
    await service.processPending();
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-mine');
    expect(provider.render).not.toHaveBeenCalled();
    service.regenerate(hash);
    await service.processPending();
    expect((await service.getOrRender(hash))?.toString()).toBe('OggS-fake');
  });

  it('returns null from getOrRender when the file is missing and the service is down', async () => {
    const db = createDbClient(':memory:');
    const service = createAudioService(db, { provider: fakeProvider(false) });
    const hash = service.enqueue(T)!;
    expect(await service.getOrRender(hash)).toBeNull();
  });
});
```

Create `app/api/audio/routes.test.ts`:
- with `GAIT_DATA_DIR` set, write a file for a known hash through `writeAudio`;
- `GET /api/audio/<hash>` → 200 with `Content-Type: audio/ogg` and the bytes;
- an unknown valid-looking hash with the service unreachable (`setSetting(db, 'speech_url', 'http://127.0.0.1:9')`) → 503 with `code: 'audio_unavailable'`;
- a malformed hash (`abc`) → 400.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/audioService.test.ts app/api/audio`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/db/schema.ts` gains:

```sql
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audio_jobs (
  hash TEXT PRIMARY KEY,
  transcript TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','done','failed','uploaded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_try_at TEXT,
  updated_at TEXT NOT NULL
);
```

`lib/tutoring/errorCodes.ts` gains `'audio_unavailable'`. Catalogs: en "This audio isn't available right now", de "Dieses Audio ist gerade nicht verfügbar".

`lib/speech/localSpeechProvider.ts`:

```ts
import type { SpeechProvider } from './speechProvider';

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function createLocalSpeechProvider(baseUrl: string): SpeechProvider {
  const url = (path: string) => `${baseUrl.replace(/\/$/, '')}${path}`;
  return {
    async health() {
      try {
        return await withTimeout(3000, async (signal) => {
          const res = await fetch(url('/health'), { signal });
          if (!res.ok) return { ok: false, voices: [] };
          const body = (await res.json()) as { voices?: string[] };
          return { ok: true, voices: body.voices ?? [] };
        });
      } catch {
        return { ok: false, voices: [] };
      }
    },
    async render(input) {
      return withTimeout(60_000, async (signal) => {
        const res = await fetch(url('/render'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
        if (!res.ok) throw new Error(`speech service ${res.status}: ${await res.text()}`);
        return Buffer.from(await res.arrayBuffer());
      });
    },
    async convert(data) {
      return withTimeout(60_000, async (signal) => {
        const res = await fetch(url('/convert'), { method: 'POST', body: data, signal });
        if (!res.ok) throw new Error(`speech service ${res.status}: ${await res.text()}`);
        return Buffer.from(await res.arrayBuffer());
      });
    },
  };
}
```

`lib/audio/audioStore.ts`:
- a directory `join(process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor'), 'audio')`, created on write;
- `audioPath(hash)` validates `/^[0-9a-f]{64}$/` and throws otherwise;
- `writeAudio` writes to `.tmp` and then renames;
- `listAudioFiles()` returns `{ name, path }[]`.

`lib/services/audioService.ts`:
- **`enqueue(transcript)`:** parse it; if invalid, return null. Compute the hash. `INSERT OR IGNORE` a pending job. If the file already exists and the job is pending, mark it done. Return the hash.
- **`enqueueFromContent`:** walks the content of type `audio_questions` and enqueues its transcript.
- **`processPending`:** selects up to `limit` jobs with `status = 'pending' AND (next_try_at IS NULL OR next_try_at <= now)`. For each, it renders through the provider from the job's parsed transcript and writes the file.
  - On success: status `done`, and `notify.resolve('audio_failed:' + hash)`.
  - On error: `attempts + 1`, `last_error`, and `next_try_at = now + 2^attempts minutes`. At 5 attempts, status `failed` and `notify.raise('audio_failed', 'audio_failed:' + hash, 'Audio generation failed', error)`.
  - It never touches `uploaded` jobs.
- **`getOrRender(hash)`:**
  - if the file exists, return it;
  - otherwise, if a job exists and isn't `uploaded`, try one render now: success writes the file, marks it done and returns it; failure returns `null`;
  - with no job for the hash, return `null`.
- **`regenerate(hash)`:** deletes the file and sets the job to `pending` with `attempts = 0`.
- **`upload(hash, data)`:** `provider.convert(data)` → `writeAudio`, then the job's status becomes `uploaded`. A job is created from an empty transcript if it's missing, because upload is only offered for known hashes.

`app/api/audio/[hash]/route.ts`: `GET`. It validates the hash format (400), calls `getOrRender`, and returns `new Response(buf, { headers: { 'Content-Type': 'audio/ogg', 'Cache-Control': 'private, max-age=31536000, immutable' } })`, or 503 `errorBody('This audio is not available right now', 'audio_unavailable')`.

**Enqueuing:**
- `curriculumSeedLoader` (after upserting exercises), `teilSetService` (load, upload, update, pool generation) and `lessonAdminService` (create, update) call `createAudioService(db).enqueueFromContent(type, content)` for `audio_questions` content.
- Enqueuing only writes rows: it never calls the provider.

**Background worker:**
- `lib/background/worker.ts`:

```ts
import type Database from 'better-sqlite3';
import { createAudioService } from '../services/audioService';

const started = Symbol.for('nadoch.worker');

// Spec: renders queued audio every 5 s (Task 4 adds the 60 s health check). Once per process.
export function startBackgroundWorker(db: Database.Database): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[started]) return;
  g[started] = true;
  const audio = createAudioService(db);
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await audio.processPending();
    } finally {
      busy = false;
    }
  }, 5000).unref();
}
```

- `instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VITEST) return;
  const { getDb } = await import('./lib/db/client');
  const { startBackgroundWorker } = await import('./lib/background/worker');
  startBackgroundWorker(getDb());
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/audioService.test.ts app/api/audio && npx tsc --noEmit && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib/services/appSettings.ts lib/speech lib/audio lib/services/audioService.ts lib/services/audioService.test.ts lib/background instrumentation.ts app/api/audio lib/db/schema.ts lib/services lib/tutoring/errorCodes.ts messages
git commit -m "feat: add the speech provider, the audio cache and job queue, and the audio route"
```

---

### Task 4: Admin notifications and SMTP email

**Files:**
- Create:
  - `lib/services/notificationService.ts`, `lib/services/notificationService.test.ts`
  - `lib/services/mailService.ts`
  - `lib/background/healthCheck.ts`, `lib/background/healthCheck.test.ts`
  - `lib/background/contentCheck.ts`
- Modify:
  - `lib/db/schema.ts`, `lib/background/worker.ts`
  - `lib/services/aiService.ts` (record provider failures)
  - Phase 2's `practiceService.ts` and Reading's `teilSetService.ts` (pool items)
  - `package.json` (`nodemailer`, `@types/nodemailer`)

**Interfaces:**
- Produces:
  - `createNotificationService(db, deps?: { mailer?: Mailer; now? })` →
    - `raise(kind, problemKey, title, body)`: idempotent while open, emails on the first raise
    - `resolve(problemKey)`: emails "resolved" only if one was open
    - `info(kind, title, body)`: for `pool_items`, it increments one unread row per day
    - `list(filter)`, `markAllRead()`, `unreadCount()`
  - `Mailer { send(subject: string, text: string): Promise<void> }`
  - `createMailService(db): Mailer`, which reads SMTP settings from `app_settings.smtp` and throws a clear error when they aren't configured
  - `SmtpSettings { host; port; secure: boolean; user; passwordEncrypted: string; from; to }`
  - `saveSmtpSettings(db, input with plain password | null to keep)` and `readSmtpSettingsForDisplay(db)` (the password is never returned)
  - `runHealthCheck(db, provider, notifications)`: raises `speech_down` with key `speech_down` when it's not ok, and resolves it when it's ok
  - `recordProviderFailure(db)`: raises `provider_errors` at 3 failures within 10 minutes, and a success resolves it
  - `runContentCheck(db)`: at most daily; an `info('content_issues')` when flashcard-rule violations or missing German titles exist

- [ ] **Step 1: Write the failing tests**

Create `lib/services/notificationService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { createNotificationService } from './notificationService';

function setup(failMail = false) {
  const db = createDbClient(':memory:');
  const mailer = { send: vi.fn(async () => { if (failMail) throw new Error('SMTP auth failed'); }) };
  return { db, mailer, service: createNotificationService(db, { mailer, now: () => new Date('2026-09-29T10:00:00Z') }) };
}

describe('notificationService', () => {
  it('raises a problem once, emails on raise and on resolve only', async () => {
    const { service, mailer } = setup();
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'Cannot reach http://localhost:5002');
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'again');
    expect(service.list({ openProblems: true })).toHaveLength(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    await service.resolve('speech_down');
    await service.resolve('speech_down');
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenLastCalledWith('Resolved: Speech service is down', expect.any(String));
    await service.raise('speech_down', 'speech_down', 'Speech service is down', 'down again');
    expect(service.list({ openProblems: true })).toHaveLength(1);
  });

  it('keeps pool items in-app, one unread row per day with a running count', async () => {
    const { service, mailer } = setup();
    await service.info('pool_items', 'New pool items', '1 new item to review');
    await service.info('pool_items', 'New pool items', '1 new item to review');
    const rows = service.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('2 new items to review');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('records an email failure instead of throwing', async () => {
    const { service } = setup(true);
    await expect(service.raise('provider_errors', 'provider_errors', 'AI provider errors', 'x')).resolves.toBeUndefined();
    expect(service.list({})[0].emailError).toBe('SMTP auth failed');
  });
});
```

Create `lib/background/healthCheck.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runHealthCheck } from './healthCheck';

describe('runHealthCheck', () => {
  // Review Focus 1: repeated failed checks raise one problem.
  it('raises speech_down while unreachable and resolves it when back', async () => {
    const notifications = { raise: vi.fn(async () => {}), resolve: vi.fn(async () => {}) };
    const down = { health: vi.fn(async () => ({ ok: false, voices: [] })) };
    await runHealthCheck(down as never, notifications as never, 'http://localhost:5002');
    await runHealthCheck(down as never, notifications as never, 'http://localhost:5002');
    expect(notifications.raise).toHaveBeenCalledWith('speech_down', 'speech_down', 'Speech service is down', expect.stringContaining('http://localhost:5002'));
    const up = { health: vi.fn(async () => ({ ok: true, voices: ['thorsten'] })) };
    await runHealthCheck(up as never, notifications as never, 'http://localhost:5002');
    expect(notifications.resolve).toHaveBeenCalledWith('speech_down');
  });
});
```

(The single open row is guaranteed by `raise`'s idempotence, which the notification test covers.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/notificationService.test.ts lib/background`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `npm install nodemailer && npm install -D @types/nodemailer`
- Schema: `admin_notifications` and its partial unique index, exactly as in the spec, plus an `email_error TEXT` column.
- **`notificationService`:**
  - **raise:** if an open row with `problem_key` exists, return. Otherwise insert it (severity `problem`) and send `mailer.send(title, body + footer)`, catching errors into `email_error`.
  - **resolve:** set `resolved_at` on the open row. If one was closed, send `Resolved: <title>`.
  - **info:** for `pool_items`, update today's unread row, bumping the count parsed from the body (`/^(\d+)/`) and re-rendering `"<n> new item(s) to review"`, or insert one. Otherwise insert.
  - **list:** `{ openProblems?: boolean; unreadOnly?: boolean }`, newest first, mapped to camelCase, including `emailError`.
- **`mailService`:** reads the SMTP settings, decrypts the password with `loadOrCreateMasterKey()`, and uses `nodemailer.createTransport({ host, port, secure, auth: { user, pass } })` → `sendMail({ from, to, subject: '[NaDoch!] ' + subject, text })`. When SMTP isn't configured, `createNotificationService`'s default mailer is a no-op, recorded as `email_error: 'Email is not set up'`.
- **`healthCheck.ts`:** `runHealthCheck(provider, notifications, url)` raises with the body `Cannot reach the speech service at ${url}. Start it with: docker compose up -d speech`, or resolves.
- **`worker.ts`:** every 60 s, `runHealthCheck(getSpeechProvider(db), createNotificationService(db, { mailer: createMailService(db) }), url)`; and once per 24 h, `runContentCheck(db)`.
- **`aiService`:** after `generateWithActiveProvider` fails with `ai_failed`, `credentials_unreadable` or `no_model`, call `recordProviderFailure(db)`. It keeps timestamps in memory per process; 3 failures within 10 minutes raise `provider_errors`. On success, call `resolve('provider_errors')`. `no_provider` isn't counted.
- **Pool items:** where Phase 2's `practiceService` and Reading's `teilSetService` insert pool items, call `info('pool_items', 'New pool items', '1 new item to review')`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib package.json package-lock.json
git commit -m "feat: add admin notifications with email on problem start and resolution"
```

---

### Task 5: `audio_questions` in lessons, Teil sets, test-outs and practice; availability rules

**Files:**
- Modify:
  - `lib/exam/formats.ts` (`RUNTIME_TASK_TYPES` adds `audio_questions`)
  - `lib/curriculum/*`, `lib/tutoring/exerciseView.ts`, `lessonAnswers.ts`, `lib/services/exerciseGrading.ts`, `lib/tutoring/testOut.ts`, `lib/services/testOutStatus.ts`
  - `lib/services/progressService.ts`, `lib/services/attemptService.ts`
  - `lib/services/examPracticeService.ts`
  - Phase 2's `practiceGeneration.ts`
  - `lib/db/schema.ts` (the exercise-type CHECK, via the same rebuild pattern as Reading's `migrateExerciseTypes`, now allowing `'audio_questions'`)
  - and their tests

**Interfaces:**
- Produces:
  - `LessonView` gains `unavailableAudio: number`.
  - The attempt outcome gains `reveal?: { transcript: ParsedTranscript; evidence: (string | null)[] }` for `audio_questions`, and the Teil `PracticeResult` gains `reveal` in the same shape.
  - `overview()` marks a listening part `runnable` only when the speech service is healthy or every usable set's audio is cached.
  - `isTestOutEligibleType('audio_questions', …)` is true, and drawing it requires cached audio.

- [ ] **Step 1: Write the failing tests**

- **`progressService.test.ts`:**
  - a lesson with one `audio_questions` exercise whose file is missing, with the provider stubbed down through `setSetting(db, 'speech_url', 'http://127.0.0.1:9')`, gives a lesson view without that exercise and `unavailableAudio: 1`;
  - with the file written through `writeAudio`, the view includes it and `unavailableAudio: 0`.
- **`attemptService.test.ts`:** a lesson whose remaining unavailable exercise is audio-only completes once every **available** exercise is passed.
- **`examPracticeService.test.ts`:** with `telc-b1/hoeren-1` sets bundled (add one real set in this task: `data/teil-sets/telc-b1/hoeren-1.json`):
  - `overview().parts` marks `hoeren-1` runnable when the files exist;
  - it isn't runnable when the files are missing and the service is down;
  - submitting returns `reveal`.
- **`testOutService.test.ts`:** an `audio_questions` exercise without cached audio isn't drawn.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services`
Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces above:
- Rebuild the exercise type CHECK the way Reading's `migrateExerciseTypes` does. Generalize that function to take the full list, and rename it `migrateExerciseTypeCheck`.
- The lesson's available-exercise filter, and `meetsCompletionRule` over the available ids, is computed in `progressService`/`attemptService` with `hasAudio`, and a single `provider.health()` per request, memoized for 30 s in-process.
- Phase 2's generation `SHAPES` gains `audio_questions`: `{"transcript": "[Name m|f] German lines (60–150 words, 1–3 speakers)", "questions": [...3 options, correctIndex, "evidence": exact words from the transcript]}`. Generated audio exercises are enqueued.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib data/teil-sets
git commit -m "feat: use audio questions in lessons, exam practice, test-outs, and practice, with availability rules"
```

---

### Task 6: AudioPlayer and the transcript reveal

**Files:**
- Create:
  - `components/audio/AudioPlayer.tsx`, `components/audio/AudioPlayer.test.tsx`
  - `components/audio/TranscriptReveal.tsx`, `components/audio/TranscriptReveal.test.tsx`
- Modify:
  - `components/exam/TaskInputs.tsx` (the `audio_questions` input: player above the questions)
  - `components/exam/TeilReview.tsx`, `components/tutoring/ExerciseCard.tsx` (reveal after answering)
  - `components/tutoring/LessonPage.tsx` (the unavailable-audio note)
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- `AudioPlayer({ hash, available, mode: 'lesson' | 'exam', replays? })`:
  - uses an `<audio>` element with `src="/api/audio/<hash>"` and custom controls only (no native `controls`).
  - **Exam:** a Play/Pause button, and "Played {n} of {max} times". A play counts when playback starts from the beginning (`currentTime === 0` at `play`). A resume after pausing doesn't count (Review Focus 4). At `ended`, the element resets to 0, and after `max` plays Play is disabled.
  - **Lesson:** Play/Pause, a **−5 s** button, and a **0.75×** toggle (`playbackRate`).
  - When `available` is false: the text `audio.unavailable`.
- `TranscriptReveal({ transcript: ParsedTranscript, evidence })`: each line shows its speaker label, and the text with every evidence string highlighted in a `<mark>`.

- [ ] **Step 1: Write the failing tests**

Create `components/audio/AudioPlayer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { AudioPlayer } from './AudioPlayer';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
});

describe('AudioPlayer', () => {
  it('in exam mode counts full plays, not resumes, and stops at the limit', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={2} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    Object.defineProperty(audio, 'currentTime', { value: 3, writable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 2 times')).toBeInTheDocument();
    audio.currentTime = 0;
    fireEvent(audio, new Event('ended'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent(audio, new Event('ended'));
    expect(screen.getByText('Played 2 of 2 times')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('in lesson mode offers rewind and slow speed, with no limit', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="lesson" />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: '0.75×' }));
    expect(audio.playbackRate).toBe(0.75);
    audio.currentTime = 12;
    fireEvent.click(screen.getByRole('button', { name: 'Back 5 seconds' }));
    expect(audio.currentTime).toBe(7);
  });

  it('says when audio is unavailable', () => {
    renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available={false} mode="lesson" />);
    expect(screen.getByText('Audio unavailable right now')).toBeInTheDocument();
  });
});
```

Create `components/audio/TranscriptReveal.test.tsx`: it renders two lines, and asserts the speaker labels and that `mark` contains the evidence text.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/audio`
Expected: FAIL.

- [ ] **Step 3: Implement** the two components.
- Wire them into:
  - `TaskInputs`: `audio_questions` shows the player (exam mode with the part's `replays` in the runner, lesson mode in lessons), then the questions as for passages;
  - `ExerciseCard`: after grading an `audio_questions` exercise, show `TranscriptReveal` from the outcome's `reveal`;
  - `TeilReview`: the same, from the result's `reveal`.
- `LessonPage` shows `lesson.audioUnavailableNote` when `unavailableAudio > 0`.

Catalogs, an `audio` namespace (en / de):
- `play` "Play" / "Abspielen", `pause` "Pause" / "Pause"
- `back5` "Back 5 seconds" / "5 Sekunden zurück", `slow` "0.75×" / "0,75×"
- `played` "Played {n} of {max} times" / "{n} von {max} Mal abgespielt"
- `unavailable` "Audio unavailable right now" / "Audio gerade nicht verfügbar"
- `transcript` "Transcript" / "Transkript"

`lesson.audioUnavailableNote`: "Some listening exercises are unavailable right now." / "Einige Hörübungen sind gerade nicht verfügbar."

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A components messages
git commit -m "feat: add the audio player with exam replay limits and the transcript reveal"
```

---

### Task 7: Admin UI — notifications, SMTP and speech settings, regenerate and upload

**Files:**
- Create:
  - `app/admin/notifications/page.tsx`
  - `components/admin/NotificationsAdmin.tsx`, `components/admin/NotificationsAdmin.test.tsx`
  - `components/admin/SystemSettingsAdmin.tsx`, `components/admin/SystemSettingsAdmin.test.tsx`
  - `app/admin/settings/page.tsx`
  - routes:
    - `app/api/admin/notifications/route.ts` (GET list, POST mark-all-read), `app/api/admin/notifications/count/route.ts`
    - `app/api/admin/settings/smtp/route.ts` (GET display, PUT save), `app/api/admin/settings/smtp/test/route.ts` (POST)
    - `app/api/admin/settings/speech/route.ts` (GET URL and health, PUT URL)
    - `app/api/admin/audio/[hash]/route.ts` (POST regenerate; PUT upload, raw body, max 20 MB)
  - `app/api/admin/notifications/routes.test.ts`, `app/api/admin/settings/routes.test.ts`
- Modify:
  - `app/admin/layout.tsx` (Notifications with an unread bell, and Settings in the sub-nav)
  - `components/admin/LessonEditorForm.tsx` and `ExamPracticeAdmin.tsx` (Regenerate and Upload per audio exercise or set)

**Interfaces and tests (all admin routes 401 without a session):**
- **Notifications:** the list page with **Open problems** and **Unread** filters, **Mark all read**, and email errors shown per row. The bell in the sub-nav reads `/count` (`{ unread }`).
- **SMTP form:** host, port, TLS switch, user, password (write-only: a placeholder "••••••" when stored, and empty keeps it), from, to; **Save** and **Send test email**. The test result is shown inline (success, or the SMTP error text).
  - Test: PUT stores the password encrypted, so the raw DB value doesn't contain it, and GET never returns it.
  - Test: POST test with the mailer mocked through `vi.mock('@/lib/services/mailService')` returns `{ ok: true }`.
- **Speech settings:** the URL field, with **Check** showing the health result.
- **Regenerate and Upload** (on lessons and sets with `audio_questions`): Regenerate POSTs and shows "Queued". Upload takes a file input (audio/*); the PUT body is the file, and a 413 comes back over 20 MB.
  - Test: upload calls `audioService.upload` and returns `{ ok: true }`.

- [ ] **Step 1: Write the route and component tests above**, following the admin route test pattern (`vi.mock('@/lib/auth/adminSession')`) and the component patterns (`delayedResponse`, `role="alert"` for errors).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Store the SMTP settings as JSON in `app_settings.smtp`, with `passwordEncrypted = encrypt(password, loadOrCreateMasterKey())`.
- [ ] **Step 4: Run** `npx vitest run app/api/admin components/admin && npx tsc --noEmit && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: admin notifications, SMTP and speech settings, and audio regenerate and upload"` (after `git add -A app components lib`).

---

### Task 8: Backups version 2

**Files:** modify `lib/services/backupService.ts`, `lib/services/backupService.test.ts`, and the export and import routes if they pass paths.

**Interfaces:**
- `exportBackup(dbPath, keyFilePath, audioDir?)`: envelope version 2, with `audio: { [fileName]: base64 }` (only names matching `^[0-9a-f]{64}\.ogg$`). It builds the JSON as a stream of chunks through `zlib.createGzip()` into one Buffer, so the encoded audio isn't held twice (Review Focus 5).
- `importBackup(archive, dbPath, keyFilePath, audioDir?)`: accepts version 1 (no audio) and version 2. It writes the audio files (the names validated the same way) after the database and key.

- [ ] **Step 1: Write the failing tests** in `backupService.test.ts`:
  - a version-2 round trip restores two audio files byte for byte;
  - a version-1 archive (built the old way in the test) still imports;
  - a file name like `../evil.ogg` in the audio map is rejected with `InvalidBackupError('Backup archive has an invalid audio file name')`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Export writes `{"version":2,...,"audio":{` and then each entry chunk by chunk into the gzip stream, collecting the output with `zlib.gzipSync` per chunk or `createGzip` piped to an array of Buffers. The export and import routes pass `join(dataDir, 'audio')`.
- [ ] **Step 4: Run** `npx vitest run lib/services/backupService.test.ts app/api/backup && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat: include audio in backups (version 2)"`.

---

### Task 9: Content — format replays and the listening lesson conversion

**Files:** modify `data/exam-formats/*.json` (listening parts), `data/curriculum-seed/*.json` (listening lessons), `lib/services/bundledSeedStructure.test.ts`, and the seed versions.

- [ ] **Step 1: Add the validation tests**
  - `data/exam-formats/formats.test.ts`: every `audio_questions` part has `replays` of 1 or 2.
  - `bundledSeedStructure.test.ts`: every listening lesson has at least one `audio_questions` exercise, and no exercise question or prompt in a listening lesson contains `Hörtext`.

  Run them to see them fail.
- [ ] **Step 2: Content**
  - **Formats:** set `replays` for every listening part from its Modellsatz.
  - **Lessons:** convert every listening lesson as the spec's Content section describes:
    - each printed Hörtext becomes a speaker-tagged transcript with a fitting `@filter`;
    - exercises about the same Hörtext merge into one `audio_questions` exercise;
    - each question gets `evidence`;
    - the `instruction` is en and de where there was English framing;
    - other exercises stay.
  - Bump `seedVersion`.
- [ ] **Step 3: Run** `npx vitest run data lib/services/bundledSeed*.test.ts && npm test`. Then start the sidecar and the app, open a converted lesson, and play its audio.
- [ ] **Step 4: Commit per track:** `content: convert the <track> listening lessons to audio`.

---

### Task 10: Content — telc listening starter sets

**Files:** create `data/teil-sets/telc-<level>/hoeren-<n>.json` for every listening part of the five telc formats. Include the extra sets for `telc-b1/hoeren-1`, whose first set came in Task 5.

- [ ] **Step 1: Write the sets**
  - **3 sets per part**, in the exact format: the number of texts and items, Richtig/Falsch or multiple choice as the Modellsatz has it.
  - Speaker-tagged German transcripts at the level, with a fitting filter (news → radio, announcements → station, voicemail → phone).
  - `evidence` for every question, and explanations in en and de.
  - For parts with several short texts, put all of them in one transcript separated by an `[Ansage f]`-style marker line ("Text 2."), and order the questions to match.
- [ ] **Step 2:** Run `npx vitest run data/teil-sets` after each level.
- [ ] **Step 3:** Commit per level.

---

### Task 11: Content — Goethe and NaDoch listening starter sets

**Files:** create `data/teil-sets/goethe-<level>/hoeren-<n>.json` and `data/teil-sets/generic-<level>/hoeren-<n>.json`.

- [ ] **Step 1:** Follow Task 10's rules, for every Goethe listening part and every NaDoch listening part.
- [ ] **Step 2:** Run `npx vitest run data/teil-sets` after each level.
- [ ] **Step 3:** Commit per track and level. Then, with the sidecar running, run the app. The background worker renders the audio, and after a few minutes `SELECT status, COUNT(*) FROM audio_jobs GROUP BY status` shows no `failed` rows. Report the counts.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Sidecar: Task 2.
  - Provider, cache, queue, worker, route, upload and regenerate: Tasks 3 and 7.
  - Task type: Tasks 1 and 5.
  - Player and reveal: Task 6.
  - Availability: Task 5.
  - Notifications and email: Tasks 4 and 7.
  - Backups: Task 8.
  - Content: Tasks 9–11.
- **Upload conversion:** the upload feature uses the sidecar's `/convert`, so an upload needs the service to be up. The upload route returns 503 `audio_unavailable` when it isn't; say so in the admin UI.
