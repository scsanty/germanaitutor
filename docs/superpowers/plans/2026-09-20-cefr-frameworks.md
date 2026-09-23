# CEFR Frameworks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-09-22 amendment — read this before trusting Tasks 10–15 below.** Tasks 1–9 and 16 were executed as written and remain accurate (Task 1's schema has since gained `lessons.track`/`lessons.concept_id` — see the spec's "Data Model" update — but the task's TDD structure and everything else about it stands). **Tasks 10–15 (the AI-generation pipeline: `lib/curriculum-gen/*`, `scripts/generate-curriculum.ts`) were executed as written, run for a pilot, and have since been deleted** — the self-generated A1 content wasn't good enough, and real content was hand-produced for all 15 track×level combinations outside this codebase instead. They're left in place below as a historical record of what was built and why (the reasoning in each task is still legitimate engineering — it just describes a system that no longer exists), not as a guide to the current implementation. **"Addendum: Replacing Generation with Import (2026-09-22)" at the end of this document describes what actually shipped in their place** — read that instead for the current state. The design spec (`docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md`) has the equivalent full rewrite of the affected sections; this plan gets a pointer rather than a line-by-line rewrite, since it's a record of *how the work was done*, not a living design document.

**Goal:** Build the static, pre-authored CEFR curriculum (Track → Level → Milestone → Section → Lesson, for Generic/TELC/Goethe × A1–C1), the offline AI generation pipeline that fills it in, a merge-capable seed loader, read-only query API, and an admin-gated browse UI — plus the small password-auth addendum to Core that gates the admin section.

**Architecture:** Nine new SQLite tables extend Core's existing DB. A three-phase, resumable offline script (`scripts/generate-curriculum.ts`) calls Core's existing provider adapters to populate them, then exports per-track-level JSON seed files. A merge/upsert loader applies those seed files into any user's local DB on app start. Thin API routes under `/api/curriculum/*` (ungated) expose the data; an `/admin/*` section (gated by a new password-auth addendum) browses it for QA.

**Tech Stack:** Same as Core — Next.js 14.2 App Router, TypeScript, better-sqlite3, Vitest + Testing Library. No new runtime dependencies (Node's built-in `crypto` covers password hashing and session signing).

**Spec:** `docs/superpowers/specs/2026-09-20-cefr-frameworks-design.md`

## Global Constraints

- All DB access and AI provider calls happen server-side only; the frontend never touches the DB or a provider directly.
- `/admin/*` pages and `/api/admin/*` routes require a valid admin session; `/api/curriculum/*` is intentionally ungated.
- Password hashing uses Node's built-in `crypto.scrypt`; sessions are a stateless HMAC-signed cookie — no new dependency, no sessions table.
- Auth gating is a per-route/page check (`isAdminSessionValid()`), never Next.js middleware — middleware runs in the Edge Runtime and lacks Node's `crypto` module.
- `milestones`, `sections`, `lessons`, and `exercises` use stable, slug-style IDs (never auto-increment integers) — mastery records, prerequisite edges, and future per-user item history all key off these IDs, and a regeneration that reassigns them would silently corrupt stored state.
- Each track (Generic/TELC/Goethe) has its own independent Milestone → Section structure; lesson *content* is shared/referenced across tracks via `lesson_placements`, not duplicated.
- The curriculum generation script is resumable: every phase checks what's already persisted (by stable ID) and skips it, so a crash or rate-limit partway through doesn't require starting over.
- This sub-project stores the per-lesson exercise corpus only — it never assembles or stores milestone tests; that's sub-project #3's job at request time.
- Curriculum content is generated once, offline, by a developer-run script using its own AI credentials — never generated live by an end user's connected provider.

---

### Task 1: Curriculum + admin schema and types

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/curriculum/types.ts`
- Test: `lib/db/curriculumSchema.test.ts`

**Interfaces:**
- Produces: nine new tables (`admin_auth`, `milestones`, `sections`, `lessons`, `lesson_placements`, `lesson_track_overrides`, `exercises`, `lesson_prerequisites`, `curriculum_meta`) via `runMigrations` (already wired into `createDbClient`/`getDb` from Core — no client changes needed). Produces TypeScript types `Skill`, `ExerciseType`, `Milestone`, `Section`, `Lesson`, `LessonPlacement`, `LessonTrackOverride`, `Exercise`, `ExerciseContent` (+ per-type content interfaces), `LessonPrerequisite` — consumed by every later task.

- [ ] **Step 1: Add the new tables to `lib/db/schema.ts`**

Add these `CREATE TABLE IF NOT EXISTS` statements inside the existing `runMigrations` function's template string, after the existing four tables (before the closing `` ` `` `);`):

```sql
    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      source_level TEXT NOT NULL CHECK (source_level IN ('A1','A2','B1','B2','C1')),
      skill TEXT NOT NULL CHECK (skill IN ('grammar','vocabulary','reading','listening','writing','speaking')),
      title TEXT NOT NULL,
      explanation TEXT,
      examples TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id, section_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_track_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      track TEXT NOT NULL CHECK (track IN ('generic','telc','goethe')),
      explanation TEXT,
      examples TEXT,
      UNIQUE(lesson_id, track)
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      track TEXT CHECK (track IN ('generic','telc','goethe')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','flashcard','free_text')),
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_prerequisites (
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      prerequisite_lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      PRIMARY KEY (lesson_id, prerequisite_lesson_id)
    );

    CREATE TABLE IF NOT EXISTS curriculum_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seed_version TEXT NOT NULL DEFAULT '0',
      last_synced_at TEXT
    );
```

- [ ] **Step 2: Write `lib/curriculum/types.ts`**

```ts
import type { Track, CefrLevel } from '../types';

export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking';
export type ExerciseType = 'multiple_choice' | 'fill_blank' | 'flashcard' | 'free_text';

export interface Milestone {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  orderIndex: number;
}

export interface Section {
  id: string;
  milestoneId: string;
  title: string;
  description: string | null;
  orderIndex: number;
}

export interface Lesson {
  id: string;
  sourceLevel: CefrLevel;
  skill: Skill;
  title: string;
  explanation: string | null;
  examples: string[] | null;
  createdAt: string;
}

export interface LessonPlacement {
  id: number;
  lessonId: string;
  sectionId: string;
  orderIndex: number;
  createdAt: string;
}

export interface LessonTrackOverride {
  id: number;
  lessonId: string;
  track: Track;
  explanation: string | null;
  examples: string[] | null;
}

export interface MultipleChoiceContent {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface FillBlankContent {
  textWithBlank: string;
  correctAnswer: string;
  acceptableVariants?: string[];
}

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface FreeTextContent {
  prompt: string;
  modelAnswer: string;
}

export type ExerciseContent = MultipleChoiceContent | FillBlankContent | FlashcardContent | FreeTextContent;

export interface Exercise {
  id: string;
  lessonId: string;
  track: Track | null;
  type: ExerciseType;
  content: ExerciseContent;
}

export interface LessonPrerequisite {
  lessonId: string;
  prerequisiteLessonId: string;
}
```

- [ ] **Step 3: Write the failing test**

```ts
// lib/db/curriculumSchema.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

describe('curriculum schema', () => {
  it('creates all nine new tables', () => {
    const db = createDbClient(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'admin_auth',
        'milestones',
        'sections',
        'lessons',
        'lesson_placements',
        'lesson_track_overrides',
        'exercises',
        'lesson_prerequisites',
        'curriculum_meta',
      ])
    );
    db.close();
  });

  it('allows a lesson to be inserted without explanation/examples (Phase 1 state)', () => {
    const db = createDbClient(':memory:');
    expect(() =>
      db
        .prepare(`INSERT INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)`)
        .run('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs')
    ).not.toThrow();
    db.close();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/db/curriculumSchema.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/curriculum/types.ts lib/db/curriculumSchema.test.ts
git commit -m "feat: add curriculum and admin auth schema"
```

---

### Task 2: Session secret file

**Files:**
- Create: `lib/crypto/sessionSecret.ts`
- Test: `lib/crypto/sessionSecret.test.ts`

**Interfaces:**
- Consumes: nothing (uses `node:crypto`/`node:fs` only, mirrors `lib/crypto/keyfile.ts`).
- Produces: `defaultSessionSecretPath()`, `loadOrCreateSessionSecret(secretPath?)` — consumed by Task 3's `adminAuthService`.

- [ ] **Step 1: Write `lib/crypto/sessionSecret.ts`**

```ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultSessionSecretPath(): string {
  const dataDir = process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
  return join(dataDir, 'session.key');
}

export function loadOrCreateSessionSecret(secretPath: string = defaultSessionSecretPath()): Buffer {
  mkdirSync(dirname(secretPath), { recursive: true });
  if (existsSync(secretPath)) {
    return Buffer.from(readFileSync(secretPath, 'utf8'), 'hex');
  }
  const secret = randomBytes(32);
  writeFileSync(secretPath, secret.toString('hex'), { mode: 0o600 });
  chmodSync(secretPath, 0o600);
  return secret;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/crypto/sessionSecret.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateSessionSecret } from './sessionSecret';

describe('loadOrCreateSessionSecret', () => {
  it('creates a 32-byte secret with restricted permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-session-'));
    const secretPath = join(dir, 'session.key');
    const secret = loadOrCreateSessionSecret(secretPath);
    expect(secret).toHaveLength(32);
    expect(existsSync(secretPath)).toBe(true);
    expect(statSync(secretPath).mode & 0o777).toBe(0o600);
  });

  it('returns the same secret on repeated calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-session-'));
    const secretPath = join(dir, 'session.key');
    const first = loadOrCreateSessionSecret(secretPath);
    const second = loadOrCreateSessionSecret(secretPath);
    expect(first).toEqual(second);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/crypto/sessionSecret.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/crypto/sessionSecret.ts lib/crypto/sessionSecret.test.ts
git commit -m "feat: add session secret file for admin auth"
```

---

### Task 3: Admin auth service

**Files:**
- Create: `lib/services/adminAuthService.ts`
- Test: `lib/services/adminAuthService.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Core, `lib/db/client.ts`).
- Produces: `createAdminAuthService(db)` returning `{ isPasswordSet(), setPassword(password), verifyPassword(password), createSessionToken(secret), verifySessionToken(token, secret) }` — consumed by Task 4 (`requireAdminSession`) and Task 5 (auth API route).

- [ ] **Step 1: Write `lib/services/adminAuthService.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import type Database from 'better-sqlite3';

const SCRYPT_KEYLEN = 64;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createAdminAuthService(db: Database.Database) {
  function isPasswordSet(): boolean {
    const row = db.prepare('SELECT 1 FROM admin_auth LIMIT 1').get();
    return row !== undefined;
  }

  function setPassword(password: string): void {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
    const stored = `${salt.toString('hex')}:${hash.toString('hex')}`;
    db.prepare('DELETE FROM admin_auth').run();
    db.prepare('INSERT INTO admin_auth (id, password_hash) VALUES (1, ?)').run(stored);
  }

  function verifyPassword(password: string): boolean {
    const row = db.prepare('SELECT password_hash FROM admin_auth LIMIT 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row) return false;
    const [saltHex, hashHex] = row.password_hash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  function createSessionToken(secret: Buffer): string {
    const payload = Buffer.from(JSON.stringify({ issuedAt: Date.now() })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${signature}`;
  }

  function verifySessionToken(token: string, secret: Buffer): boolean {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false;
    try {
      const { issuedAt } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof issuedAt === 'number' && Date.now() - issuedAt < SESSION_MAX_AGE_MS;
    } catch {
      return false;
    }
  }

  return { isPasswordSet, setPassword, verifyPassword, createSessionToken, verifySessionToken };
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/adminAuthService.test.ts
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDbClient } from '../db/client';
import { createAdminAuthService } from './adminAuthService';

describe('adminAuthService', () => {
  it('reports no password set, then set, after setPassword', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    expect(service.isPasswordSet()).toBe(false);
    service.setPassword('correct-horse-battery-staple');
    expect(service.isPasswordSet()).toBe(true);
  });

  it('verifies the correct password and rejects a wrong one', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    service.setPassword('correct-horse-battery-staple');
    expect(service.verifyPassword('correct-horse-battery-staple')).toBe(true);
    expect(service.verifyPassword('wrong-password')).toBe(false);
  });

  it('round-trips a valid session token', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const secret = randomBytes(32);
    const token = service.createSessionToken(secret);
    expect(service.verifySessionToken(token, secret)).toBe(true);
  });

  it('rejects a token signed with a different secret', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const token = service.createSessionToken(randomBytes(32));
    expect(service.verifySessionToken(token, randomBytes(32))).toBe(false);
  });

  it('rejects an expired token', () => {
    const db = createDbClient(':memory:');
    const service = createAdminAuthService(db);
    const secret = randomBytes(32);
    const staleIssuedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ issuedAt: staleIssuedAt })).toString('base64url');
    const { createHmac } = require('node:crypto');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const staleToken = `${payload}.${signature}`;
    expect(service.verifySessionToken(staleToken, secret)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/services/adminAuthService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/adminAuthService.ts lib/services/adminAuthService.test.ts
git commit -m "feat: add admin auth service"
```

---

### Task 4: requireAdminSession helper

**Files:**
- Create: `lib/auth/adminSession.ts`
- Test: `lib/auth/adminSession.test.ts`

**Interfaces:**
- Consumes: `getDb` (Core, `lib/db/client.ts`); `createAdminAuthService` (Task 3); `loadOrCreateSessionSecret` (Task 2); `cookies` from `next/headers`.
- Produces: `isAdminSessionValid(): boolean` — consumed by every protected `/admin/*` page and `/api/admin/*` route (Tasks 5, 9).

- [ ] **Step 1: Write `lib/auth/adminSession.ts`**

```ts
import { cookies } from 'next/headers';
import { getDb } from '../db/client';
import { createAdminAuthService } from '../services/adminAuthService';
import { loadOrCreateSessionSecret } from '../crypto/sessionSecret';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export function isAdminSessionValid(): boolean {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = loadOrCreateSessionSecret();
  const service = createAdminAuthService(getDb());
  return service.verifySessionToken(token, secret);
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/auth/adminSession.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '../db/client';
import { createAdminAuthService } from '../services/adminAuthService';
import { loadOrCreateSessionSecret } from '../crypto/sessionSecret';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

import { isAdminSessionValid } from './adminSession';

describe('isAdminSessionValid', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-session-'));
    cookieStore.clear();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns false when no cookie is present', () => {
    expect(isAdminSessionValid()).toBe(false);
  });

  it('returns true for a valid session token', () => {
    const service = createAdminAuthService(getDb());
    const secret = loadOrCreateSessionSecret();
    cookieStore.set('admin_session', service.createSessionToken(secret));
    expect(isAdminSessionValid()).toBe(true);
  });

  it('returns false for a tampered token', () => {
    const service = createAdminAuthService(getDb());
    const secret = loadOrCreateSessionSecret();
    cookieStore.set('admin_session', service.createSessionToken(secret) + 'tampered');
    expect(isAdminSessionValid()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/auth/adminSession.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/auth/adminSession.ts lib/auth/adminSession.test.ts
git commit -m "feat: add requireAdminSession helper"
```

---

### Task 5: Admin auth API route

**Files:**
- Create: `app/api/admin/auth/route.ts`
- Test: `app/api/admin/auth/route.test.ts`

**Interfaces:**
- Consumes: `getDb` (Core); `createAdminAuthService` (Task 3); `loadOrCreateSessionSecret` (Task 2); `ADMIN_SESSION_COOKIE` (Task 4).
- Produces: `GET` (status: `{ passwordSet, authenticated }`), `POST` (body `{ password }` — sets password if unset, else verifies login; sets session cookie on success), `DELETE` (clears session cookie) at `/api/admin/auth`.

- [ ] **Step 1: Write `app/api/admin/auth/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db/client';
import { createAdminAuthService } from '@/lib/services/adminAuthService';
import { loadOrCreateSessionSecret } from '@/lib/crypto/sessionSecret';
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/auth/adminSession';

export async function GET() {
  const service = createAdminAuthService(getDb());
  return NextResponse.json({
    passwordSet: service.isPasswordSet(),
    authenticated: isAdminSessionValid(),
  });
}

export async function POST(request: Request) {
  const { password } = await request.json();
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }
  const service = createAdminAuthService(getDb());
  if (!service.isPasswordSet()) {
    service.setPassword(password);
  } else if (!service.verifyPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }
  const secret = loadOrCreateSessionSecret();
  const token = service.createSessionToken(secret);
  cookies().set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  cookies().delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the failing test**

```ts
// app/api/admin/auth/route.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

import { GET, POST, DELETE } from './route';

describe('/api/admin/auth', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-admin-auth-'));
    cookieStore.clear();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('reports passwordSet=false and authenticated=false initially', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ passwordSet: false, authenticated: false });
  });

  it('sets the password on first POST and authenticates', async () => {
    const setupRes = await POST(
      new Request('http://localhost/api/admin/auth', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) })
    );
    expect((await setupRes.json()).ok).toBe(true);
    expect(cookieStore.has('admin_session')).toBe(true);

    const statusRes = await GET();
    expect(await statusRes.json()).toEqual({ passwordSet: true, authenticated: true });
  });

  it('rejects a wrong password on a subsequent login attempt', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) }));
    cookieStore.clear();
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
    );
    expect(res.status).toBe(401);
    expect(cookieStore.has('admin_session')).toBe(false);
  });

  it('clears the session cookie on DELETE', async () => {
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ password: 'hunter2' }) }));
    expect(cookieStore.has('admin_session')).toBe(true);
    await DELETE();
    expect(cookieStore.has('admin_session')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- app/api/admin/auth/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/auth
git commit -m "feat: add admin auth API route"
```

---

### Task 6: Admin login/setup page

**Files:**
- Create: `components/admin/AdminLogin.tsx`, `app/admin/login/page.tsx`
- Test: `components/admin/AdminLogin.test.tsx`

**Interfaces:**
- Consumes (via `fetch`): `GET/POST /api/admin/auth` (Task 5).
- Produces: `<AdminLogin />` rendered at `/admin/login`, redirecting to `/admin/curriculum` on success (Task 9 builds that destination).

- [ ] **Step 1: Write `components/admin/AdminLogin.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminLogin() {
  const router = useRouter();
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((data) => setPasswordSet(data.passwordSet));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/admin/curriculum');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Login failed');
    }
  }

  if (passwordSet === null) return <p>Loading...</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h1>{passwordSet ? 'Admin login' : 'Set admin password'}</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">{passwordSet ? 'Log in' : 'Set password'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write `app/admin/login/page.tsx`**

```tsx
import { AdminLogin } from '@/components/admin/AdminLogin';

export default function AdminLoginPage() {
  return <AdminLogin />;
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// components/admin/AdminLogin.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AdminLogin } from './AdminLogin';

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows "Set admin password" when no password is set yet', async () => {
    (fetch as any).mockResolvedValueOnce({ json: async () => ({ passwordSet: false, authenticated: false }) });
    render(<AdminLogin />);
    await waitFor(() => expect(screen.getByText('Set admin password')).toBeInTheDocument());
  });

  it('shows an error on failed login', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ passwordSet: true, authenticated: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Incorrect password' }) });
    render(<AdminLogin />);
    await waitFor(() => expect(screen.getByText('Admin login')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password'));
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- components/admin/AdminLogin.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminLogin.tsx app/admin/login
git commit -m "feat: add admin login/setup page"
```

---

### Task 7: Curriculum query service

**Files:**
- Create: `lib/services/curriculumService.ts`
- Test: `lib/services/curriculumService.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Core); types from Task 1 (`Milestone`, `Section`, `Lesson`, `Exercise`, `LessonPrerequisite`).
- Produces: `createCurriculumService(db)` returning `{ listTracks(), getTrackStructure(track, level), getLesson(lessonId, track), getExercises(lessonId, track), getPrerequisites(lessonId) }` — consumed by Task 8 (API routes) and Task 9 (admin UI).

- [ ] **Step 1: Write `lib/services/curriculumService.ts`**

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Milestone, Section, Lesson, Exercise, ExerciseContent, LessonPrerequisite } from '../curriculum/types';

interface MilestoneRow {
  id: string;
  track: Track;
  level: CefrLevel;
  title: string;
  description: string | null;
  order_index: number;
}

interface SectionRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  order_index: number;
}

interface LessonRow {
  id: string;
  source_level: CefrLevel;
  skill: Lesson['skill'];
  title: string;
  explanation: string | null;
  examples: string | null;
  created_at: string;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: Exercise['type'];
  content: string;
}

function rowToMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    track: row.track,
    level: row.level,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToSection(row: SectionRow): Section {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function rowToLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    sourceLevel: row.source_level,
    skill: row.skill,
    title: row.title,
    explanation: row.explanation,
    examples: row.examples ? JSON.parse(row.examples) : null,
    createdAt: row.created_at,
  };
}

function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    track: row.track,
    type: row.type,
    content: JSON.parse(row.content) as ExerciseContent,
  };
}

export function createCurriculumService(db: Database.Database) {
  function listTracks(): { track: Track; levels: CefrLevel[] }[] {
    const rows = db
      .prepare('SELECT DISTINCT track, level FROM milestones ORDER BY track, level')
      .all() as { track: Track; level: CefrLevel }[];
    const byTrack = new Map<Track, CefrLevel[]>();
    for (const row of rows) {
      const levels = byTrack.get(row.track) ?? [];
      levels.push(row.level);
      byTrack.set(row.track, levels);
    }
    return Array.from(byTrack.entries()).map(([track, levels]) => ({ track, levels }));
  }

  function getTrackStructure(
    track: Track,
    level: CefrLevel
  ): { milestone: Milestone; sections: { section: Section; lessons: Lesson[] }[] }[] {
    const milestoneRows = db
      .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY order_index')
      .all(track, level) as MilestoneRow[];

    return milestoneRows.map((milestoneRow) => {
      const sectionRows = db
        .prepare('SELECT * FROM sections WHERE milestone_id = ? ORDER BY order_index')
        .all(milestoneRow.id) as SectionRow[];

      const sections = sectionRows.map((sectionRow) => {
        const lessonRows = db
          .prepare(
            `SELECT lessons.* FROM lessons
             JOIN lesson_placements ON lesson_placements.lesson_id = lessons.id
             WHERE lesson_placements.section_id = ?
             ORDER BY lesson_placements.order_index`
          )
          .all(sectionRow.id) as LessonRow[];
        return { section: rowToSection(sectionRow), lessons: lessonRows.map(rowToLesson) };
      });

      return { milestone: rowToMilestone(milestoneRow), sections };
    });
  }

  function getLesson(lessonId: string, track: Track): Lesson | null {
    const lessonRow = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as LessonRow | undefined;
    if (!lessonRow) return null;
    const overrideRow = db
      .prepare('SELECT explanation, examples FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
      .get(lessonId, track) as { explanation: string | null; examples: string | null } | undefined;
    if (overrideRow && overrideRow.explanation !== null) {
      return {
        ...rowToLesson(lessonRow),
        explanation: overrideRow.explanation,
        examples: overrideRow.examples ? JSON.parse(overrideRow.examples) : null,
      };
    }
    return rowToLesson(lessonRow);
  }

  function getExercises(lessonId: string, track: Track): Exercise[] {
    const trackSpecific = db
      .prepare('SELECT * FROM exercises WHERE lesson_id = ? AND track = ?')
      .all(lessonId, track) as ExerciseRow[];
    if (trackSpecific.length > 0) return trackSpecific.map(rowToExercise);
    const shared = db
      .prepare('SELECT * FROM exercises WHERE lesson_id = ? AND track IS NULL')
      .all(lessonId) as ExerciseRow[];
    return shared.map(rowToExercise);
  }

  function getPrerequisites(lessonId: string): LessonPrerequisite[] {
    const rows = db
      .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?')
      .all(lessonId) as { lesson_id: string; prerequisite_lesson_id: string }[];
    return rows.map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
  }

  return { listTracks, getTrackStructure, getLesson, getExercises, getPrerequisites };
}

export type CurriculumService = ReturnType<typeof createCurriculumService>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/curriculumService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumService } from './curriculumService';

function seedBasicTree(db: ReturnType<typeof createDbClient>) {
  db.exec(`
    INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-m1', 'generic', 'A1', 'Basics', 0);
    INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('generic-a1-m1-s1', 'generic-a1-m1', 'Greetings', 0);
    INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES
      ('a1-present-tense-regular', 'A1', 'grammar', 'Present tense of regular verbs', 'Canonical explanation', '["ich lerne"]');
    INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-present-tense-regular', 'generic-a1-m1-s1', 0);
    INSERT INTO exercises (id, lesson_id, track, type, content) VALUES
      ('a1-present-tense-regular-mc-1', 'a1-present-tense-regular', NULL, 'multiple_choice', '{"question":"q","options":["a","b"],"correctIndex":0}');
  `);
}

describe('curriculumService', () => {
  it('lists tracks with their levels', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    expect(service.listTracks()).toEqual([{ track: 'generic', levels: ['A1'] }]);
  });

  it('returns a track structure with nested sections and lessons', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const structure = service.getTrackStructure('generic', 'A1');
    expect(structure).toHaveLength(1);
    expect(structure[0].sections[0].lessons[0].id).toBe('a1-present-tense-regular');
  });

  it('falls back to canonical lesson content when no track override exists', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const lesson = service.getLesson('a1-present-tense-regular', 'telc');
    expect(lesson?.explanation).toBe('Canonical explanation');
  });

  it('uses a track override when one exists', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    db.exec(
      `INSERT INTO lesson_track_overrides (lesson_id, track, explanation, examples) VALUES ('a1-present-tense-regular', 'telc', 'TELC-specific explanation', '["telc example"]')`
    );
    const service = createCurriculumService(db);
    const lesson = service.getLesson('a1-present-tense-regular', 'telc');
    expect(lesson?.explanation).toBe('TELC-specific explanation');
  });

  it('falls back to shared exercises when no track-specific exercises exist', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    const service = createCurriculumService(db);
    const exercises = service.getExercises('a1-present-tense-regular', 'telc');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].track).toBeNull();
  });

  it('prefers track-specific exercises over shared ones', () => {
    const db = createDbClient(':memory:');
    seedBasicTree(db);
    db.exec(
      `INSERT INTO exercises (id, lesson_id, track, type, content) VALUES ('a1-present-tense-regular-telc-mc-1', 'a1-present-tense-regular', 'telc', 'multiple_choice', '{"question":"telc q","options":["a","b"],"correctIndex":1}')`
    );
    const service = createCurriculumService(db);
    const exercises = service.getExercises('a1-present-tense-regular', 'telc');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].track).toBe('telc');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/services/curriculumService.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/curriculumService.ts lib/services/curriculumService.test.ts
git commit -m "feat: add curriculum query service"
```

---

### Task 8: Curriculum API routes

**Files:**
- Create: `app/api/curriculum/tracks/route.ts`, `app/api/curriculum/tracks/[track]/[level]/route.ts`, `app/api/curriculum/lessons/[id]/route.ts`
- Test: `app/api/curriculum/route.test.ts`

**Interfaces:**
- Consumes: `getDb` (Core); `createCurriculumService` (Task 7).
- Produces: `GET /api/curriculum/tracks`, `GET /api/curriculum/tracks/[track]/[level]`, `GET /api/curriculum/lessons/[id]?track=...` (returns `{ lesson, exercises, prerequisites }`).

- [ ] **Step 1: Write `app/api/curriculum/tracks/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export async function GET() {
  const service = createCurriculumService(getDb());
  return NextResponse.json(service.listTracks());
}
```

- [ ] **Step 2: Write `app/api/curriculum/tracks/[track]/[level]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  const service = createCurriculumService(getDb());
  const structure = service.getTrackStructure(params.track as Track, params.level as CefrLevel);
  return NextResponse.json(structure);
}
```

- [ ] **Step 3: Write `app/api/curriculum/lessons/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track } from '@/lib/types';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') ?? 'generic') as Track;
  const service = createCurriculumService(getDb());
  const lesson = service.getLesson(params.id, track);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    lesson,
    exercises: service.getExercises(params.id, track),
    prerequisites: service.getPrerequisites(params.id),
  });
}
```

- [ ] **Step 4: Write the failing test**

```ts
// app/api/curriculum/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET as getTracks } from './tracks/route';
import { GET as getTrackStructure } from './tracks/[track]/[level]/route';
import { GET as getLesson } from './lessons/[id]/route';

describe('/api/curriculum', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-curriculum-api-'));
    getDb().exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-m1', 'generic', 'A1', 'Basics', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('generic-a1-m1-s1', 'generic-a1-m1', 'Greetings', 0);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES
        ('a1-present-tense-regular', 'A1', 'grammar', 'Present tense', 'Explanation', '["ich lerne"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-present-tense-regular', 'generic-a1-m1-s1', 0);
    `);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('lists tracks', async () => {
    const res = await getTracks();
    expect(await res.json()).toEqual([{ track: 'generic', levels: ['A1'] }]);
  });

  it('returns a track structure', async () => {
    const res = await getTrackStructure(new Request('http://localhost'), {
      params: { track: 'generic', level: 'A1' },
    });
    const body = await res.json();
    expect(body[0].sections[0].lessons[0].id).toBe('a1-present-tense-regular');
  });

  it('returns a lesson with exercises and prerequisites', async () => {
    const res = await getLesson(new Request('http://localhost/api/curriculum/lessons/a1-present-tense-regular?track=generic'), {
      params: { id: 'a1-present-tense-regular' },
    });
    const body = await res.json();
    expect(body.lesson.id).toBe('a1-present-tense-regular');
    expect(body.exercises).toEqual([]);
    expect(body.prerequisites).toEqual([]);
  });

  it('returns 404 for an unknown lesson', async () => {
    const res = await getLesson(new Request('http://localhost'), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- app/api/curriculum/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add app/api/curriculum
git commit -m "feat: add curriculum read API routes"
```

---

### Task 9: Admin curriculum browse UI

**Files:**
- Create: `components/admin/CurriculumBrowser.tsx`, `app/admin/curriculum/page.tsx`, `app/admin/curriculum/[track]/[level]/page.tsx`, `app/admin/curriculum/lesson/[id]/page.tsx`
- Test: `app/admin/curriculum/page.test.tsx`

**Interfaces:**
- Consumes: `isAdminSessionValid` (Task 4); `/api/curriculum/*` (Task 8) via `fetch` from client components.
- Produces: the admin browse UI at `/admin/curriculum`, `/admin/curriculum/[track]/[level]`, `/admin/curriculum/lesson/[id]` — each page gated.

- [ ] **Step 1: Write `app/admin/curriculum/page.tsx`** (gated server component, lists tracks)

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export default function AdminCurriculumPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const tracks = createCurriculumService(getDb()).listTracks();
  return (
    <div>
      <h1>Curriculum</h1>
      <ul>
        {tracks.map(({ track, levels }) => (
          <li key={track}>
            {track}:{' '}
            {levels.map((level) => (
              <a key={level} href={`/admin/curriculum/${track}/${level}`}>
                {level}{' '}
              </a>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/admin/curriculum/[track]/[level]/page.tsx`** (gated server component, structure browse)

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';
import type { Track, CefrLevel } from '@/lib/types';

export default function AdminTrackLevelPage({ params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const structure = createCurriculumService(getDb()).getTrackStructure(
    params.track as Track,
    params.level as CefrLevel
  );
  return (
    <div>
      <h1>
        {params.track} — {params.level}
      </h1>
      {structure.map(({ milestone, sections }) => (
        <div key={milestone.id}>
          <h2>{milestone.title}</h2>
          {sections.map(({ section, lessons }) => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              <ul>
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a href={`/admin/curriculum/lesson/${lesson.id}?track=${params.track}`}>{lesson.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `components/admin/CurriculumBrowser.tsx`** (client component, lesson detail — fetches to resolve track-specific content client-side since it reads a query param)

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Lesson, Exercise, LessonPrerequisite } from '@/lib/curriculum/types';

export function LessonDetail({ lessonId, track }: { lessonId: string; track: string }) {
  const [data, setData] = useState<{ lesson: Lesson; exercises: Exercise[]; prerequisites: LessonPrerequisite[] } | null>(
    null
  );

  useEffect(() => {
    fetch(`/api/curriculum/lessons/${lessonId}?track=${track}`)
      .then((r) => r.json())
      .then(setData);
  }, [lessonId, track]);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h1>{data.lesson.title}</h1>
      <p>{data.lesson.explanation}</p>
      <h2>Examples</h2>
      <ul>{(data.lesson.examples ?? []).map((ex, i) => <li key={i}>{ex}</li>)}</ul>
      <h2>Exercises ({data.exercises.length})</h2>
      <ul>
        {data.exercises.map((ex) => (
          <li key={ex.id}>
            {ex.type}: {JSON.stringify(ex.content)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/admin/curriculum/lesson/[id]/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { LessonDetail } from '@/components/admin/CurriculumBrowser';

export default function AdminLessonPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { track?: string };
}) {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <LessonDetail lessonId={params.id} track={searchParams.track ?? 'generic'} />;
}
```

- [ ] **Step 5: Write the failing test**

```tsx
// app/admin/curriculum/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

const isAdminSessionValidMock = vi.fn();
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: isAdminSessionValidMock }));

vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));

const listTracksMock = vi.fn();
vi.mock('@/lib/services/curriculumService', () => ({
  createCurriculumService: () => ({ listTracks: listTracksMock }),
}));

import AdminCurriculumPage from './page';

describe('AdminCurriculumPage', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects to /admin/login when not authenticated', () => {
    isAdminSessionValidMock.mockReturnValue(false);
    AdminCurriculumPage();
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('renders track list when authenticated', () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listTracksMock.mockReturnValue([{ track: 'generic', levels: ['A1'] }]);
    const result = AdminCurriculumPage();
    expect(result).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- app/admin/curriculum/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add components/admin/CurriculumBrowser.tsx app/admin/curriculum app/admin/curriculum/page.test.tsx
git commit -m "feat: add admin curriculum browse UI"
```

---

> **Tasks 10–15 below (through "Seed export and top-level generation script") were removed from the codebase on 2026-09-22.** See the amendment note at the top of this document and "Addendum: Replacing Generation with Import (2026-09-22)" at the end. Kept here as a historical record only.

### Task 10: Generation script AI client helper

**Files:**
- Create: `lib/curriculum-gen/aiClient.ts`
- Test: `lib/curriculum-gen/aiClient.test.ts`

**Interfaces:**
- Consumes: `getAdapter` (Core, `lib/providers/registry.ts`); `ProviderType`, `GenerateTextParams` (Core, `lib/providers/types.ts` and `lib/types.ts`).
- Produces: `createGenerationAiClient(): { generateJSON(systemPrompt, userPrompt): Promise<unknown> }` — consumed by Tasks 11-13.

- [ ] **Step 1: Write `lib/curriculum-gen/aiClient.ts`**

```ts
import { getAdapter } from '../providers/registry';
import type { ProviderType } from '../types';

function readEnvCredentials(): { providerType: ProviderType; apiKey?: string; host?: string; model: string } {
  const providerType = process.env.CURRICULUM_GEN_PROVIDER as ProviderType | undefined;
  const model = process.env.CURRICULUM_GEN_MODEL;
  if (!providerType || !model) {
    throw new Error('CURRICULUM_GEN_PROVIDER and CURRICULUM_GEN_MODEL environment variables are required');
  }
  return {
    providerType,
    apiKey: process.env.CURRICULUM_GEN_API_KEY,
    host: process.env.CURRICULUM_GEN_OLLAMA_HOST,
    model,
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[a-z]*\n/, '').replace(/```$/, '').trim();
  }
  return trimmed;
}

export function createGenerationAiClient() {
  async function generateJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const { providerType, apiKey, host, model } = readEnvCredentials();
    const adapter = getAdapter(providerType);
    const result = await adapter.generateText(
      { apiKey, host },
      { model, systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
    );
    const cleaned = stripMarkdownFences(result.text);
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Failed to parse AI response as JSON: ${(error as Error).message}\nResponse was: ${cleaned}`);
    }
  }

  return { generateJSON };
}

export type GenerationAiClient = ReturnType<typeof createGenerationAiClient>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/curriculum-gen/aiClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateTextMock = vi.fn();
vi.mock('../providers/registry', () => ({
  getAdapter: () => ({ generateText: generateTextMock, testConnection: vi.fn(), listModels: vi.fn() }),
}));

import { createGenerationAiClient } from './aiClient';

describe('createGenerationAiClient', () => {
  beforeEach(() => {
    process.env.CURRICULUM_GEN_PROVIDER = 'anthropic';
    process.env.CURRICULUM_GEN_MODEL = 'claude-sonnet-5';
    process.env.CURRICULUM_GEN_API_KEY = 'sk-test';
  });

  afterEach(() => {
    delete process.env.CURRICULUM_GEN_PROVIDER;
    delete process.env.CURRICULUM_GEN_MODEL;
    delete process.env.CURRICULUM_GEN_API_KEY;
    vi.clearAllMocks();
  });

  it('parses a clean JSON response', async () => {
    generateTextMock.mockResolvedValue({ text: '{"concepts": []}' });
    const client = createGenerationAiClient();
    const result = await client.generateJSON('system', 'user');
    expect(result).toEqual({ concepts: [] });
  });

  it('strips markdown code fences before parsing', async () => {
    generateTextMock.mockResolvedValue({ text: '```json\n{"concepts": []}\n```' });
    const client = createGenerationAiClient();
    const result = await client.generateJSON('system', 'user');
    expect(result).toEqual({ concepts: [] });
  });

  it('throws a clear error on invalid JSON', async () => {
    generateTextMock.mockResolvedValue({ text: 'not json' });
    const client = createGenerationAiClient();
    await expect(client.generateJSON('system', 'user')).rejects.toThrow('Failed to parse AI response as JSON');
  });

  it('throws when required env vars are missing', async () => {
    delete process.env.CURRICULUM_GEN_PROVIDER;
    const client = createGenerationAiClient();
    await expect(client.generateJSON('system', 'user')).rejects.toThrow(
      'CURRICULUM_GEN_PROVIDER and CURRICULUM_GEN_MODEL environment variables are required'
    );
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/curriculum-gen/aiClient.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/curriculum-gen/aiClient.ts lib/curriculum-gen/aiClient.test.ts
git commit -m "feat: add curriculum generation AI client helper"
```

---

### Task 11: Phase 1 — master concept pool generation

**Files:**
- Create: `lib/curriculum-gen/phase1MasterPool.ts`
- Test: `lib/curriculum-gen/phase1MasterPool.test.ts`

**Interfaces:**
- Consumes: `GenerationAiClient` (Task 10); `createDbClient` (Core).
- Produces: `runPhase1(db, aiClient): Promise<void>` — for each CEFR level, generates and persists that level's concept pool into `lessons`/`lesson_prerequisites`. Consumed by the top-level script (Task 15).

- [ ] **Step 1: Write `lib/curriculum-gen/phase1MasterPool.ts`**

```ts
import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { CefrLevel } from '../types';
import type { Skill } from '../curriculum/types';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

interface RawConcept {
  slug: string;
  skill: string;
  title: string;
  prerequisiteSlugs: string[];
}

const SYSTEM_PROMPT =
  'You are an expert German-as-a-foreign-language curriculum designer, deeply familiar with the CEFR framework.';

function buildUserPrompt(level: CefrLevel): string {
  return `Design the master concept pool for CEFR level ${level} German language learning content, covering all six skill areas: ${SKILLS.join(
    ', '
  )}. List every concept a learner at this level should master, grounded in official CEFR "can-do" descriptors for ${level}. For each concept, give: a short kebab-case slug (unique within this level, no level prefix), the skill it belongs to, a short human-readable title, and an array of prerequisite slugs referencing EARLIER concepts in this same list that this one depends on (omit if none). Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"concepts": [{"slug": string, "skill": "grammar"|"vocabulary"|"reading"|"listening"|"writing"|"speaking", "title": string, "prerequisiteSlugs": string[]}]}`;
}

function isLevelAlreadyGenerated(db: Database.Database, level: CefrLevel): boolean {
  const row = db.prepare('SELECT 1 FROM lessons WHERE source_level = ? LIMIT 1').get(level);
  return row !== undefined;
}

function persistConcepts(db: Database.Database, level: CefrLevel, concepts: RawConcept[]): void {
  const insertLesson = db.prepare(
    'INSERT OR IGNORE INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)'
  );
  const insertPrerequisite = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );
  const persist = db.transaction((items: RawConcept[]) => {
    for (const concept of items) {
      const id = `${level}-${concept.slug}`.toLowerCase();
      insertLesson.run(id, level, concept.skill, concept.title);
    }
    for (const concept of items) {
      const id = `${level}-${concept.slug}`.toLowerCase();
      for (const prereqSlug of concept.prerequisiteSlugs) {
        insertPrerequisite.run(id, `${level}-${prereqSlug}`.toLowerCase());
      }
    }
  });
  persist(concepts);
}

export async function runPhase1(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  for (const level of LEVELS) {
    if (isLevelAlreadyGenerated(db, level)) continue;
    const response = (await aiClient.generateJSON(SYSTEM_PROMPT, buildUserPrompt(level))) as {
      concepts: RawConcept[];
    };
    if (!Array.isArray(response.concepts)) {
      throw new Error(`Phase 1 response for level ${level} did not contain a "concepts" array`);
    }
    persistConcepts(db, level, response.concepts);
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/curriculum-gen/phase1MasterPool.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase1 } from './phase1MasterPool';

describe('runPhase1', () => {
  it('persists concepts and prerequisites for every level', async () => {
    const db = createDbClient(':memory:');
    const generateJSON = vi.fn().mockResolvedValue({
      concepts: [
        { slug: 'personal-pronouns', skill: 'grammar', title: 'Personal pronouns', prerequisiteSlugs: [] },
        {
          slug: 'present-tense-regular',
          skill: 'grammar',
          title: 'Present tense',
          prerequisiteSlugs: ['personal-pronouns'],
        },
      ],
    });
    await runPhase1(db, { generateJSON });

    expect(generateJSON).toHaveBeenCalledTimes(5); // A1-C1
    const lessons = db.prepare('SELECT id, source_level FROM lessons').all();
    expect(lessons).toHaveLength(10); // 2 concepts x 5 levels

    const prereqs = db
      .prepare('SELECT * FROM lesson_prerequisites WHERE lesson_id = ?')
      .all('a1-present-tense-regular');
    expect(prereqs).toEqual([{ lesson_id: 'a1-present-tense-regular', prerequisite_lesson_id: 'a1-personal-pronouns' }]);
  });

  it('is resumable: skips a level that already has lessons', async () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-existing', 'A1', 'grammar', 'Existing')`);
    const generateJSON = vi.fn().mockResolvedValue({ concepts: [] });
    await runPhase1(db, { generateJSON });
    expect(generateJSON).toHaveBeenCalledTimes(4); // A2-C1, A1 skipped
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/curriculum-gen/phase1MasterPool.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/curriculum-gen/phase1MasterPool.ts lib/curriculum-gen/phase1MasterPool.test.ts
git commit -m "feat: add curriculum generation phase 1 (master concept pool)"
```

---

### Task 12: Phase 2 — track structuring

**Files:**
- Create: `lib/curriculum-gen/phase2TrackStructure.ts`
- Test: `lib/curriculum-gen/phase2TrackStructure.test.ts`

**Interfaces:**
- Consumes: `GenerationAiClient` (Task 10); `createDbClient` (Core); `Track`, `CefrLevel` (Core, `lib/types.ts`).
- Produces: `runPhase2(db, aiClient): Promise<void>` — for each track × level, generates and persists that combination's `milestones`/`sections`/`lesson_placements`, any new track-exclusive lesson stubs, and placeholder `lesson_track_overrides` rows for flagged shared concepts. Consumed by the top-level script (Task 15).

- [ ] **Step 1: Write `lib/curriculum-gen/phase2TrackStructure.ts`**

```ts
import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { Track, CefrLevel } from '../types';

const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

interface RawLessonRef {
  lessonId: string;
}

interface RawNewLesson {
  slug: string;
  skill: string;
  title: string;
}

interface RawSection {
  slug: string;
  title: string;
  lessons: (RawLessonRef | { newLesson: RawNewLesson })[];
}

interface RawMilestone {
  slug: string;
  title: string;
  sections: RawSection[];
}

interface RawStructureResponse {
  milestones: RawMilestone[];
  overrideNeeded: { lessonId: string }[];
}

const SYSTEM_PROMPT =
  'You are an expert German-as-a-foreign-language curriculum designer, deeply familiar with CEFR, TELC, and Goethe-Institut exam formats.';

function buildUserPrompt(track: Track, level: CefrLevel, poolLessonIds: string[]): string {
  const trackGuidance =
    track === 'generic'
      ? 'This is the Generic track: use general CEFR "can-do" descriptors only, no specific exam format.'
      : `This is the ${track === 'telc' ? 'TELC' : 'Goethe-Institut'} exam track: ground the structure in that exam's real, documented format and syllabus for level ${level}, drawing on your training knowledge of it.`;
  return `Arrange a German-learning curriculum structure for CEFR level ${level}, track "${track}". ${trackGuidance}
Available shared concept pool for this level (reference by exact id): ${JSON.stringify(poolLessonIds)}.
Organize into Milestones, each containing Sections, each containing an ordered list of Lessons. A Lesson is either a reference to a pool concept ({"lessonId": "<id from the pool>"}) or, only when the exam format requires content not in the pool, a brand-new lesson ({"newLesson": {"slug": string, "skill": string, "title": string}}). A milestone should be a meaningful chunk of study, not a single lesson or an entire level.
Also list any pool concept (by id) that needs a track-specific explanation or exercise variant for this track, in "overrideNeeded".
Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"milestones": [{"slug": string, "title": string, "sections": [{"slug": string, "title": string, "lessons": [{"lessonId": string} | {"newLesson": {"slug": string, "skill": string, "title": string}}]}]}], "overrideNeeded": [{"lessonId": string}]}`;
}

function isTrackLevelAlreadyGenerated(db: Database.Database, track: Track, level: CefrLevel): boolean {
  const row = db.prepare('SELECT 1 FROM milestones WHERE track = ? AND level = ? LIMIT 1').get(track, level);
  return row !== undefined;
}

function persistStructure(
  db: Database.Database,
  track: Track,
  level: CefrLevel,
  response: RawStructureResponse
): void {
  const insertMilestone = db.prepare(
    'INSERT OR IGNORE INTO milestones (id, track, level, title, order_index) VALUES (?, ?, ?, ?, ?)'
  );
  const insertSection = db.prepare(
    'INSERT OR IGNORE INTO sections (id, milestone_id, title, order_index) VALUES (?, ?, ?, ?)'
  );
  const insertNewLesson = db.prepare(
    'INSERT OR IGNORE INTO lessons (id, source_level, skill, title) VALUES (?, ?, ?, ?)'
  );
  const insertPlacement = db.prepare(
    'INSERT OR IGNORE INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)'
  );
  const insertOverridePlaceholder = db.prepare(
    'INSERT OR IGNORE INTO lesson_track_overrides (lesson_id, track) VALUES (?, ?)'
  );

  const persist = db.transaction(() => {
    response.milestones.forEach((milestone, milestoneIndex) => {
      const milestoneId = `${track}-${level}-${milestone.slug}`.toLowerCase();
      insertMilestone.run(milestoneId, track, level, milestone.title, milestoneIndex);

      milestone.sections.forEach((section, sectionIndex) => {
        const sectionId = `${milestoneId}-${section.slug}`.toLowerCase();
        insertSection.run(sectionId, milestoneId, section.title, sectionIndex);

        section.lessons.forEach((lessonRef, lessonIndex) => {
          let lessonId: string;
          if ('newLesson' in lessonRef) {
            lessonId = `${track}-${level}-${lessonRef.newLesson.slug}`.toLowerCase();
            insertNewLesson.run(lessonId, level, lessonRef.newLesson.skill, lessonRef.newLesson.title);
          } else {
            lessonId = lessonRef.lessonId;
          }
          insertPlacement.run(lessonId, sectionId, lessonIndex);
        });
      });
    });

    for (const { lessonId } of response.overrideNeeded ?? []) {
      insertOverridePlaceholder.run(lessonId, track);
    }
  });
  persist();
}

export async function runPhase2(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  for (const track of TRACKS) {
    for (const level of LEVELS) {
      if (isTrackLevelAlreadyGenerated(db, track, level)) continue;
      const poolLessonIds = (
        db.prepare('SELECT id FROM lessons WHERE source_level = ?').all(level) as { id: string }[]
      ).map((r) => r.id);
      const response = (await aiClient.generateJSON(
        SYSTEM_PROMPT,
        buildUserPrompt(track, level, poolLessonIds)
      )) as RawStructureResponse;
      if (!Array.isArray(response.milestones)) {
        throw new Error(`Phase 2 response for ${track}/${level} did not contain a "milestones" array`);
      }
      persistStructure(db, track, level, response);
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/curriculum-gen/phase2TrackStructure.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase2 } from './phase2TrackStructure';

function seedPool(db: ReturnType<typeof createDbClient>) {
  db.exec(
    `INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-present-tense-regular', 'A1', 'grammar', 'Present tense')`
  );
}

describe('runPhase2', () => {
  it('persists milestones, sections, placements, new lessons, and override placeholders', async () => {
    const db = createDbClient(':memory:');
    seedPool(db);
    const generateJSON = vi.fn().mockResolvedValue({
      milestones: [
        {
          slug: 'm1',
          title: 'Milestone 1',
          sections: [
            {
              slug: 's1',
              title: 'Section 1',
              lessons: [
                { lessonId: 'a1-present-tense-regular' },
                { newLesson: { slug: 'formal-letter-format', skill: 'writing', title: 'Formal letter format' } },
              ],
            },
          ],
        },
      ],
      overrideNeeded: [{ lessonId: 'a1-present-tense-regular' }],
    });
    await runPhase2(db, { generateJSON });

    expect(generateJSON).toHaveBeenCalledTimes(15); // 3 tracks x 5 levels
    const milestones = db.prepare('SELECT id FROM milestones').all();
    expect(milestones.length).toBeGreaterThan(0);
    const newLesson = db.prepare("SELECT * FROM lessons WHERE id LIKE '%formal-letter-format'").all();
    expect(newLesson.length).toBeGreaterThan(0);
    const overrides = db.prepare('SELECT * FROM lesson_track_overrides WHERE lesson_id = ?').all('a1-present-tense-regular');
    expect(overrides.length).toBe(3); // one per track that saw this response shape
  });

  it('is resumable: skips a track/level that already has milestones', async () => {
    const db = createDbClient(':memory:');
    seedPool(db);
    db.exec(
      `INSERT INTO milestones (id, track, level, title, order_index) VALUES ('generic-a1-existing', 'generic', 'A1', 'Existing', 0)`
    );
    const generateJSON = vi.fn().mockResolvedValue({ milestones: [], overrideNeeded: [] });
    await runPhase2(db, { generateJSON });
    expect(generateJSON).toHaveBeenCalledTimes(14); // generic/A1 skipped
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/curriculum-gen/phase2TrackStructure.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/curriculum-gen/phase2TrackStructure.ts lib/curriculum-gen/phase2TrackStructure.test.ts
git commit -m "feat: add curriculum generation phase 2 (track structuring)"
```

---

### Task 13: Phase 3 — content generation

**Files:**
- Create: `lib/curriculum-gen/phase3Content.ts`
- Test: `lib/curriculum-gen/phase3Content.test.ts`

**Interfaces:**
- Consumes: `GenerationAiClient` (Task 10); `createDbClient` (Core); `Skill`, `ExerciseType` (Task 1).
- Produces: `runPhase3(db, aiClient): Promise<void>` — for each lesson missing content, generates explanation/examples/exercises; for each pending `lesson_track_overrides` row, generates override explanation/examples and track-specific exercises. Consumed by the top-level script (Task 15).

- [ ] **Step 1: Write `lib/curriculum-gen/phase3Content.ts`**

```ts
import type Database from 'better-sqlite3';
import type { GenerationAiClient } from './aiClient';
import type { Track } from '../types';

interface RawExercise {
  slug: string;
  type: 'multiple_choice' | 'fill_blank' | 'flashcard' | 'free_text';
  content: unknown;
}

interface RawLessonContent {
  explanation: string;
  examples: string[];
  exercises: RawExercise[];
}

const SYSTEM_PROMPT = 'You are an expert German-as-a-foreign-language content writer.';

function buildLessonPrompt(skill: string, title: string): string {
  return `Write full content for a German-learning lesson on "${title}" (skill: ${skill}). Provide: a clear explanation of the concept, an array of example sentences (German, illustrating the concept), and 5-8 exercises drawn from these types as appropriate for the skill: multiple_choice ({"question","options","correctIndex"}), fill_blank ({"textWithBlank","correctAnswer","acceptableVariants"?}), flashcard ({"front","back"}), free_text ({"prompt","modelAnswer"}). Each exercise needs a unique short kebab-case slug. Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{"explanation": string, "examples": string[], "exercises": [{"slug": string, "type": "multiple_choice"|"fill_blank"|"flashcard"|"free_text", "content": object}]}`;
}

function buildOverridePrompt(skill: string, title: string, track: Track, canonicalExplanation: string): string {
  return `The German-learning lesson "${title}" (skill: ${skill}) normally reads: "${canonicalExplanation}". Write a ${track === 'telc' ? 'TELC' : track === 'goethe' ? 'Goethe-Institut' : track}-specific variant of this lesson's explanation, examples, and 5-8 exercises, reflecting how this exam track treats the concept differently. Same JSON shape as before:
{"explanation": string, "examples": string[], "exercises": [{"slug": string, "type": "multiple_choice"|"fill_blank"|"flashcard"|"free_text", "content": object}]}`;
}

function persistExercises(
  db: Database.Database,
  lessonId: string,
  track: Track | null,
  exercises: RawExercise[]
): void {
  const insertExercise = db.prepare(
    'INSERT OR IGNORE INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)'
  );
  for (const exercise of exercises) {
    const id = `${lessonId}-${exercise.slug}`.toLowerCase();
    insertExercise.run(id, lessonId, track, exercise.type, JSON.stringify(exercise.content));
  }
}

export async function runPhase3(db: Database.Database, aiClient: GenerationAiClient): Promise<void> {
  const pendingLessons = db
    .prepare('SELECT id, skill, title FROM lessons WHERE explanation IS NULL')
    .all() as { id: string; skill: string; title: string }[];

  for (const lesson of pendingLessons) {
    const content = (await aiClient.generateJSON(
      SYSTEM_PROMPT,
      buildLessonPrompt(lesson.skill, lesson.title)
    )) as RawLessonContent;
    if (typeof content.explanation !== 'string' || !Array.isArray(content.examples)) {
      throw new Error(`Phase 3 response for lesson ${lesson.id} missing explanation/examples`);
    }
    const update = db.transaction(() => {
      db.prepare('UPDATE lessons SET explanation = ?, examples = ? WHERE id = ?').run(
        content.explanation,
        JSON.stringify(content.examples),
        lesson.id
      );
      persistExercises(db, lesson.id, null, content.exercises ?? []);
    });
    update();
  }

  const pendingOverrides = db
    .prepare(
      `SELECT lesson_track_overrides.lesson_id as lessonId, lesson_track_overrides.track as track,
              lessons.skill as skill, lessons.title as title, lessons.explanation as canonicalExplanation
       FROM lesson_track_overrides
       JOIN lessons ON lessons.id = lesson_track_overrides.lesson_id
       WHERE lesson_track_overrides.explanation IS NULL`
    )
    .all() as { lessonId: string; track: Track; skill: string; title: string; canonicalExplanation: string }[];

  for (const override of pendingOverrides) {
    const content = (await aiClient.generateJSON(
      SYSTEM_PROMPT,
      buildOverridePrompt(override.skill, override.title, override.track, override.canonicalExplanation)
    )) as RawLessonContent;
    if (typeof content.explanation !== 'string' || !Array.isArray(content.examples)) {
      throw new Error(`Phase 3 override response for ${override.lessonId}/${override.track} missing fields`);
    }
    const update = db.transaction(() => {
      db.prepare(
        'UPDATE lesson_track_overrides SET explanation = ?, examples = ? WHERE lesson_id = ? AND track = ?'
      ).run(content.explanation, JSON.stringify(content.examples), override.lessonId, override.track);
      persistExercises(db, override.lessonId, override.track, content.exercises ?? []);
    });
    update();
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/curriculum-gen/phase3Content.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';
import { runPhase3 } from './phase3Content';

describe('runPhase3', () => {
  it('fills in explanation, examples, and exercises for a pending lesson', async () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO lessons (id, source_level, skill, title) VALUES ('a1-test', 'A1', 'grammar', 'Test lesson')`);
    const generateJSON = vi.fn().mockResolvedValue({
      explanation: 'Explanation text',
      examples: ['Beispiel 1'],
      exercises: [{ slug: 'mc-1', type: 'multiple_choice', content: { question: 'q', options: ['a', 'b'], correctIndex: 0 } }],
    });
    await runPhase3(db, { generateJSON });

    const lesson = db.prepare('SELECT explanation, examples FROM lessons WHERE id = ?').get('a1-test') as any;
    expect(lesson.explanation).toBe('Explanation text');
    expect(JSON.parse(lesson.examples)).toEqual(['Beispiel 1']);
    const exercises = db.prepare('SELECT * FROM exercises WHERE lesson_id = ?').all('a1-test');
    expect(exercises).toHaveLength(1);
  });

  it('is resumable: skips lessons that already have explanation', async () => {
    const db = createDbClient(':memory:');
    db.exec(
      `INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('a1-done', 'A1', 'grammar', 'Done', 'Already written', '[]')`
    );
    const generateJSON = vi.fn();
    await runPhase3(db, { generateJSON });
    expect(generateJSON).not.toHaveBeenCalled();
  });

  it('fills in pending track override rows', async () => {
    const db = createDbClient(':memory:');
    db.exec(
      `INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('a1-test', 'A1', 'grammar', 'Test', 'Canonical', '["x"]')`
    );
    db.exec(`INSERT INTO lesson_track_overrides (lesson_id, track) VALUES ('a1-test', 'telc')`);
    const generateJSON = vi.fn().mockResolvedValue({
      explanation: 'TELC-specific explanation',
      examples: ['TELC example'],
      exercises: [],
    });
    await runPhase3(db, { generateJSON });

    const override = db
      .prepare('SELECT explanation FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
      .get('a1-test', 'telc') as any;
    expect(override.explanation).toBe('TELC-specific explanation');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/curriculum-gen/phase3Content.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/curriculum-gen/phase3Content.ts lib/curriculum-gen/phase3Content.test.ts
git commit -m "feat: add curriculum generation phase 3 (content generation)"
```

---

### Task 14: Validation pass and summary report

**Files:**
- Create: `lib/curriculum-gen/validate.ts`
- Test: `lib/curriculum-gen/validate.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Core).
- Produces: `validateCurriculum(db): ValidationReport` where `ValidationReport = { counts: Record<string, number>, issues: string[] }` — consumed by the top-level script (Task 15) to print before export.

- [ ] **Step 1: Write `lib/curriculum-gen/validate.ts`**

```ts
import type Database from 'better-sqlite3';

export interface ValidationReport {
  counts: {
    milestones: number;
    sections: number;
    lessons: number;
    exercises: number;
    lessonPlacements: number;
    trackOverrides: number;
  };
  issues: string[];
}

export function validateCurriculum(db: Database.Database): ValidationReport {
  const issues: string[] = [];

  const count = (table: string): number => (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;

  const counts = {
    milestones: count('milestones'),
    sections: count('sections'),
    lessons: count('lessons'),
    exercises: count('exercises'),
    lessonPlacements: count('lesson_placements'),
    trackOverrides: count('lesson_track_overrides'),
  };

  const emptyLessons = db.prepare('SELECT id FROM lessons WHERE explanation IS NULL').all() as { id: string }[];
  for (const row of emptyLessons) issues.push(`Lesson ${row.id} has no content (explanation is NULL)`);

  const orphanPlacements = db
    .prepare(
      `SELECT lesson_placements.id as id FROM lesson_placements
       LEFT JOIN lessons ON lessons.id = lesson_placements.lesson_id
       WHERE lessons.id IS NULL`
    )
    .all() as { id: number }[];
  for (const row of orphanPlacements) issues.push(`lesson_placements row ${row.id} references a missing lesson`);

  const sectionsWithoutLessons = db
    .prepare(
      `SELECT sections.id as id FROM sections
       LEFT JOIN lesson_placements ON lesson_placements.section_id = sections.id
       WHERE lesson_placements.id IS NULL`
    )
    .all() as { id: string }[];
  for (const row of sectionsWithoutLessons) issues.push(`Section ${row.id} has zero lessons`);

  const milestonesWithOneSection = db
    .prepare(
      `SELECT milestones.id as id, COUNT(sections.id) as sectionCount FROM milestones
       LEFT JOIN sections ON sections.milestone_id = milestones.id
       GROUP BY milestones.id HAVING sectionCount <= 1`
    )
    .all() as { id: string; sectionCount: number }[];
  for (const row of milestonesWithOneSection) {
    issues.push(`Milestone ${row.id} has only ${row.sectionCount} section(s) — possibly under-decomposed`);
  }

  return { counts, issues };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/curriculum-gen/validate.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { validateCurriculum } from './validate';

describe('validateCurriculum', () => {
  it('reports counts and no issues for a well-formed tree', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s2', 'm1', 'S2', 1);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Explanation', '[]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's2', 0);
    `);
    const report = validateCurriculum(db);
    expect(report.counts.milestones).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it('flags lessons with no content, orphan sections, and under-decomposed milestones', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title) VALUES ('l1', 'A1', 'grammar', 'L1');
    `);
    const report = validateCurriculum(db);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'Lesson l1 has no content (explanation is NULL)',
        'Section s1 has zero lessons',
        'Milestone m1 has only 1 section(s) — possibly under-decomposed',
      ])
    );
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/curriculum-gen/validate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/curriculum-gen/validate.ts lib/curriculum-gen/validate.test.ts
git commit -m "feat: add curriculum generation validation pass"
```

---

### Task 15: Seed export and top-level generation script

**Files:**
- Create: `lib/curriculum-gen/exportSeed.ts`, `scripts/generate-curriculum.ts`
- Test: `lib/curriculum-gen/exportSeed.test.ts`
- Modify: `package.json` (add `tsx` devDependency and a `generate-curriculum` script)

**Interfaces:**
- Consumes: `runPhase1`/`runPhase2`/`runPhase3` (Tasks 11-13); `validateCurriculum` (Task 14); `createGenerationAiClient` (Task 10); `createDbClient` (Core).
- Produces: `exportSeed(db, outDir): void` (writes one JSON file per track+level under `outDir`); the runnable script tying every phase together.

- [ ] **Step 1: Add `tsx` and a script entry to `package.json`**

Add to `devDependencies`: `"tsx": "^4.19.2"`. Add to `scripts`: `"generate-curriculum": "tsx scripts/generate-curriculum.ts"`.

- [ ] **Step 2: Write `lib/curriculum-gen/exportSeed.ts`**

Each track+level seed file exports the **structure** (milestones/sections/lesson references) plus three **separate, raw** collections: canonical `lessons` (never track-resolved), this track's `overrides` (only rows that actually exist), and `exercises` (shared and this-track, with their own `track` field preserved). This separation matters: a shared lesson appears in multiple tracks' seed files, and each file must carry the *canonical* content, not a track-resolved merge — otherwise loading one track's seed after another's would overwrite the canonical explanation with that track's override.

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

interface LessonRow {
  id: string;
  source_level: CefrLevel;
  skill: string;
  title: string;
  explanation: string | null;
  examples: string | null;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  track: Track | null;
  type: string;
  content: string;
}

export function exportSeed(db: Database.Database, outDir: string, seedVersion: string): void {
  mkdirSync(outDir, { recursive: true });

  for (const track of TRACKS) {
    for (const level of LEVELS) {
      const milestoneRows = db
        .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY order_index')
        .all(track, level) as { id: string; title: string; description: string | null; order_index: number }[];
      if (milestoneRows.length === 0) continue;

      const lessonIds = new Set<string>();
      const milestones = milestoneRows.map((milestoneRow) => {
        const sectionRows = db
          .prepare('SELECT * FROM sections WHERE milestone_id = ? ORDER BY order_index')
          .all(milestoneRow.id) as { id: string; title: string; description: string | null; order_index: number }[];
        const sections = sectionRows.map((sectionRow) => {
          const placementRows = db
            .prepare('SELECT lesson_id, order_index FROM lesson_placements WHERE section_id = ? ORDER BY order_index')
            .all(sectionRow.id) as { lesson_id: string; order_index: number }[];
          for (const p of placementRows) lessonIds.add(p.lesson_id);
          return {
            section: {
              id: sectionRow.id,
              milestoneId: milestoneRow.id,
              title: sectionRow.title,
              description: sectionRow.description,
              orderIndex: sectionRow.order_index,
            },
            lessonRefs: placementRows.map((p) => ({ lessonId: p.lesson_id, orderIndex: p.order_index })),
          };
        });
        return {
          milestone: {
            id: milestoneRow.id,
            track,
            level,
            title: milestoneRow.title,
            description: milestoneRow.description,
            orderIndex: milestoneRow.order_index,
          },
          sections,
        };
      });

      const lessonIdList = Array.from(lessonIds);

      const lessons = lessonIdList.map((id) => {
        const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as LessonRow;
        return {
          id: row.id,
          sourceLevel: row.source_level,
          skill: row.skill,
          title: row.title,
          explanation: row.explanation,
          examples: row.examples ? JSON.parse(row.examples) : null,
        };
      });

      const overrides = lessonIdList.flatMap((id) => {
        const row = db
          .prepare('SELECT explanation, examples FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
          .get(id, track) as { explanation: string | null; examples: string | null } | undefined;
        if (!row || row.explanation === null) return [];
        return [
          {
            lessonId: id,
            track,
            explanation: row.explanation,
            examples: row.examples ? JSON.parse(row.examples) : null,
          },
        ];
      });

      const exercises = lessonIdList.flatMap((id) => {
        const rows = db
          .prepare('SELECT * FROM exercises WHERE lesson_id = ? AND (track IS NULL OR track = ?)')
          .all(id, track) as ExerciseRow[];
        return rows.map((row) => ({
          id: row.id,
          lessonId: row.lesson_id,
          track: row.track,
          type: row.type,
          content: JSON.parse(row.content),
        }));
      });

      const prerequisites = lessonIdList.flatMap((id) => {
        const rows = db
          .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites WHERE lesson_id = ?')
          .all(id) as { lesson_id: string; prerequisite_lesson_id: string }[];
        return rows.map((r) => ({ lessonId: r.lesson_id, prerequisiteLessonId: r.prerequisite_lesson_id }));
      });

      const filePath = join(outDir, `${track}-${level.toLowerCase()}.json`);
      writeFileSync(
        filePath,
        JSON.stringify(
          { seedVersion, track, level, milestones, lessons, overrides, exercises, prerequisites },
          null,
          2
        )
      );
    }
  }
}
```

- [ ] **Step 3: Write the failing test**

```ts
// lib/curriculum-gen/exportSeed.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { exportSeed } from './exportSeed';

describe('exportSeed', () => {
  it('writes one JSON file per populated track+level, with canonical lessons separate from overrides', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('m1', 'generic', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('s1', 'm1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Canonical explanation', '["ex"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 's1', 0);
    `);
    const outDir = mkdtempSync(join(tmpdir(), 'gait-seed-export-'));
    exportSeed(db, outDir, '1');

    const filePath = join(outDir, 'generic-a1.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(content.seedVersion).toBe('1');
    expect(content.milestones[0].sections[0].lessonRefs[0].lessonId).toBe('l1');
    expect(content.lessons[0]).toMatchObject({ id: 'l1', explanation: 'Canonical explanation' });
    expect(content.overrides).toEqual([]);

    expect(existsSync(join(outDir, 'telc-a1.json'))).toBe(false);
  });

  it('exports a track override separately from the canonical lesson, and only for the matching track', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('telc-a1-m1', 'telc', 'A1', 'M1', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('telc-a1-m1-s1', 'telc-a1-m1', 'S1', 0);
      INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES ('l1', 'A1', 'grammar', 'L1', 'Canonical explanation', '["ex"]');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('l1', 'telc-a1-m1-s1', 0);
      INSERT INTO lesson_track_overrides (lesson_id, track, explanation, examples) VALUES ('l1', 'telc', 'TELC-specific explanation', '["telc ex"]');
    `);
    const outDir = mkdtempSync(join(tmpdir(), 'gait-seed-export-'));
    exportSeed(db, outDir, '1');

    const content = JSON.parse(readFileSync(join(outDir, 'telc-a1.json'), 'utf8'));
    expect(content.lessons[0].explanation).toBe('Canonical explanation');
    expect(content.overrides).toEqual([
      { lessonId: 'l1', track: 'telc', explanation: 'TELC-specific explanation', examples: ['telc ex'] },
    ]);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm install && npm test -- lib/curriculum-gen/exportSeed.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `scripts/generate-curriculum.ts`**

```ts
import { createDbClient } from '../lib/db/client';
import { createGenerationAiClient } from '../lib/curriculum-gen/aiClient';
import { runPhase1 } from '../lib/curriculum-gen/phase1MasterPool';
import { runPhase2 } from '../lib/curriculum-gen/phase2TrackStructure';
import { runPhase3 } from '../lib/curriculum-gen/phase3Content';
import { validateCurriculum } from '../lib/curriculum-gen/validate';
import { exportSeed } from '../lib/curriculum-gen/exportSeed';
import { join } from 'node:path';

async function main() {
  const dbPath = process.env.CURRICULUM_GEN_DB_PATH ?? join(process.cwd(), 'data', 'curriculum-gen.db');
  const outDir = process.env.CURRICULUM_GEN_OUT_DIR ?? join(process.cwd(), 'data', 'curriculum-seed');
  const seedVersion = process.env.CURRICULUM_GEN_SEED_VERSION ?? String(Date.now());

  const db = createDbClient(dbPath);
  const aiClient = createGenerationAiClient();

  console.log('Phase 1: master concept pool...');
  await runPhase1(db, aiClient);

  console.log('Phase 2: track structuring...');
  await runPhase2(db, aiClient);

  console.log('Phase 3: content generation...');
  await runPhase3(db, aiClient);

  console.log('Validating...');
  const report = validateCurriculum(db);
  console.log('Counts:', report.counts);
  if (report.issues.length > 0) {
    console.log(`${report.issues.length} issue(s) flagged for review:`);
    for (const issue of report.issues) console.log(`  - ${issue}`);
  }

  console.log(`Exporting seed data to ${outDir}...`);
  exportSeed(db, outDir, seedVersion);

  db.close();
  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 6: Commit**

```bash
git add lib/curriculum-gen/exportSeed.ts lib/curriculum-gen/exportSeed.test.ts scripts/generate-curriculum.ts package.json package-lock.json
git commit -m "feat: add seed export and top-level curriculum generation script"
```

---

### Task 16: Seed loader (merge/upsert) and app-start wiring

**Files:**
- Create: `lib/services/curriculumSeedLoader.ts`
- Modify: `app/layout.tsx`
- Test: `lib/services/curriculumSeedLoader.test.ts`

**Interfaces:**
- Consumes: `createDbClient`/`getDb` (Core); seed files produced by Task 15's `exportSeed`.
- Produces: `loadSeedIfNeeded(db, seedDir): void` — called once at app startup.

- [ ] **Step 1: Write `lib/services/curriculumSeedLoader.ts`**

Mirrors Task 15's seed file shape exactly: `lessons` (canonical, always safe to upsert regardless of which track's file it came from), `overrides` (only this file's track's actual override rows), and `exercises` (shared + this-track, `track` field preserved as-is) are upserted as separate, independent collections — never merged/resolved before writing, so loading multiple tracks' seed files never overwrites canonical content with one track's override.

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';

interface SeedFile {
  seedVersion: string;
  track: Track;
  level: CefrLevel;
  milestones: {
    milestone: { id: string; track: Track; level: CefrLevel; title: string; description: string | null; orderIndex: number };
    sections: {
      section: { id: string; milestoneId: string; title: string; description: string | null; orderIndex: number };
      lessonRefs: { lessonId: string; orderIndex: number }[];
    }[];
  }[];
  lessons: {
    id: string;
    sourceLevel: CefrLevel;
    skill: string;
    title: string;
    explanation: string | null;
    examples: string[] | null;
  }[];
  overrides: { lessonId: string; track: Track; explanation: string | null; examples: string[] | null }[];
  exercises: { id: string; lessonId: string; track: Track | null; type: string; content: unknown }[];
  prerequisites: { lessonId: string; prerequisiteLessonId: string }[];
}

function getCurrentSeedVersion(db: Database.Database): string {
  const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as
    | { seed_version: string }
    | undefined;
  return row?.seed_version ?? '0';
}

function upsertSeedFile(db: Database.Database, seed: SeedFile): void {
  const upsertMilestone = db.prepare(
    `INSERT INTO milestones (id, track, level, title, description, order_index) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, order_index = excluded.order_index`
  );
  const upsertSection = db.prepare(
    `INSERT INTO sections (id, milestone_id, title, description, order_index) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, order_index = excluded.order_index`
  );
  const upsertPlacement = db.prepare(
    `INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES (?, ?, ?)
     ON CONFLICT(lesson_id, section_id) DO UPDATE SET order_index = excluded.order_index`
  );
  const upsertLesson = db.prepare(
    `INSERT INTO lessons (id, source_level, skill, title, explanation, examples) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, explanation = excluded.explanation, examples = excluded.examples`
  );
  const upsertOverride = db.prepare(
    `INSERT INTO lesson_track_overrides (lesson_id, track, explanation, examples) VALUES (?, ?, ?, ?)
     ON CONFLICT(lesson_id, track) DO UPDATE SET explanation = excluded.explanation, examples = excluded.examples`
  );
  const upsertExercise = db.prepare(
    `INSERT INTO exercises (id, lesson_id, track, type, content) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content`
  );
  const upsertPrerequisite = db.prepare(
    'INSERT OR IGNORE INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id) VALUES (?, ?)'
  );

  for (const { milestone, sections } of seed.milestones) {
    upsertMilestone.run(
      milestone.id,
      milestone.track,
      milestone.level,
      milestone.title,
      milestone.description,
      milestone.orderIndex
    );
    for (const { section, lessonRefs } of sections) {
      upsertSection.run(section.id, section.milestoneId, section.title, section.description, section.orderIndex);
      for (const ref of lessonRefs) {
        upsertPlacement.run(ref.lessonId, section.id, ref.orderIndex);
      }
    }
  }

  for (const lesson of seed.lessons) {
    upsertLesson.run(
      lesson.id,
      lesson.sourceLevel,
      lesson.skill,
      lesson.title,
      lesson.explanation,
      lesson.examples ? JSON.stringify(lesson.examples) : null
    );
  }

  for (const override of seed.overrides) {
    upsertOverride.run(
      override.lessonId,
      override.track,
      override.explanation,
      override.examples ? JSON.stringify(override.examples) : null
    );
  }

  for (const exercise of seed.exercises) {
    upsertExercise.run(exercise.id, exercise.lessonId, exercise.track, exercise.type, JSON.stringify(exercise.content));
  }

  for (const prereq of seed.prerequisites) {
    upsertPrerequisite.run(prereq.lessonId, prereq.prerequisiteLessonId);
  }
}

export function loadSeedIfNeeded(db: Database.Database, seedDir: string): void {
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const firstSeed = JSON.parse(readFileSync(join(seedDir, files[0]), 'utf8')) as SeedFile;
  const bundledVersion = firstSeed.seedVersion;
  const currentVersion = getCurrentSeedVersion(db);
  if (bundledVersion === currentVersion) return;

  const applyAll = db.transaction(() => {
    for (const file of files) {
      const seed = JSON.parse(readFileSync(join(seedDir, file), 'utf8')) as SeedFile;
      upsertSeedFile(db, seed);
    }
    db.prepare(
      `INSERT INTO curriculum_meta (id, seed_version, last_synced_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET seed_version = excluded.seed_version, last_synced_at = excluded.last_synced_at`
    ).run(bundledVersion);
  });
  applyAll();
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/curriculumSeedLoader.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded } from './curriculumSeedLoader';

function writeSeedFile(
  dir: string,
  name: string,
  seedVersion: string,
  overrides: { lessonId: string; track: string; explanation: string | null; examples: string[] | null }[] = []
) {
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      seedVersion,
      track: 'generic',
      level: 'A1',
      milestones: [
        {
          milestone: { id: 'm1', track: 'generic', level: 'A1', title: 'M1', description: null, orderIndex: 0 },
          sections: [
            {
              section: { id: 's1', milestoneId: 'm1', title: 'S1', description: null, orderIndex: 0 },
              lessonRefs: [{ lessonId: 'l1', orderIndex: 0 }],
            },
          ],
        },
      ],
      lessons: [
        { id: 'l1', sourceLevel: 'A1', skill: 'grammar', title: 'L1', explanation: 'Canonical explanation', examples: ['ex'] },
      ],
      overrides,
      exercises: [],
      prerequisites: [],
    })
  );
}

describe('loadSeedIfNeeded', () => {
  it('loads seed data into an empty DB and records the seed version', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');

    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT title FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.title).toBe('L1');
    const meta = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as any;
    expect(meta.seed_version).toBe('1');
  });

  it('does nothing when the bundled seed version matches what is already loaded', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);

    db.prepare('UPDATE lessons SET title = ? WHERE id = ?').run('User-modified title', 'l1');
    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT title FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.title).toBe('User-modified title');
  });

  it('upserts changed content when the seed version is newer', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);

    writeSeedFile(seedDir, 'generic-a1.json', '2');
    loadSeedIfNeeded(db, seedDir);

    const meta = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as any;
    expect(meta.seed_version).toBe('2');
  });

  it('never touches profile or memory_store data', () => {
    const db = createDbClient(':memory:');
    db.prepare(`UPDATE profile SET display_name = 'Real User' WHERE id = 1`).run();
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1');
    loadSeedIfNeeded(db, seedDir);
    const profile = db.prepare('SELECT display_name FROM profile WHERE id = 1').get() as any;
    expect(profile.display_name).toBe('Real User');
  });

  it('loads a track override without altering the canonical lesson content', () => {
    const db = createDbClient(':memory:');
    const seedDir = mkdtempSync(join(tmpdir(), 'gait-seed-'));
    writeSeedFile(seedDir, 'generic-a1.json', '1', [
      { lessonId: 'l1', track: 'telc', explanation: 'TELC-specific explanation', examples: ['telc ex'] },
    ]);
    loadSeedIfNeeded(db, seedDir);

    const lesson = db.prepare('SELECT explanation FROM lessons WHERE id = ?').get('l1') as any;
    expect(lesson.explanation).toBe('Canonical explanation');
    const override = db
      .prepare('SELECT explanation FROM lesson_track_overrides WHERE lesson_id = ? AND track = ?')
      .get('l1', 'telc') as any;
    expect(override.explanation).toBe('TELC-specific explanation');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/services/curriculumSeedLoader.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 4: Wire into `app/layout.tsx`**

Modify the root layout to call the loader once per server process on import (module-level, so it runs once when the server starts, not per-request):

```tsx
import type { ReactNode } from 'react';
import { join } from 'node:path';
import { getDb } from '@/lib/db/client';
import { loadSeedIfNeeded } from '@/lib/services/curriculumSeedLoader';

loadSeedIfNeeded(getDb(), join(process.cwd(), 'data', 'curriculum-seed'));

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests across every task)

- [ ] **Step 6: Run type-check and build**

Run: `npx tsc --noEmit`
Expected: clean, zero errors

Run: `npm run build`
Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add lib/services/curriculumSeedLoader.ts lib/services/curriculumSeedLoader.test.ts app/layout.tsx
git commit -m "feat: add curriculum seed loader and wire into app startup"
```

---

## Manual Verification (after Task 16)

Not automated in this plan — check by hand:

- [ ] Set `CURRICULUM_GEN_PROVIDER`, `CURRICULUM_GEN_API_KEY`, `CURRICULUM_GEN_MODEL` env vars to a real provider, run `npm run generate-curriculum` against at least one level (consider temporarily narrowing `LEVELS`/`TRACKS` in Tasks 11-12 for a cheap smoke test before committing to a full A1–C1 × 3-track run)
- [ ] Review the validation report's flagged issues
- [ ] Start the app (`npm run dev`), confirm the seed data loads on first run

---

## Addendum: Replacing Generation with Import (2026-09-22)

This section documents what actually replaced Tasks 10–15 (the deleted AI-generation pipeline) and the original "Manual Verification" steps above, which referenced env vars (`CURRICULUM_GEN_*`) and a script (`npm run generate-curriculum`) that no longer exist. It's a record of what was done, in the order it happened, not a set of steps to re-run.

**Why:** the generation pipeline (Tasks 10–15) was built and run for a small A1 pilot. The user reviewed the self-generated content and rejected it. Real content for all 15 track×level combinations was then hand-produced outside this codebase (prompting external LLMs directly, using `docs/curriculum-content-authoring-prompt.md` as the authoring spec, with human review/editing) and handed to this session as `curricula/{generic,telc,goethe}_{A1,A2,B1,B2,C1}.yaml`.

**Reconciling the content model:** the original schema assumed one canonical `lessons` row shared across tracks via `lesson_placements`, patched per-track by `lesson_track_overrides`. Reading all 15 real files found zero shared slugs between tracks (each was authored independently) but substantial conceptual overlap once compared closely — cataloged across three review passes in `curricula/overlap-review.md` (~90 candidate cross-track matches, covering strong 1:1 equivalents down to partial/loose overlaps, explicitly flagging what was and wasn't checked). The user's decision (this session): don't merge content — import every lesson fully independently per track, and represent cross-track equivalence with a lightweight `concept_id` tag instead, to be set later via an admin UI rather than computed from the review file automatically. Full reasoning in the spec's "Cross-Track Concept Linking" section and Key Decisions Log.

**What was built, in order:**

1. **Schema** (`lib/db/schema.ts`): added `lessons.track` (required) and `lessons.concept_id` (nullable, indexed). Added a `migrateLegacyCurriculumSchema()` step that detects an app.db still on the old `lessons` shape (missing `track`) and drops+recreates only the curriculum tables (never `profile`/`provider_connections`/`memory_store`/`admin_auth`, which hold real user data) — necessary because SQLite's `CREATE TABLE IF NOT EXISTS` doesn't retroactively add columns to a table that already exists on disk, and the dev DB already had schema + pilot data on it. This whole migration is wrapped in one `db.transaction()` — an earlier unwrapped version caused a real bug: `next build`'s parallel static-page-data workers each call `getDb()`, and one worker could observe the mid-migration state (tables dropped, not yet recreated) and throw `no such table: curriculum_meta`. Wrapping in a transaction fixed it (WAL-mode readers only ever see a fully-pre- or fully-post-migration snapshot).
2. **Types** (`lib/curriculum/types.ts`): `Lesson` gained `track` and `conceptId` fields, with a doc comment explaining the completion-sharing semantics (see spec).
3. **`lib/services/curriculumSeedLoader.ts`**: rewritten — `SeedFile.lessons[]` entries now carry `track`/`conceptId`; the `overrides` array and its upsert logic were removed entirely (nothing populates `lesson_track_overrides` anymore, though the table itself stays in the schema — see below).
4. **`lib/services/curriculumService.ts`**: `getLesson()`/`getExercises()` simplified — no more override-merge or track-specific-vs-shared-exercise fallback logic, since a lesson/exercise now belongs to exactly one track by construction. Both keep their original `(lessonId, track)` signatures for API-shape compatibility with existing callers (3 API routes, the admin browse UI), even though `track` is now vestigial.
5. **`curricula/*.yaml` brought into the worktree**: these 15 files existed only as untracked files in the main repo checkout (never committed), so they were copied into this branch's `curricula/` directory so the import script has something to read.
6. **Real bug found and fixed in the source YAML**: 33 lines across 5 files (`generic_A1.yaml`, `goethe_A1.yaml`, `goethe_B1.yaml`, `goethe_C1.yaml`, `telc_C1.yaml`) had unquoted `title:` values containing a colon (e.g. `title: Modal Verbs: Können and Möchten`), which is ambiguous/invalid YAML (parses as a nested mapping). Fixed by quoting every such title.
7. **New script, `scripts/build-curriculum-seed.ts`** (`npm run build-curriculum-seed`): reads all 15 YAML files, converts each to the seed JSON shape `curriculumSeedLoader` consumes. Every lesson becomes an independent row with `concept_id: null` (nothing is merged at import time — see above). Lessons are grouped into one milestone per skill (fixed order: grammar → vocabulary → reading → listening → writing → speaking), one section each, in-file order preserved — a deliberately flat placeholder structure, not curated Milestone/Section pedagogy; refining that is left to future admin work, same as concept linking.
8. **Second real bug found and fixed**: a bare lesson `slug` is only unique within its own YAML file. Three slugs are reused across *different levels of the same track* for genuinely different lessons (`goethe-lesen-teil2-textrekonstruktion` in both B2 and C1; `telc-reading-teil3-classifieds-matching` and `telc-speaking-teil3-joint-planning` in both A2 and B1). Since `lessons.id` is a single global primary key, importing both under the bare slug would silently let the second overwrite the first. Fixed by namespacing every lesson's DB id by level (`${level}-${slug}`), applied consistently to lesson ids, placement refs, exercise-lesson refs, and prerequisite refs (which only ever point within the same file/level, so the same transform keeps them valid). Verified afterward: 303 lessons imported, 303 unique ids, 253 prerequisite edges, zero dangling references.
9. **Old generation pipeline removed**: `lib/curriculum-gen/` (all of Tasks 10–14's output) and `scripts/generate-curriculum.ts` (Task 15's output) deleted via `git rm`, plus the `generate-curriculum` npm script entry. It wasn't referenced by any live app code (routes/components), only by its own now-removed entry script, and its tests directly inserted into `lessons` without the new required `track` column — keeping it would have meant either breaking those tests or weakening the new schema (`track` nullable) to accommodate dead code. `lesson_track_overrides` was the one exception kept in the schema (empty, unpopulated) specifically to avoid also touching its remaining references.
10. **Tests updated**: `lib/db/curriculumSchema.test.ts`, `lib/services/curriculumSeedLoader.test.ts`, `lib/services/curriculumService.test.ts`, `app/api/curriculum/route.test.ts` — all rewritten/fixed for the new schema and simplified service behavior. Full suite: 33 files, 109 tests, all passing. `npm run build` succeeds.
11. **End-to-end verification**: ran the real dev server against the migrated real `~/.germanaitutor/app.db`; confirmed `/api/curriculum/tracks` lists all 3 tracks × 5 levels, `/api/curriculum/tracks/generic/A1` returns the expected 6 skill-milestones with correct lesson counts (9 grammar / 3 vocab / 2 reading / 2 listening / 1 writing / 1 speaking = 18, matching the source YAML), a sample lesson round-trips its real explanation/examples, and `/admin/curriculum` correctly redirects to `/admin/login` when unauthenticated. Confirmed the real user's `profile`/`provider_connections` rows (from Core) were untouched by the whole process.
12. **Self-inflicted data-loss incident, caught and recovered**: mid-verification, manually `rm`'d the DB's `-wal`/`-shm` files "to clean up," not realizing WAL mode can leave writes only in the WAL, not yet checkpointed into the main file — this deleted all 303 just-imported lessons (though not `profile`/`provider_connections`, which predated this session's writes and were already checkpointed). Recovered fully and losslessly by re-running the seed loader against the untouched source YAML/seed-JSON — nothing was permanently lost, but the lesson for future work: never manually delete SQLite WAL/SHM files; if a checkpoint is actually needed, use `PRAGMA wal_checkpoint`.

**What's genuinely deferred, not done:** the `/admin/curriculum` merge UI (assign a shared `concept_id` to matched cross-track lessons) does not exist yet — every imported lesson currently has `concept_id: null`. `curricula/overlap-review.md` is the candidate list for whoever builds it. No progress/completion-tracking table exists yet either (out of scope for this sub-project regardless — see spec). Milestone/section structure is the flat per-skill placeholder described above, not hand-curated pedagogy.
- [ ] Visit `/admin`, set a password, confirm login persists across a page reload
- [ ] Browse the generated curriculum via `/admin/curriculum`, spot-check content quality across a few tracks/levels/skills
- [ ] Confirm `/api/curriculum/tracks` and related routes are reachable without authentication
- [ ] Re-run the generation script with a code change to one lesson's prompt handling (or manually edit a seed file's `seedVersion`) and confirm the app picks up the update on next start without wiping existing profile/progress data
