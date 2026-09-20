# Core Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Core sub-project of the German AI Tutor WebApp — BYOK AI provider connections, onboarding, settings, encrypted local storage, and generic structured-memory infrastructure.

**Architecture:** Next.js 14 (App Router) app with a thin frontend and all provider/DB access happening in server-side API routes. SQLite (better-sqlite3) persists everything locally; API keys are AES-256-GCM encrypted with a locally generated master key file kept outside the DB. A provider-adapter interface abstracts Anthropic/OpenAI/Gemini/Ollama behind one contract so later sub-projects call one API regardless of active provider.

**Tech Stack:** Next.js 14.2 (App Router, TypeScript, synchronous route params), React 18, better-sqlite3, Vitest + @testing-library/react for tests, Node's built-in `crypto`/`zlib` (no extra crypto/zip dependencies).

**Spec:** `docs/superpowers/specs/2026-09-20-core-design.md`

## Global Constraints

- Local-only, single-user app — no authentication system, no multi-device sync.
- All AI provider calls and all DB access happen server-side only; the frontend never calls a provider or the DB directly.
- Support exactly four provider types in Core: `anthropic`, `openai`, `gemini`, `ollama` — no others.
- STT/TTS adapters are out of scope for Core (deferred to the Speaking sub-project).
- API keys must be AES-256-GCM encrypted at rest using a local master-key file stored outside the SQLite DB and outside any git-tracked path.
- Provider switching takes effect on the next session, not mid-session.
- Onboarding is mandatory and cannot complete without at least one successfully validated provider connection.
- The `memory_store` table is generic infrastructure only — Core must not define German-learning-specific entity types or schema (that belongs to the CEFR frameworks sub-project).
- Freestyle-mode logic itself (scoring, sessions) is out of scope for Core — only a default preference toggle lives here.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`
- Create: `app/layout.tsx`, `app/page.tsx` (placeholder, replaced in Task 21)
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm test` (Vitest) and `npm run dev` (Next.js) baseline every later task builds on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "germanaitutor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "14.2.18",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/better-sqlite3": "^7.6.11",
    "vitest": "^2.1.8",
    "@vitejs/plugin-react": "^4.3.4",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.js`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

```
# .gitignore
node_modules/
.next/
*.db
*.db-wal
*.db-shm
*.key
```

- [ ] **Step 4: Write placeholder app shell**

```tsx
// app/layout.tsx
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx
export default function Home() {
  return <p>German AI Tutor — Core scaffold</p>;
}
```

- [ ] **Step 5: Write the sanity test**

```ts
// lib/sanity.test.ts
import { describe, it, expect } from 'vitest';

describe('project scaffold', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install dependencies and run the test**

Run: `npm install && npm test`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json next.config.js vitest.config.ts vitest.setup.ts .gitignore app lib package-lock.json
git commit -m "chore: scaffold Next.js + Vitest project"
```

---

### Task 2: Shared types, SQLite schema & DB client

**Files:**
- Create: `lib/types.ts`, `lib/db/schema.ts`, `lib/db/client.ts`
- Test: `lib/db/client.test.ts`

**Interfaces:**
- Produces: `ProviderType`, `ConnectionStatus`, `Track`, `CefrLevel`, `Profile`, `ProviderConnection` types (`lib/types.ts`); `runMigrations(db)` (`lib/db/schema.ts`); `createDbClient(path)`, `getDb()`, `getDbPath()`, `closeDb()` (`lib/db/client.ts`) — every later service and route imports from here.

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama';
export type ConnectionStatus = 'valid' | 'invalid' | 'failing' | 'untested';
export type Track = 'generic' | 'telc' | 'goethe';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface ProviderConnection {
  id: number;
  providerType: ProviderType;
  label: string | null;
  ollamaHost: string | null;
  selectedModel: string | null;
  isActive: boolean;
  lastValidatedStatus: ConnectionStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface Profile {
  displayName: string;
  uiLanguage: 'en' | 'de';
  activeTrack: Track;
  activeLevel: CefrLevel;
  freestyleDefault: boolean;
  onboardingComplete: boolean;
  updatedAt: string;
}
```

- [ ] **Step 2: Write `lib/db/schema.ts`**

```ts
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL DEFAULT '',
      ui_language TEXT NOT NULL DEFAULT 'en' CHECK (ui_language IN ('en','de')),
      active_track TEXT NOT NULL DEFAULT 'generic' CHECK (active_track IN ('generic','telc','goethe')),
      active_level TEXT NOT NULL DEFAULT 'A1' CHECK (active_level IN ('A1','A2','B1','B2','C1')),
      freestyle_default INTEGER NOT NULL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_type TEXT NOT NULL CHECK (provider_type IN ('anthropic','openai','gemini','ollama')),
      label TEXT,
      encrypted_api_key TEXT,
      ollama_host TEXT,
      selected_model TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      last_validated_status TEXT NOT NULL DEFAULT 'untested' CHECK (last_validated_status IN ('valid','invalid','failing','untested')),
      last_validated_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(connection_id, date)
    );

    CREATE TABLE IF NOT EXISTS memory_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_by_provider TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_key)
    );
  `);
}
```

- [ ] **Step 3: Write `lib/db/client.ts`**

```ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { runMigrations } from './schema';

function defaultDataDir(): string {
  return process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
}

export function getDbPath(): string {
  return process.env.GAIT_DB_PATH ?? join(defaultDataDir(), 'app.db');
}

export function createDbClient(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

let singleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!singleton) {
    singleton = createDbClient(getDbPath());
  }
  return singleton;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}
```

- [ ] **Step 4: Write the failing test**

```ts
// lib/db/client.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient, getDb, closeDb } from './client';
import { runMigrations } from './schema';

describe('createDbClient', () => {
  it('creates all four Core tables', () => {
    const db = createDbClient(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['profile', 'provider_connections', 'provider_usage', 'memory_store'])
    );
    db.close();
  });

  it('runMigrations is idempotent', () => {
    const db = createDbClient(':memory:');
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('getDb reuses a singleton until closeDb is called', () => {
    process.env.GAIT_DB_PATH = ':memory:';
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
    closeDb();
    const third = getDb();
    expect(third).not.toBe(first);
    closeDb();
    delete process.env.GAIT_DB_PATH;
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/db/client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db/schema.ts lib/db/client.ts lib/db/client.test.ts
git commit -m "feat: add SQLite schema and DB client"
```

---

### Task 3: Master key file & encryption module

**Files:**
- Create: `lib/crypto/keyfile.ts`, `lib/crypto/encrypt.ts`
- Test: `lib/crypto/keyfile.test.ts`, `lib/crypto/encrypt.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses `node:crypto`/`node:fs` only).
- Produces: `defaultKeyFilePath()`, `loadOrCreateMasterKey(keyFilePath?)` (`lib/crypto/keyfile.ts`); `encrypt(plaintext, key)`, `decrypt(payload, key)` (`lib/crypto/encrypt.ts`) — used by the provider connection service (Task 9).

- [ ] **Step 1: Write `lib/crypto/keyfile.ts`**

```ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultKeyFilePath(): string {
  const dataDir = process.env.GAIT_DATA_DIR ?? join(homedir(), '.germanaitutor');
  return join(dataDir, 'master.key');
}

export function loadOrCreateMasterKey(keyFilePath: string = defaultKeyFilePath()): Buffer {
  mkdirSync(dirname(keyFilePath), { recursive: true });
  if (existsSync(keyFilePath)) {
    return Buffer.from(readFileSync(keyFilePath, 'utf8'), 'hex');
  }
  const key = randomBytes(32);
  writeFileSync(keyFilePath, key.toString('hex'), { mode: 0o600 });
  chmodSync(keyFilePath, 0o600);
  return key;
}
```

- [ ] **Step 2: Write `lib/crypto/encrypt.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decrypt(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 3: Write the failing tests**

```ts
// lib/crypto/keyfile.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateMasterKey } from './keyfile';

describe('loadOrCreateMasterKey', () => {
  it('creates a 32-byte key with restricted permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-key-'));
    const keyPath = join(dir, 'master.key');
    const key = loadOrCreateMasterKey(keyPath);
    expect(key).toHaveLength(32);
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  it('returns the same key on repeated calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gait-key-'));
    const keyPath = join(dir, 'master.key');
    const first = loadOrCreateMasterKey(keyPath);
    const second = loadOrCreateMasterKey(keyPath);
    expect(first).toEqual(second);
  });
});
```

```ts
// lib/crypto/encrypt.test.ts
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './encrypt';

describe('encrypt/decrypt', () => {
  it('round-trips a plaintext string', () => {
    const key = randomBytes(32);
    const ciphertext = encrypt('sk-ant-super-secret', key);
    expect(ciphertext).not.toContain('sk-ant-super-secret');
    expect(decrypt(ciphertext, key)).toBe('sk-ant-super-secret');
  });

  it('fails to decrypt with the wrong key', () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const ciphertext = encrypt('secret', key);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/crypto`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/crypto
git commit -m "feat: add master-key file and AES-256-GCM encryption"
```

---

### Task 4: Provider adapter interface + Anthropic adapter

**Files:**
- Create: `lib/providers/types.ts`, `lib/providers/anthropic.ts`
- Test: `lib/providers/anthropic.test.ts`

**Interfaces:**
- Produces: `FetchLike`, `ProviderCredentials`, `ModelInfo`, `TestConnectionResult`, `ChatMessage`, `GenerateTextParams`, `GenerateTextResult`, `ProviderAdapter` (`lib/providers/types.ts`) — the contract every adapter (Tasks 5-7) and the registry (Task 8) implement/consume; `createAnthropicAdapter(fetchImpl?)`.

- [ ] **Step 1: Write `lib/providers/types.ts`**

```ts
export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface ProviderCredentials {
  apiKey?: string;
  host?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateTextParams {
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
}

export interface GenerateTextResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderAdapter {
  testConnection(creds: ProviderCredentials): Promise<TestConnectionResult>;
  listModels(creds: ProviderCredentials): Promise<ModelInfo[]>;
  generateText(creds: ProviderCredentials, params: GenerateTextParams): Promise<GenerateTextResult>;
}
```

- [ ] **Step 2: Write `lib/providers/anthropic.ts`**

```ts
import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://api.anthropic.com/v1';
const KNOWN_MODELS: ModelInfo[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

export function createAnthropicAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function headers(creds: ProviderCredentials): HeadersInit {
    return {
      'x-api-key': creds.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (res.ok) return { ok: true };
      return { ok: false, error: `Anthropic returned ${res.status}` };
    },
    async listModels() {
      return KNOWN_MODELS;
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${API_BASE}/messages`, {
        method: 'POST',
        headers: headers(creds),
        body: JSON.stringify({
          model: params.model,
          system: params.systemPrompt,
          messages: params.messages,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.content?.[0]?.text ?? '',
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      };
    },
  };
}
```

- [ ] **Step 3: Write the failing test**

```ts
// lib/providers/anthropic.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAnthropicAdapter } from './anthropic';

describe('createAnthropicAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'sk-ant-test' });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }) })
    );
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'Anthropic returned 401' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'Hallo!' }], usage: { input_tokens: 10, output_tokens: 5 } }),
    });
    const adapter = createAnthropicAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'sk-ant-test' },
      { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 10, outputTokens: 5 });
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/providers/anthropic.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/providers/types.ts lib/providers/anthropic.ts lib/providers/anthropic.test.ts
git commit -m "feat: add provider adapter interface and Anthropic adapter"
```

---

### Task 5: OpenAI adapter

**Files:**
- Create: `lib/providers/openai.ts`
- Test: `lib/providers/openai.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, `FetchLike`, `ProviderCredentials`, `GenerateTextParams`, `GenerateTextResult`, `ModelInfo` from `lib/providers/types.ts` (Task 4).
- Produces: `createOpenAIAdapter(fetchImpl?)`.

- [ ] **Step 1: Write `lib/providers/openai.ts`**

```ts
import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://api.openai.com/v1';

export function createOpenAIAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function headers(creds: ProviderCredentials): HeadersInit {
    return {
      Authorization: `Bearer ${creds.apiKey ?? ''}`,
      'content-type': 'application/json',
    };
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (res.ok) return { ok: true };
      return { ok: false, error: `OpenAI returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${API_BASE}/models`, { headers: headers(creds) });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
      const data = await res.json();
      return (data.data ?? []).map((m: { id: string }) => ({ id: m.id, label: m.id }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: headers(creds),
        body: JSON.stringify({
          model: params.model,
          messages: params.systemPrompt
            ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
            : params.messages,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/providers/openai.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOpenAIAdapter } from './openai';

describe('createOpenAIAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'sk-test' });
    expect(result).toEqual({ ok: true });
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'OpenAI returned 403' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hallo!' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }),
    });
    const adapter = createOpenAIAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'sk-test' },
      { model: 'gpt-5', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 8, outputTokens: 4 });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/providers/openai.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/providers/openai.ts lib/providers/openai.test.ts
git commit -m "feat: add OpenAI provider adapter"
```

---

### Task 6: Gemini adapter

**Files:**
- Create: `lib/providers/gemini.ts`
- Test: `lib/providers/gemini.test.ts`

**Interfaces:**
- Consumes: same `lib/providers/types.ts` contract as Task 4/5.
- Produces: `createGeminiAdapter(fetchImpl?)`.

- [ ] **Step 1: Write `lib/providers/gemini.ts`**

```ts
import type {
  ProviderAdapter,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function createGeminiAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (res.ok) return { ok: true };
      return { ok: false, error: `Gemini returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${API_BASE}/models?key=${creds.apiKey ?? ''}`);
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => ({ id: m.name, label: m.name }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(
        `${API_BASE}/models/${params.model}:generateContent?key=${creds.apiKey ?? ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: params.systemPrompt
              ? { parts: [{ text: params.systemPrompt }] }
              : undefined,
            contents: params.messages.map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/providers/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createGeminiAdapter } from './gemini';

describe('createGeminiAdapter', () => {
  it('reports ok when the models endpoint returns 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'gm-test' });
    expect(result).toEqual({ ok: true });
  });

  it('reports the status code on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.testConnection({ apiKey: 'bad-key' });
    expect(result).toEqual({ ok: false, error: 'Gemini returned 400' });
  });

  it('extracts text and token usage from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hallo!' }] } }],
        usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 3 },
      }),
    });
    const adapter = createGeminiAdapter(fetchImpl);
    const result = await adapter.generateText(
      { apiKey: 'gm-test' },
      { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 6, outputTokens: 3 });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/providers/gemini.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/providers/gemini.ts lib/providers/gemini.test.ts
git commit -m "feat: add Gemini provider adapter"
```

---

### Task 7: Ollama adapter

**Files:**
- Create: `lib/providers/ollama.ts`
- Test: `lib/providers/ollama.test.ts`

**Interfaces:**
- Consumes: same `lib/providers/types.ts` contract as Task 4/5/6. Unlike the others, credentials use `host` instead of `apiKey`.
- Produces: `createOllamaAdapter(fetchImpl?)`.

- [ ] **Step 1: Write `lib/providers/ollama.ts`**

```ts
import type {
  ProviderAdapter,
  ProviderCredentials,
  ModelInfo,
  GenerateTextParams,
  GenerateTextResult,
  FetchLike,
} from './types';

export function createOllamaAdapter(fetchImpl: FetchLike = fetch): ProviderAdapter {
  function base(creds: ProviderCredentials): string {
    return creds.host ?? 'http://localhost:11434';
  }

  return {
    async testConnection(creds) {
      const res = await fetchImpl(`${base(creds)}/api/tags`);
      if (res.ok) return { ok: true };
      return { ok: false, error: `Ollama returned ${res.status}` };
    },
    async listModels(creds): Promise<ModelInfo[]> {
      const res = await fetchImpl(`${base(creds)}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      return (data.models ?? []).map((m: { name: string }) => ({ id: m.name, label: m.name }));
    },
    async generateText(creds, params: GenerateTextParams): Promise<GenerateTextResult> {
      const res = await fetchImpl(`${base(creds)}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model: params.model,
          messages: params.systemPrompt
            ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
            : params.messages,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      return {
        text: data.message?.content ?? '',
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      };
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/providers/ollama.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOllamaAdapter } from './ollama';

describe('createOllamaAdapter', () => {
  it('defaults to localhost:11434 when no host is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const adapter = createOllamaAdapter(fetchImpl);
    await adapter.testConnection({});
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:11434/api/tags');
  });

  it('uses a custom host when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    const adapter = createOllamaAdapter(fetchImpl);
    const result = await adapter.testConnection({ host: 'http://192.168.1.20:11434' });
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:11434/api/tags');
    expect(result).toEqual({ ok: false, error: 'Ollama returned 502' });
  });

  it('extracts text and eval counts from generateText', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { content: 'Hallo!' }, prompt_eval_count: 7, eval_count: 2 }),
    });
    const adapter = createOllamaAdapter(fetchImpl);
    const result = await adapter.generateText(
      {},
      { model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] }
    );
    expect(result).toEqual({ text: 'Hallo!', inputTokens: 7, outputTokens: 2 });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/providers/ollama.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/providers/ollama.ts lib/providers/ollama.test.ts
git commit -m "feat: add Ollama provider adapter"
```

---

### Task 8: Provider adapter registry

**Files:**
- Create: `lib/providers/registry.ts`
- Test: `lib/providers/registry.test.ts`

**Interfaces:**
- Consumes: `createAnthropicAdapter`, `createOpenAIAdapter`, `createGeminiAdapter`, `createOllamaAdapter` (Tasks 4-7); `ProviderType` (`lib/types.ts`, Task 2).
- Produces: `getAdapter(providerType: ProviderType): ProviderAdapter` — consumed by the provider connection service (Task 9).

- [ ] **Step 1: Write `lib/providers/registry.ts`**

```ts
import type { ProviderAdapter } from './types';
import type { ProviderType } from '../types';
import { createAnthropicAdapter } from './anthropic';
import { createOpenAIAdapter } from './openai';
import { createGeminiAdapter } from './gemini';
import { createOllamaAdapter } from './ollama';

export function getAdapter(providerType: ProviderType): ProviderAdapter {
  switch (providerType) {
    case 'anthropic':
      return createAnthropicAdapter();
    case 'openai':
      return createOpenAIAdapter();
    case 'gemini':
      return createGeminiAdapter();
    case 'ollama':
      return createOllamaAdapter();
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/providers/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getAdapter } from './registry';

describe('getAdapter', () => {
  it.each(['anthropic', 'openai', 'gemini', 'ollama'] as const)(
    'returns a full adapter for %s',
    (type) => {
      const adapter = getAdapter(type);
      expect(typeof adapter.testConnection).toBe('function');
      expect(typeof adapter.listModels).toBe('function');
      expect(typeof adapter.generateText).toBe('function');
    }
  );
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/providers/registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/providers/registry.ts lib/providers/registry.test.ts
git commit -m "feat: add provider adapter registry"
```

---

### Task 9: Provider connection service

**Files:**
- Create: `lib/services/providerService.ts`
- Test: `lib/services/providerService.test.ts`

**Interfaces:**
- Consumes: `getAdapter` (Task 8); `encrypt`/`decrypt` (Task 3); `loadOrCreateMasterKey` (Task 3); `ProviderConnection`, `ProviderType`, `ConnectionStatus` (Task 2); `createDbClient` (Task 2).
- Produces: `createProviderService(db, keyFilePath?)` returning `{ listConnections, createConnection, getConnection, updateConnection, deleteConnection, setActiveConnection, getActiveConnection, testConnection, recordFailure, recordSuccess, getDecryptedApiKey }` — consumed by the provider API routes (Task 15) and the backup/reset routes indirectly via the DB they share.

- [ ] **Step 1: Write `lib/services/providerService.ts`**

```ts
import type Database from 'better-sqlite3';
import { encrypt, decrypt } from '../crypto/encrypt';
import { loadOrCreateMasterKey } from '../crypto/keyfile';
import { getAdapter } from '../providers/registry';
import type { ProviderConnection, ProviderType, ConnectionStatus } from '../types';

interface Row {
  id: number;
  provider_type: ProviderType;
  label: string | null;
  encrypted_api_key: string | null;
  ollama_host: string | null;
  selected_model: string | null;
  is_active: number;
  last_validated_status: ConnectionStatus;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
}

function rowToConnection(row: Row): ProviderConnection {
  return {
    id: row.id,
    providerType: row.provider_type,
    label: row.label,
    ollamaHost: row.ollama_host,
    selectedModel: row.selected_model,
    isActive: row.is_active === 1,
    lastValidatedStatus: row.last_validated_status,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export function createProviderService(db: Database.Database, keyFilePath?: string) {
  const masterKey = loadOrCreateMasterKey(keyFilePath);

  function getRow(id: number): Row | undefined {
    return db.prepare('SELECT * FROM provider_connections WHERE id = ?').get(id) as Row | undefined;
  }

  function listConnections(): ProviderConnection[] {
    const rows = db.prepare('SELECT * FROM provider_connections ORDER BY created_at').all() as Row[];
    return rows.map(rowToConnection);
  }

  function getConnection(id: number): ProviderConnection | null {
    const row = getRow(id);
    return row ? rowToConnection(row) : null;
  }

  function createConnection(input: {
    providerType: ProviderType;
    label?: string;
    apiKey?: string;
    ollamaHost?: string;
    selectedModel?: string;
  }): ProviderConnection {
    const encryptedKey = input.apiKey ? encrypt(input.apiKey, masterKey) : null;
    const info = db
      .prepare(
        `INSERT INTO provider_connections (provider_type, label, encrypted_api_key, ollama_host, selected_model)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.providerType, input.label ?? null, encryptedKey, input.ollamaHost ?? null, input.selectedModel ?? null);
    return getConnection(Number(info.lastInsertRowid))!;
  }

  function updateConnection(
    id: number,
    input: Partial<{ label: string; apiKey: string; ollamaHost: string; selectedModel: string }>
  ): ProviderConnection | null {
    const existing = getRow(id);
    if (!existing) return null;
    const encryptedKey = input.apiKey !== undefined ? encrypt(input.apiKey, masterKey) : existing.encrypted_api_key;
    db.prepare(
      `UPDATE provider_connections SET label = ?, encrypted_api_key = ?, ollama_host = ?, selected_model = ? WHERE id = ?`
    ).run(
      input.label ?? existing.label,
      encryptedKey,
      input.ollamaHost ?? existing.ollama_host,
      input.selectedModel ?? existing.selected_model,
      id
    );
    return getConnection(id);
  }

  function deleteConnection(id: number): void {
    db.prepare('DELETE FROM provider_connections WHERE id = ?').run(id);
  }

  function setActiveConnection(id: number): void {
    db.prepare('UPDATE provider_connections SET is_active = 0').run();
    db.prepare('UPDATE provider_connections SET is_active = 1 WHERE id = ?').run(id);
  }

  function getActiveConnection(): ProviderConnection | null {
    const row = db.prepare('SELECT * FROM provider_connections WHERE is_active = 1').get() as Row | undefined;
    return row ? rowToConnection(row) : null;
  }

  async function testConnection(id: number): Promise<{ ok: boolean; error?: string }> {
    const row = getRow(id);
    if (!row) return { ok: false, error: 'Connection not found' };
    const adapter = getAdapter(row.provider_type);
    const creds = {
      apiKey: row.encrypted_api_key ? decrypt(row.encrypted_api_key, masterKey) : undefined,
      host: row.ollama_host ?? undefined,
    };
    const result = await adapter.testConnection(creds);
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = ?, last_validated_at = datetime('now'), last_error = ? WHERE id = ?`
    ).run(result.ok ? 'valid' : 'invalid', result.error ?? null, id);
    return result;
  }

  function recordFailure(id: number, error: string): void {
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = 'failing', last_error = ? WHERE id = ?`
    ).run(error, id);
  }

  function recordSuccess(id: number): void {
    db.prepare(
      `UPDATE provider_connections SET last_validated_status = 'valid', last_error = NULL WHERE id = ?`
    ).run(id);
  }

  function getDecryptedApiKey(id: number): string | null {
    const row = getRow(id);
    if (!row?.encrypted_api_key) return null;
    return decrypt(row.encrypted_api_key, masterKey);
  }

  return {
    listConnections,
    createConnection,
    getConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    getActiveConnection,
    testConnection,
    recordFailure,
    recordSuccess,
    getDecryptedApiKey,
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/providerService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProviderService } from './providerService';

vi.mock('../providers/registry', () => ({
  getAdapter: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    listModels: vi.fn(),
    generateText: vi.fn(),
  })),
}));

function setup() {
  const db = createDbClient(':memory:');
  const keyFilePath = join(mkdtempSync(join(tmpdir(), 'gait-')), 'master.key');
  return createProviderService(db, keyFilePath);
}

describe('providerService', () => {
  it('creates a connection with an encrypted API key and decrypts it back on demand', () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    expect(created.providerType).toBe('anthropic');
    expect(service.getDecryptedApiKey(created.id)).toBe('sk-ant-test');
  });

  it('only allows one active connection at a time', () => {
    const service = setup();
    const a = service.createConnection({ providerType: 'anthropic', apiKey: 'a' });
    const b = service.createConnection({ providerType: 'openai', apiKey: 'b' });
    service.setActiveConnection(a.id);
    service.setActiveConnection(b.id);
    expect(service.getActiveConnection()?.id).toBe(b.id);
  });

  it('updates last_validated_status after testConnection', async () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    const result = await service.testConnection(created.id);
    expect(result.ok).toBe(true);
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('valid');
  });

  it('records failures and successes', () => {
    const service = setup();
    const created = service.createConnection({ providerType: 'anthropic', apiKey: 'sk-ant-test' });
    service.recordFailure(created.id, 'quota exceeded');
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('failing');
    service.recordSuccess(created.id);
    expect(service.getConnection(created.id)?.lastValidatedStatus).toBe('valid');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/services/providerService.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/providerService.ts lib/services/providerService.test.ts
git commit -m "feat: add provider connection service"
```

---

### Task 10: Usage tracking service

**Files:**
- Create: `lib/services/usageService.ts`
- Test: `lib/services/usageService.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Task 2).
- Produces: `createUsageService(db)` returning `{ recordUsage(connectionId, requestDelta, tokenDelta, date?), getUsageForDate(connectionId, date?), getUsageHistory(connectionId, days) }` — consumed by the usage API route (Task 16).

- [ ] **Step 1: Write `lib/services/usageService.ts`**

```ts
import type Database from 'better-sqlite3';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createUsageService(db: Database.Database) {
  function recordUsage(
    connectionId: number,
    requestDelta: number,
    tokenDelta: number,
    date: string = todayISO()
  ): void {
    db.prepare(
      `INSERT INTO provider_usage (connection_id, date, request_count, token_count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(connection_id, date) DO UPDATE SET
         request_count = request_count + excluded.request_count,
         token_count = token_count + excluded.token_count`
    ).run(connectionId, date, requestDelta, tokenDelta);
  }

  function getUsageForDate(
    connectionId: number,
    date: string = todayISO()
  ): { requestCount: number; tokenCount: number } {
    const row = db
      .prepare('SELECT request_count, token_count FROM provider_usage WHERE connection_id = ? AND date = ?')
      .get(connectionId, date) as { request_count: number; token_count: number } | undefined;
    return { requestCount: row?.request_count ?? 0, tokenCount: row?.token_count ?? 0 };
  }

  function getUsageHistory(
    connectionId: number,
    days: number
  ): { date: string; requestCount: number; tokenCount: number }[] {
    const rows = db
      .prepare(
        `SELECT date, request_count, token_count FROM provider_usage WHERE connection_id = ? ORDER BY date DESC LIMIT ?`
      )
      .all(connectionId, days) as { date: string; request_count: number; token_count: number }[];
    return rows.map((r) => ({ date: r.date, requestCount: r.request_count, tokenCount: r.token_count }));
  }

  return { recordUsage, getUsageForDate, getUsageHistory };
}

export type UsageService = ReturnType<typeof createUsageService>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/usageService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createUsageService } from './usageService';

describe('usageService', () => {
  it('accumulates usage for the same connection and date', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    const service = createUsageService(db);
    service.recordUsage(1, 1, 100, '2026-09-20');
    service.recordUsage(1, 1, 50, '2026-09-20');
    expect(service.getUsageForDate(1, '2026-09-20')).toEqual({ requestCount: 2, tokenCount: 150 });
  });

  it('keeps separate totals per date', () => {
    const db = createDbClient(':memory:');
    db.exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    const service = createUsageService(db);
    service.recordUsage(1, 1, 10, '2026-09-19');
    service.recordUsage(1, 1, 20, '2026-09-20');
    expect(service.getUsageHistory(1, 30)).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/services/usageService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/usageService.ts lib/services/usageService.test.ts
git commit -m "feat: add provider usage tracking service"
```

---

### Task 11: Profile service

**Files:**
- Create: `lib/services/profileService.ts`
- Test: `lib/services/profileService.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Task 2); `Profile`, `Track`, `CefrLevel` (Task 2).
- Produces: `createProfileService(db)` returning `{ getProfile(), updateProfile(partial) }` — consumed by the profile API route (Task 14) and the home-page gate (Task 21).

- [ ] **Step 1: Write `lib/services/profileService.ts`**

```ts
import type Database from 'better-sqlite3';
import type { Profile, Track, CefrLevel } from '../types';

interface Row {
  display_name: string;
  ui_language: 'en' | 'de';
  active_track: Track;
  active_level: CefrLevel;
  freestyle_default: number;
  onboarding_complete: number;
  updated_at: string;
}

function rowToProfile(row: Row): Profile {
  return {
    displayName: row.display_name,
    uiLanguage: row.ui_language,
    activeTrack: row.active_track,
    activeLevel: row.active_level,
    freestyleDefault: row.freestyle_default === 1,
    onboardingComplete: row.onboarding_complete === 1,
    updatedAt: row.updated_at,
  };
}

export function createProfileService(db: Database.Database) {
  function ensureRow(): void {
    db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  }

  function getProfile(): Profile {
    ensureRow();
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Row;
    return rowToProfile(row);
  }

  function updateProfile(
    input: Partial<{
      displayName: string;
      uiLanguage: 'en' | 'de';
      activeTrack: Track;
      activeLevel: CefrLevel;
      freestyleDefault: boolean;
      onboardingComplete: boolean;
    }>
  ): Profile {
    ensureRow();
    const current = getProfile();
    db.prepare(
      `UPDATE profile SET display_name = ?, ui_language = ?, active_track = ?, active_level = ?, freestyle_default = ?, onboarding_complete = ?, updated_at = datetime('now') WHERE id = 1`
    ).run(
      input.displayName ?? current.displayName,
      input.uiLanguage ?? current.uiLanguage,
      input.activeTrack ?? current.activeTrack,
      input.activeLevel ?? current.activeLevel,
      (input.freestyleDefault ?? current.freestyleDefault) ? 1 : 0,
      (input.onboardingComplete ?? current.onboardingComplete) ? 1 : 0
    );
    return getProfile();
  }

  return { getProfile, updateProfile };
}

export type ProfileService = ReturnType<typeof createProfileService>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/profileService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';

describe('profileService', () => {
  it('returns default profile values before any update', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.getProfile()).toMatchObject({
      activeTrack: 'generic',
      activeLevel: 'A1',
      uiLanguage: 'en',
      onboardingComplete: false,
    });
  });

  it('persists partial updates across calls', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.updateProfile({ activeTrack: 'telc', activeLevel: 'B1' });
    const updated = service.updateProfile({ onboardingComplete: true });
    expect(updated).toMatchObject({ activeTrack: 'telc', activeLevel: 'B1', onboardingComplete: true });
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/services/profileService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/profileService.ts lib/services/profileService.test.ts
git commit -m "feat: add profile service"
```

---

### Task 12: Generic memory store service

**Files:**
- Create: `lib/services/memoryStore.ts`
- Test: `lib/services/memoryStore.test.ts`

**Interfaces:**
- Consumes: `createDbClient` (Task 2).
- Produces: `createMemoryStore(db)` returning `{ setEntity(type, key, value, updatedByProvider?), getEntity(type, key), queryEntities(type), deleteEntity(type, key) }`, and the `MemoryEntity` type. This is generic infrastructure — no German-specific entity types are defined here (future sub-projects will call `setEntity`/`queryEntities` with their own `entityType` strings).

- [ ] **Step 1: Write `lib/services/memoryStore.ts`**

```ts
import type Database from 'better-sqlite3';

export interface MemoryEntity {
  entityType: string;
  entityKey: string;
  value: unknown;
  updatedByProvider: string | null;
  updatedAt: string;
}

interface Row {
  entity_type: string;
  entity_key: string;
  value: string;
  updated_by_provider: string | null;
  updated_at: string;
}

function rowToEntity(row: Row): MemoryEntity {
  return {
    entityType: row.entity_type,
    entityKey: row.entity_key,
    value: JSON.parse(row.value),
    updatedByProvider: row.updated_by_provider,
    updatedAt: row.updated_at,
  };
}

export function createMemoryStore(db: Database.Database) {
  function setEntity(entityType: string, entityKey: string, value: unknown, updatedByProvider?: string): void {
    db.prepare(
      `INSERT INTO memory_store (entity_type, entity_key, value, updated_by_provider, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(entity_type, entity_key) DO UPDATE SET
         value = excluded.value, updated_by_provider = excluded.updated_by_provider, updated_at = excluded.updated_at`
    ).run(entityType, entityKey, JSON.stringify(value), updatedByProvider ?? null);
  }

  function getEntity(entityType: string, entityKey: string): MemoryEntity | null {
    const row = db
      .prepare('SELECT * FROM memory_store WHERE entity_type = ? AND entity_key = ?')
      .get(entityType, entityKey) as Row | undefined;
    return row ? rowToEntity(row) : null;
  }

  function queryEntities(entityType: string): MemoryEntity[] {
    const rows = db
      .prepare('SELECT * FROM memory_store WHERE entity_type = ? ORDER BY updated_at DESC')
      .all(entityType) as Row[];
    return rows.map(rowToEntity);
  }

  function deleteEntity(entityType: string, entityKey: string): void {
    db.prepare('DELETE FROM memory_store WHERE entity_type = ? AND entity_key = ?').run(entityType, entityKey);
  }

  return { setEntity, getEntity, queryEntities, deleteEntity };
}

export type MemoryStore = ReturnType<typeof createMemoryStore>;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/memoryStore.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createMemoryStore } from './memoryStore';

describe('memoryStore', () => {
  it('round-trips arbitrary JSON values by type and key', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'session-1', { summary: 'covered separable verbs' }, 'anthropic');
    const entity = store.getEntity('note', 'session-1');
    expect(entity?.value).toEqual({ summary: 'covered separable verbs' });
    expect(entity?.updatedByProvider).toBe('anthropic');
  });

  it('overwrites the value on a repeated key', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'session-1', { summary: 'v1' });
    store.setEntity('note', 'session-1', { summary: 'v2' });
    expect(store.queryEntities('note')).toHaveLength(1);
    expect(store.getEntity('note', 'session-1')?.value).toEqual({ summary: 'v2' });
  });

  it('deletes an entity', () => {
    const db = createDbClient(':memory:');
    const store = createMemoryStore(db);
    store.setEntity('note', 'a', { x: 1 });
    store.deleteEntity('note', 'a');
    expect(store.getEntity('note', 'a')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/services/memoryStore.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/memoryStore.ts lib/services/memoryStore.test.ts
git commit -m "feat: add generic structured memory store"
```

---

### Task 13: Backup export/import service

**Files:**
- Create: `lib/services/backupService.ts`
- Test: `lib/services/backupService.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses `node:fs`, `node:zlib`, `node:crypto` only); operates on raw file paths, so it's independent of the DB/keyfile modules.
- Produces: `exportBackup(dbPath, keyFilePath): Buffer`, `importBackup(archive, dbPath, keyFilePath): void`, `InvalidBackupError` — consumed by the backup API routes (Task 17).

- [ ] **Step 1: Write `lib/services/backupService.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const BACKUP_VERSION = 1;

interface BackupEnvelope {
  version: number;
  exportedAt: string;
  db: string;
  dbHash: string;
  key: string;
  keyHash: string;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function exportBackup(dbPath: string, keyFilePath: string): Buffer {
  const dbBuf = readFileSync(dbPath);
  const keyBuf = readFileSync(keyFilePath);
  const envelope: BackupEnvelope = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    db: dbBuf.toString('base64'),
    dbHash: sha256(dbBuf),
    key: keyBuf.toString('base64'),
    keyHash: sha256(keyBuf),
  };
  return gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

export class InvalidBackupError extends Error {}

export function importBackup(archive: Buffer, dbPath: string, keyFilePath: string): void {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(gunzipSync(archive).toString('utf8'));
  } catch {
    throw new InvalidBackupError('Archive is not a valid backup file');
  }
  if (envelope.version !== BACKUP_VERSION) {
    throw new InvalidBackupError(`Unsupported backup version ${envelope.version}`);
  }
  const dbBuf = Buffer.from(envelope.db, 'base64');
  const keyBuf = Buffer.from(envelope.key, 'base64');
  if (sha256(dbBuf) !== envelope.dbHash || sha256(keyBuf) !== envelope.keyHash) {
    throw new InvalidBackupError('Backup archive is corrupt (checksum mismatch)');
  }
  writeFileSync(dbPath, dbBuf);
  writeFileSync(keyFilePath, keyBuf, { mode: 0o600 });
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/services/backupService.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportBackup, importBackup, InvalidBackupError } from './backupService';

function setupFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'gait-backup-'));
  const dbPath = join(dir, 'app.db');
  const keyPath = join(dir, 'master.key');
  writeFileSync(dbPath, 'fake-db-contents');
  writeFileSync(keyPath, 'fake-key-contents');
  return { dbPath, keyPath };
}

describe('backupService', () => {
  it('round-trips db and key contents through export/import', () => {
    const { dbPath, keyPath } = setupFiles();
    const archive = exportBackup(dbPath, keyPath);

    const restoreDir = mkdtempSync(join(tmpdir(), 'gait-restore-'));
    const restoredDb = join(restoreDir, 'app.db');
    const restoredKey = join(restoreDir, 'master.key');
    importBackup(archive, restoredDb, restoredKey);

    expect(readFileSync(restoredDb, 'utf8')).toBe('fake-db-contents');
    expect(readFileSync(restoredKey, 'utf8')).toBe('fake-key-contents');
  });

  it('rejects a corrupt archive', () => {
    expect(() => importBackup(Buffer.from('not a real backup'), '/tmp/x', '/tmp/y')).toThrow(
      InvalidBackupError
    );
  });

  it('rejects a checksum mismatch', () => {
    const { dbPath, keyPath } = setupFiles();
    const archive = exportBackup(dbPath, keyPath);
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => importBackup(tampered, '/tmp/x', '/tmp/y')).toThrow();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/services/backupService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/services/backupService.ts lib/services/backupService.test.ts
git commit -m "feat: add backup export/import service"
```

---

### Task 14: API route — profile

**Files:**
- Create: `app/api/profile/route.ts`
- Test: `app/api/profile/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `closeDb` (Task 2); `createProfileService` (Task 11).
- Produces: `GET`, `PATCH` handlers at `/api/profile`.

- [ ] **Step 1: Write `app/api/profile/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';

export async function GET() {
  const service = createProfileService(getDb());
  return NextResponse.json(service.getProfile());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const service = createProfileService(getDb());
  return NextResponse.json(service.updateProfile(body));
}
```

- [ ] **Step 2: Write the failing test**

```ts
// app/api/profile/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';
import { GET, PATCH } from './route';

describe('/api/profile', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET returns the default profile', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.activeTrack).toBe('generic');
  });

  it('PATCH updates and returns the new profile', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ activeTrack: 'telc' }),
      })
    );
    const body = await res.json();
    expect(body.activeTrack).toBe('telc');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- app/api/profile/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add app/api/profile
git commit -m "feat: add profile API route"
```

---

### Task 15: API routes — provider connections

**Files:**
- Create: `app/api/providers/route.ts`, `app/api/providers/[id]/route.ts`, `app/api/providers/[id]/test/route.ts`, `app/api/providers/active/route.ts`
- Test: `app/api/providers/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `closeDb` (Task 2); `defaultKeyFilePath` (Task 3); `createProviderService` (Task 9).
- Produces: `GET`/`POST` at `/api/providers`, `PATCH`/`DELETE` at `/api/providers/[id]`, `POST` at `/api/providers/[id]/test`, `GET`/`PUT` at `/api/providers/active`.

- [ ] **Step 1: Write `app/api/providers/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function GET() {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  return NextResponse.json(service.listConnections());
}

export async function POST(request: Request) {
  const body = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const connection = service.createConnection(body);
  return NextResponse.json(connection, { status: 201 });
}
```

- [ ] **Step 2: Write `app/api/providers/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const updated = service.updateConnection(Number(params.id), body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  service.deleteConnection(Number(params.id));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Write `app/api/providers/[id]/test/route.ts` and `app/api/providers/active/route.ts`**

```ts
// app/api/providers/[id]/test/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const result = await service.testConnection(Number(params.id));
  return NextResponse.json(result);
}
```

```ts
// app/api/providers/active/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function GET() {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  return NextResponse.json(service.getActiveConnection());
}

export async function PUT(request: Request) {
  const { id } = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  service.setActiveConnection(id);
  return NextResponse.json(service.getActiveConnection());
}
```

- [ ] **Step 4: Write the failing test**

```ts
// app/api/providers/route.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDb } from '@/lib/db/client';

vi.mock('@/lib/providers/registry', () => ({
  getAdapter: () => ({
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    listModels: vi.fn(),
    generateText: vi.fn(),
  }),
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { POST as testRoute } from './[id]/test/route';
import { GET as getActive, PUT as setActive } from './active/route';

describe('/api/providers', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('creates, lists, tests, and activates a connection', async () => {
    const createRes = await POST(
      new Request('http://localhost/api/providers', {
        method: 'POST',
        body: JSON.stringify({ providerType: 'anthropic', apiKey: 'sk-ant-test' }),
      })
    );
    const created = await createRes.json();
    expect(created.providerType).toBe('anthropic');

    const listRes = await GET();
    expect(await listRes.json()).toHaveLength(1);

    const testRes = await testRoute(new Request('http://localhost'), { params: { id: String(created.id) } });
    expect((await testRes.json()).ok).toBe(true);

    await setActive(
      new Request('http://localhost/api/providers/active', {
        method: 'PUT',
        body: JSON.stringify({ id: created.id }),
      })
    );
    const activeRes = await getActive();
    expect((await activeRes.json()).id).toBe(created.id);
  });

  it('updates and deletes a connection', async () => {
    const createRes = await POST(
      new Request('http://localhost/api/providers', {
        method: 'POST',
        body: JSON.stringify({ providerType: 'openai', apiKey: 'sk-test' }),
      })
    );
    const created = await createRes.json();

    const updateRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ label: 'Work account' }) }),
      { params: { id: String(created.id) } }
    );
    expect((await updateRes.json()).label).toBe('Work account');

    const deleteRes = await DELETE(new Request('http://localhost'), { params: { id: String(created.id) } });
    expect(deleteRes.status).toBe(204);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- app/api/providers/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add app/api/providers
git commit -m "feat: add provider connection API routes"
```

---

### Task 16: API route — usage

**Files:**
- Create: `app/api/usage/route.ts`
- Test: `app/api/usage/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `closeDb` (Task 2); `createUsageService` (Task 10).
- Produces: `GET` handler at `/api/usage?connectionId=&days=`.

- [ ] **Step 1: Write `app/api/usage/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createUsageService } from '@/lib/services/usageService';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectionId = Number(url.searchParams.get('connectionId'));
  const days = Number(url.searchParams.get('days') ?? '30');
  const service = createUsageService(getDb());
  return NextResponse.json(service.getUsageHistory(connectionId, days));
}
```

- [ ] **Step 2: Write the failing test**

```ts
// app/api/usage/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

describe('/api/usage', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb().exec(`INSERT INTO provider_connections (id, provider_type) VALUES (1, 'anthropic')`);
    getDb().exec(
      `INSERT INTO provider_usage (connection_id, date, request_count, token_count) VALUES (1, '2026-09-20', 3, 500)`
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns usage history for a connection', async () => {
    const res = await GET(new Request('http://localhost/api/usage?connectionId=1&days=30'));
    const body = await res.json();
    expect(body).toEqual([{ date: '2026-09-20', requestCount: 3, tokenCount: 500 }]);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- app/api/usage/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add app/api/usage
git commit -m "feat: add usage API route"
```

---

### Task 17: API routes — backup export/import

**Files:**
- Create: `app/api/backup/export/route.ts`, `app/api/backup/import/route.ts`
- Test: `app/api/backup/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getDbPath`, `closeDb` (Task 2); `defaultKeyFilePath`, `loadOrCreateMasterKey` (Task 3); `exportBackup`, `importBackup`, `InvalidBackupError` (Task 13).
- Produces: `GET` at `/api/backup/export`, `POST` at `/api/backup/import`.

- [ ] **Step 1: Write `app/api/backup/export/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { exportBackup } from '@/lib/services/backupService';
import { getDbPath } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function GET() {
  const archive = exportBackup(getDbPath(), defaultKeyFilePath());
  return new NextResponse(archive, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="germanaitutor-backup.gaitbackup"',
    },
  });
}
```

- [ ] **Step 2: Write `app/api/backup/import/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { importBackup, InvalidBackupError } from '@/lib/services/backupService';
import { getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function POST(request: Request) {
  const arrayBuffer = await request.arrayBuffer();
  try {
    importBackup(Buffer.from(arrayBuffer), getDbPath(), defaultKeyFilePath());
    closeDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
```

- [ ] **Step 3: Write the failing test**

```ts
// app/api/backup/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { GET as exportRoute } from './export/route';
import { POST as importRoute } from './import/route';

describe('/api/backup', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb();
    loadOrCreateMasterKey();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('exports a downloadable archive and re-imports it successfully', async () => {
    const exportRes = await exportRoute();
    const archive = Buffer.from(await exportRes.arrayBuffer());
    expect(archive.length).toBeGreaterThan(0);

    const importRes = await importRoute(
      new Request('http://localhost/api/backup/import', { method: 'POST', body: archive })
    );
    expect((await importRes.json()).ok).toBe(true);
  });

  it('rejects an invalid archive on import', async () => {
    const importRes = await importRoute(
      new Request('http://localhost/api/backup/import', { method: 'POST', body: Buffer.from('garbage') })
    );
    expect(importRes.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- app/api/backup/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/backup
git commit -m "feat: add backup export/import API routes"
```

---

### Task 18: API route — reset

**Files:**
- Create: `app/api/reset/route.ts`
- Test: `app/api/reset/route.test.ts`

**Interfaces:**
- Consumes: `getDbPath`, `closeDb` (Task 2); `defaultKeyFilePath` (Task 3).
- Produces: `POST` handler at `/api/reset`.

- [ ] **Step 1: Write `app/api/reset/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { unlinkSync, existsSync } from 'node:fs';
import { getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';

export async function POST() {
  closeDb();
  const dbPath = getDbPath();
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, defaultKeyFilePath()]) {
    if (existsSync(path)) unlinkSync(path);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the failing test**

```ts
// app/api/reset/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, getDbPath, closeDb } from '@/lib/db/client';
import { defaultKeyFilePath, loadOrCreateMasterKey } from '@/lib/crypto/keyfile';
import { POST } from './route';

describe('/api/reset', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-api-'));
    getDb();
    loadOrCreateMasterKey();
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('deletes the database and master key files', async () => {
    expect(existsSync(getDbPath())).toBe(true);
    expect(existsSync(defaultKeyFilePath())).toBe(true);

    const res = await POST();
    expect((await res.json()).ok).toBe(true);
    expect(existsSync(getDbPath())).toBe(false);
    expect(existsSync(defaultKeyFilePath())).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- app/api/reset/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add app/api/reset
git commit -m "feat: add reset API route"
```

---

### Task 19: Onboarding wizard UI

**Files:**
- Create: `components/onboarding/OnboardingWizard.tsx`, `app/onboarding/page.tsx`
- Test: `components/onboarding/OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes (via `fetch`): `POST /api/providers`, `POST /api/providers/[id]/test`, `PUT /api/providers/active`, `PATCH /api/profile` (Tasks 14-15).
- Produces: `<OnboardingWizard />` component rendered at `/onboarding`.

- [ ] **Step 1: Write `components/onboarding/OnboardingWizard.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'welcome' | 'provider' | 'track' | 'language';

const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
const TRACKS = ['generic', 'telc', 'goethe'] as const;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [providerType, setProviderType] = useState<(typeof PROVIDER_TYPES)[number]>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  const [validated, setValidated] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [track, setTrack] = useState<(typeof TRACKS)[number]>('generic');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('A1');
  const [uiLanguage, setUiLanguage] = useState<'en' | 'de'>('en');
  const [saving, setSaving] = useState(false);

  async function handleConnectAndTest() {
    setSaving(true);
    setTestError(null);
    const body = providerType === 'ollama' ? { providerType, ollamaHost } : { providerType, apiKey };
    const createRes = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const created = await createRes.json();
    const testRes = await fetch(`/api/providers/${created.id}/test`, { method: 'POST' });
    const result = await testRes.json();
    setSaving(false);
    if (result.ok) {
      setValidated(true);
      await fetch('/api/providers/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id }),
      });
    } else {
      setTestError(result.error ?? 'Connection failed');
    }
  }

  async function handleFinish() {
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeTrack: track, activeLevel: level, uiLanguage, onboardingComplete: true }),
    });
    router.push('/');
  }

  if (step === 'welcome') {
    return (
      <div>
        <h1>Welcome to German AI Tutor</h1>
        <button onClick={() => setStep('provider')}>Get started</button>
      </div>
    );
  }

  if (step === 'provider') {
    return (
      <div>
        <h2>Connect an AI provider</h2>
        <select value={providerType} onChange={(e) => setProviderType(e.target.value as typeof providerType)}>
          {PROVIDER_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {providerType === 'ollama' ? (
          <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="Ollama host" />
        ) : (
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" type="password" />
        )}
        <button onClick={handleConnectAndTest} disabled={saving}>
          Test connection
        </button>
        {testError && <p role="alert">{testError}</p>}
        {validated && <p>Connected!</p>}
        <button onClick={() => setStep('track')} disabled={!validated}>
          Next
        </button>
      </div>
    );
  }

  if (step === 'track') {
    return (
      <div>
        <h2>Choose your track and level</h2>
        <select value={track} onChange={(e) => setTrack(e.target.value as typeof track)}>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={() => setStep('language')}>Next</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Choose your interface language</h2>
      <select value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value as 'en' | 'de')}>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      <button onClick={handleFinish}>Finish</button>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/onboarding/page.tsx`**

```tsx
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// components/onboarding/OnboardingWizard.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { OnboardingWizard } from './OnboardingWizard';

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps Next disabled on the provider step until the connection test succeeds', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({}) });

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(nextButton).not.toBeDisabled());
  });

  it('shows the error and keeps Next disabled when the test fails', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 1 }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: false, error: 'Anthropic returned 401' }) });

    render(<OnboardingWizard />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Anthropic returned 401'));
    expect(screen.getByText('Next')).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/onboarding app/onboarding
git commit -m "feat: add onboarding wizard"
```

---

### Task 20: Settings UI

**Files:**
- Create: `components/settings/SettingsPage.tsx`, `app/settings/page.tsx`
- Test: `components/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes (via `fetch`): `GET/PATCH /api/profile`, `GET /api/providers`, `PUT /api/providers/active`, `POST /api/providers/[id]/test`, `DELETE /api/providers/[id]`, `GET /api/backup/export`, `POST /api/backup/import`, `POST /api/reset` (Tasks 14-18). Uses `Profile`, `ProviderConnection` types (Task 2).
- Produces: `<SettingsPage />` component rendered at `/settings`.

- [ ] **Step 1: Write `components/settings/SettingsPage.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ProviderConnection, Profile } from '@/lib/types';

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then(setProfile);
    fetch('/api/providers').then((r) => r.json()).then(setConnections);
  }, []);

  async function refreshConnections() {
    const res = await fetch('/api/providers');
    setConnections(await res.json());
  }

  async function handleSetActive(id: number) {
    await fetch('/api/providers/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await refreshConnections();
  }

  async function handleRetest(id: number) {
    await fetch(`/api/providers/${id}/test`, { method: 'POST' });
    await refreshConnections();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    await refreshConnections();
  }

  async function handleProfileChange(patch: Partial<Profile>) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setProfile(await res.json());
  }

  async function handleExport() {
    const res = await fetch('/api/backup/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'germanaitutor-backup.gaitbackup';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    await fetch('/api/backup/import', { method: 'POST', body: file });
  }

  async function handleReset() {
    await fetch('/api/reset', { method: 'POST' });
    setConfirmingReset(false);
    window.location.href = '/onboarding';
  }

  if (!profile) return <p>Loading...</p>;

  return (
    <div>
      <section>
        <h2>Providers</h2>
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              {c.providerType} ({c.lastValidatedStatus}){c.isActive ? ' — active' : ''}
              <button onClick={() => handleSetActive(c.id)} disabled={c.isActive}>
                Make active
              </button>
              <button onClick={() => handleRetest(c.id)}>Re-test</button>
              <button onClick={() => handleDelete(c.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Track & level</h2>
        <select
          value={profile.activeTrack}
          onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Profile['activeTrack'] })}
        >
          <option value="generic">Generic</option>
          <option value="telc">TELC</option>
          <option value="goethe">Goethe</option>
        </select>
        <select
          value={profile.activeLevel}
          onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
        >
          {['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2>Language</h2>
        <select
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </section>

      <section>
        <h2>Freestyle mode</h2>
        <label>
          <input
            type="checkbox"
            checked={profile.freestyleDefault}
            onChange={(e) => handleProfileChange({ freestyleDefault: e.target.checked })}
          />
          Default to freestyle mode
        </label>
      </section>

      <section>
        <h2>Backup</h2>
        <button onClick={handleExport}>Export backup</button>
        <input
          type="file"
          accept=".gaitbackup"
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
        />
      </section>

      <section>
        <h2>Danger zone</h2>
        {confirmingReset ? (
          <>
            <p>This deletes all local data permanently. Are you sure?</p>
            <button onClick={handleReset}>Yes, reset everything</button>
            <button onClick={() => setConfirmingReset(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmingReset(true)}>Reset app data</button>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/settings/page.tsx`**

```tsx
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function Settings() {
  return <SettingsPage />;
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// components/settings/SettingsPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/profile') {
          return Promise.resolve({
            json: async () => ({
              displayName: '',
              uiLanguage: 'en',
              activeTrack: 'generic',
              activeLevel: 'A1',
              freestyleDefault: false,
              onboardingComplete: true,
              updatedAt: '',
            }),
          });
        }
        if (url === '/api/providers') {
          return Promise.resolve({ json: async () => [] });
        }
        return Promise.resolve({ json: async () => ({ ok: true }) });
      })
    );
  });

  it('requires confirmation before resetting app data', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText('Reset app data'));
    fireEvent.click(screen.getByText('Reset app data'));
    expect(screen.getByText(/permanently/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/api/reset', expect.anything());
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/settings/SettingsPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add components/settings app/settings
git commit -m "feat: add settings UI"
```

---

### Task 21: App shell — onboarding gate & active-provider failure banner

**Files:**
- Modify: `app/page.tsx` (replaces Task 1's placeholder)
- Create: `components/ActiveProviderBanner.tsx`
- Test: `app/page.test.tsx`, `components/ActiveProviderBanner.test.tsx`

**Interfaces:**
- Consumes: `getDb` (Task 2); `createProfileService` (Task 11); `GET /api/providers/active` (Task 15).
- Produces: the final Core home page — redirects to `/onboarding` when `profile.onboardingComplete` is false, otherwise renders the placeholder home with `<ActiveProviderBanner />`.

- [ ] **Step 1: Write `components/ActiveProviderBanner.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ProviderConnection } from '@/lib/types';

export function ActiveProviderBanner() {
  const [active, setActive] = useState<ProviderConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch('/api/providers/active');
      const data = await res.json();
      if (!cancelled) setActive(data);
    }
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!active || active.lastValidatedStatus !== 'failing') return null;

  return (
    <div role="alert">
      Your active provider ({active.providerType}) is having trouble: {active.lastError}. Visit Settings to fix it
      or switch providers.
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ActiveProviderBanner } from '@/components/ActiveProviderBanner';

export default function Home() {
  const profile = createProfileService(getDb()).getProfile();
  if (!profile.onboardingComplete) {
    redirect('/onboarding');
  }
  return (
    <div>
      <ActiveProviderBanner />
      <h1>German AI Tutor</h1>
      <p>Core platform is set up. Lesson content lands in later sub-projects.</p>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing tests**

```tsx
// components/ActiveProviderBanner.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActiveProviderBanner } from './ActiveProviderBanner';

describe('ActiveProviderBanner', () => {
  it('shows an alert when the active provider is failing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' }),
      })
    );
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded'));
  });

  it('renders nothing when the active provider is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ providerType: 'anthropic', lastValidatedStatus: 'valid', lastError: null }),
      })
    );
    render(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

```tsx
// app/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

const getProfileMock = vi.fn();
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: getProfileMock }),
}));
vi.mock('@/components/ActiveProviderBanner', () => ({ ActiveProviderBanner: () => null }));

import Home from './page';

describe('Home page', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects to onboarding when onboarding is incomplete', () => {
    getProfileMock.mockReturnValue({ onboardingComplete: false });
    Home();
    expect(redirectMock).toHaveBeenCalledWith('/onboarding');
  });

  it('renders home content when onboarding is complete', () => {
    getProfileMock.mockReturnValue({ onboardingComplete: true });
    const result = Home();
    expect(result).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/ActiveProviderBanner.test.tsx app/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests across every task)

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/ActiveProviderBanner.tsx app/page.test.tsx components/ActiveProviderBanner.test.tsx
git commit -m "feat: add onboarding gate and active-provider failure banner"
```

---

## Manual Verification (after Task 21)

Per the spec's testing section, these are not automated in Core and should be checked by hand:

- [ ] `npm run dev`, complete the onboarding wizard end-to-end with a real (or deliberately invalid) API key
- [ ] Confirm settings changes persist across an app restart (`npm run dev` stop/start)
- [ ] Confirm switching the active provider in Settings does not change behavior until the next session
- [ ] Run one real connection test against a locally running Ollama instance
- [ ] Export a backup, delete local data via Reset, re-import the backup, and confirm settings/connections are restored
