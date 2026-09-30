# Accounts & Hosting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Multi-user NaDoch!: accounts (password, magic link, passkeys, Google), roles, invites, per-user data and BYOK.
- Data rights and legal pages.
- A Docker Compose home-server deployment behind Tailscale, with Litestream backups and Funnel on `/badges`.

**Architecture:**
- **Auth:** Better Auth, on the app's SQLite, with its plugins.
- **Session helpers:** `lib/auth/session.ts` gives every route the user, and `proxy.ts` guards pages.
- **Per-user data:** every per-user table gets `user_id` through one migration at first-run setup. Services take `{ userId }`, converted domain by domain with a table-driven isolation test as the safety net.
- **Deployment:** files under `deploy/`, and a guide.

**Tech Stack:** Next.js 16 (`proxy.ts`, standalone output), better-auth (plus the passkey plugin), better-sqlite3, fflate, vitest 5, Docker, Litestream, Tailscale.

**Spec:** `docs/superpowers/specs/2026-09-29-accounts-hosting-design.md`

**Precondition:** every earlier sub-project is merged.

## Global Constraints

- **Roles:** `owner`, `content_admin` and `student`. Every user has `student`, and the first user also has `owner` and `content_admin`. At least one Owner always remains.
- **Public paths:** `/login`, `/signup`, `/setup` (only while there are no users), `/api/auth/*`, `/badges/*`, `/privacy`, `/impressum`, and static assets. Everything else needs a session. API routes answer 401 or 403 in JSON.
- **Invites:** a 32-byte random token, stored as a SHA-256 hash, single-use, with a 7-day default expiry. Open sign-up (`app_settings.signup_open`) requires email verification.
- **Per-user tables:** carry `user_id` with `ON DELETE CASCADE`. Shared tables stay unscoped, exactly as the spec lists.
- **Practice pool (Tutoring Phase 2):** `practice_seen` becomes per-user (add a `user_id` column and key it on `(user_id, practice_exercise_id)`). `practiceService.serveBatch` also needs a concurrency-safe pick once several students share a pool, because two simultaneous calls can otherwise serve the same unseen rows.
- **AI:** each user's own key. Without one, AI features are unavailable for that user, and another user's key is never used.
- **Backups:** the instance backup is Owner-only. The personal export holds only the user's rows.
- **Deletion:** account deletion cascades and removes speech files; the last Owner can't delete themselves.
- **`APP_URL`** (env) sets the auth origin, the passkey `rpID` and the OAuth redirect. `BETTER_AUTH_SECRET` is required in production.
- **Existing rules:** `res.ok` and `role="alert"`; `delayedResponse`; student text in en and de; admin in English.

## Review Focus

1. **Route isolation:** a route that forgets to scope by user returns another user's data. The table-driven isolation test covers every per-user route (Task 8).
2. **Setup races:** two `/setup` submissions at once create one Owner. The second gets "Setup is already done" (Task 1).
3. **An invite used twice:** a second sign-up with the same token is refused, even if the first sign-up is still unverified (Task 3).
4. **The last Owner:** demoting or deleting the only Owner is refused with a clear message (Task 3).
5. **Worker AI calls:** background exam grading uses the sitting user's key, never a global or first-found key (Task 7).

## Task Order

1. Auth foundation: Better Auth, roles, the setup and login pages, session helpers, `proxy.ts`
2. Magic link, passkeys, Google, and email verification
3. Invites, open sign-up, and user management
4. The per-user data migration (the schema, and assigning the existing data at setup)
5. Services per user: profile, providers, AI availability, the admin role check
6. Services per user: tutoring (tree, lessons, attempts, queue, chat, placement, test-outs, practice)
7. Services per user: Freestyle, deck, exam practice, writing, speaking, error log, level exams, certificates, and the worker
8. The isolation test over every per-user route
9. Data rights: export, account deletion, Owner-only instance backup
10. Privacy and Impressum
11. Deployment: Dockerfile, Compose, Litestream, Tailscale, and the hosting guide
12. The launch checklist

---

### Task 1: Auth foundation

**Files:**
- Create:
  - `lib/auth/auth.ts`, `lib/auth/session.ts`, `lib/auth/roles.ts`
  - `app/api/auth/[...all]/route.ts`
  - `app/setup/page.tsx`, `components/auth/SetupForm.tsx`
  - `app/login/page.tsx`, `components/auth/LoginForm.tsx`
  - `proxy.ts`
  - `lib/auth/auth.test.ts`, `proxy.test.ts`, `components/auth/auth.test.tsx`
- Modify: `package.json` (`better-auth`), `lib/db/schema.ts` (`user_roles`), `app/layout.tsx` (the shell shows the user menu), `messages/*`

**Interfaces:**
- `auth` is the Better Auth instance, with `database: getDb()` (better-sqlite3 is supported directly), `emailAndPassword` enabled, and `baseURL: process.env.APP_URL ?? 'http://localhost:3000'`. Its tables are created through `auth.$context` migrations at startup: call `getMigrations(auth.options)` and `runMigrations()` from `better-auth/db` in `lib/db/client.ts` after the app migrations.
- `getCurrentUser()` reads `auth.api.getSession({ headers: await headers() })` and joins the roles. `requireUser()` and `requireRole(role)` throw `AuthError(401 | 403)`, and `toAuthErrorResponse` maps them.
- `setupOwner({ email, password, name })` runs in one transaction. It refuses if any user exists (Review Focus 2: a `BEGIN IMMEDIATE` transaction, plus a unique check). It creates the user through `auth.api.signUpEmail`, marks the email verified, and inserts the `owner`, `content_admin` and `student` roles. Task 4 adds the data assignment.
- `proxy.ts` has a matcher for all routes except static assets. It checks the session cookie's presence (Better Auth's `getSessionCookie(request)`): pages redirect to `/login?next=…`, and APIs return 401 JSON. `/setup` is public only while no user exists; when users exist, it redirects to `/login` (checked by a cheap `GET /api/auth/setup-status` cached for 60 s in the proxy).

- [ ] **Step 1: Write the failing tests:**
  - `setupOwner` creates one Owner with three roles, and a second call (or a concurrent one) → "Setup is already done";
  - `requireRole('owner')` for a student → 403;
  - `proxy`: `/lesson/x` without a cookie → a redirect to `/login?next=%2Flesson%2Fx`; `/api/tutoring/tree` → 401; `/badges/issuer` → passes; `/privacy` → passes;
  - `LoginForm`: email and password → `authClient.signIn.email` (mocked), a wrong password shows the error;
  - `SetupForm` validates the password length (≥ 10) and the confirmation.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** The catalogs get an `auth` namespace (en and de) for the login and setup texts.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test && npm run build`.
- [ ] **Step 5: Commit:** `git commit -m "feat: add accounts with Better Auth, first-run setup, login, roles, and the page guard"`.

---

### Task 2: Magic link, passkeys, Google, and email verification

**Files:** modify `lib/auth/auth.ts` (plugins), `components/auth/LoginForm.tsx`, and create `app/verify-email/page.tsx`, `lib/auth/authClient.ts` (Better Auth React client with the passkey and magic-link client plugins), the tests, and `messages/*`.

**Behaviour:**
- **Magic link:** `sendMagicLink({ email, url })` goes through `createMailService(db)` (Listening). When SMTP isn't set, the login page hides "Email me a link".
- **Passkeys:** `passkey({ rpID: new URL(APP_URL).hostname, rpName: 'NaDoch!', origin: APP_URL })`. Profile has "Add a passkey" and a list of passkeys with remove. The login has "Sign in with a passkey".
- **Google:** enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and the button shows only then (`/api/auth/providers` tells the client).
- **Email verification:** required for password sign-ups (not for the setup Owner). The verification email goes through SMTP, and `/verify-email` handles the link and shows "Resend".

- [ ] **Steps 1–5:**
  - Tests: magic link send is called with the right email and URL; the Google button is hidden without env; passkey buttons render (WebAuthn is mocked); an unverified user sees "Verify your email" with Resend.
  - Implement, run the tests, then `git commit -m "feat: add magic links, passkeys, Google sign-in, and email verification"`.

---

### Task 3: Invites, open sign-up, and user management

**Files:**
- Create:
  - `lib/services/inviteService.ts`, `lib/services/userAdminService.ts`, and their tests
  - `app/signup/page.tsx`, `components/auth/SignupForm.tsx`
  - `app/admin/users/page.tsx`, `components/admin/UsersAdmin.tsx`
  - routes `app/api/admin/users/*`, `app/api/admin/invites/*`
- Modify: `lib/db/schema.ts` (`invites`, `user_status(user_id, disabled_at)`), `lib/auth/auth.ts` (`databaseHooks.user.create.before` checks the invite or open sign-up; a `session.create.before` hook blocks disabled users)

**Interfaces:**
- `createInvite({ email?, roles, expiresInDays = 7, createdBy })` → `{ url }`, emailed when `email` is given and SMTP works.
- `consumeInvite(token, userId)` runs in a transaction: it refuses used or expired invites and marks the invite used before the account is committed (Review Focus 3).
- `setRoles(userId, roles)` keeps `student` and refuses removing the last Owner (Review Focus 4).
- `disable(userId)` revokes sessions, and `enable(userId)`.
- `deleteUser(userId)` is shared with Task 9.
- The admin UI (Owner only): the users table (email, name, roles as checkboxes, disabled, last sign-in), **Invite** (a dialog giving a link and copy button), and the open sign-up switch.

- [ ] **Steps 1–5:**
  - Tests: invite accept, reuse refused, expired refused, a sign-up without an invite refused when sign-up is closed and allowed when open, the last Owner guard, a disabled user's session is refused, and the admin UI flows.
  - Implement, run the tests, then `git commit -m "feat: add invites, open sign-up, and user management"`.

---

### Task 4: The per-user data migration

**Files:**
- Modify: `lib/db/schema.ts` (the `user_id` columns, per-user uniques, table rebuilds), `lib/auth/auth.ts` (`setupOwner` assigns the data)
- Create: `lib/db/userScopeMigration.test.ts`

**Rules:**
- Add `user_id TEXT` to every per-user table the spec lists, so a fresh install creates the tables with it. Where a unique key or primary key must include `user_id`, rebuild the table with the rebuild helper:
  - `profile`: the singleton `id` becomes `user_id` as the primary key;
  - `lesson_completions`: `(user_id, lesson_id)`;
  - `exercise_srs_state`: `(user_id, exercise_id)`;
  - `vocabulary_items`: `(user_id, lemma_key)`;
  - `freestyle_sessions`: the unique index on `(user_id, mode)`;
  - `milestone_testouts`: the open index on `(user_id, milestone_id)`;
  - `teil_seen`: `(user_id, set_id)`;
  - `level_clearances`: `(user_id, track, level)`;
  - `placement_session` and `placement_best_result`: `user_id` as the primary key.
- The columns stay nullable until setup. `setupOwner` then runs `UPDATE <table> SET user_id = ? WHERE user_id IS NULL` for every per-user table, in the same transaction as the Owner creation.
- New rows always carry a `user_id` (enforced by the services, Tasks 5–7). A final migration step, run after setup, rebuilds each table with `NOT NULL` once no nulls remain; it runs at startup when users exist.

- [ ] **Steps 1–5:**
  - Test: an old-shape database with data in every per-user table → migrate → `setupOwner` → every row has the Owner's id; the uniques are per user (two users can complete the same lesson); and a second startup makes `user_id` `NOT NULL`.
  - Implement, run the tests, then `git commit -m "feat: add user scoping to every per-user table and assign existing data to the Owner"`.

---

### Tasks 5–7: Services per user

The same pattern applies in each task.

**The rule:**
1. Every factory `createXService(db, deps)` that reads or writes a per-user table gains `userId: string` in its `deps`. Every such query gets `AND user_id = ?` or `user_id = ?` in its inserts, and passes `userId` to nested services.
2. Every route calls `const user = await requireUser()` (or `requireRole` for admin) and passes `{ userId: user.id }`.
3. Tests create users with a new fixture, `createTestUser(db, { roles })` in `test/users.ts`, which inserts into Better Auth's `user` table and `user_roles`, and pass `userId` to the services. Route tests mock `getCurrentUser` through `vi.mock('@/lib/auth/session')`.
4. `tsc` is the guide: make `userId` a **required** field of each service's deps, so every unconverted caller fails to compile.

**Task 5: profile, providers, AI availability, admin.**
- `profileService`, `providerService`, `usageService`, `aiService` (`isAiAvailable(db, userId)`, `generateWithActiveProvider(db, request, userId)`) and `memoryStore`.
- `isAdminSessionValid()` is replaced everywhere by `requireRole('content_admin')` (admin pages and routes), and by `requireRole('owner')` for system settings, users, instance backup, badge settings and legal texts. Remove `adminAuthService`, the admin password pages and routes, the `admin_auth` table (in a migration), and the "Content Admin" condition in Settings, which now checks roles.
- Commit: `feat: scope profiles, providers, and AI to the signed-in user; roles replace the admin password`.

**Task 6: tutoring.**
- `progressService`, `levelGating`, `attemptService`, `lessonChatService`, `placementService`, `unlockService`, `testOutService`, `practiceService` (`practice_seen`), `dashboardService`, `errorLogService`.
- Commit: `feat: scope lessons, reviews, chat, placement, test-outs, and practice to the user`.

**Task 7: Freestyle, deck, exams, speech, certificates, and the worker.**
- `freestyleService`, `deckService`, `examPracticeService`, `letterGradingService`, `speechClipService` (scope names gain the user: `u:<userId>:lesson:<id>` …), `examSittingService`, `certificateService`, and the dashboard readiness and mistakes routes.
- **Worker:** exam grading retries load the sitting's `user_id` and call the graders with it (Review Focus 5). Audio rendering and the health check stay user-free.
- Commit: `feat: scope Freestyle, the deck, exam practice, level exams, speech, and certificates to the user`.

Each task ends with `npx tsc --noEmit && npm test && npm run build` green.

---

### Task 8: The isolation test over every per-user route

**Files:** create `app/api/isolation.test.ts`.

- [ ] **Step 1: Write a table-driven test.**
  - Two users, A and B, with data for A created through the services: a lesson attempt and completion, a deck word, a Freestyle session, a Teil attempt, an exam sitting, a provider connection, a chat message, a placement result, an error-log entry, and a certificate.
  - For each per-user GET route, list it in the table (tree, lesson, queue, queue count, dashboard, mistakes, readiness, flashcards, flashcard words, Freestyle overview and session, chat thread, placement, exam practice overview, level exam node, history, certificates, profile, providers, usage).
  - Call it as B, and assert no A-specific value appears in the JSON: A's word, A's message text, A's lesson id completion, A's provider label.
  - Then call the mutation routes on A's ids as B (answer an A exam attempt, delete A's speech scope, download A's certificate PDF, submit to A's test-out), and expect 404 or 403.
- [ ] **Step 2: Run it. Fix every leak at its source.**
- [ ] **Step 3: Commit:** `test: prove per-user isolation across every per-user route`.

---

### Task 9: Data rights

**Files:** create `app/api/me/export/route.ts`, `app/api/me/route.ts` (DELETE), `lib/services/accountService.ts`, and their tests; modify `components/settings/SettingsPage.tsx` ("Download my data", "Delete my account") and the backup routes (Owner only).

**Rules:**
- **Export:** a zip with `<table>.json` for each per-user table (the user's rows only) and `README.txt`, explaining the files in en and de.
- **Delete:**
  - confirmed by the typed email;
  - refused for the last Owner;
  - deletes the Better Auth user (cascading) and the speech files of the user's scopes, then signs out.
- **Instance backup and restore:** `requireRole('owner')`. Settings shows them only to the Owner.

- [ ] **Steps 1–5:**
  - Tests: the export has only the user's rows (two users); delete cascades (row counts go to 0 for that user and are unchanged for the other); the last-Owner refusal; the typed-email confirmation in the UI; a student gets 403 on the backup routes.
  - Commit: `feat: add personal data export and account deletion; restrict instance backup to the Owner`.

---

### Task 10: Privacy and Impressum

**Files:** create `app/privacy/page.tsx`, `app/impressum/page.tsx`, `components/legal/LegalPage.tsx` (Markdown rendered with `react-markdown`, without raw HTML), an Owner editor in Settings (Markdown with a preview), the routes `app/api/admin/legal/route.ts`, and the tests; add footer links (the shell and the login page).

- [ ] **Steps 1–5:**
  - Tests: the pages are public and render the Markdown; they show a placeholder when empty; the Owner saves; a student gets 403; raw `<script>` in the Markdown isn't rendered.
  - Commit: `feat: add editable privacy and Impressum pages`.

---

### Task 11: Deployment

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `deploy/litestream.yml`, `deploy/tailscale/serve.json`, `docs/hosting.md`, `.env.example`
- Modify: `docker-compose.yml`, `next.config.*` (`output: 'standalone'`), `package.json` (a `start:prod` script)

- [ ] **Step 1: Write the files as the spec describes.**
  - The `Dockerfile` is multi-stage: deps → build → runtime `node:22-slim`, copying `.next/standalone`, `.next/static`, `public` and `data`.
  - `serve.json` serves the app on `:443` and marks `AllowFunnel` for `${TS_CERT_DOMAIN}:443` on the `/badges` handler only. In Tailscale's serve config format, give `/badges` its own `Handlers` entry proxying to `http://app:3000/badges`, and enable Funnel for the host.

    Because Funnel is per host and port, put the full app on port 443 (tailnet only) and a **second port, 8443**, with only `/badges`, and enable Funnel for `:8443`. The badge `public_base_url` is then `https://nadoch.<tailnet>.ts.net:8443`. Explain this in the guide.
- [ ] **Step 2: Validate.** Run `docker compose config -q`, `docker compose build app`, and then `docker compose up -d app speech`, and check that `curl -fsS localhost:3000/login` returns HTML. Add a CI-style script, `scripts/smoke.sh`, that does these steps.
- [ ] **Step 3: Write the guide** (`docs/hosting.md`), covering:
  - prerequisites;
  - `.env` values;
  - Tailscale setup (enable HTTPS and MagicDNS; create an auth key);
  - first run and `/setup`;
  - `APP_URL`;
  - the Google OAuth redirect;
  - SMTP;
  - the badge URL on `:8443` with Funnel;
  - backups with Litestream (and how to restore: `litestream restore -o /data/app.db /replica`);
  - updating (`git pull && docker compose up -d --build`);
  - troubleshooting (the microphone needs HTTPS, the speech service health, passkeys and the domain).
- [ ] **Step 4: Commit:** `feat: add the home-server deployment with Docker Compose, Litestream, and Tailscale`.

---

### Task 12: The launch checklist

**Files:** create `docs/launch-checklist.md`, the spec's six items, each with how to check it done. Link it from `docs/hosting.md` and the Owner's admin settings page ("Before going public").

- [ ] **Step 1:** Write it. **Step 2:** Commit: `docs: add the public launch checklist`.

---

## Self-review notes (planner)

- **Spec coverage:**
  - Accounts: Tasks 1–3.
  - Per-user data: Tasks 4–8.
  - BYOK: Task 5.
  - Background work: Task 7.
  - Data rights: Task 9.
  - Legal: Task 10.
  - Hosting: Task 11.
  - Checklist: Task 12.
- **Funnel ports:** Funnel is enabled per host and port, so the badges are served on a dedicated port (8443) rather than a path-only Funnel on 443. The spec's "Funnel only `/badges/*`" holds, because port 8443 serves nothing else.
- **Mechanical conversion:** Tasks 5–7 are driven by required `userId` dependencies and `tsc`, and Task 8's isolation test is the safety net, rather than every edited line being written out here.
