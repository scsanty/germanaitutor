# Accounts & Hosting — Design Spec

## Overview

NaDoch! becomes multi-user, for a small invited group on the user's home server first and a public cloud deployment later. This sub-project adds:
- **accounts** through Better Auth: email and password, magic link, passkeys, Google;
- **roles**: Owner, Content admin and Student, which a user can combine;
- **invite-only sign-up**, with an open-sign-up switch for later;
- **per-user data**: progress, settings and AI keys are each user's own, while the curriculum, pools, exams and audio are shared;
- **personal BYOK**: each user brings their own AI key;
- **privacy features**: self-service export, self-service deletion, and privacy and Impressum pages;
- **a deployment**: Docker Compose on the home server, with the app, the speech sidecar, Litestream backups, and Tailscale with MagicDNS HTTPS and Funnel for `/badges/*` only.

The existing single-user data becomes the **Owner's** account at first-run setup.

### In scope

- Better Auth (in-app, SQLite through better-sqlite3), with the magic-link, passkey and Google social providers. Email verification uses the SMTP mailer (Listening).
- A **first-run setup** (`/setup`, only while no user exists): it creates the Owner with email and password, and assigns all existing per-user data to them.
- **Sign-in** at `/login`, with password, magic link, passkey or Google. **Sign-up** at `/signup?invite=<token>`, or open sign-up when it's switched on, with email verification.
- **Roles and access:**
  - Owner: users, invites, system settings (SMTP, speech, sign-up switch, badge settings, instance backup, privacy texts).
  - Content admin: curriculum, pools, exam content, review.
  - Student: learning.
  - The old single admin password is removed; the Content Admin entry depends on the role.
- **Per-user data:** a `user_id` on every per-user table, services scoped to the signed-in user, and per-user unique constraints.
- **BYOK per user:** provider connections belong to a user. A user without a working key sees AI features disabled, with a Settings link.
- **Background work:** jobs that need AI run with the key of the user who triggered them.
- **Data rights:** a personal export (zip of JSON) and account deletion. The Owner gets the instance backup and restore (the existing backup, restricted).
- **Legal:** `/privacy` and `/impressum`, public, as Markdown the Owner edits in Settings. Only essential cookies (the session), so there's no consent banner.
- **Hosting:** the app's `Dockerfile` (Next standalone), `docker-compose.yml` (app, speech, litestream, tailscale), the Litestream config (a local replica directory by default, or S3-compatible via env), the Tailscale serve and Funnel config, and a hosting guide.
- **A launch checklist** for going public: the Wortlisten copyright, the cloud target, passkey re-registration on the new domain, and the Google OAuth redirect change.

### Out of scope

- The cloud deployment itself (decided later).
- Speech usage limits (by decision, none).
- Teacher or progress-sharing features.

## Accounts

**Better Auth configuration** (`lib/auth/auth.ts`):
- the database is the app's SQLite file, with Better Auth's own tables (`user`, `session`, `account`, `verification`, and `passkey` from the plugin), created by its migration on startup;
- `emailAndPassword: { enabled: true, requireEmailVerification: true }`, with the Owner created at setup already verified;
- the plugins `magicLink({ sendMagicLink })`, `passkey({ rpID, rpName: 'NaDoch!', origin })`, and `socialProviders.google` (`clientId` and `clientSecret` from env; the button is hidden when they're unset);
- `APP_URL` (env) sets the origin, the passkey `rpID` (its hostname) and the OAuth redirect.

**Roles:** a `user_roles(user_id, role CHECK IN ('owner','content_admin','student'))` table. Every user has `student`. The first user gets `owner` and `content_admin` too.

**Helpers** (`lib/auth/session.ts`):
- `getCurrentUser(): Promise<{ id; email; name; roles: Role[] } | null>`
- `requireUser()` (401)
- `requireRole(role)` (403)

**`proxy.ts`** (Next 16's name for middleware):
- signed-out requests to app pages redirect to `/login?next=…`;
- public paths: `/login`, `/signup`, `/setup`, `/api/auth/*`, `/badges/*`, `/privacy`, `/impressum`, and static assets;
- `/setup` redirects to `/login` once any user exists;
- API routes answer 401 JSON instead of redirecting.

**Invites:** an `invites(id, token_hash, email NULL, roles JSON, created_by, expires_at, used_at, used_by)` table.
- The Owner creates invites (optional email, roles, a 7-day expiry by default), and gets a link. If an email is given and SMTP works, it's sent.
- Tokens are random, 32 bytes, stored hashed, and single-use.
- The **open sign-up switch** (`app_settings.signup_open`) allows `/signup` without an invite, with email verification required.

**User management** (Owner): the list of users (email, name, roles, last sign-in), role changes (at least one Owner must remain), disabling a user (sessions revoked, sign-in blocked), and deleting a user (as in account deletion).

## Per-user Data

- **Per-user tables** gain `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`:
  - profile and settings: `profile` (keyed by `user_id` instead of the singleton `id = 1`), `provider_connections`, `provider_usage`, `memory_store`;
  - lesson progress: `lesson_attempts`, `lesson_completions`, `exercise_srs_state`, `lesson_chat_messages`, `milestone_testouts`;
  - placement: `placement_session`, `placement_best_result`;
  - practice and Freestyle: `practice_seen`, `freestyle_sessions`, `freestyle_messages` (through the session);
  - vocabulary: `vocabulary_items`, `vocabulary_srs_state`, `vocabulary_answers`;
  - exam practice and exams: `teil_seen`, `teil_attempts`, `exam_sittings`, `level_clearances`, `certificates`;
  - speech and errors: `speech_clips`, `error_log`.
- **Per-user uniques:**
  - `profile(user_id)`;
  - `lesson_completions(user_id, lesson_id)`, `exercise_srs_state(user_id, exercise_id)`;
  - `vocabulary_items(user_id, lemma_key)`;
  - one open Freestyle session per `(user_id, mode)`, one open test-out per `(user_id, milestone_id)`;
  - `teil_seen(user_id, set_id)`, `level_clearances(user_id, track, level)`;
  - one placement session per user.
- **Shared tables** stay unscoped:
  - curriculum and pools: curriculum, `practice_exercises`, `teil_sets`, `exams`;
  - media and system: `audio_jobs` and audio files, `admin_notifications`, `app_settings`;
  - the placement exam.
- **Migration** (at first-run setup): every existing per-user row gets the Owner's id. Tables are rebuilt where a unique or primary key changes (the create-copy-drop-rename pattern, with foreign keys off, as in earlier migrations).
- **Services:** every service that touches per-user data takes `{ userId }` in its dependencies. Routes pass `(await requireUser()).id`. `isAiAvailable` and `generateWithActiveProvider` take `userId`.
- **Background worker:** it records the triggering user on jobs that need AI (exam grading retries use the sitting's user). The health check and audio rendering don't need a user.

## Data Rights and Legal

- **Export:** `GET /api/me/export` returns a zip (fflate) with one JSON file per per-user table (the user's rows) and a `README.txt`.
- **Account deletion:** `/settings` → "Delete my account", which asks for confirmation by typing the email.
  - It deletes the user, which cascades to all per-user rows, and removes their speech files.
  - Shared content they caused, such as AI pool items generated with their key, stays. It isn't attributed to them.
  - The last Owner can't delete their account.
- **Instance backup and restore:** Owner only, the existing feature (including audio).
- **Privacy and Impressum:** public pages rendering Markdown from `app_settings` (`privacy_md`, `impressum_md`). The Owner edits them in Settings with a preview. The pages show a placeholder until they're filled.

## Hosting

**`Dockerfile`** (the app): a multi-stage build, `node:22-slim`, `npm ci`, `next build` with `output: 'standalone'`, and a runtime image that runs `node server.js`, with `GAIT_DATA_DIR=/data` (a volume).

**`docker-compose.yml`** (extending the Listening file):

```yaml
services:
  app:        { build: ., environment: [APP_URL, GAIT_DATA_DIR=/data, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET], volumes: [nadoch-data:/data], depends_on: [speech] }
  speech:     { build: ./speech }
  litestream: { image: litestream/litestream:0.3, command: replicate, volumes: [nadoch-data:/data, ./deploy/litestream.yml:/etc/litestream.yml, litestream-replica:/replica] }
  tailscale:  { image: tailscale/tailscale:latest, hostname: nadoch, environment: [TS_AUTHKEY, TS_STATE_DIR=/var/lib/tailscale, TS_SERVE_CONFIG=/config/serve.json], volumes: [tailscale-state:/var/lib/tailscale, ./deploy/tailscale:/config] }
```

The app talks to the speech service at `http://speech:5002`, which is the default `speech_url` in Compose.

- **`deploy/litestream.yml`:** replicates `/data/app.db` to `/replica` (a local volume) by default. The file shows the commented S3-compatible settings, and the guide explains restoring.
- **`deploy/tailscale/serve.json`:** HTTPS on 443 proxies to `app:3000`. **Funnel** is enabled only for the `/badges` path handler (serve config `AllowFunnel` scoped to a separate path mapping). The guide gives the equivalent `tailscale serve`/`funnel` CLI commands.
- **Guide** (`docs/hosting.md`):
  - prerequisites (Docker, a Tailscale account with HTTPS and MagicDNS enabled, an auth key);
  - `.env` values;
  - first run (`/setup`);
  - setting `APP_URL` to the `https://nadoch.<tailnet>.ts.net` URL;
  - the Google OAuth redirect (`<APP_URL>/api/auth/callback/google`);
  - SMTP;
  - backups and restore;
  - updating;
  - the badge public base URL (the same ts.net URL, reachable publicly only on `/badges`).

## Launch Checklist (`docs/launch-checklist.md`)

A checklist for going public on a cloud host:
1. Resolve the Wortlisten copyright: get permission, or replace the lists with NaDoch-drafted ones.
2. Choose the cloud target, and adapt Compose (replace Tailscale with a reverse proxy and TLS, and point Litestream at object storage).
3. Passkeys are bound to the ts.net domain, so users must add new passkeys after the move. Password, magic link and Google keep working.
4. Update the Google OAuth redirect and `APP_URL`.
5. Badge URLs: keep the old ts.net badge paths redirecting (or reissue), and update `public_base_url`.
6. Review the privacy text for public users, turn on open sign-up if wanted, and check the SMTP sending limits.

## Error Handling

- **Auth errors** show clear messages: wrong password, unverified email (with "Resend"), expired invite, passkey not available on this device.
- **A disabled user** is signed out at the next request, with "This account is disabled".
- **Setup** can't run twice. A failure in the data assignment rolls back the Owner creation.

## Testing

- **Auth** (Better Auth in-memory database helpers):
  - setup creates the Owner with roles and assigns the existing rows (every per-user table's rows get the Owner id);
  - the session helpers;
  - `proxy.ts` redirects and public paths;
  - invite create, accept, expire and reuse;
  - open sign-up on and off;
  - role changes with the last-Owner guard;
  - a disabled user is blocked.
- **Isolation:** two users with separate progress, decks, Freestyle sessions, keys and exams. No route returns another user's rows. A test table-drives every per-user route.
- **BYOK:** a user without a key has AI unavailable, while another user's key is never used.
- **Data rights:** the export contains only the user's rows; deletion cascades and removes speech files; the last Owner can't be deleted.
- **Legal pages:** they're public and render the Markdown.
- **Deployment:** `docker compose config` validates, and the app image builds and starts in CI (a smoke test hits `/login`).

## Decisions (2026-09-29)

- **Sign-in:** email and password, magic link, passkeys and Google, through Better Auth.
- **Sign-up:** invite-only now, with an open-sign-up switch for the cloud.
- **Roles:** Owner, Content admin and Student, combinable. The existing data becomes the Owner's account.
- **AI keys:** personal BYOK only.
- **Storage and hosting:** SQLite with Litestream. The home server is reached over Tailscale with MagicDNS HTTPS. The cloud is decided later.
- **Speech:** no per-user limits.
- **Backups:** the instance backup is Owner-only. Students have their own export and deletion.
- **GDPR:** export, deletion, privacy and Impressum pages, and no tracking cookies.
- **Carried over:** the Wortlisten copyright before a public launch, and the HTTPS requirement for the microphone (met by Tailscale HTTPS).
