# Level Exams — Design Spec

## Overview

Every track+level gets a **formal exam** at the end of its lesson tree (📝). It covers every part of that track's real format: reading and Sprachbausteine, listening, writing and speaking. It uses the same runners the skill modules built, under real exam conditions.

**Clearing a level now needs all its lessons *and* a passed exam.** A level cleared in any track opens the next level in **all** tracks. The exam is gated like milestones: it opens when every milestone of the level is complete.

Passing a **NaDoch!**-track exam also gives a **certificate PDF** and a self-issued **Open Badge 3.0**, whose public verification is served from the home server through Tailscale Funnel (`/badges/*` only).

### In scope

- **The Exam node** in the tree (states: locked / open / in progress / cooldown / passed per block) and the exam pages.
- **Content:** 2 **reserved** exams per track+level (30 in total), never served in practice. After a student has used both, **AI-generated exams** are built from the pool, one set per part, marked `unreviewed` for the admin, and usable at once (the pool pattern).
- **Sittings:** the written and oral blocks are separate. A passed block stays passed. A failed block can be retaken after **24 hours**.
- **Conditions:**
  - **Timer:** auto-submit at zero, with no overtime.
  - **Oral block:** the **20-minute preparation phase** with the task sheets and a notes pad, whose notes stay visible during speaking.
  - **Readiness gate:** the listening parts need their audio (cached or the service up), and the oral block needs the speech service. Otherwise the block can't start, with a clear reason.
- **Pass rule:** per the format's blocks (telc: written ≥ 60% and oral ≥ 60%; Goethe per its modules; NaDoch 60% per block).
- **Results:** points per Teil against each block's pass mark, focus points on a failure (weak Teile plus the top error-log categories since the attempt started), and a **history in Profile**.
- **Level clearing:**
  - the unlock service now requires `lessonsDone && examPassed`;
  - placement unlocks are unchanged;
  - **levels already unlocked stay unlocked**, and their exam node shows "not yet passed".
- **NaDoch! cross-track rule:** a level cleared in any track makes that level's NaDoch exam open directly, while its milestones stay gated. After passing another track's exam, the student is invited to take the NaDoch exam at the same level, for the certificate and badge.
- **Certificate PDF** (NaDoch track only): the logo, the name (profile display name), the level, the date, the block scores, and a verification ID and URL.
- **Open Badge 3.0** (NaDoch track only):
  - an `OpenBadgeCredential`, signed as a JWT VC (EdDSA, Ed25519 issuer key);
  - the issuer profile, the achievement definitions, a credential endpoint and a human verification page under `/badges/*`;
  - a baked PNG badge to download;
  - a "public base URL" admin setting (the Funnel URL).
- **Admin:**
  - reserved exams per track+level (view, replace by upload, JSON/YAML), and generated exams to review;
  - the issuer key (generated on first use; rotation by an explicit action);
  - the public base URL and Funnel instructions.

### Out of scope

- A teacher or proctor role, or anti-cheating measures (single user, self-study).
- Real certificates. The PDF and badge state clearly that they're **NaDoch! mock exam** results, not telc or Goethe certificates.

## Data

```sql
ALTER TABLE teil_sets ADD COLUMN exam_id TEXT;          -- groups the sets of one complete exam (reserved or generated)
CREATE TABLE exams (
  id TEXT PRIMARY KEY,                                  -- "telc-b1__x1", generated: "telc-b1__g<random>"
  format_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reserved','generated')),
  review_status TEXT NOT NULL CHECK (review_status IN ('approved','unreviewed','rejected')),
  created_at TEXT NOT NULL
);
CREATE TABLE exam_sittings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  format_id TEXT NOT NULL, block TEXT NOT NULL CHECK (block IN ('written','oral')),
  status TEXT NOT NULL CHECK (status IN ('preparing','in_progress','grading','passed','failed')),
  started_at TEXT NOT NULL, deadline_at TEXT, finished_at TEXT,
  notes TEXT,                                            -- oral prep notes
  score REAL, max_score REAL, parts TEXT                 -- JSON: per part { partId, score, maxScore, attemptId }
);
CREATE TABLE level_clearances (track TEXT NOT NULL, level TEXT NOT NULL, cleared_at TEXT NOT NULL, PRIMARY KEY (track, level));
CREATE TABLE certificates (
  id TEXT PRIMARY KEY,                                   -- UUID, the verification id
  level TEXT NOT NULL, holder_name TEXT NOT NULL, issued_at TEXT NOT NULL,
  written_percent REAL NOT NULL, oral_percent REAL NOT NULL,
  credential_jwt TEXT NOT NULL
);
```

- **Parts:** each part inside a sitting reuses a `teil_attempts` row with `kind` extended to `'exam'`.
- **A block is passed** when any of its sittings is `passed`.
- **The level exam is passed** when both blocks are passed for that track+level. The blocks may come from different sittings, in any order.

## Exam Selection

On sitting start:
- the first **reserved** exam of the format that the student hasn't sat for that block;
- otherwise an approved or unreviewed **generated** exam they haven't sat;
- otherwise one is generated now, one AI call per part (German-only, the part's format), stored `unreviewed` and flagged to the admin.

Reserved exams are never served by Freestyle or practice. Their sets have `status: 'reserved'`, which practice selection already excludes.

## Sitting Flow

- **Written block:**
  1. Start fixes `deadline_at = start + block minutes`.
  2. The parts run in order, each with its runner (reading, cloze, audio with its replays, letter).
  3. There's one countdown for the block. At the deadline, whatever is answered is **auto-submitted**, and the remaining parts score 0.
  4. The letter is graded after submission (status `grading`), then the block result.
- **Oral block:**
  1. **Preparation:** 20 minutes (the format's value), with all speaking parts' task sheets and a notes pad (plain text, saved on the sitting).
  2. "Start the exam" is allowed early.
  3. The speaking parts run in order, with the notes visible in a side panel.
  4. The part minutes form a soft limit, then close automatically.
  5. Grading → the block result.
- **Leaving a sitting** mid-way: it stays `in_progress` until its deadline (written) or 2 hours (oral), and can be resumed. After that, it's finished and graded with what was answered.
- **Cooldown:** a failed block can be retaken 24 hours after `finished_at`.

## Level Clearing and Unlocking

- `isLevelCleared(track, level) = isLevelFinished(track, level) && examPassed(track, level)`. `level_clearances` records it.
- `checkLevelFinishedAfterCompletion` runs after lesson completions **and after exam passes**. If any track clears the level, the next level unlocks in all tracks (the existing notice flow).
- **Existing profiles:** nothing is re-locked. The exam node of an already-unlocked level shows its real state ("not yet passed").

**Exam node state** (the tree gets a `exam` field after the last milestone):

| State | When |
|---|---|
| `locked` | milestones incomplete, and (NaDoch) the level isn't cleared in another track |
| `open` | the node can be started |
| `in_progress` | a sitting is running |
| `cooldown` (with retry time) | a block recently failed |
| `passed` | per block |

## Results, History, Focus Points

- **Block result:**
  - points per part and total against the pass mark, with pass or fail;
  - the letter and spoken feedback views from their modules;
  - on a failure: **focus points** (parts under 60%, and the top 5 error-log categories since the sitting started, linked like the Dashboard card) and the retake time.
- **Profile → "Exams":** every sitting (date, track, level, block, score, pass or fail), with links to the results, and the certificates with Download PDF and the badge link.
- **After passing another track's exam:** the result page invites the student to take the NaDoch exam at the same level.

## Certificate and Open Badge (NaDoch track only)

- **Issued** when both blocks of a NaDoch-track level are passed, once per level. A later pass doesn't reissue.
- **PDF** (`pdf-lib`):
  - A4 landscape;
  - the NaDoch! logo (a PNG rendered by the icon build script);
  - "NaDoch! Sprachnachweis {level}", the holder name, the date, and the written and oral percentages;
  - "NaDoch! mock exam — not an official telc or Goethe certificate";
  - the verification ID and URL (`<publicBaseUrl>/badges/verify/<id>`), plus a QR code (`qrcode` library, rendered to PNG).
- **Open Badge 3.0:**
  - **Issuer profile:** `/badges/issuer`, a JSON `Profile` with `id`, `name: "NaDoch!"`, `url`, and `verificationMethod`: the Ed25519 public JWK.
  - **Achievement:** `/badges/achievements/<level>`, for "German <level> (NaDoch! track)", with criteria text.
  - **Credential:** `/badges/credentials/<id>` returns the signed JWT (`application/vc+jwt`). `/badges/verify/<id>` is a human page that verifies the signature and shows the holder, level and date, and the "mock exam" notice.
  - **Baked PNG:** `/badges/credentials/<id>.png`, with the credential embedded in an `iTXt` chunk, keyword `openbadgecredential`.
  - **Keys:** Ed25519, generated on first issue. The private JWK is stored encrypted with the master key in `app_settings`. Rotation re-signs nothing; old credentials keep verifying against the key history, and the issuer profile lists the current and previous public keys.
- **`public_base_url`** is an admin setting. Without it, certificates show the local URL and a warning in admin.

**Funnel:** the admin page shows the command for exposing only the badge paths:

```
tailscale funnel --bg --set-path /badges http://127.0.0.1:3000/badges
```

`/badges/*` routes are read-only and need no session.

## Admin

- **`/admin/exams`:**
  - per track+level, the reserved exams (2) with their parts and sets: view, download (JSON/YAML, one file per exam with every part's set), and replace by upload (validated per part, as with Teil sets);
  - generated exams to review (approve or reject);
  - the certificate list;
  - badge settings: the public base URL, the issuer key (fingerprint, **Rotate key** with confirmation), and the Funnel instructions.

## Content

- **30 reserved exams:** 2 per track+level. Each is a complete exam with one set per part in the exact format:
  - the texts, audio transcripts, letter tasks and speaking sheets are all new, German at the level, and distinct from the practice starter sets;
  - explanations in en and de per item.
- Claude drafts them track by track, and the user spot-checks them.

## Error Handling

- **Can't start:** a sitting whose audio isn't ready, or whose oral block lacks the speech service, can't start. The reason is shown with the admin contact hint.
- **Grading failure** at the end of a block: the sitting stays `grading` and retries in the background (5 attempts, then an admin notification). The student sees "Your results are being prepared".
- **Signing or PDF failure:** the exam pass is still recorded, and the certificate can be regenerated from Profile.

## Testing

- **Pure:**
  - the pass rule per format and block;
  - exam selection order (reserved, then generated, then generate);
  - the exam node state machine (all states, NaDoch cross-track);
  - focus points;
  - the credential payload (OB 3.0 fields);
  - JWT sign and verify round trip;
  - `iTXt` baking and reading;
  - the certificate text fields.
- **Services:**
  - written sitting: timer and auto-submit at the deadline, parts scored 0 when unanswered, the letter graded after submission;
  - oral sitting: prep notes saved and shown, the speaking parts, grading;
  - block pass, then level cleared, then the next level unlocked in all tracks (lessons done), and not unlocked when the exam isn't passed;
  - existing unlocks untouched;
  - cooldown;
  - resume and expiry;
  - certificate issue (NaDoch only, once);
  - key rotation keeps old credentials verifiable.
- **Routes:** exam routes; `/badges/*` without a session (issuer, achievement, credential, verify page, PNG).
- **Client:** the exam node states in the tree; the sitting screens (block timer, auto-submit notice, prep phase with notes, resume); the result pages; Profile history; the certificate download; the admin exams page.
- **Content:** every format has 2 reserved exams with a valid set per part (validated like Teil sets, with `status: 'reserved'` and `exam_id`).

## Decisions (2026-09-29)

- **Gating:** the exam node sits at the end of each level's tree and is gated like milestones. Clearing a level needs lessons **and** an exam pass. A level cleared in any track opens the next level in all tracks.
- **Pass rule:** the real telc rule (written ≥ 60% and oral ≥ 60%, each separately); other formats per their own rules; NaDoch 60% per block.
- **Sittings:** written and oral are separate, a passed block stays passed, and retakes come after 24 hours. Focus points are recommended, not required.
- **Timing:** auto-submit with no overtime. The oral part keeps its 20-minute prep with notes.
- **Content:** 2 reserved exams per track+level (30), never shown in practice, then AI-generated exams reviewed by the admin. They're usable immediately, following the pool pattern (a ruling: the decision said "reviewed by the admin" without requiring approval first).
- **Existing progress:** levels already unlocked stay unlocked, with the exam node showing "not yet passed".
- **NaDoch passes:** a certificate PDF with a verification ID, and a self-issued Open Badge 3.0, verified publicly through Tailscale Funnel on `/badges/*` only. After another track's pass, the student is invited to take the NaDoch exam at that level, which is open directly for any level cleared in any track.
