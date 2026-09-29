# Speaking Module — Design Spec

## Overview

Speaking adds speech-to-text (**faster-whisper**) to the sidecar and builds spoken practice on it, in five places:
1. a **spoken-response** lesson exercise type;
2. the **speaking parts** of all 15 exam formats, where the AI plays the partner and the examiner;
3. Freestyle's **spoken conversation** mode;
4. **spoken items in the placement test**;
5. an **estimated pronunciation** read-out.

Grading uses each format's oral criteria with **anchor transcripts**. Nothing spoken is kept: recordings and transcripts live only until the lesson run, session or attempt ends. Scores and error-log entries are kept.

### In scope

- **Sidecar:** faster-whisper, `POST /transcribe` returning text and per-word confidence. The model defaults to `small` (CPU, int8) and is selectable in admin settings (`small` or `medium`).
- **`SpeechProvider.transcribe`**, and browser recording with MediaRecorder, **tap to talk, tap to finish**.
- **Temporary speech storage:** recordings and transcripts scoped to a lesson run, Freestyle session, Teil attempt or placement session. They're deleted when the scope ends, and the background worker also removes anything older than 6 hours.
- **Pronunciation estimate:** words below a confidence threshold are flagged "possibly unclear", and the AI comments on patterns. It's always labelled as an estimate.
- **`spoken_response` lesson type:** it's added alongside the existing exercises of the speaking lessons. It isn't in the Daily Queue and isn't test-out eligible.
- **Teil runtime for `spoken` parts:**
  - the task sheet (no prep time in practice);
  - a turn loop, with the AI's lines spoken by Piper voices;
  - grading with the format part's rubric plus anchor transcripts;
  - the result shows criterion cards, the student's turns marked up, and the pronunciation estimate.
  - Mocks gain the oral block, and readiness includes the speaking parts.
- **Freestyle spoken conversation:** voice in and voice out, with inline corrections under the transcript of each turn.
- **Placement:** one spoken item per level, graded like free text on the transcript. It's skipped automatically when the speech service is down.
- **Error log:** spoken corrections feed it with source `speaking`.
- **Content:**
  - oral rubrics for all 15 formats' speaking parts;
  - 3 anchor transcripts per speaking part (A, C and D bands);
  - 3 starter sets per speaking part;
  - one spoken-response exercise per speaking lesson;
  - 5 spoken placement items.

### Out of scope

- The 20-minute prep phase (the formal exam has it; see the Level exams spec).
- Real phoneme-level pronunciation scoring (by decision, an estimate only).
- Storing any recording or transcript beyond its scope.

## Sidecar: Transcription

```
POST /transcribe?model=small|medium   (body: audio bytes, any format ffmpeg reads)
→ { text, language, duration, words: [{ word, start, end, probability }] }
```

- faster-whisper runs with `language="de"`, `word_timestamps=True`, `compute_type="int8"` and `device="cpu"`.
- Loaded models are cached per name. The Docker image pre-downloads `small`; `medium` downloads on first use (with a note in the README).
- The admin setting `whisper_model` (`small` by default) is passed with each request.
- There's an audio length limit of 5 minutes, which returns 400.

## Recording (browser)

`useRecorder()` wraps `getUserMedia` and `MediaRecorder` (`audio/webm;codecs=opus`, or the browser's default).
- **Button:** a large round mic in the thumb zone. The first tap starts recording (a pulsing ring and an elapsed timer); a second tap stops it, uploads it, and shows "Transcribing…".
- **Microphone permission denied or missing:** a clear message explaining that the microphone is needed and that the browser only allows it on HTTPS or localhost, with the text answer offered instead where the context allows it (lesson spoken responses may fall back to typing, which is graded without a pronunciation estimate).
- **Upload:** `POST /api/speech/transcribe` with `{ scope }` in the query and the audio as the body. The server forwards it to the sidecar, stores the recording and transcript under the scope (temporary), and returns `{ clipId, text, words, duration }`.

## Temporary Speech Storage

```sql
CREATE TABLE speech_clips (
  id TEXT PRIMARY KEY,                 -- random
  scope TEXT NOT NULL,                 -- 'lesson:<lessonId>' | 'freestyle:spoken' | 'teil:<attemptId>' | 'placement'
  role TEXT NOT NULL CHECK (role IN ('student','partner')),
  file TEXT,                           -- <data dir>/speech-tmp/<id>.webm|.ogg
  transcript TEXT,
  words TEXT,                          -- JSON, student clips only
  created_at TEXT NOT NULL
);
```

- `DELETE /api/speech/scope?scope=…` deletes a scope's rows and files. The client calls it when a lesson run ends, a Freestyle spoken session ends, a Teil result is closed, or the placement finishes.
- The worker deletes clips older than 6 hours on every tick of its 60 s health loop.
- Nothing from `speech_clips` goes into backups: temporary data is excluded.

## Pronunciation Estimate

```ts
function pronunciationEstimate(words: { word: string; probability: number }[]):
  { score: number /* 0–100, mean probability */; unclear: string[] /* probability < 0.6, deduplicated */ }
```

- **Grading prompts** include the unclear words, and the AI returns `pronunciation: { comment_en, comment_de }`: patterns such as final -e, ü/u, ö/o, ch, r, or word stress, phrased as a tentative hint.
- **The UI** shows "Pronunciation (estimate)", the score as a qualitative band ("clear" ≥ 85, "mostly clear" ≥ 70, else "sometimes unclear"), the unclear words, and the comment. A note says it's an estimate from speech recognition.
- **Scoring:** where a format has a pronunciation criterion (e.g. telc Aussprache/Intonation), its grade comes from the AI, informed by the estimate. The code doesn't compute it.

## `spoken_response` Lesson Type

```ts
interface SpokenResponseContent { instruction?: LocalizedText; prompt: string /* German situation/question */; modelAnswer: string; minSeconds?: number }
// Answer: { type: 'spoken_response'; clipId: string } | { type: 'spoken_response'; typed: string }
```

1. **Record:** the student records and sees the transcript. They can **record again** before submitting.
2. **Submit:** grades the transcript like free text (AI), plus the pronunciation estimate and mistakes.
3. **Result:** the free-text result, the "Pronunciation (estimate)" box, and the transcript with marks.
4. **Typed fallback** (no microphone): graded as free text, without an estimate.

It isn't in the Daily Queue or test-outs. The lesson run's scope clips are deleted when the run ends.

## Teil Runtime for `spoken` Parts

**Sets:**

```ts
interface SpokenPartContent {
  situation: string;                 // German task sheet text
  materials: { title: string; points: string[] }[];   // e.g. planning notes, topic text summary
  examinerIntro: string;             // German, spoken first
  partner: { name: string; gender: 'm' | 'f'; profile: string };   // who the AI partner is
  turns: number;                     // student turns before the examiner closes (4–10 by part)
}
```

**The turn loop:**
1. The examiner's intro is rendered and played with the voice `kerstin`. The partner uses a voice by gender, never the examiner's.
2. The student taps to talk. Their turn is transcribed and shown.
3. One AI call returns `{ "speaker": "partner" | "examiner", "text": "..." }`. The partner speaks and reacts at the level and follows the part's task; the examiner steps in only to open, redirect, or close.
4. The reply is rendered with the right voice (temporary, `role: 'partner'`) and played.
5. This repeats until `turns` is reached; then the examiner closes. The student can also press **Finish**.

**Timing:** the part's `minutes` show as a soft timer, with overtime marked, as in other Teile.

**Grading:**
- One AI call with the format part's `rubric` (the oral criteria), 2–3 anchor transcripts, the whole conversation (the student's turns marked), and the pronunciation estimate.
- It returns criterion grades with justifications, `marks` on the student's turns (as in writing, located per turn), the pronunciation comment, and a summary.
- The score is the rubric points. Marks go to the error log with source `speaking`.

**Result:** the criterion cards, the turn-by-turn transcript with marks, the pronunciation estimate, and the total.

**Afterwards:** the scope `teil:<attemptId>` is deleted when the result screen is left (the scores stay).

**Mocks and readiness:** the full mock gains the **oral block** (its speaking parts, in order) as a separate block result. Readiness includes the speaking parts.

**Data:** formats' `spoken` parts gain `rubric` (like writing: criteria and grade points). The anchors are in `data/speaking-anchors/<format>/<part>.json` (3 per part: A, C and D bands). Each anchor has the student turns, the grades and a German justification.

## Freestyle Spoken Conversation

- The `spoken` mode is enabled. Setup is like conversation: level and scenario.
- **Each turn:** the student speaks, the transcript is shown, and the conversation turn runs with the existing prompt (corrections plus reply). The reply is spoken aloud (partner voice) and shown as text.
- **Corrections** appear inline under the transcript of the turn and feed the error log (`freestyle_chat`).
- **End** works like other sessions (summary, then delete), and also deletes the `freestyle:spoken` clips.

## Placement

- **Question type:** placement questions gain `spoken` (`{ prompt, modelAnswer }`, with the bilingual `instruction` allowed). It's graded like free text on the transcript, and scored the same way.
- **When the service is down at session start:** the session skips spoken items (they're left out of the served order and don't count toward the maximum). The thresholds are computed from the exam as served.
- **Answers:** a spoken item can be answered by recording only; there's no typed fallback, because placement needs speech to be meaningful. A skipped item counts as unanswered, not wrong.
- **Default exam:** it gains 5 spoken items, one per level, placed at the end of each level's block.

## Error Handling

- **Transcription failure** (service down, a timeout, audio too long): the student sees the error with **Try again**. The recording is kept for retry until the scope ends.
- **Grading failure:** keeps the transcript and offers a retry. A Teil attempt stays open.
- **TTS failure mid-conversation:** the partner's reply is shown as text, with "Audio unavailable".

## Testing

- **Sidecar** (pytest in the Docker build): transcribing a rendered German sentence returns text containing its key words and per-word probabilities; over 5 minutes → 400.
- **Pure:**
  - `pronunciationEstimate` (score, threshold, dedupe);
  - the spoken grading prompt contents (rubric, anchors, unclear words, estimate note);
  - the reply parser (per-turn marks, criteria, pronunciation comment);
  - the turn-loop state machine (whose turn, when the examiner closes, Finish);
  - placement serving without spoken items (thresholds recomputed).
- **Services:**
  - the transcribe route (scope storage, forwarding, 5 min limit);
  - scope deletion and 6-hour cleanup;
  - `spoken_response` grading (clip or typed);
  - Teil spoken attempts (loop calls, grading, error log, scope cleanup on close);
  - Freestyle spoken turns (TTS render, corrections logged);
  - placement with the service up or down.
- **Client** (MediaRecorder and getUserMedia mocked):
  - `useRecorder` (start, stop, upload, permission denied message);
  - the spoken lesson card (record again, submit, result with estimate, typed fallback);
  - the Teil conversation screen (turns, audio playback, Finish, result);
  - Freestyle spoken;
  - placement spoken items.
- **Content:** oral rubrics for every `spoken` part; anchors (3 per part); sets validated; each speaking lesson has a `spoken_response`; the default placement exam has 5 spoken items.

## Decisions (2026-09-29)

- **Speech-to-text:** faster-whisper in the sidecar, small model by default, selectable.
- **Turns:** tap to talk, tap to finish. The transcript is shown, then the AI replies aloud with its text visible.
- **Pronunciation:** estimated from whisper confidence, and labelled as an estimate.
- **Retention:** recordings and transcripts are kept only until the lesson, session or attempt ends. Scores are kept. The error log keeps a category and a short snippet.
- **Prep phase:** skipped in practice; the formal exam keeps it.
- **Grading:** AI with anchor transcripts per Teil, using the telc (and each format's) oral criteria plus the estimate.
- **Placement:** a few spoken items, skipped when the speech service is down.
- **Freestyle:** the spoken conversation mode arrives here.
- **Hosting:** the microphone needs HTTPS or localhost. The home server uses Tailscale HTTPS (Accounts spec).
