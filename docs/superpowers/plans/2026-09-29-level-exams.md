# Level Exams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Task 10 is a content task.

**Goal:**
- A formal, gated exam per track+level (all parts, real conditions), with separate written and oral sittings.
- Level clearing: lessons plus the exam.
- NaDoch! certificates and Open Badge 3.0 credentials, verifiable publicly under `/badges/*`.

**Architecture:**
- **Pure rules** in `lib/levelExam/`: the pass rule, selection, node state, focus points, and the credential payload.
- **Sittings:** `examSittingService` reuses the Teil engine's per-part grading (an `exam` attempt kind), and adds a block deadline, auto-submit, background grading retries and cooldowns.
- **Unlocking:** `unlockService` gains the exam condition.
- **Certificates:** `pdf-lib`, `qrcode` and `jose` (EdDSA JWT VC), with PNG iTXt baking.

**Tech Stack:** Next.js 16, better-sqlite3, pdf-lib, qrcode, jose, vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-29-level-exams-design.md`

**Precondition:** everything up to and including the other-levels curriculum expansion is merged.

## Global Constraints

- **Gating:**
  - the exam node opens when every milestone of the track+level is complete;
  - the NaDoch exam also opens for any level cleared in any track;
  - clearing needs `isLevelFinished && examPassed`, and a clear in any track unlocks the next level in all tracks;
  - existing unlocks never re-lock.
- **Blocks:**
  - written and oral are separate, and a passed block stays passed;
  - a retake is allowed 24 h after a failed block's `finished_at`;
  - the written deadline is the block minutes, with auto-submit and no overtime, and unanswered parts score 0;
  - the oral block has a prep phase (the format's prep minutes; telc B1: 20), with notes visible while speaking;
  - an abandoned oral sitting expires 2 h after its start.
- **Pass rule:** each block's `passRatio`, applied to that block's points.
- **Selection order:** reserved exams not yet sat for the block, then generated exams (approved or unreviewed) not yet sat, then generate one (German-only, `unreviewed`, with an admin `pool_items` notification). Reserved sets are never served in practice.
- **Readiness to start:** a written block needs its listening audio ready (cached, or the service up). An oral block needs the speech service up.
- **Certificates and badges** (NaDoch track only): issued once per level; the PDF says "NaDoch! mock exam — not an official telc or Goethe certificate"; OB 3.0 `OpenBadgeCredential` as a JWT VC signed with EdDSA; the issuer key is encrypted with the master key; old keys stay listed.
- **`/badges/*`:** read-only and session-free.
- **Existing rules:** `res.ok` and `role="alert"`; `delayedResponse`; student text in en and de; admin in English.

## Review Focus

1. **A deadline during letter grading:** the written deadline passes while the student is still typing the letter. Auto-submit sends the letter text as it is, and grades it (Task 3).
2. **Clearing order:** passing the exam first and finishing the lessons later still clears the level, because the check runs after lesson completions too (Task 4).
3. **Two tabs:** two starts of the same block return the running sitting, not a second one (Task 3).
4. **Name missing:** a NaDoch pass with an empty display name issues the certificate as "NaDoch! learner". Profile shows a "Set your name and regenerate" link (Task 7).
5. **A tampered credential:** a verify page given a JWT with a changed payload shows "Not valid", not a crash (Task 8).

## Task Order

1. Schema and pure rules
2. The exam content format, loader and validation (one reserved telc B1 exam)
3. Sitting service: start, parts, deadline, grading, results, cooldown, resume
4. Level clearing and the tree exam node
5. Exam UI: node page, written sitting, oral sitting with prep, results and focus points
6. Profile: exam history
7. Certificates (PDF)
8. Open Badges (keys, credential, `/badges/*`, the baked PNG)
9. Admin: exams, reviews, certificates, badge settings
10. Content: 30 reserved exams

---

### Task 1: Schema and pure rules

**Files:**
- Create:
  - `lib/levelExam/rules.ts`, `lib/levelExam/rules.test.ts`
  - `lib/db/levelExamSchema.test.ts`
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces:
  - `blockResult(parts: { score: number; maxScore: number }[], passRatio: number): { score; maxScore; percent; passed: boolean }`
  - `chooseExam(candidates: { id; kind: 'reserved' | 'generated'; reviewStatus }[], satIds: Set<string>): string | null` (reserved first, then generated non-rejected, excluding sat ones)
  - `ExamNodeState = { status: 'locked' } | { status: 'open'; blocks: BlockState[] } | { status: 'in_progress'; block: 'written' | 'oral'; sittingId: number } | { status: 'passed'; blocks: BlockState[] }`, with `BlockState = { block; passed: boolean; retryAt: string | null }`
  - `examNodeState(input: { milestonesComplete: boolean; nadochOpenedByOtherTrack: boolean; sittings: { block; status; finishedAt: string | null; id: number }[]; now: Date }): ExamNodeState`
  - `focusPoints(parts: { partId; title: LocalizedText; percent: number }[], mistakes: { categoryId; label; count }[]): { weakParts: …; mistakes: … }` (parts under 60%, top 5 mistakes)

- [ ] **Step 1: Write the failing tests**

Create `lib/levelExam/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blockResult, chooseExam, examNodeState, focusPoints } from './rules';

const now = new Date('2026-09-29T12:00:00Z');

describe('level exam rules', () => {
  it('passes a block at its ratio of that block’s points', () => {
    expect(blockResult([{ score: 60, maxScore: 75 }, { score: 20, maxScore: 45 }], 0.6)).toEqual({ score: 80, maxScore: 120, percent: 67, passed: true });
    expect(blockResult([{ score: 40, maxScore: 75 }, { score: 20, maxScore: 45 }], 0.6)).toMatchObject({ passed: false, percent: 50 });
  });

  it('chooses unsat reserved exams first, then unsat non-rejected generated ones', () => {
    const c = [
      { id: 'g1', kind: 'generated' as const, reviewStatus: 'unreviewed' as const },
      { id: 'x2', kind: 'reserved' as const, reviewStatus: 'approved' as const },
      { id: 'x1', kind: 'reserved' as const, reviewStatus: 'approved' as const },
      { id: 'g0', kind: 'generated' as const, reviewStatus: 'rejected' as const },
    ];
    expect(chooseExam(c, new Set())).toBe('x1');
    expect(chooseExam(c, new Set(['x1', 'x2']))).toBe('g1');
    expect(chooseExam(c, new Set(['x1', 'x2', 'g1']))).toBeNull();
  });

  it('derives the node state', () => {
    expect(examNodeState({ milestonesComplete: false, nadochOpenedByOtherTrack: false, sittings: [], now })).toEqual({ status: 'locked' });
    expect(examNodeState({ milestonesComplete: false, nadochOpenedByOtherTrack: true, sittings: [], now })).toMatchObject({ status: 'open' });
    expect(
      examNodeState({ milestonesComplete: true, nadochOpenedByOtherTrack: false, sittings: [{ id: 3, block: 'oral', status: 'in_progress', finishedAt: null }], now })
    ).toEqual({ status: 'in_progress', block: 'oral', sittingId: 3 });
    expect(
      examNodeState({
        milestonesComplete: true,
        nadochOpenedByOtherTrack: false,
        sittings: [
          { id: 1, block: 'written', status: 'passed', finishedAt: '2026-09-20T10:00:00Z' },
          { id: 2, block: 'oral', status: 'failed', finishedAt: '2026-09-29T10:00:00Z' },
        ],
        now,
      })
    ).toEqual({
      status: 'open',
      blocks: [
        { block: 'written', passed: true, retryAt: null },
        { block: 'oral', passed: false, retryAt: '2026-09-30T10:00:00.000Z' },
      ],
    });
  });

  it('lists weak parts under 60% and the top 5 mistakes', () => {
    const points = focusPoints(
      [
        { partId: 'lesen-1', title: { en: 'R1', de: 'L1' }, percent: 80 },
        { partId: 'hoeren-2', title: { en: 'L2', de: 'H2' }, percent: 40 },
      ],
      Array.from({ length: 7 }, (_, i) => ({ categoryId: `c${i}`, label: { en: `c${i}`, de: `c${i}` }, count: 7 - i }))
    );
    expect(points.weakParts.map((p) => p.partId)).toEqual(['hoeren-2']);
    expect(points.mistakes).toHaveLength(5);
  });
});
```

Create `lib/db/levelExamSchema.test.ts`: the new tables exist, `teil_sets.exam_id` exists, and `teil_attempts.kind` accepts `'exam'`.

- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
  - Schema: the spec's tables. Add `teil_sets.exam_id` with an `ALTER` guard. Rebuild `teil_attempts` to allow `kind` `'exam'`, using the same CHECK-rebuild helper, generalized to take the table name and the new CHECK list.
  - Also add `exam_sittings.grading_attempts INTEGER NOT NULL DEFAULT 0` (for the retries).
  - `rules.ts` implements the interfaces above. The retry time is `finishedAt + 24 h`. Percent is rounded.
- [ ] **Step 4: Run** `npx vitest run lib/levelExam lib/db`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: add level exam tables and rules"` (after `git add lib`).

---

### Task 2: The exam content format, loader and validation

**Files:**
- Create:
  - `lib/levelExam/examFiles.ts`
  - `data/exams/telc-b1/telc-b1__x1.json`
  - `data/exams/exams.test.ts`
  - `lib/services/examContentService.ts`, `lib/services/examContentService.test.ts`
- Modify: `lib/services/bundledSeeds.ts`

**Interfaces:**
- `ExamFile { examId: string; formatId: string; version: string; parts: Record<string, TeilSetContent | SpokenPartContent> }`: one entry per format part.
- `examFileProblems(file, format): string[]`: every part is present, and each validated with `teilSetProblems`, or the spoken validator for `spoken` parts.
- `createExamContentService(db)` →
  - `loadBundled()`: upserts `exams` (reserved, approved) and `teil_sets` with `status: 'reserved'`, `exam_id` and set ids `<examId>__<partId>`, once per file version;
  - `generateExam(formatId): Promise<string>`: one AI call per part through the existing `buildTeilSetPrompt` (and the spoken prompt builder for speaking parts), stored as `generated` / `unreviewed`, with a `pool_items` notification;
  - `list(formatId)`, `setReview(id, status)`, `exportExam(id)`, `uploadExam(file)` (full validation first).

- [ ] **Step 1: Write the failing tests**
  - `data/exams/exams.test.ts`: every exam file is valid against its format.
  - `examContentService.test.ts`:
    - loading makes the telc B1 `x1` exam reserved, with sets in `teil_sets` of status `reserved`;
    - Reading's `pickForPractice` never returns them;
    - `generateExam` with a mocked AI creates a generated exam with one set per part;
    - an upload missing a part is rejected, naming the part.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement,** and write one complete reserved telc B1 exam (`telc-b1__x1`) with every part. The texts, transcripts, letter tasks (A and B) and speaking sheets are new and distinct from the practice sets.
- [ ] **Step 4: Run** `npx vitest run data/exams lib/services`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat: add reserved exam files, loading, generation, and validation"`.

---

### Task 3: Sitting service

**Files:**
- Create:
  - `lib/services/examSittingService.ts`, `lib/services/examSittingService.test.ts`
  - `app/api/level-exam/[track]/[level]/route.ts` (GET the node state and blocks; POST start `{ block }`)
  - `app/api/level-exam/sittings/[id]/route.ts` (GET), `…/[id]/part/route.ts` (POST start a part or submit its answers), `…/[id]/notes/route.ts` (PUT), `…/[id]/begin/route.ts` (POST: end prep, oral)
  - `app/api/level-exam/routes.test.ts`
- Modify:
  - `lib/services/examPracticeService.ts`: extract the part scoring (`scorePart(attempt, answers)`, which grades objective parts, letters and spoken parts) into `lib/services/partScoring.ts`, reused by both services
  - `lib/background/worker.ts`: grading retries for `grading` sittings, and expiry of stale sittings

**Rules** (pinned by the tests below):
- **start(track, level, block):**
  - refused unless the node isn't locked, the block isn't passed, and there's no cooldown;
  - if a sitting of that block is `preparing` or `in_progress`, it's returned (Review Focus 3);
  - the readiness gate, with codes `audio_unavailable` and `speech_unavailable`;
  - `chooseExam`, or generate;
  - written: `in_progress` with `deadline_at = start + block minutes`;
  - oral: `preparing`, with a prep deadline (the format's `prepMinutes`: add `prepMinutes` to the oral block in the format data; telc B1 is 20).
- **Parts:** each part creates a `teil_attempts` row (`kind: 'exam'`, `set_id` from the exam) when opened. Answers submitted after the deadline are refused (`bad_request`) except through auto-submit.
- **Auto-submit** (`closeIfDue`, run on every sitting read and by the worker):
  - past the deadline, each open part is submitted with its last saved draft. The client saves drafts every 10 s via `PUT part { draft }`.
  - Unanswered parts score 0. The letter draft is graded (Review Focus 1).
  - Status goes to `grading`, then `passed` or `failed` through `blockResult`.
- **Grading retries:** the worker retries `grading` sittings up to 5 times, then raises `audio_failed`-style admin notifications (`exam_grading_failed`).
- **After a pass:** `checkLevelCleared(track, level)` (Task 4).
- **Expiry:** an oral sitting older than 2 h is closed like a deadline.

- [ ] **Step 1: Write the failing tests** (fake clock, mocked graders):
  - written: start → deadline set; answering parts; advance past the deadline → auto-submitted, and the unanswered part scores 0; the draft letter is graded; `blockResult` decides pass or fail;
  - a second start while one is running returns the same sitting;
  - an answer after the deadline is refused;
  - a failed block has a cooldown of 24 h, and starting earlier is refused with `bad_request` and `params.retryAt`;
  - oral: preparing → notes saved → begin → speaking parts → graded;
  - an oral block with the speech service down → `speech_unavailable`;
  - grading failure → stays `grading`, retried by the worker function, then passes.
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement.** **Step 4: Run** `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Commit:** `git commit -m "feat: add exam sittings with deadlines, auto-submit, grading, and cooldowns"`.

---

### Task 4: Level clearing and the tree exam node

**Files:**
- Modify:
  - `lib/services/unlockService.ts`
  - `lib/services/progressService.ts` (the tree gains `exam: ExamNodeState`)
  - `lib/services/examSittingService.ts` (calls the clearing check)
  - `lib/services/attemptService.ts` and `testOutService.ts` (their completion hook now calls `checkLevelCleared`)
  - `components/tutoring/CurriculumTree.tsx`
  - the tests

**Rules:**
- `checkLevelCleared(level)`: for each track, if `isLevelFinished(track, level) && examPassed(track, level)`, insert into `level_clearances` and raise the unlock (`raiseUnlockedLevel(next, { notify: true })`).
- It runs after lesson completions, test-out passes, and exam passes (Review Focus 2).
- The old "lessons alone unlock" behaviour is removed, but existing unlocks stay.
- The NaDoch node is open when `level_clearances` has that level in any track.

- [ ] **Step 1: Write the failing tests:**
  - lessons complete, no exam → no unlock;
  - exam passed first, lessons later → unlock at the last lesson;
  - a clear in telc unlocks the next level in all tracks;
  - a profile already at B2 stays at B2 with no exam passes;
  - the tree shows the exam node `locked`, then `open`;
  - the NaDoch node is open after a telc B1 clearance while NaDoch B1's milestones are locked;
  - `CurriculumTree` renders the exam node after the last milestone, with its state and a link to `/exam/<track>/<level>`.
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement.** Update the existing unlock tests that assumed lessons alone unlock: they now also pass the exam (insert a passed written and oral sitting through a fixture helper `passLevelExam(db, track, level)` added to `test/tutoringFixtures.ts`).
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Commit:** `git commit -m "feat: require the level exam to clear a level, and show the exam node in the tree"`.

---

### Task 5: Exam UI

**Files:**
- Create:
  - `app/exam/[track]/[level]/page.tsx`
  - `components/levelExam/ExamOverview.tsx`, `WrittenSitting.tsx`, `OralSitting.tsx`, `BlockResult.tsx`
  - `components/levelExam/levelExam.test.tsx`
- Modify: `messages/*`

**Behaviour:**
- **`ExamOverview`:**
  - the format name, the two blocks with their status (passed ✓, retry time, or Start), and the rules summary (times, pass marks, "no overtime", "the oral part starts with 20 minutes of preparation");
  - Start shows the start errors (audio or speech unavailable) in an `Alert`.
- **`WrittenSitting`:**
  - one block countdown in the header, which turns to `danger` in the last 5 minutes;
  - the parts as steps (Teil n of m), each with its runner (reusing `TaskInputs`, `AudioPlayer` in exam mode with replays, and `LetterTaskInput` timed);
  - drafts saved every 10 s; Next part and Previous part are allowed within the block;
  - "Hand in" asks for confirmation;
  - at zero, the notice "Time's up — your answers were handed in" and then "Results are being prepared", polling the sitting.
- **`OralSitting`:**
  - prep screen: all task sheets, a notes `Textarea` (saved), the prep countdown, and "Start the exam";
  - then the speaking parts with `SpokenPartRunner` and the notes panel (read-only).
- **`BlockResult`:**
  - points per part against the pass mark, and pass or fail;
  - the letter and spoken views;
  - on a failure, the focus points with links and the retry time;
  - on a pass in a non-NaDoch track, the invitation card: "Take the NaDoch! exam at this level for your certificate and badge", linking to `/exam/generic/<level>`.

- [ ] **Step 1: Write the failing tests** (fake timers and delayed responses):
  - the overview states;
  - the written sitting countdown, draft saving, the confirmation on hand-in, and the auto-submit notice at zero;
  - the oral prep → begin → notes visible;
  - the result focus points and invitation card.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Catalog keys go in a `levelExam` namespace, in en and de.
- [ ] **Step 4: Run** `npx vitest run components/levelExam messages/catalogs.test.ts && npm test`.
- [ ] **Step 5: Commit:** `git commit -m "feat: add the level exam pages: overview, written and oral sittings, and results"`.

---

### Task 6: Profile — exam history

**Files:** create `app/api/level-exam/history/route.ts`; modify `components/profile/ProfilePage.tsx`, and its tests and `messages/*`.

- [ ] **Step 1: Write the failing tests:** the history lists sittings (date, track, level, block, score, pass or fail, and a link to the result) and certificates (Download PDF, and the badge link to `/badges/verify/<id>`).
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement.** **Step 4: Run** the tests. **Step 5: Commit:** `git commit -m "feat: show exam history and certificates in Profile"`.

---

### Task 7: Certificates (PDF)

**Files:**
- Create: `lib/certificates/certificatePdf.ts`, `lib/services/certificateService.ts`, `lib/services/certificateService.test.ts`, `app/api/certificates/[id]/pdf/route.ts`
- Modify: `scripts/build-icons.ts` (also write `public/brand/logo-certificate.png`, 1200 px wide, from `docs/design/nadoch-logo.svg` with its text outlined through opentype.js, as the icon does), and `package.json` (`pdf-lib`, `qrcode`, `@types/qrcode`)

**Interfaces:**
- `issueIfEligible(track, level): Certificate | null`: only the `generic` track, only when both blocks are passed, and only once per level. The holder is the display name, or "NaDoch! learner" when empty (Review Focus 4). It stores the certificate and its credential (Task 8 supplies `signCredential`; until then it's a stub that throws, so wire Task 8's function in when it exists, keeping this task's tests on an injected signer).
- `renderCertificatePdf(cert, { logoPng, verifyUrl }): Promise<Buffer>`: A4 landscape, with the texts from the spec and a QR code for `verifyUrl`.
- `regenerate(id)`: re-renders with the current display name (the verification id stays).

- [ ] **Step 1: Write the failing tests:**
  - an issue for a telc pass → null; a NaDoch pass → a certificate once (a second call returns the existing one);
  - an empty name → "NaDoch! learner";
  - the PDF starts with `%PDF`, and its extracted text includes the level, the name, "not an official telc or Goethe certificate", and the verify URL. Parse it with `pdf-lib`: load it, and check the page count 1. For the text, check the content stream contains the strings, uncompressed via `useObjectStreams: false` in tests.
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement,** and call `issueIfEligible` after a NaDoch level exam pass. **Step 4: Run** the tests.
- [ ] **Step 5: Commit:** `git commit -m "feat: issue NaDoch! certificate PDFs for passed NaDoch exams"`.

---

### Task 8: Open Badges

**Files:**
- Create:
  - `lib/badges/keys.ts`, `lib/badges/credential.ts`, `lib/badges/bakePng.ts`, `lib/badges/badges.test.ts`
  - routes under `app/badges/`: `issuer/route.ts`, `achievements/[level]/route.ts`, `credentials/[id]/route.ts` (the JWT, or `.png` when the id ends in `.png`), and `verify/[id]/page.tsx`
  - `app/badges/routes.test.ts`
- Modify: `package.json` (`jose`), `lib/services/certificateService.ts` (sign on issue)

**Interfaces:**
- `getIssuerKeys(db)`: generates an Ed25519 key pair on first use (`jose.generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })`). The private JWK is stored encrypted in `app_settings.badge_keys` as `{ current: { kid, privateEnc, publicJwk }, previous: [{ kid, publicJwk }] }`. `rotateIssuerKey(db)` moves `current` into `previous`.
- `buildCredential({ id, level, holderName, issuedAt, baseUrl, writtenPercent, oralPercent })`: an OB 3.0 `OpenBadgeCredential`, with:
  - `@context` of `https://www.w3.org/ns/credentials/v2` and `https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json`;
  - `type` of `['VerifiableCredential', 'OpenBadgeCredential']`;
  - `issuer: { id: <baseUrl>/badges/issuer, type: ['Profile'], name: 'NaDoch!' }`;
  - `validFrom`;
  - `credentialSubject: { type: ['AchievementSubject'], name: holderName, achievement: { id: <baseUrl>/badges/achievements/<level>, type: ['Achievement'], name, description, criteria: { narrative } } }`.
- `signCredential(db, credential): Promise<string>`: a compact JWS with `alg: 'EdDSA'`, `typ: 'vc+jwt'` and `kid`.
- `verifyCredentialJwt(db, jwt): Promise<{ valid: true; credential } | { valid: false }>`: it tries the current and previous keys (Review Focus 5).
- `bakePng(png: Buffer, jwt: string): Buffer` inserts an `iTXt` chunk with keyword `openbadgecredential` before `IEND`, with a correct CRC. `readBakedPng(png)` extracts it.
- Routes use `app_settings.public_base_url` (default `http://localhost:3000`).

- [ ] **Step 1: Write the failing tests:**
  - sign → verify round trip;
  - a tampered payload → `{ valid: false }`;
  - after rotation, an old credential still verifies;
  - bake → read round trip, and the PNG still has a valid signature (`\x89PNG`) and ends with `IEND`;
  - routes: issuer JSON has the public keys; the achievement JSON; the credential JWT (`application/vc+jwt`) and PNG; the verify page shows "Valid" with the holder and level, and "Not valid" for a tampered token passed via `?jwt=`, or for an unknown id;
  - no session needed.
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement.** **Step 4: Run** `npx tsc --noEmit && npm test && npm run build`.
- [ ] **Step 5: Commit:** `git commit -m "feat: issue signed Open Badge 3.0 credentials with public verification under /badges"`.

---

### Task 9: Admin — exams, reviews, certificates, badge settings

**Files:**
- Create: `app/admin/exams/page.tsx`, `components/admin/ExamsAdmin.tsx`, `components/admin/ExamsAdmin.test.tsx`, routes under `app/api/admin/exams/*` (list, review, upload, export, certificates), and `app/api/admin/badges/route.ts` (GET settings and key fingerprint; PUT the public base URL; POST rotate)
- Modify: the admin sub-nav

- [ ] **Step 1: Write the failing tests** (the admin session mock):
  - the list per track+level shows the reserved (2) and generated exams;
  - approving and rejecting a generated exam;
  - an upload with a missing part → 400 naming it;
  - export JSON and YAML;
  - the badge settings save the URL; rotate asks for confirmation and changes the fingerprint;
  - the Funnel command is shown with the saved port.
- [ ] **Step 2: Run them to see them fail.** **Step 3: Implement.** **Step 4: Run** the tests. **Step 5: Commit:** `git commit -m "feat: admin for level exams, generated exam review, certificates, and badge settings"`.

---

### Task 10: Content — 30 reserved exams

- [ ] **Step 1:** Add to `data/exams/exams.test.ts`: every one of the 15 formats has exactly 2 exam files (`<format>__x1`, `__x2`), and no set text (passages, transcripts, letter situations, speaking situations) is identical to a practice starter set of the same part. Run it. Expect failures.
- [ ] **Step 2:** Write the remaining 29 exams, track by track: telc, then Goethe, then NaDoch.
  - Every part is in the exact format, German at the level, and new material.
  - Each has explanations (en and de) per item, speaker-tagged transcripts with evidence, letter tasks with A and B where the format has a choice, and speaking sheets with partner profiles and examiner intros.
- [ ] **Step 3:** Run `npx vitest run data/exams` after each track.
- [ ] **Step 4:** Commit per track: `content: reserved <track> level exams`. Then, with the sidecar running, confirm the worker renders all exam audio (`SELECT status, COUNT(*) FROM audio_jobs GROUP BY status`), and report the counts.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Data and rules: Task 1.
  - Content format and generation: Tasks 2 and 10.
  - Sittings, conditions, readiness and grading: Task 3.
  - Clearing, unlocking and the node: Task 4.
  - UI: Task 5.
  - History: Task 6.
  - Certificate: Task 7.
  - Badges and Funnel: Tasks 8 and 9.
  - Admin: Task 9.
- **Format data:** the oral block gains a `prepMinutes` field (Task 3), added to each format with the value from its Modellsatz, and 0 for formats without prep.
