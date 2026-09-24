# Tutoring Phase 1A — Translations, Levels, Placement, Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app English/German interface text, a level-unlock model shared by all tracks, an onboarding placement test that sets the starting levels, and the admin tooling Phase 1 needs (flashcard rule, curriculum export, placement exam upload).

**Architecture:** Pure, table-testable logic lives in `lib/tutoring/` (levels, grading, placement scoring, exam file format, free-text grading prompt); DB-backed services in `lib/services/` compose it; thin Next.js routes expose the services; client components call the routes and render translated text through next-intl, whose locale comes from `profile.uiLanguage`. Plan 1B (the teaching loop) builds on the level system and graders this plan produces.

**Tech Stack:** Next.js 14.2 (App Router), React 18, TypeScript, better-sqlite3, vitest + Testing Library (jsdom), next-intl 3.x (new), fflate (new), yaml (existing).

**Spec:** `docs/superpowers/specs/2026-09-24-tutoring-section-design.md` — this plan implements its **Plan 1A** scope (Scope → "Phase 1 is implemented as two plans"). Read the spec's Level Unlocking, Placement Test, Translations, and Admin Additions sections before starting.

## Global Constraints

- All DB access happens server-side; client components only call API routes.
- Every DB-touching route and page exports `export const dynamic = 'force-dynamic'`.
- Every `/api/admin/*` route returns `401` with `{ error: 'Unauthorized' }` when `isAdminSessionValid()` is false; admin pages `redirect('/admin/login')`.
- Every client `fetch` checks `res.ok` and shows a visible error with `role="alert"` instead of hanging or silently succeeding.
- All student-facing interface text comes from `messages/en.json` / `messages/de.json` via next-intl; both catalogs have identical keys and placeholders. Admin pages stay English. Learning content (lesson text, exercises, placement questions) is never translated.
- Levels are `A1 < A2 < B1 < B2 < C1`. `profile.highest_unlocked_level` opens every level up to it in every track; A1 is always open; unlocks never go down.
- Placement scoring: a question is worth its level's points (A1 = 1, A2 = 2, B1 = 3, B2 = 4, C1 = 5); `correct` = full, `almost` = half, `wrong` = 0; only `wrong` is a mistake; the test stops at the 5th mistake, on "Beyond my knowledge", or after the last question; the threshold for a level is 75% of the maximum points of every level below it.
- Flashcard rule message, exact: `This lesson has N flashcards, which are only allowed in vocabulary lessons. Remove or change them first.` (singular: `This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.`)
- Curriculum export files are named `{track}-{level lowercase}.json`, match the existing `data/curriculum-seed/*.json` format plus a `conceptLinks` list, drop the dead `conceptId` field, and carry the current `curriculum_meta.seed_version` unchanged.
- Schema changes are data-preserving (in-place `ALTER TABLE`, never drop-and-recreate).
- Tests use real SQLite (`createDbClient(':memory:')` or a temp `GAIT_DATA_DIR`), fake AI adapters (`vi.mock` of `lib/providers/registry` or of the grading service), and — for client components with multi-step effects — timing-realistic fetch mocks from `test/delayedResponse.ts`.
- Verify every task with `npx tsc --noEmit` **and** `npm test` (vitest's transform does not type-check).

## Plan-level refinements of the spec

These settle details the spec left to the plan. They don't change any decision in the spec.

1. **Onboarding resume marker.** The spec says onboarding reopens at the placement step "if a validated provider exists". A validated provider also exists right after the provider step, before track and language are saved, so a new profile column `onboarding_choices_saved` records that the language step completed. The wizard resumes at placement only when both are true.
2. **Unlock-notice route.** `POST /api/tutoring/unlock-notice` with `{ action: 'switch' | 'dismiss' }`.
3. **Placement "no counter".** The test shows "Question n of total" (position, not a mistakes count) and never shows right/wrong or mistakes during the test.
4. **Finishing a level** needs lesson completions, which Plan 1B builds. This plan provides the unlock primitive (`unlockService.raiseUnlockedLevel`); Plan 1B calls it from its completion code.
5. **Placement exam file format.** `{ "questions": [ { "id", "level", "type", "content" } ] }`, questions listed easiest first; `content` uses the same shapes as lesson exercises.
6. **Where learners reach the notices before Plan 1B.** The tree doesn't exist yet, so the home page (`/`) shows the pending-placement banner and the unlock notice through a `HomeNotices` component that Plan 1B reuses in the tree.

## File Structure

**New — pure logic (`lib/tutoring/`)**
- `levels.ts` — level order and comparisons.
- `grading.ts` — deterministic multiple-choice and fill-blank grading; the `GradeResult` type.
- `freeTextGrading.ts` — AI prompt for free-text grading and parsing of the reply.
- `placementScoring.ts` — points, thresholds, placed level, stop rule.
- `placementExamFormat.ts` — parse/validate/serialize the exam file (JSON or YAML).
- `placementTypes.ts` — shared placement types plus request-body parsing.

**New — shared validation**
- `lib/curriculum/exerciseContentValidation.ts` — validates exercise `content` per type.

**New — services (`lib/services/`)**
- `aiService.ts` — one call to the active provider, recording usage and failures.
- `freeTextGradingService.ts` — free-text grading through `aiService`.
- `unlockService.ts` — raising unlocks and resolving the unlock notice.
- `placementService.ts` — exam storage, attempts, scoring, best result, unlocks.
- `curriculumAuditService.ts` — flashcards outside vocabulary lessons.
- `curriculumExportService.ts` — curriculum → seed JSON.

**New — routes**
- `app/api/tutoring/unlock-notice/route.ts`
- `app/api/placement/route.ts`, `start/`, `answer/`, `stop/`, `skip/`
- `app/api/admin/curriculum/flashcard-violations/route.ts`
- `app/api/admin/curriculum/export/route.ts`, `export/[track]/[level]/route.ts`
- `app/api/admin/placement-exam/route.ts`

**New — pages and components**
- `app/placement/page.tsx`, `components/placement/PlacementTest.tsx`, `components/placement/PlacementPage.tsx`
- `components/home/HomeIntro.tsx`, `components/home/HomeNotices.tsx`
- `app/admin/curriculum/flashcard-violations/page.tsx`
- `app/admin/placement-exam/page.tsx`, `components/admin/PlacementExamAdmin.tsx`

**New — translations, data, test helpers**
- `i18n/request.ts`, `messages/en.json`, `messages/de.json`, `messages/catalogs.test.ts`
- `data/placement-exam.json`
- `test/renderWithIntl.tsx`, `test/delayedResponse.ts`, `test/placementFixtures.ts`

**Modified**
- `next.config.js`, `app/layout.tsx`, `app/page.tsx`, `app/onboarding/page.tsx`
- `lib/types.ts`, `lib/db/schema.ts`, `lib/services/profileService.ts`, `app/api/profile/route.ts`
- `components/ActiveProviderBanner.tsx`, `components/onboarding/OnboardingWizard.tsx`, `components/settings/SettingsPage.tsx`
- `lib/services/lessonAdminService.ts`, `components/admin/ExerciseEditor.tsx`, `components/admin/LessonEditorForm.tsx`
- `lib/services/curriculumSeedLoader.ts`, `app/admin/curriculum/page.tsx`

---

### Task 1: next-intl setup, catalogs, and test helpers

**Files:**
- Modify: `package.json` (via npm), `next.config.js`, `app/layout.tsx`
- Create: `i18n/request.ts`, `messages/en.json`, `messages/de.json`, `messages/catalogs.test.ts`, `test/renderWithIntl.tsx`, `test/renderWithIntl.test.tsx`, `test/delayedResponse.ts`

**Interfaces:**
- Produces: `renderWithIntl(ui: ReactElement, locale?: 'en' | 'de')` from `@/test/renderWithIntl`; `delayedResponse(body, { ok?, status?, ms? })` from `@/test/delayedResponse`; the `common.loading` message key. Later tasks add namespaces to both catalogs.

- [ ] **Step 1: Install next-intl and confirm it supports Next 14**

Run: `npm install next-intl@^3.26.0`
Then run: `npm view next-intl@3.26 peerDependencies`
Expected: the `next` range includes `^14.0.0`. If it doesn't, install the newest 3.x whose `next` peer range includes 14 and use that version for the rest of this plan.

- [ ] **Step 2: Write the catalog parity test**

Create `messages/catalogs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import en from './en.json';
import de from './de.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)
  );
}

function placeholders(message: string): string[] {
  const names = [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...names, ...tags])].sort();
}

describe('message catalogs', () => {
  const enLeaves = new Map(leaves(en as Tree));
  const deLeaves = new Map(leaves(de as Tree));

  it('have exactly the same keys in English and German', () => {
    expect([...deLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('use the same placeholders and tags in both languages', () => {
    for (const [key, enMessage] of enLeaves) {
      expect({ key, placeholders: placeholders(deLeaves.get(key) ?? '') }).toEqual({
        key,
        placeholders: placeholders(enMessage),
      });
    }
  });

  it('have no empty messages', () => {
    for (const [key, message] of [...enLeaves, ...deLeaves]) {
      expect({ key, empty: message.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run messages/catalogs.test.ts`
Expected: FAIL — `./en.json` does not exist.

- [ ] **Step 4: Create the catalogs**

Create `messages/en.json`:

```json
{
  "common": {
    "loading": "Loading..."
  }
}
```

Create `messages/de.json`:

```json
{
  "common": {
    "loading": "Wird geladen …"
  }
}
```

- [ ] **Step 5: Run the parity test**

Run: `npx vitest run messages/catalogs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the test helpers**

Create `test/renderWithIntl.tsx`:

```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import de from '@/messages/de.json';

export function renderWithIntl(ui: ReactElement, locale: 'en' | 'de' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : de} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}
```

Create `test/delayedResponse.ts`:

```ts
export interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

// Resolves on a real timer so React re-renders before the response lands; an
// instantly-resolved promise hides effect-ordering bugs.
export function delayedResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; ms?: number } = {}
): Promise<FakeResponse> {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  return new Promise((resolve) =>
    setTimeout(() => resolve({ ok, status, json: async () => body }), options.ms ?? 5)
  );
}
```

Create `test/renderWithIntl.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { renderWithIntl } from './renderWithIntl';

function Probe() {
  const t = useTranslations('common');
  return <p>{t('loading')}</p>;
}

describe('renderWithIntl', () => {
  it('renders with the English catalog by default', () => {
    renderWithIntl(<Probe />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with the German catalog when asked', () => {
    renderWithIntl(<Probe />, 'de');
    expect(screen.getByText('Wird geladen …')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the helper test**

Run: `npx vitest run test/renderWithIntl.test.tsx`
Expected: PASS (2 tests).
If it fails to import `next-intl` with an ESM/"Cannot find module" error, add `server: { deps: { inline: ['next-intl'] } },` inside the `test: { ... }` block of `vitest.config.ts` and re-run.

- [ ] **Step 8: Add the request config**

Create `i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';

// The interface language is a profile setting, not a URL segment.
export default getRequestConfig(async () => {
  const locale = createProfileService(getDb()).getProfile().uiLanguage;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});
```

Replace `next.config.js` with:

```js
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withNextIntl(nextConfig);
```

Replace `app/layout.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { getDb } from '@/lib/db/client';
import { loadSeedIfNeeded } from '@/lib/services/curriculumSeedLoader';

loadSeedIfNeeded(getDb(), join(process.cwd(), 'data', 'curriculum-seed'));

// The locale is read from the database, so no page may be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Verify types, tests, and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json next.config.js app/layout.tsx i18n messages test vitest.config.ts
git commit -m "feat: add next-intl with profile-driven locale and en/de catalogs"
```

---

### Task 2: Translate the provider banner and the home page

**Files:**
- Modify: `components/ActiveProviderBanner.tsx`, `components/ActiveProviderBanner.test.tsx`, `app/page.tsx`, `app/page.test.tsx`, `messages/en.json`, `messages/de.json`
- Create: `components/home/HomeIntro.tsx`, `components/home/HomeIntro.test.tsx`

**Interfaces:**
- Consumes: `renderWithIntl` (Task 1).
- Produces: `HomeIntro` component; `home` and `banner` catalog namespaces.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add these top-level keys next to `common`:

```json
  "banner": {
    "providerTrouble": "Your active provider ({provider}) is having trouble: {error}. <link>Visit Settings</link> to fix it or switch providers."
  },
  "home": {
    "title": "German AI Tutor",
    "intro": "Your lessons will appear here soon.",
    "settings": "Settings"
  }
```

In `messages/de.json`, add:

```json
  "banner": {
    "providerTrouble": "Dein aktiver KI-Anbieter ({provider}) hat Probleme: {error}. <link>Öffne die Einstellungen</link>, um das Problem zu beheben oder den Anbieter zu wechseln."
  },
  "home": {
    "title": "German AI Tutor",
    "intro": "Deine Lektionen erscheinen bald hier.",
    "settings": "Einstellungen"
  }
```

- [ ] **Step 2: Update the banner tests (they fail until Step 4)**

In `components/ActiveProviderBanner.test.tsx`:
- Replace the first import line with `import { screen, waitFor } from '@testing-library/react';` and add `import { renderWithIntl } from '@/test/renderWithIntl';`.
- Replace every `render(<ActiveProviderBanner />);` with `renderWithIntl(<ActiveProviderBanner />);`.
- Replace the `stubActive` body with:

```ts
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => connection }));
```

- Add these tests before the final `});`:

```tsx
  it('shows the alert in German when the UI language is German', async () => {
    stubActive({ providerType: 'anthropic', lastValidatedStatus: 'failing', lastError: 'quota exceeded' });
    renderWithIntl(<ActiveProviderBanner />, 'de');
    const link = await screen.findByRole('link', { name: 'Öffne die Einstellungen' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders nothing when the status request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderWithIntl(<ActiveProviderBanner />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify the German test fails**

Run: `npx vitest run components/ActiveProviderBanner.test.tsx`
Expected: FAIL — the German link text isn't found (the banner still renders hard-coded English).

- [ ] **Step 4: Translate the banner**

Replace `components/ActiveProviderBanner.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ProviderConnection } from '@/lib/types';

export function ActiveProviderBanner() {
  const t = useTranslations('banner');
  const [active, setActive] = useState<ProviderConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch('/api/providers/active');
      if (!res.ok) return;
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

  // 'invalid' comes from a failed re-test in Settings, 'failing' from a runtime
  // failure recorded by providerService.recordFailure — both need the banner.
  if (!active || (active.lastValidatedStatus !== 'invalid' && active.lastValidatedStatus !== 'failing')) {
    return null;
  }

  return (
    <div role="alert">
      {t.rich('providerTrouble', {
        provider: active.providerType,
        error: active.lastError ?? '',
        link: (chunks) => <Link href="/settings">{chunks}</Link>,
      })}
    </div>
  );
}
```

- [ ] **Step 5: Write the HomeIntro test**

Create `components/home/HomeIntro.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { HomeIntro } from './HomeIntro';

describe('HomeIntro', () => {
  it('renders the title, intro and a Settings link in English', () => {
    renderWithIntl(<HomeIntro />);
    expect(screen.getByRole('heading', { name: 'German AI Tutor' })).toBeInTheDocument();
    expect(screen.getByText('Your lessons will appear here soon.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders in German', () => {
    renderWithIntl(<HomeIntro />, 'de');
    expect(screen.getByText('Deine Lektionen erscheinen bald hier.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run components/home/HomeIntro.test.tsx`
Expected: FAIL — `./HomeIntro` does not exist.

- [ ] **Step 7: Create HomeIntro and use it on the home page**

Create `components/home/HomeIntro.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function HomeIntro() {
  const t = useTranslations('home');
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <nav>
        <Link href="/settings">{t('settings')}</Link>
      </nav>
    </div>
  );
}
```

Replace `app/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { ActiveProviderBanner } from '@/components/ActiveProviderBanner';
import { HomeIntro } from '@/components/home/HomeIntro';

// Reads the DB on every request; without this Next would evaluate it at build
// time and freeze the onboarding gate into the static output.
export const dynamic = 'force-dynamic';

export default function Home() {
  const profile = createProfileService(getDb()).getProfile();
  if (!profile.onboardingComplete) {
    redirect('/onboarding');
  }
  return (
    <div>
      <ActiveProviderBanner />
      <HomeIntro />
    </div>
  );
}
```

In `app/page.test.tsx`, add after the existing `ActiveProviderBanner` mock:

```ts
vi.mock('@/components/home/HomeIntro', () => ({ HomeIntro: () => null }));
```

- [ ] **Step 8: Verify**

Run: `npx vitest run components/ActiveProviderBanner.test.tsx components/home/HomeIntro.test.tsx app/page.test.tsx messages/catalogs.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/ActiveProviderBanner.tsx components/ActiveProviderBanner.test.tsx components/home app/page.tsx app/page.test.tsx messages
git commit -m "feat: translate the provider banner and home page"
```

---

### Task 3: Level helpers, profile level columns, and the level lock

**Files:**
- Create: `lib/tutoring/levels.ts`, `lib/tutoring/levels.test.ts`, `lib/db/profileLevelMigration.test.ts`
- Modify: `lib/types.ts`, `lib/db/schema.ts`, `lib/services/profileService.ts`, `lib/services/profileService.test.ts`, `app/api/profile/route.ts`, `app/api/profile/route.test.ts`

**Interfaces:**
- Produces (`@/lib/tutoring/levels`): `LEVELS: readonly CefrLevel[]`, `isCefrLevel(v: unknown): v is CefrLevel`, `levelIndex(l): number`, `isAtOrBelow(level, ceiling): boolean`, `nextLevel(l): CefrLevel | null`, `higherLevel(a, b): CefrLevel`, `levelsUpTo(ceiling): CefrLevel[]`.
- Produces (`@/lib/types`): `PlacementStatus = 'pending' | 'skipped' | 'taken'`; `Profile` gains `highestUnlockedLevel: CefrLevel`, `placementStatus: PlacementStatus`, `unlockNoticeLevel: CefrLevel | null`, `onboardingChoicesSaved: boolean`.
- Produces (`@/lib/services/profileService`): `LockedLevelError`; `ProfileUpdate`; `LevelStateUpdate`; service method `writeLevelState(update: LevelStateUpdate): Profile`. `updateProfile` now throws `LockedLevelError` for a level above `highestUnlockedLevel` and accepts `onboardingChoicesSaved`.

- [ ] **Step 1: Write the level helper tests**

Create `lib/tutoring/levels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LEVELS, isCefrLevel, levelIndex, isAtOrBelow, nextLevel, higherLevel, levelsUpTo } from './levels';

describe('levels', () => {
  it('orders levels from A1 to C1', () => {
    expect(LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
    expect(levelIndex('A1')).toBe(0);
    expect(levelIndex('C1')).toBe(4);
  });

  it('recognises CEFR levels', () => {
    expect(isCefrLevel('B2')).toBe(true);
    expect(isCefrLevel('C2')).toBe(false);
    expect(isCefrLevel(3)).toBe(false);
  });

  it('compares a level against a ceiling', () => {
    expect(isAtOrBelow('A2', 'B1')).toBe(true);
    expect(isAtOrBelow('B1', 'B1')).toBe(true);
    expect(isAtOrBelow('B2', 'B1')).toBe(false);
  });

  it('finds the next level, and none after C1', () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('C1')).toBeNull();
  });

  it('picks the higher of two levels', () => {
    expect(higherLevel('A2', 'B1')).toBe('B1');
    expect(higherLevel('C1', 'A1')).toBe('C1');
  });

  it('lists every level up to a ceiling', () => {
    expect(levelsUpTo('B1')).toEqual(['A1', 'A2', 'B1']);
    expect(levelsUpTo('A1')).toEqual(['A1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/tutoring/levels.test.ts`
Expected: FAIL — `./levels` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/tutoring/levels.ts`:

```ts
import type { CefrLevel } from '../types';

export const LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function levelIndex(level: CefrLevel): number {
  return LEVELS.indexOf(level);
}

export function isAtOrBelow(level: CefrLevel, ceiling: CefrLevel): boolean {
  return levelIndex(level) <= levelIndex(ceiling);
}

export function nextLevel(level: CefrLevel): CefrLevel | null {
  return LEVELS[levelIndex(level) + 1] ?? null;
}

export function higherLevel(a: CefrLevel, b: CefrLevel): CefrLevel {
  return levelIndex(a) >= levelIndex(b) ? a : b;
}

export function levelsUpTo(ceiling: CefrLevel): CefrLevel[] {
  return LEVELS.filter((level) => isAtOrBelow(level, ceiling));
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run lib/tutoring/levels.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the migration and profile tests**

Create `lib/db/profileLevelMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './schema';
import { createDbClient } from './client';
import { createProfileService } from '../services/profileService';

describe('profile level migration', () => {
  it('adds the level columns and resets an existing self-selected level to A1', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT NOT NULL DEFAULT '',
        ui_language TEXT NOT NULL DEFAULT 'en',
        active_track TEXT NOT NULL DEFAULT 'generic',
        active_level TEXT NOT NULL DEFAULT 'A1',
        freestyle_default INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO profile (id, active_track, active_level, onboarding_complete) VALUES (1, 'goethe', 'B1', 1);
    `);

    runMigrations(db);

    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    expect(row).toMatchObject({
      active_track: 'goethe',
      active_level: 'A1',
      onboarding_complete: 1,
      highest_unlocked_level: 'A1',
      placement_status: 'pending',
      unlock_notice_level: null,
      onboarding_choices_saved: 0,
    });
  });

  it('does not reset a profile that already has the columns', () => {
    const db = createDbClient(':memory:');
    createProfileService(db).writeLevelState({ highestUnlockedLevel: 'B1', activeLevel: 'B1' });

    runMigrations(db);

    expect(createProfileService(db).getProfile()).toMatchObject({ activeLevel: 'B1', highestUnlockedLevel: 'B1' });
  });
});
```

Replace `lib/services/profileService.test.ts` with:

```ts
// lib/services/profileService.test.ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService, LockedLevelError } from './profileService';

describe('profileService', () => {
  it('returns default profile values before any update', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.getProfile()).toMatchObject({
      activeTrack: 'generic',
      activeLevel: 'A1',
      uiLanguage: 'en',
      onboardingComplete: false,
      highestUnlockedLevel: 'A1',
      placementStatus: 'pending',
      unlockNoticeLevel: null,
      onboardingChoicesSaved: false,
    });
  });

  it('persists partial updates across calls', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.writeLevelState({ highestUnlockedLevel: 'B1' });
    service.updateProfile({ activeTrack: 'telc', activeLevel: 'B1' });
    const updated = service.updateProfile({ onboardingComplete: true });
    expect(updated).toMatchObject({ activeTrack: 'telc', activeLevel: 'B1', onboardingComplete: true });
  });

  it('rejects switching to a level above the highest unlocked one', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(() => service.updateProfile({ activeLevel: 'A2' })).toThrow(LockedLevelError);
    expect(service.getProfile().activeLevel).toBe('A1');
  });

  it('ignores level-state fields sent through updateProfile', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.updateProfile({ highestUnlockedLevel: 'C1', placementStatus: 'taken' } as never);
    expect(service.getProfile()).toMatchObject({ highestUnlockedLevel: 'A1', placementStatus: 'pending' });
  });

  it('writes level state directly and can clear the unlock notice', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    service.writeLevelState({
      highestUnlockedLevel: 'B2',
      activeLevel: 'B1',
      placementStatus: 'taken',
      unlockNoticeLevel: 'B2',
    });
    expect(service.getProfile()).toMatchObject({
      highestUnlockedLevel: 'B2',
      activeLevel: 'B1',
      placementStatus: 'taken',
      unlockNoticeLevel: 'B2',
    });

    service.writeLevelState({ unlockNoticeLevel: null });
    expect(service.getProfile()).toMatchObject({ unlockNoticeLevel: null, highestUnlockedLevel: 'B2', activeLevel: 'B1' });
  });

  it('stores that the onboarding choices were saved', () => {
    const db = createDbClient(':memory:');
    const service = createProfileService(db);
    expect(service.updateProfile({ onboardingChoicesSaved: true }).onboardingChoicesSaved).toBe(true);
  });
});
```

In `app/api/profile/route.test.ts`, add these imports at the top:

```ts
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
```

(`closeDb` is already imported from `@/lib/db/client`; merge the two into one import line.) Add these tests before the final `});`:

```ts
  it('PATCH rejects a locked level with 400', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'B2' }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Level B2 is locked' });
  });

  it('PATCH accepts an unlocked level', async () => {
    createProfileService(getDb()).writeLevelState({ highestUnlockedLevel: 'B2' });
    const res = await PATCH(
      new Request('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify({ activeLevel: 'B2' }) })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).activeLevel).toBe('B2');
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run lib/db/profileLevelMigration.test.ts lib/services/profileService.test.ts app/api/profile/route.test.ts`
Expected: FAIL — `writeLevelState` and `LockedLevelError` don't exist.

- [ ] **Step 7: Extend the Profile type**

In `lib/types.ts`, add above `export interface Profile`:

```ts
export type PlacementStatus = 'pending' | 'skipped' | 'taken';
```

and replace the `Profile` interface with:

```ts
export interface Profile {
  displayName: string;
  uiLanguage: 'en' | 'de';
  activeTrack: Track;
  activeLevel: CefrLevel;
  freestyleDefault: boolean;
  onboardingComplete: boolean;
  highestUnlockedLevel: CefrLevel;
  placementStatus: PlacementStatus;
  unlockNoticeLevel: CefrLevel | null;
  onboardingChoicesSaved: boolean;
  updatedAt: string;
}
```

- [ ] **Step 8: Add the columns to the schema**

In `lib/db/schema.ts`, inside `createTablesIfMissing`, replace the `profile` table definition with:

```sql
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL DEFAULT '',
      ui_language TEXT NOT NULL DEFAULT 'en' CHECK (ui_language IN ('en','de')),
      active_track TEXT NOT NULL DEFAULT 'generic' CHECK (active_track IN ('generic','telc','goethe')),
      active_level TEXT NOT NULL DEFAULT 'A1' CHECK (active_level IN ('A1','A2','B1','B2','C1')),
      freestyle_default INTEGER NOT NULL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      highest_unlocked_level TEXT NOT NULL DEFAULT 'A1' CHECK (highest_unlocked_level IN ('A1','A2','B1','B2','C1')),
      placement_status TEXT NOT NULL DEFAULT 'pending' CHECK (placement_status IN ('pending','skipped','taken')),
      unlock_notice_level TEXT CHECK (unlock_notice_level IN ('A2','B1','B2','C1')),
      onboarding_choices_saved INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

Add this function above `runMigrations`:

```ts
/**
 * Adds the level-unlocking columns to a profile created before the placement test existed.
 * That profile self-selected its level in onboarding; per the Tutoring spec it restarts at A1
 * and is prompted for the placement test. Fresh databases already have the columns.
 */
function migrateProfileLevelColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
  if (columns.some((c) => c.name === 'placement_status')) return;

  db.exec(`
    ALTER TABLE profile ADD COLUMN highest_unlocked_level TEXT NOT NULL DEFAULT 'A1'
      CHECK (highest_unlocked_level IN ('A1','A2','B1','B2','C1'));
    ALTER TABLE profile ADD COLUMN placement_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (placement_status IN ('pending','skipped','taken'));
    ALTER TABLE profile ADD COLUMN unlock_notice_level TEXT
      CHECK (unlock_notice_level IN ('A2','B1','B2','C1'));
    ALTER TABLE profile ADD COLUMN onboarding_choices_saved INTEGER NOT NULL DEFAULT 0;
    UPDATE profile SET active_level = 'A1' WHERE id = 1;
  `);
}
```

In `runMigrations`, add `migrateProfileLevelColumns(db);` as the last line inside the `db.transaction(() => { ... })` callback.

- [ ] **Step 9: Rewrite profileService**

Replace `lib/services/profileService.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { Profile, Track, CefrLevel, PlacementStatus } from '../types';
import { isAtOrBelow } from '../tutoring/levels';

interface Row {
  display_name: string;
  ui_language: 'en' | 'de';
  active_track: Track;
  active_level: CefrLevel;
  freestyle_default: number;
  onboarding_complete: number;
  highest_unlocked_level: CefrLevel;
  placement_status: PlacementStatus;
  unlock_notice_level: CefrLevel | null;
  onboarding_choices_saved: number;
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
    highestUnlockedLevel: row.highest_unlocked_level,
    placementStatus: row.placement_status,
    unlockNoticeLevel: row.unlock_notice_level,
    onboardingChoicesSaved: row.onboarding_choices_saved === 1,
    updatedAt: row.updated_at,
  };
}

export class LockedLevelError extends Error {}

export interface ProfileUpdate {
  displayName?: string;
  uiLanguage?: 'en' | 'de';
  activeTrack?: Track;
  activeLevel?: CefrLevel;
  freestyleDefault?: boolean;
  onboardingComplete?: boolean;
  onboardingChoicesSaved?: boolean;
}

export interface LevelStateUpdate {
  activeLevel?: CefrLevel;
  highestUnlockedLevel?: CefrLevel;
  placementStatus?: PlacementStatus;
  unlockNoticeLevel?: CefrLevel | null;
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

  function updateProfile(input: ProfileUpdate): Profile {
    ensureRow();
    const current = getProfile();
    if (input.activeLevel !== undefined && !isAtOrBelow(input.activeLevel, current.highestUnlockedLevel)) {
      throw new LockedLevelError(`Level ${input.activeLevel} is locked`);
    }
    db.prepare(
      `UPDATE profile SET display_name = ?, ui_language = ?, active_track = ?, active_level = ?, freestyle_default = ?,
         onboarding_complete = ?, onboarding_choices_saved = ?, updated_at = datetime('now') WHERE id = 1`
    ).run(
      input.displayName ?? current.displayName,
      input.uiLanguage ?? current.uiLanguage,
      input.activeTrack ?? current.activeTrack,
      input.activeLevel ?? current.activeLevel,
      (input.freestyleDefault ?? current.freestyleDefault) ? 1 : 0,
      (input.onboardingComplete ?? current.onboardingComplete) ? 1 : 0,
      (input.onboardingChoicesSaved ?? current.onboardingChoicesSaved) ? 1 : 0
    );
    return getProfile();
  }

  // Level state changes only through the unlock and placement services, never a client PATCH.
  function writeLevelState(update: LevelStateUpdate): Profile {
    ensureRow();
    const current = getProfile();
    db.prepare(
      `UPDATE profile SET active_level = ?, highest_unlocked_level = ?, placement_status = ?, unlock_notice_level = ?,
         updated_at = datetime('now') WHERE id = 1`
    ).run(
      update.activeLevel ?? current.activeLevel,
      update.highestUnlockedLevel ?? current.highestUnlockedLevel,
      update.placementStatus ?? current.placementStatus,
      'unlockNoticeLevel' in update ? (update.unlockNoticeLevel ?? null) : current.unlockNoticeLevel
    );
    return getProfile();
  }

  return { getProfile, updateProfile, writeLevelState };
}

export type ProfileService = ReturnType<typeof createProfileService>;
```

- [ ] **Step 10: Map the lock error in the route**

Replace `app/api/profile/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProfileService, LockedLevelError } from '@/lib/services/profileService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createProfileService(getDb());
  return NextResponse.json(service.getProfile());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const service = createProfileService(getDb());
  try {
    return NextResponse.json(service.updateProfile(body));
  } catch (err) {
    if (err instanceof LockedLevelError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
```

- [ ] **Step 11: Verify**

Run: `npx vitest run lib/tutoring/levels.test.ts lib/db/profileLevelMigration.test.ts lib/services/profileService.test.ts app/api/profile/route.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass. (`components/settings/SettingsPage.test.tsx` still passes: its `PROFILE` fixture is a partial object and its level select is untouched until Task 15.)

- [ ] **Step 12: Commit**

```bash
git add lib/tutoring/levels.ts lib/tutoring/levels.test.ts lib/db lib/types.ts lib/services/profileService.ts lib/services/profileService.test.ts app/api/profile
git commit -m "feat: add unlocked-level profile state and lock the active level to it"
```

---

### Task 4: Unlock service and the unlock-notice route

**Files:**
- Create: `lib/services/unlockService.ts`, `lib/services/unlockService.test.ts`, `app/api/tutoring/unlock-notice/route.ts`, `app/api/tutoring/unlock-notice/route.test.ts`

**Interfaces:**
- Consumes: `createProfileService(db).writeLevelState/getProfile`, `levels` helpers (Task 3).
- Produces: `createUnlockService(db)` with `isLevelUnlocked(level: CefrLevel): boolean`, `raiseUnlockedLevel(level: CefrLevel, options: { notify: boolean }): Profile`, `resolveUnlockNotice(action: 'switch' | 'dismiss'): Profile`. Plan 1B calls `raiseUnlockedLevel(next, { notify: true })` when a level is finished.

- [ ] **Step 1: Write the service tests**

Create `lib/services/unlockService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

function setup() {
  const db = createDbClient(':memory:');
  return { profiles: createProfileService(db), unlocks: createUnlockService(db) };
}

describe('unlockService', () => {
  it('treats every level up to the highest unlocked one as unlocked', () => {
    const { profiles, unlocks } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'A2' });
    expect(unlocks.isLevelUnlocked('A1')).toBe(true);
    expect(unlocks.isLevelUnlocked('A2')).toBe(true);
    expect(unlocks.isLevelUnlocked('B1')).toBe(false);
  });

  it('raises the unlocked level and records a notice when asked', () => {
    const { unlocks } = setup();
    const profile = unlocks.raiseUnlockedLevel('A2', { notify: true });
    expect(profile).toMatchObject({ highestUnlockedLevel: 'A2', unlockNoticeLevel: 'A2', activeLevel: 'A1' });
  });

  it('raises without a notice when notify is false', () => {
    const { unlocks } = setup();
    expect(unlocks.raiseUnlockedLevel('B1', { notify: false })).toMatchObject({
      highestUnlockedLevel: 'B1',
      unlockNoticeLevel: null,
    });
  });

  it('never lowers the unlocked level', () => {
    const { profiles, unlocks } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'B2' });
    expect(unlocks.raiseUnlockedLevel('A2', { notify: true })).toMatchObject({
      highestUnlockedLevel: 'B2',
      unlockNoticeLevel: null,
    });
  });

  it('keeps the higher level in the notice when a second unlock happens first', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('A2', { notify: true });
    expect(unlocks.raiseUnlockedLevel('B1', { notify: true }).unlockNoticeLevel).toBe('B1');
  });

  it('switching moves the active level to the notice level and clears it', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('B1', { notify: true });
    expect(unlocks.resolveUnlockNotice('switch')).toMatchObject({ activeLevel: 'B1', unlockNoticeLevel: null });
  });

  it('dismissing clears the notice and keeps the active level', () => {
    const { unlocks } = setup();
    unlocks.raiseUnlockedLevel('B1', { notify: true });
    expect(unlocks.resolveUnlockNotice('dismiss')).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });

  it('does nothing when there is no notice', () => {
    const { unlocks } = setup();
    expect(unlocks.resolveUnlockNotice('switch')).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/unlockService.test.ts`
Expected: FAIL — `./unlockService` does not exist.

- [ ] **Step 3: Implement the service**

Create `lib/services/unlockService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { CefrLevel, Profile } from '../types';
import { higherLevel, isAtOrBelow } from '../tutoring/levels';
import { createProfileService } from './profileService';

export function createUnlockService(db: Database.Database) {
  const profiles = createProfileService(db);

  function isLevelUnlocked(level: CefrLevel): boolean {
    return isAtOrBelow(level, profiles.getProfile().highestUnlockedLevel);
  }

  // Unlocks never go down: a level at or below the current ceiling changes nothing.
  function raiseUnlockedLevel(level: CefrLevel, options: { notify: boolean }): Profile {
    const profile = profiles.getProfile();
    if (isAtOrBelow(level, profile.highestUnlockedLevel)) return profile;
    const notice = options.notify
      ? profile.unlockNoticeLevel
        ? higherLevel(profile.unlockNoticeLevel, level)
        : level
      : profile.unlockNoticeLevel;
    return profiles.writeLevelState({ highestUnlockedLevel: level, unlockNoticeLevel: notice });
  }

  function resolveUnlockNotice(action: 'switch' | 'dismiss'): Profile {
    const profile = profiles.getProfile();
    if (!profile.unlockNoticeLevel) return profile;
    return profiles.writeLevelState({
      unlockNoticeLevel: null,
      ...(action === 'switch' ? { activeLevel: profile.unlockNoticeLevel } : {}),
    });
  }

  return { isLevelUnlocked, raiseUnlockedLevel, resolveUnlockNotice };
}

export type UnlockService = ReturnType<typeof createUnlockService>;
```

- [ ] **Step 4: Run the service tests**

Run: `npx vitest run lib/services/unlockService.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the route test**

Create `app/api/tutoring/unlock-notice/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createUnlockService } from '@/lib/services/unlockService';
import { POST } from './route';

function post(body: unknown) {
  return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/tutoring/unlock-notice', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-unlock-'));
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('switches to the unlocked level', async () => {
    createUnlockService(getDb()).raiseUnlockedLevel('A2', { notify: true });
    const res = await post({ action: 'switch' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ activeLevel: 'A2', unlockNoticeLevel: null });
  });

  it('dismisses the notice', async () => {
    createUnlockService(getDb()).raiseUnlockedLevel('A2', { notify: true });
    const res = await post({ action: 'dismiss' });
    expect(await res.json()).toMatchObject({ activeLevel: 'A1', unlockNoticeLevel: null });
  });

  it('rejects an unknown action', async () => {
    const res = await post({ action: 'maybe' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run app/api/tutoring/unlock-notice/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 7: Implement the route**

Create `app/api/tutoring/unlock-notice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createUnlockService } from '@/lib/services/unlockService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'switch' && action !== 'dismiss') {
    return NextResponse.json({ error: 'action must be "switch" or "dismiss"' }, { status: 400 });
  }
  return NextResponse.json(createUnlockService(getDb()).resolveUnlockNotice(action));
}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run lib/services/unlockService.test.ts app/api/tutoring/unlock-notice/route.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/services/unlockService.ts lib/services/unlockService.test.ts app/api/tutoring/unlock-notice
git commit -m "feat: add unlock service and unlock-notice route"
```

---

### Task 5: Exercise content validation and deterministic grading

**Files:**
- Create: `lib/curriculum/exerciseContentValidation.ts`, `lib/curriculum/exerciseContentValidation.test.ts`, `lib/tutoring/grading.ts`, `lib/tutoring/grading.test.ts`

**Interfaces:**
- Produces: `validateExerciseContent(type: unknown, content: unknown): string[]` (empty = valid); `GradeResult = 'correct' | 'almost' | 'wrong'`; `gradeMultipleChoice(content: MultipleChoiceContent, selectedIndex: number): GradeResult`; `gradeFillBlank(content: FillBlankContent, answer: string): GradeResult`. Plan 1B reuses the graders; Phase 2 reuses the validator.

- [ ] **Step 1: Write the validation tests**

Create `lib/curriculum/exerciseContentValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateExerciseContent } from './exerciseContentValidation';

describe('validateExerciseContent', () => {
  it('accepts valid content of every type', () => {
    expect(validateExerciseContent('multiple_choice', { question: 'Q?', options: ['a', 'b'], correctIndex: 1 })).toEqual([]);
    expect(validateExerciseContent('fill_blank', { textWithBlank: 'Ich ___ Anna.', correctAnswer: 'heiße' })).toEqual([]);
    expect(
      validateExerciseContent('fill_blank', { textWithBlank: 'a ___', correctAnswer: 'b', acceptableVariants: ['c'] })
    ).toEqual([]);
    expect(validateExerciseContent('flashcard', { front: 'der Hund', back: 'the dog' })).toEqual([]);
    expect(validateExerciseContent('free_text', { prompt: 'Write.', modelAnswer: 'Ich schreibe.' })).toEqual([]);
  });

  it('rejects an unknown type and non-object content', () => {
    expect(validateExerciseContent('essay', {})).toEqual(['unknown exercise type "essay"']);
    expect(validateExerciseContent('flashcard', 'text')).toEqual(['content must be an object']);
  });

  it('reports multiple-choice problems', () => {
    expect(validateExerciseContent('multiple_choice', { question: '', options: ['a'], correctIndex: 0 })).toEqual([
      'question must be a non-empty string',
      'options must be at least 2 non-empty strings',
    ]);
    expect(validateExerciseContent('multiple_choice', { question: 'Q', options: ['a', 'b'], correctIndex: 2 })).toEqual([
      'correctIndex must point at one of the options',
    ]);
  });

  it('reports fill-blank problems', () => {
    expect(validateExerciseContent('fill_blank', { textWithBlank: 'no blank', correctAnswer: '' })).toEqual([
      'textWithBlank must be a non-empty string containing ___',
      'correctAnswer must be a non-empty string',
    ]);
    expect(
      validateExerciseContent('fill_blank', { textWithBlank: 'a ___', correctAnswer: 'b', acceptableVariants: [''] })
    ).toEqual(['acceptableVariants must be a list of non-empty strings']);
  });

  it('reports flashcard and free-text problems', () => {
    expect(validateExerciseContent('flashcard', { front: 'x' })).toEqual(['back must be a non-empty string']);
    expect(validateExerciseContent('free_text', { modelAnswer: 'x' })).toEqual(['prompt must be a non-empty string']);
  });
});
```

- [ ] **Step 2: Write the grading tests**

Create `lib/tutoring/grading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gradeMultipleChoice, gradeFillBlank } from './grading';

describe('gradeMultipleChoice', () => {
  const content = { question: 'Q', options: ['a', 'b', 'c'], correctIndex: 1 };

  it('is correct only for the correct option', () => {
    expect(gradeMultipleChoice(content, 1)).toBe('correct');
    expect(gradeMultipleChoice(content, 0)).toBe('wrong');
    expect(gradeMultipleChoice(content, 7)).toBe('wrong');
  });
});

describe('gradeFillBlank', () => {
  const content = { textWithBlank: 'Das Problem, ___ wir sprachen', correctAnswer: 'über das', acceptableVariants: ['worüber'] };

  it('accepts the answer and its variants, ignoring outer and repeated spaces', () => {
    expect(gradeFillBlank(content, 'über das')).toBe('correct');
    expect(gradeFillBlank(content, '  über   das ')).toBe('correct');
    expect(gradeFillBlank(content, 'worüber')).toBe('correct');
  });

  it('is case-sensitive, since capitalisation is part of German spelling', () => {
    expect(gradeFillBlank({ textWithBlank: '___ ist groß.', correctAnswer: 'Der Hund' }, 'der hund')).toBe('wrong');
  });

  it('rejects anything else', () => {
    expect(gradeFillBlank(content, 'über dem')).toBe('wrong');
    expect(gradeFillBlank(content, '')).toBe('wrong');
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run lib/curriculum/exerciseContentValidation.test.ts lib/tutoring/grading.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement the validator**

Create `lib/curriculum/exerciseContentValidation.ts`:

```ts
import type { ExerciseType } from './types';

const EXERCISE_TYPES: readonly ExerciseType[] = ['multiple_choice', 'fill_blank', 'flashcard', 'free_text'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateExerciseContent(type: unknown, content: unknown): string[] {
  if (!EXERCISE_TYPES.includes(type as ExerciseType)) return [`unknown exercise type "${String(type)}"`];
  if (!content || typeof content !== 'object' || Array.isArray(content)) return ['content must be an object'];
  const c = content as Record<string, unknown>;
  const errors: string[] = [];

  switch (type as ExerciseType) {
    case 'multiple_choice': {
      if (!isNonEmptyString(c.question)) errors.push('question must be a non-empty string');
      if (!Array.isArray(c.options) || c.options.length < 2 || !c.options.every(isNonEmptyString)) {
        errors.push('options must be at least 2 non-empty strings');
      } else if (
        typeof c.correctIndex !== 'number' ||
        !Number.isInteger(c.correctIndex) ||
        c.correctIndex < 0 ||
        c.correctIndex >= c.options.length
      ) {
        errors.push('correctIndex must point at one of the options');
      }
      break;
    }
    case 'fill_blank': {
      if (!isNonEmptyString(c.textWithBlank) || !c.textWithBlank.includes('___')) {
        errors.push('textWithBlank must be a non-empty string containing ___');
      }
      if (!isNonEmptyString(c.correctAnswer)) errors.push('correctAnswer must be a non-empty string');
      if (
        c.acceptableVariants !== undefined &&
        (!Array.isArray(c.acceptableVariants) || !c.acceptableVariants.every(isNonEmptyString))
      ) {
        errors.push('acceptableVariants must be a list of non-empty strings');
      }
      break;
    }
    case 'flashcard': {
      if (!isNonEmptyString(c.front)) errors.push('front must be a non-empty string');
      if (!isNonEmptyString(c.back)) errors.push('back must be a non-empty string');
      break;
    }
    case 'free_text': {
      if (!isNonEmptyString(c.prompt)) errors.push('prompt must be a non-empty string');
      if (!isNonEmptyString(c.modelAnswer)) errors.push('modelAnswer must be a non-empty string');
      break;
    }
  }
  return errors;
}
```

- [ ] **Step 5: Implement the graders**

Create `lib/tutoring/grading.ts`:

```ts
import type { MultipleChoiceContent, FillBlankContent } from '../curriculum/types';

export type GradeResult = 'correct' | 'almost' | 'wrong';

export function gradeMultipleChoice(content: MultipleChoiceContent, selectedIndex: number): GradeResult {
  return selectedIndex === content.correctIndex ? 'correct' : 'wrong';
}

function normalize(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function gradeFillBlank(content: FillBlankContent, answer: string): GradeResult {
  const given = normalize(answer);
  const accepted = [content.correctAnswer, ...(content.acceptableVariants ?? [])].map(normalize);
  return given !== '' && accepted.includes(given) ? 'correct' : 'wrong';
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run lib/curriculum/exerciseContentValidation.test.ts lib/tutoring/grading.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/curriculum/exerciseContentValidation.ts lib/curriculum/exerciseContentValidation.test.ts lib/tutoring/grading.ts lib/tutoring/grading.test.ts
git commit -m "feat: add exercise content validation and deterministic graders"
```

---

### Task 6: AI calls through the active provider, and free-text grading

**Files:**
- Create: `lib/services/aiService.ts`, `lib/services/aiService.test.ts`, `lib/tutoring/freeTextGrading.ts`, `lib/tutoring/freeTextGrading.test.ts`, `lib/services/freeTextGradingService.ts`, `lib/services/freeTextGradingService.test.ts`

**Interfaces:**
- Consumes: `createProviderService(db, keyFilePath?)` (`getActiveConnection`, `getDecryptedApiKey`, `recordSuccess`, `recordFailure`), `getAdapter(providerType)`, `createUsageService(db).recordUsage(connectionId, requests, tokens)`, `GradeResult` (Task 5).
- Produces: `AiResult = { ok: true; text: string } | { ok: false; error: string }`; `generateWithActiveProvider(db, request: { systemPrompt: string; messages: ChatMessage[] }, keyFilePath?: string): Promise<AiResult>`; `FreeTextGradingInput { prompt; modelAnswer; studentAnswer; level: CefrLevel; uiLanguage: 'en' | 'de' }`; `buildFreeTextGradingPrompt(input)`; `parseFreeTextGrade(text): { result: GradeResult; feedback: string } | null`; `FreeTextGradeOutcome = { ok: true; result: GradeResult; feedback: string } | { ok: false; error: string }`; `gradeFreeText(db, input, keyFilePath?): Promise<FreeTextGradeOutcome>`. Plan 1B's lesson chat also uses `generateWithActiveProvider`.

- [ ] **Step 1: Write the aiService tests**

Create `lib/services/aiService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';
import { generateWithActiveProvider } from './aiService';

vi.mock('../providers/registry', () => ({ getAdapter: vi.fn() }));
import { getAdapter } from '../providers/registry';

function setup() {
  const db = createDbClient(':memory:');
  const keyFilePath = join(mkdtempSync(join(tmpdir(), 'gait-ai-')), 'master.key');
  const providers = createProviderService(db, keyFilePath);
  return { db, keyFilePath, providers };
}

const request = { systemPrompt: 'sys', messages: [{ role: 'user' as const, content: 'question' }] };

describe('generateWithActiveProvider', () => {
  beforeEach(() => {
    vi.mocked(getAdapter).mockReset();
  });

  it('returns an error when no provider is active', async () => {
    const { db, keyFilePath } = setup();
    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'No AI provider is set up',
    });
  });

  it('returns an error when the active provider has no model selected', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test' });
    providers.setActiveConnection(connection.id);
    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'The active AI provider has no model selected',
    });
  });

  it('calls the active provider with its model and key, and records usage', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test', selectedModel: 'model-x' });
    providers.setActiveConnection(connection.id);
    const generateText = vi.fn().mockResolvedValue({ text: 'hello', inputTokens: 10, outputTokens: 5 });
    vi.mocked(getAdapter).mockReturnValue({ testConnection: vi.fn(), listModels: vi.fn(), generateText });

    const result = await generateWithActiveProvider(db, request, keyFilePath);

    expect(result).toEqual({ ok: true, text: 'hello' });
    expect(generateText).toHaveBeenCalledWith(
      { apiKey: 'sk-test', host: undefined },
      { model: 'model-x', systemPrompt: 'sys', messages: request.messages }
    );
    expect(createUsageService(db).getUsageForDate(connection.id)).toEqual({ requestCount: 1, tokenCount: 15 });
    expect(providers.getConnection(connection.id)?.lastValidatedStatus).toBe('valid');
  });

  it('records the failure on the connection and returns the error when the call throws', async () => {
    const { db, keyFilePath, providers } = setup();
    const connection = providers.createConnection({ providerType: 'anthropic', apiKey: 'sk-test', selectedModel: 'model-x' });
    providers.setActiveConnection(connection.id);
    const generateText = vi.fn().mockRejectedValue(new Error('Anthropic returned 429'));
    vi.mocked(getAdapter).mockReturnValue({ testConnection: vi.fn(), listModels: vi.fn(), generateText });

    expect(await generateWithActiveProvider(db, request, keyFilePath)).toEqual({
      ok: false,
      error: 'Anthropic returned 429',
    });
    expect(providers.getConnection(connection.id)).toMatchObject({
      lastValidatedStatus: 'failing',
      lastError: 'Anthropic returned 429',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/aiService.test.ts`
Expected: FAIL — `./aiService` does not exist.

- [ ] **Step 3: Implement aiService**

Create `lib/services/aiService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { ChatMessage } from '../providers/types';
import { getAdapter } from '../providers/registry';
import { createProviderService } from './providerService';
import { createUsageService } from './usageService';

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

export interface AiRequest {
  systemPrompt: string;
  messages: ChatMessage[];
}

export async function generateWithActiveProvider(
  db: Database.Database,
  request: AiRequest,
  keyFilePath?: string
): Promise<AiResult> {
  const providers = createProviderService(db, keyFilePath);
  const active = providers.getActiveConnection();
  if (!active) return { ok: false, error: 'No AI provider is set up' };
  if (!active.selectedModel) return { ok: false, error: 'The active AI provider has no model selected' };

  let apiKey: string | undefined;
  try {
    apiKey = providers.getDecryptedApiKey(active.id) ?? undefined;
  } catch {
    return { ok: false, error: 'Stored credentials could not be decrypted' };
  }

  try {
    const result = await getAdapter(active.providerType).generateText(
      { apiKey, host: active.ollamaHost ?? undefined },
      { model: active.selectedModel, systemPrompt: request.systemPrompt, messages: request.messages }
    );
    createUsageService(db).recordUsage(active.id, 1, (result.inputTokens ?? 0) + (result.outputTokens ?? 0));
    providers.recordSuccess(active.id);
    return { ok: true, text: result.text };
  } catch (err) {
    const message = (err as Error).message;
    providers.recordFailure(active.id, message);
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 4: Run the aiService tests**

Run: `npx vitest run lib/services/aiService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the free-text prompt/parse tests**

Create `lib/tutoring/freeTextGrading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFreeTextGradingPrompt, parseFreeTextGrade } from './freeTextGrading';

const input = {
  prompt: 'Introduce yourself.',
  modelAnswer: 'Ich heiße Anna.',
  studentAnswer: 'Ich heiße Tom.',
  level: 'A1' as const,
  uiLanguage: 'en' as const,
};

describe('buildFreeTextGradingPrompt', () => {
  it('names the level, the feedback language and the reply format', () => {
    const { systemPrompt } = buildFreeTextGradingPrompt(input);
    expect(systemPrompt).toContain('CEFR level A1');
    expect(systemPrompt).toContain('Write the feedback in English');
    expect(systemPrompt).toContain('{"result": "correct" | "almost" | "wrong", "feedback": "..."}');
  });

  it('asks for German feedback when the UI language is German', () => {
    expect(buildFreeTextGradingPrompt({ ...input, uiLanguage: 'de' }).systemPrompt).toContain('Write the feedback in German');
  });

  it('sends the task, model answer and student answer as the user message', () => {
    expect(buildFreeTextGradingPrompt(input).messages).toEqual([
      {
        role: 'user',
        content: 'Task: Introduce yourself.\nModel answer: Ich heiße Anna.\nStudent answer: Ich heiße Tom.',
      },
    ]);
  });
});

describe('parseFreeTextGrade', () => {
  it('parses a plain JSON reply', () => {
    expect(parseFreeTextGrade('{"result": "almost", "feedback": " Check the ending. "}')).toEqual({
      result: 'almost',
      feedback: 'Check the ending.',
    });
  });

  it('finds the JSON object inside a fenced reply', () => {
    expect(parseFreeTextGrade('Sure!\n```json\n{"result":"correct","feedback":"Well done."}\n```')).toEqual({
      result: 'correct',
      feedback: 'Well done.',
    });
  });

  it('returns null for anything else', () => {
    expect(parseFreeTextGrade('Correct!')).toBeNull();
    expect(parseFreeTextGrade('{"result": "great", "feedback": "x"}')).toBeNull();
    expect(parseFreeTextGrade('{"result": "wrong"}')).toBeNull();
    expect(parseFreeTextGrade('{not json}')).toBeNull();
  });
});
```

- [ ] **Step 6: Write the grading-service tests**

Create `lib/services/freeTextGradingService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createDbClient } from '../db/client';

vi.mock('./aiService', () => ({ generateWithActiveProvider: vi.fn() }));
import { generateWithActiveProvider } from './aiService';
import { gradeFreeText } from './freeTextGradingService';

const input = {
  prompt: 'Write.',
  modelAnswer: 'Ich schreibe.',
  studentAnswer: 'Ich schreib.',
  level: 'A2' as const,
  uiLanguage: 'en' as const,
};

describe('gradeFreeText', () => {
  it('returns the parsed grade', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: '{"result":"almost","feedback":"Ending."}' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: true,
      result: 'almost',
      feedback: 'Ending.',
    });
  });

  it('treats an unexpected reply as a failure', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: true, text: 'Looks good!' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: false,
      error: 'The AI replied in an unexpected format',
    });
  });

  it('passes through a provider failure', async () => {
    vi.mocked(generateWithActiveProvider).mockResolvedValue({ ok: false, error: 'No AI provider is set up' });
    expect(await gradeFreeText(createDbClient(':memory:'), input)).toEqual({
      ok: false,
      error: 'No AI provider is set up',
    });
  });
});
```

- [ ] **Step 7: Run to verify both fail**

Run: `npx vitest run lib/tutoring/freeTextGrading.test.ts lib/services/freeTextGradingService.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 8: Implement the prompt/parse module**

Create `lib/tutoring/freeTextGrading.ts`:

```ts
import type { CefrLevel } from '../types';
import type { ChatMessage } from '../providers/types';
import type { GradeResult } from './grading';

export interface FreeTextGradingInput {
  prompt: string;
  modelAnswer: string;
  studentAnswer: string;
  level: CefrLevel;
  uiLanguage: 'en' | 'de';
}

export function buildFreeTextGradingPrompt(input: FreeTextGradingInput): {
  systemPrompt: string;
  messages: ChatMessage[];
} {
  const language = input.uiLanguage === 'de' ? 'German' : 'English';
  const systemPrompt = [
    `You are grading a German learner's answer to one exercise at CEFR level ${input.level}.`,
    'Compare the student answer with the model answer. The model answer is one good solution, not the only one: accept any answer that fulfils the task correctly.',
    'Grade it as:',
    '- "correct": fulfils the task with no errors that matter at this level.',
    '- "almost": fulfils the task but has small mistakes (for example a wrong article, ending, or word order).',
    '- "wrong": does not fulfil the task, or has errors that block understanding.',
    `Write the feedback in ${language}: one to three short sentences naming the main mistake and its corrected form, if there is one.`,
    'Reply with only a JSON object: {"result": "correct" | "almost" | "wrong", "feedback": "..."}',
  ].join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `Task: ${input.prompt}\nModel answer: ${input.modelAnswer}\nStudent answer: ${input.studentAnswer}`,
    },
  ];
  return { systemPrompt, messages };
}

export function parseFreeTextGrade(text: string): { result: GradeResult; feedback: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { result, feedback } = data as Record<string, unknown>;
  if (result !== 'correct' && result !== 'almost' && result !== 'wrong') return null;
  if (typeof feedback !== 'string') return null;
  return { result, feedback: feedback.trim() };
}
```

- [ ] **Step 9: Implement the grading service**

Create `lib/services/freeTextGradingService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { GradeResult } from '../tutoring/grading';
import { buildFreeTextGradingPrompt, parseFreeTextGrade, type FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { generateWithActiveProvider } from './aiService';

export type FreeTextGradeOutcome = { ok: true; result: GradeResult; feedback: string } | { ok: false; error: string };

export async function gradeFreeText(
  db: Database.Database,
  input: FreeTextGradingInput,
  keyFilePath?: string
): Promise<FreeTextGradeOutcome> {
  const response = await generateWithActiveProvider(db, buildFreeTextGradingPrompt(input), keyFilePath);
  if (!response.ok) return response;
  const parsed = parseFreeTextGrade(response.text);
  if (!parsed) return { ok: false, error: 'The AI replied in an unexpected format' };
  return { ok: true, ...parsed };
}
```

- [ ] **Step 10: Verify**

Run: `npx vitest run lib/services/aiService.test.ts lib/tutoring/freeTextGrading.test.ts lib/services/freeTextGradingService.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add lib/services/aiService.ts lib/services/aiService.test.ts lib/tutoring/freeTextGrading.ts lib/tutoring/freeTextGrading.test.ts lib/services/freeTextGradingService.ts lib/services/freeTextGradingService.test.ts
git commit -m "feat: grade free-text answers through the active AI provider"
```

---

### Task 7: Placement scoring

**Files:**
- Create: `lib/tutoring/placementScoring.ts`, `lib/tutoring/placementScoring.test.ts`

**Interfaces:**
- Consumes: `LEVELS` (Task 3), `GradeResult` (Task 5).
- Produces: `LEVEL_POINTS`, `PASS_SHARE = 0.75`, `MAX_MISTAKES = 5`, `PlacementStopReason = 'beyond_my_knowledge' | 'five_mistakes' | 'finished'`, `pointsFor(level, result): number`, `maxScore(questions: { level }[]): number`, `placementThresholds(questions): Record<CefrLevel, number>`, `placedLevel(score, questions): CefrLevel`, `stopReasonAfterAnswer(mistakes, answeredCount, totalQuestions): 'five_mistakes' | 'finished' | null`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/placementScoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { CefrLevel } from '../types';
import { LEVELS } from './levels';
import {
  pointsFor,
  maxScore,
  placementThresholds,
  placedLevel,
  stopReasonAfterAnswer,
  MAX_MISTAKES,
} from './placementScoring';

function examWith(perLevel: number): { level: CefrLevel }[] {
  return LEVELS.flatMap((level) => Array.from({ length: perLevel }, () => ({ level })));
}

describe('placement scoring', () => {
  it('weights points by level and halves them for almost', () => {
    expect(pointsFor('A1', 'correct')).toBe(1);
    expect(pointsFor('B2', 'correct')).toBe(4);
    expect(pointsFor('C1', 'almost')).toBe(2.5);
    expect(pointsFor('C1', 'wrong')).toBe(0);
  });

  it('sums the maximum score', () => {
    expect(maxScore(examWith(8))).toBe(120);
  });

  it('computes the default-exam thresholds as 75% of every lower level', () => {
    expect(placementThresholds(examWith(8))).toEqual({ A1: 0, A2: 6, B1: 18, B2: 36, C1: 60 });
  });

  it('places the default exam exactly as the spec table says', () => {
    const exam = examWith(8);
    const cases: [number, CefrLevel][] = [
      [0, 'A1'],
      [5.5, 'A1'],
      [6, 'A2'],
      [17.5, 'A2'],
      [18, 'B1'],
      [35.5, 'B1'],
      [36, 'B2'],
      [59.5, 'B2'],
      [60, 'C1'],
      [120, 'C1'],
    ];
    for (const [score, level] of cases) {
      expect({ score, level: placedLevel(score, exam) }).toEqual({ score, level });
    }
  });

  it('recomputes thresholds for a differently sized exam', () => {
    expect(placementThresholds(examWith(2))).toEqual({ A1: 0, A2: 1.5, B1: 4.5, B2: 9, C1: 15 });
  });

  it('stops at the fifth mistake, then when every question is answered', () => {
    expect(MAX_MISTAKES).toBe(5);
    expect(stopReasonAfterAnswer(4, 10, 40)).toBeNull();
    expect(stopReasonAfterAnswer(5, 10, 40)).toBe('five_mistakes');
    expect(stopReasonAfterAnswer(2, 40, 40)).toBe('finished');
    expect(stopReasonAfterAnswer(5, 40, 40)).toBe('five_mistakes');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/tutoring/placementScoring.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement scoring**

Create `lib/tutoring/placementScoring.ts`:

```ts
import type { CefrLevel } from '../types';
import type { GradeResult } from './grading';
import { LEVELS } from './levels';

export const LEVEL_POINTS: Record<CefrLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
export const PASS_SHARE = 0.75;
export const MAX_MISTAKES = 5;

export type PlacementStopReason = 'beyond_my_knowledge' | 'five_mistakes' | 'finished';

export function pointsFor(level: CefrLevel, result: GradeResult): number {
  if (result === 'correct') return LEVEL_POINTS[level];
  if (result === 'almost') return LEVEL_POINTS[level] / 2;
  return 0;
}

export function maxScore(questions: { level: CefrLevel }[]): number {
  return questions.reduce((sum, q) => sum + LEVEL_POINTS[q.level], 0);
}

// Placed at a level = shown PASS_SHARE of the points of every level below it.
export function placementThresholds(questions: { level: CefrLevel }[]): Record<CefrLevel, number> {
  const maxByLevel = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 } as Record<CefrLevel, number>;
  for (const q of questions) maxByLevel[q.level] += LEVEL_POINTS[q.level];
  const thresholds = {} as Record<CefrLevel, number>;
  let cumulative = 0;
  for (const level of LEVELS) {
    thresholds[level] = cumulative;
    cumulative += PASS_SHARE * maxByLevel[level];
  }
  return thresholds;
}

export function placedLevel(score: number, questions: { level: CefrLevel }[]): CefrLevel {
  const thresholds = placementThresholds(questions);
  let placed: CefrLevel = 'A1';
  for (const level of LEVELS) {
    if (score >= thresholds[level]) placed = level;
  }
  return placed;
}

export function stopReasonAfterAnswer(
  mistakes: number,
  answeredCount: number,
  totalQuestions: number
): 'five_mistakes' | 'finished' | null {
  if (mistakes >= MAX_MISTAKES) return 'five_mistakes';
  if (answeredCount >= totalQuestions) return 'finished';
  return null;
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/tutoring/placementScoring.test.ts`
Expected: PASS (6 tests).
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/placementScoring.ts lib/tutoring/placementScoring.test.ts
git commit -m "feat: add deterministic placement scoring"
```

---

### Task 8: Placement exam file format

**Files:**
- Create: `lib/tutoring/placementExamFormat.ts`, `lib/tutoring/placementExamFormat.test.ts`

**Interfaces:**
- Consumes: `validateExerciseContent` (Task 5), `LEVELS`, `isCefrLevel`, `levelIndex` (Task 3), the `yaml` package.
- Produces: `PlacementQuestionType`, `PLACEMENT_QUESTION_TYPES`, `PlacementQuestion` (discriminated union on `type`, with `content` typed per type), `ExamFormat = 'json' | 'yaml'`, `ExamParseResult`, `validatePlacementExam(data: unknown): ExamParseResult`, `parsePlacementExam(text: string, format: ExamFormat): ExamParseResult`, `serializePlacementExam(questions, format): string`.

- [ ] **Step 1: Write the tests**

Create `lib/tutoring/placementExamFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels';
import { parsePlacementExam, serializePlacementExam, validatePlacementExam, type PlacementQuestion } from './placementExamFormat';

function validExam(): PlacementQuestion[] {
  return LEVELS.map((level, i): PlacementQuestion => ({
    id: `q${i + 1}`,
    level,
    type: 'multiple_choice',
    content: { question: `${level}?`, options: ['a', 'b'], correctIndex: 0 },
  }));
}

describe('placement exam format', () => {
  it('accepts a valid exam', () => {
    expect(validatePlacementExam({ questions: validExam() })).toEqual({ ok: true, questions: validExam() });
  });

  it('round-trips through JSON and YAML', () => {
    for (const format of ['json', 'yaml'] as const) {
      const text = serializePlacementExam(validExam(), format);
      expect(parsePlacementExam(text, format)).toEqual({ ok: true, questions: validExam() });
    }
  });

  it('rejects files that are not valid JSON or YAML', () => {
    const result = parsePlacementExam('{ questions: [', 'json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^The file is not valid JSON/);
  });

  it('requires a non-empty questions list', () => {
    expect(validatePlacementExam({})).toEqual({ ok: false, errors: ['The file must contain a "questions" list'] });
    expect(validatePlacementExam({ questions: [] })).toEqual({ ok: false, errors: ['The "questions" list is empty'] });
  });

  it('collects every problem instead of stopping at the first', () => {
    const questions: unknown[] = [
      ...validExam(),
      { id: 'q1', level: 'A1', type: 'flashcard', content: { front: 'x', back: 'y' } },
      { id: 'q7', level: 'Z9', type: 'free_text', content: { prompt: 'p' } },
    ];
    const result = validatePlacementExam({ questions });
    expect(result).toEqual({
      ok: false,
      errors: [
        'Question 6 (q1): duplicate id',
        'Question 6 (q1): level A1 comes after C1; questions must be ordered from easiest to hardest level',
        'Question 6 (q1): type must be one of multiple_choice, fill_blank, free_text',
        'Question 7 (q7): level must be one of A1, A2, B1, B2, C1',
        'Question 7 (q7): modelAnswer must be a non-empty string',
      ],
    });
  });

  it('requires every level to be present', () => {
    const result = validatePlacementExam({ questions: validExam().filter((q) => q.level !== 'B2') });
    expect(result).toEqual({
      ok: false,
      errors: ['The exam has no B2 questions; every level from A1 to C1 needs at least one'],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/tutoring/placementExamFormat.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the format**

Create `lib/tutoring/placementExamFormat.ts`:

```ts
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { CefrLevel } from '../types';
import type { MultipleChoiceContent, FillBlankContent, FreeTextContent } from '../curriculum/types';
import { validateExerciseContent } from '../curriculum/exerciseContentValidation';
import { LEVELS, isCefrLevel, levelIndex } from './levels';

export type PlacementQuestionType = 'multiple_choice' | 'fill_blank' | 'free_text';

export const PLACEMENT_QUESTION_TYPES: readonly PlacementQuestionType[] = ['multiple_choice', 'fill_blank', 'free_text'];

export type PlacementQuestion =
  | { id: string; level: CefrLevel; type: 'multiple_choice'; content: MultipleChoiceContent }
  | { id: string; level: CefrLevel; type: 'fill_blank'; content: FillBlankContent }
  | { id: string; level: CefrLevel; type: 'free_text'; content: FreeTextContent };

export type ExamFormat = 'json' | 'yaml';

export type ExamParseResult = { ok: true; questions: PlacementQuestion[] } | { ok: false; errors: string[] };

export function validatePlacementExam(data: unknown): ExamParseResult {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { questions?: unknown }).questions)) {
    return { ok: false, errors: ['The file must contain a "questions" list'] };
  }
  const raw = (data as { questions: unknown[] }).questions;
  if (raw.length === 0) return { ok: false, errors: ['The "questions" list is empty'] };

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenLevels = new Set<CefrLevel>();
  let previousLevel: CefrLevel | null = null;

  raw.forEach((entry, index) => {
    const label = `Question ${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    const q = entry as Record<string, unknown>;
    const hasId = typeof q.id === 'string' && q.id.trim() !== '';
    const name = hasId ? `${label} (${q.id as string})` : label;

    if (!hasId) errors.push(`${label}: id must be a non-empty string`);
    else if (seenIds.has(q.id as string)) errors.push(`${name}: duplicate id`);
    else seenIds.add(q.id as string);

    if (!isCefrLevel(q.level)) {
      errors.push(`${name}: level must be one of ${LEVELS.join(', ')}`);
    } else {
      if (previousLevel && levelIndex(q.level) < levelIndex(previousLevel)) {
        errors.push(
          `${name}: level ${q.level} comes after ${previousLevel}; questions must be ordered from easiest to hardest level`
        );
      }
      previousLevel = q.level;
      seenLevels.add(q.level);
    }

    if (!PLACEMENT_QUESTION_TYPES.includes(q.type as PlacementQuestionType)) {
      errors.push(`${name}: type must be one of ${PLACEMENT_QUESTION_TYPES.join(', ')}`);
    } else {
      for (const problem of validateExerciseContent(q.type, q.content)) errors.push(`${name}: ${problem}`);
    }
  });

  for (const level of LEVELS) {
    if (!seenLevels.has(level)) {
      errors.push(`The exam has no ${level} questions; every level from A1 to C1 needs at least one`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    questions: raw.map((entry) => {
      const { id, level, type, content } = entry as PlacementQuestion;
      return { id, level, type, content } as PlacementQuestion;
    }),
  };
}

export function parsePlacementExam(text: string, format: ExamFormat): ExamParseResult {
  let data: unknown;
  try {
    data = format === 'json' ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    return { ok: false, errors: [`The file is not valid ${format.toUpperCase()}: ${(err as Error).message}`] };
  }
  return validatePlacementExam(data);
}

export function serializePlacementExam(questions: PlacementQuestion[], format: ExamFormat): string {
  const data = { questions: questions.map(({ id, level, type, content }) => ({ id, level, type, content })) };
  return format === 'json' ? `${JSON.stringify(data, null, 2)}\n` : stringifyYaml(data);
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/tutoring/placementExamFormat.test.ts`
Expected: PASS (6 tests).
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tutoring/placementExamFormat.ts lib/tutoring/placementExamFormat.test.ts
git commit -m "feat: add placement exam file parsing and validation"
```

---

### Task 9: The default placement exam (human review gate)

**Files:**
- Create: `data/placement-exam.json`, `lib/tutoring/defaultPlacementExam.test.ts`

**Interfaces:**
- Consumes: `validatePlacementExam` (Task 8), `placementThresholds` (Task 7).
- Produces: `data/placement-exam.json`, the bundled seed exam loaded by Task 11.

This task has a **human review gate**: the spec requires the user to review the exam before it ships. Before marking this task complete, the controller shows the user the 40 questions below and applies any edits they ask for. If the user already approved them while reviewing this plan, record that in the task report and continue.

- [ ] **Step 1: Write the test**

Create `lib/tutoring/defaultPlacementExam.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS } from './levels';
import { validatePlacementExam } from './placementExamFormat';
import { placementThresholds } from './placementScoring';

function loadDefaultExam() {
  const parsed = validatePlacementExam(JSON.parse(readFileSync(join(process.cwd(), 'data', 'placement-exam.json'), 'utf8')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.questions;
}

describe('the default placement exam', () => {
  it('is a valid exam of 40 questions', () => {
    expect(loadDefaultExam()).toHaveLength(40);
  });

  it('has 8 questions per level: 3 multiple choice, 3 fill-blank and 2 free text', () => {
    const exam = loadDefaultExam();
    for (const level of LEVELS) {
      const types = exam.filter((q) => q.level === level).map((q) => q.type);
      expect({ level, mc: types.filter((t) => t === 'multiple_choice').length }).toEqual({ level, mc: 3 });
      expect({ level, fill: types.filter((t) => t === 'fill_blank').length }).toEqual({ level, fill: 3 });
      expect({ level, free: types.filter((t) => t === 'free_text').length }).toEqual({ level, free: 2 });
    }
  });

  it('does not always put the right answer in the same position', () => {
    const positions = new Set(
      loadDefaultExam().flatMap((q) => (q.type === 'multiple_choice' ? [q.content.correctIndex] : []))
    );
    expect(positions.size).toBeGreaterThan(2);
  });

  it('produces the spec thresholds', () => {
    expect(placementThresholds(loadDefaultExam())).toEqual({ A1: 0, A2: 6, B1: 18, B2: 36, C1: 60 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/tutoring/defaultPlacementExam.test.ts`
Expected: FAIL — `data/placement-exam.json` does not exist.

- [ ] **Step 3: Create the exam**

Create `data/placement-exam.json`:

```json
{
  "questions": [
    { "id": "pl-a1-1", "level": "A1", "type": "multiple_choice", "content": { "question": "Ich ___ Anna.", "options": ["heißt", "heiße", "heißen", "heißet"], "correctIndex": 1 } },
    { "id": "pl-a1-2", "level": "A1", "type": "fill_blank", "content": { "textWithBlank": "Das ist ___ Buch. (ein / eine)", "correctAnswer": "ein" } },
    { "id": "pl-a1-3", "level": "A1", "type": "multiple_choice", "content": { "question": "Ich trinke gern ___.", "options": ["Brot", "Stuhl", "Kaffee", "Auto"], "correctIndex": 2 } },
    { "id": "pl-a1-4", "level": "A1", "type": "fill_blank", "content": { "textWithBlank": "Wir ___ aus Spanien. (kommen)", "correctAnswer": "kommen" } },
    { "id": "pl-a1-5", "level": "A1", "type": "multiple_choice", "content": { "question": "„Es ist halb acht.“ Wie spät ist es?", "options": ["8:30", "7:15", "8:00", "7:30"], "correctIndex": 3 } },
    { "id": "pl-a1-6", "level": "A1", "type": "fill_blank", "content": { "textWithBlank": "Am Wochenende ___ ich meine Oma. (besuchen)", "correctAnswer": "besuche" } },
    { "id": "pl-a1-7", "level": "A1", "type": "free_text", "content": { "prompt": "Introduce yourself in German in 2–3 sentences: your name, where you come from, and where you live.", "modelAnswer": "Ich heiße Anna. Ich komme aus Italien und wohne jetzt in Berlin." } },
    { "id": "pl-a1-8", "level": "A1", "type": "free_text", "content": { "prompt": "Write 1–2 sentences in German about what you like to eat and drink for breakfast.", "modelAnswer": "Zum Frühstück esse ich gern Brot mit Käse und trinke einen Kaffee." } },

    { "id": "pl-a2-1", "level": "A2", "type": "multiple_choice", "content": { "question": "Gestern ___ ich ins Kino gegangen.", "options": ["habe", "bin", "war", "hatte"], "correctIndex": 1 } },
    { "id": "pl-a2-2", "level": "A2", "type": "fill_blank", "content": { "textWithBlank": "Ich habe gestern einen Brief ___. (schreiben)", "correctAnswer": "geschrieben" } },
    { "id": "pl-a2-3", "level": "A2", "type": "multiple_choice", "content": { "question": "Ich gebe ___ Mann das Buch.", "options": ["den", "der", "dem", "des"], "correctIndex": 2 } },
    { "id": "pl-a2-4", "level": "A2", "type": "fill_blank", "content": { "textWithBlank": "Er wohnt in Hamburg, ___ er dort eine Arbeit hat. (weil / denn / aber)", "correctAnswer": "weil" } },
    { "id": "pl-a2-5", "level": "A2", "type": "multiple_choice", "content": { "question": "Heute ist das Wetter ___ als gestern.", "options": ["gut", "am besten", "guter", "besser"], "correctIndex": 3 } },
    { "id": "pl-a2-6", "level": "A2", "type": "fill_blank", "content": { "textWithBlank": "Kannst du mir bitte ___? Ich finde den Bahnhof nicht. (helfen)", "correctAnswer": "helfen" } },
    { "id": "pl-a2-7", "level": "A2", "type": "free_text", "content": { "prompt": "Write 2–3 sentences in German about what you did last weekend. Use the Perfekt (for example „ich habe … gemacht“).", "modelAnswer": "Am Samstag habe ich meine Freunde getroffen. Wir sind in den Park gegangen und haben Fußball gespielt." } },
    { "id": "pl-a2-8", "level": "A2", "type": "free_text", "content": { "prompt": "You cannot come to a friend's birthday party. Write a short message in German: apologise, give a reason, and suggest another day to meet.", "modelAnswer": "Liebe Maria, es tut mir leid, aber ich kann am Samstag nicht zu deiner Party kommen, weil ich arbeiten muss. Wollen wir uns am Sonntag im Café treffen?" } },

    { "id": "pl-b1-1", "level": "B1", "type": "multiple_choice", "content": { "question": "Das ist der Mann, ___ ich gestern geholfen habe.", "options": ["den", "dem", "der", "dessen"], "correctIndex": 1 } },
    { "id": "pl-b1-2", "level": "B1", "type": "fill_blank", "content": { "textWithBlank": "Wenn ich mehr Zeit ___, würde ich öfter reisen. (haben)", "correctAnswer": "hätte" } },
    { "id": "pl-b1-3", "level": "B1", "type": "multiple_choice", "content": { "question": "Ich interessiere mich sehr ___ Geschichte.", "options": ["für", "an", "über", "auf"], "correctIndex": 0 } },
    { "id": "pl-b1-4", "level": "B1", "type": "fill_blank", "content": { "textWithBlank": "Das Rathaus ___ im Jahr 1900 gebaut. (werden, Präteritum)", "correctAnswer": "wurde" } },
    { "id": "pl-b1-5", "level": "B1", "type": "multiple_choice", "content": { "question": "Obwohl es regnete, ___", "options": ["wir gingen spazieren.", "spazieren gingen wir.", "gingen wir spazieren.", "wir spazieren gingen."], "correctIndex": 2 } },
    { "id": "pl-b1-6", "level": "B1", "type": "fill_blank", "content": { "textWithBlank": "Ich freue mich schon ___ die Sommerferien. (Präposition)", "correctAnswer": "auf" } },
    { "id": "pl-b1-7", "level": "B1", "type": "free_text", "content": { "prompt": "Beschreiben Sie in 3–4 Sätzen Vor- und Nachteile des Lebens in einer Großstadt.", "modelAnswer": "In einer Großstadt gibt es viele Freizeitangebote und gute Verkehrsverbindungen. Außerdem findet man dort leichter eine Arbeit. Allerdings sind die Mieten oft sehr hoch, und es ist laut und hektisch. Deshalb ziehen manche Menschen lieber aufs Land." } },
    { "id": "pl-b1-8", "level": "B1", "type": "free_text", "content": { "prompt": "Schreiben Sie eine kurze E-Mail an Ihren Vermieter: Die Heizung in Ihrer Wohnung ist kaputt. Bitten Sie höflich um eine schnelle Reparatur.", "modelAnswer": "Sehr geehrter Herr Müller, leider funktioniert die Heizung in meiner Wohnung seit gestern nicht mehr. Könnten Sie bitte so bald wie möglich einen Techniker schicken? Vielen Dank im Voraus. Mit freundlichen Grüßen, Anna Schmidt" } },

    { "id": "pl-b2-1", "level": "B2", "type": "multiple_choice", "content": { "question": "Er tut so, als ___ er nichts davon gewusst.", "options": ["habe", "hat", "hatte", "hätte"], "correctIndex": 3 } },
    { "id": "pl-b2-2", "level": "B2", "type": "fill_blank", "content": { "textWithBlank": "Trotz ___ schlechten Wetters fand das Konzert statt. (Artikel)", "correctAnswer": "des" } },
    { "id": "pl-b2-3", "level": "B2", "type": "multiple_choice", "content": { "question": "Je länger ich Deutsch lerne, ___ besser verstehe ich es.", "options": ["als", "desto", "wie", "dann"], "correctIndex": 1 } },
    { "id": "pl-b2-4", "level": "B2", "type": "fill_blank", "content": { "textWithBlank": "Das Problem, ___ wir gestern gesprochen haben, ist noch nicht gelöst. (Präposition + Relativpronomen)", "correctAnswer": "über das", "acceptableVariants": ["worüber"] } },
    { "id": "pl-b2-5", "level": "B2", "type": "multiple_choice", "content": { "question": "Was bedeutet „etwas in Kauf nehmen“?", "options": ["etwas günstig kaufen", "etwas zurückgeben", "einen Nachteil akzeptieren", "auf etwas verzichten"], "correctIndex": 2 } },
    { "id": "pl-b2-6", "level": "B2", "type": "fill_blank", "content": { "textWithBlank": "Der Bericht muss bis Freitag noch gründlich ___ werden. (überarbeiten)", "correctAnswer": "überarbeitet" } },
    { "id": "pl-b2-7", "level": "B2", "type": "free_text", "content": { "prompt": "Formulieren Sie den Satz im Passiv: „Die Regierung hat das neue Gesetz im letzten Jahr beschlossen.“", "modelAnswer": "Das neue Gesetz wurde im letzten Jahr von der Regierung beschlossen." } },
    { "id": "pl-b2-8", "level": "B2", "type": "free_text", "content": { "prompt": "Nehmen Sie in 4–5 Sätzen Stellung: Sollte Homeoffice für alle Angestellten zum Standard werden? Begründen Sie Ihre Meinung.", "modelAnswer": "Meiner Meinung nach sollte Homeoffice eine Möglichkeit, aber kein Standard sein. Einerseits sparen Angestellte viel Zeit, weil der Arbeitsweg wegfällt. Andererseits fehlt der persönliche Austausch mit Kolleginnen und Kollegen, der für eine gute Zusammenarbeit wichtig ist. Außerdem eignen sich nicht alle Tätigkeiten für das Homeoffice. Deshalb halte ich eine flexible Mischung aus Büro und Homeoffice für die beste Lösung." } },

    { "id": "pl-c1-1", "level": "C1", "type": "multiple_choice", "content": { "question": "Welcher Satz passt am besten in einen formellen Bericht?", "options": ["Die Ergebnisse zeigen irgendwie, dass man noch mehr untersuchen muss.", "Man sieht, dass da noch was gemacht werden muss.", "Die Ergebnisse sind so, dass man weiterforschen sollte, oder?", "Die Ergebnisse legen nahe, dass weitere Untersuchungen erforderlich sind."], "correctIndex": 3 } },
    { "id": "pl-c1-2", "level": "C1", "type": "fill_blank", "content": { "textWithBlank": "___ der gestiegenen Kosten wurde das Projekt fortgesetzt. (Präposition mit Genitiv, Gegensatz)", "correctAnswer": "Ungeachtet", "acceptableVariants": ["Trotz"] } },
    { "id": "pl-c1-3", "level": "C1", "type": "multiple_choice", "content": { "question": "Was bedeutet „etwas auf die lange Bank schieben“?", "options": ["etwas hinauszögern", "etwas gründlich prüfen", "etwas vergessen", "etwas beschleunigen"], "correctIndex": 0 } },
    { "id": "pl-c1-4", "level": "C1", "type": "fill_blank", "content": { "textWithBlank": "Hätte er rechtzeitig reagiert, ___ der Schaden vermieden werden können. (Hilfsverb im Konjunktiv II)", "correctAnswer": "hätte" } },
    { "id": "pl-c1-5", "level": "C1", "type": "multiple_choice", "content": { "question": "Welcher Satz bedeutet dasselbe wie „Das Problem kann nicht gelöst werden“?", "options": ["Das Problem hat nicht zu lösen.", "Das Problem ist nicht zu lösen.", "Das Problem lässt nicht lösen.", "Das Problem wird nicht lösend."], "correctIndex": 1 } },
    { "id": "pl-c1-6", "level": "C1", "type": "fill_blank", "content": { "textWithBlank": "Die Maßnahme erwies sich als wirkungslos, ___ sie mit großem Aufwand umgesetzt worden war. (Konjunktion, Gegensatz)", "correctAnswer": "obwohl", "acceptableVariants": ["obgleich", "obschon", "wenngleich"] } },
    { "id": "pl-c1-7", "level": "C1", "type": "free_text", "content": { "prompt": "Erklären Sie in 3–4 Sätzen die Redewendung „Wer rastet, der rostet“ und wenden Sie sie auf das Sprachenlernen an.", "modelAnswer": "Die Redewendung bedeutet, dass man Fähigkeiten verliert, wenn man sie nicht regelmäßig nutzt. Beim Sprachenlernen zeigt sich das besonders deutlich: Wer eine Sprache längere Zeit nicht verwendet, vergisst Wortschatz und Strukturen erstaunlich schnell. Daher empfiehlt es sich, auch nach einem Kurs täglich zumindest ein wenig zu lesen, zu hören oder zu sprechen." } },
    { "id": "pl-c1-8", "level": "C1", "type": "free_text", "content": { "prompt": "Fassen Sie in 3–4 Sätzen die wichtigsten Argumente für und gegen ein generelles Tempolimit auf Autobahnen zusammen und ziehen Sie ein begründetes Fazit.", "modelAnswer": "Befürworter eines Tempolimits argumentieren, dass es die Zahl schwerer Unfälle senken und den CO2-Ausstoß verringern würde. Gegner halten dem entgegen, dass Autobahnen bereits zu den sichersten Straßen zählen und ein Tempolimit die persönliche Freiheit einschränke. Wägt man beide Seiten ab, überwiegen meines Erachtens die Vorteile für Sicherheit und Umwelt, weshalb ein moderates Tempolimit sinnvoll wäre." } }
  ]
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/tutoring/defaultPlacementExam.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Human review gate**

Show the user the questions in `data/placement-exam.json` (or confirm they approved them in this plan). Apply any requested edits, keeping 3 multiple choice / 3 fill-blank / 2 free text per level, and re-run the Step 4 test after edits.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

```bash
git add data/placement-exam.json lib/tutoring/defaultPlacementExam.test.ts
git commit -m "feat: add the default placement exam"
```

---

### Task 10: Placement tables and the placement service

**Files:**
- Create: `lib/tutoring/placementTypes.ts`, `lib/tutoring/placementTypes.test.ts`, `lib/services/placementService.ts`, `lib/services/placementService.test.ts`, `test/placementFixtures.ts`
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: graders (Task 5), `FreeTextGradingInput`/`gradeFreeText`/`FreeTextGradeOutcome` (Task 6), scoring (Task 7), `PlacementQuestion`/`validatePlacementExam` (Task 8), `createProfileService` `writeLevelState` (Task 3), `createUnlockService` (Task 4), `higherLevel` (Task 3).
- Produces (`@/lib/tutoring/placementTypes`): `PlacementAnswer`, `PlacementQuestionView`, `PlacementAnswerRecord`, `PlacementOutcome`, `PlacementState`, `PlacementBestResult`, `parsePlacementAnswer(raw: unknown): PlacementAnswer | null`.
- Produces (`@/lib/services/placementService`): `PlacementError` (with `kind: 'no_exam' | 'no_session' | 'bad_request' | 'grading_failed'`), `toPlacementErrorResponse(err): { status: number; body: { error: string } } | null`, `PlacementDeps`, and `createPlacementService(db, deps?)` with `getExam()`, `replaceExam(questions)`, `loadSeedExamIfEmpty(filePath)`, `questionCount()`, `start(): PlacementState`, `answer(questionId, answer): Promise<PlacementState>`, `stop(): PlacementState`, `skip(): Profile`, `getBestResult(): PlacementBestResult | null`.
- Produces (`@/test/placementFixtures`): `smallPlacementExam(): PlacementQuestion[]` (one multiple choice + one fill-blank per level, 10 questions, max score 30, thresholds A2 1.5 / B1 4.5 / B2 9 / C1 15), `rightAnswer(q)`, `wrongAnswer(q)`.

- [ ] **Step 1: Add the tables**

In `lib/db/schema.ts`, inside `createTablesIfMissing`, add after the `curriculum_meta` table:

```sql
    CREATE TABLE IF NOT EXISTS placement_questions (
      id TEXT PRIMARY KEY,
      position INTEGER NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
      type TEXT NOT NULL CHECK (type IN ('multiple_choice','fill_blank','free_text')),
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS placement_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      started_at TEXT NOT NULL,
      next_position INTEGER NOT NULL,
      score REAL NOT NULL,
      mistakes INTEGER NOT NULL,
      answers TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS placement_best_result (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      score REAL NOT NULL,
      max_score REAL NOT NULL,
      placed_level TEXT NOT NULL CHECK (placed_level IN ('A1','A2','B1','B2','C1')),
      stop_reason TEXT NOT NULL CHECK (stop_reason IN ('beyond_my_knowledge','five_mistakes','finished')),
      taken_at TEXT NOT NULL
    );
```

- [ ] **Step 2: Write the shared types and their test**

Create `lib/tutoring/placementTypes.ts`:

```ts
import type { CefrLevel } from '../types';
import type { GradeResult } from './grading';
import type { PlacementQuestionType } from './placementExamFormat';
import type { PlacementStopReason } from './placementScoring';

export type PlacementAnswer =
  | { type: 'multiple_choice'; selectedIndex: number }
  | { type: 'fill_blank'; text: string }
  | { type: 'free_text'; text: string };

interface QuestionViewBase {
  id: string;
  position: number;
  total: number;
  level: CefrLevel;
}

// What the client sees of a question: never the answer.
export type PlacementQuestionView =
  | (QuestionViewBase & { type: 'multiple_choice'; question: string; options: string[] })
  | (QuestionViewBase & { type: 'fill_blank'; textWithBlank: string })
  | (QuestionViewBase & { type: 'free_text'; prompt: string });

export interface PlacementAnswerRecord {
  questionId: string;
  level: CefrLevel;
  type: PlacementQuestionType;
  question: string;
  given: string;
  correctAnswer: string;
  result: GradeResult;
  feedback: string | null;
}

export interface PlacementOutcome {
  score: number;
  maxScore: number;
  placedLevel: CefrLevel;
  stopReason: PlacementStopReason;
  answers: PlacementAnswerRecord[];
  isNewBest: boolean;
}

export type PlacementState =
  | { status: 'in_progress'; question: PlacementQuestionView }
  | { status: 'finished'; outcome: PlacementOutcome };

export interface PlacementBestResult {
  score: number;
  maxScore: number;
  placedLevel: CefrLevel;
  stopReason: PlacementStopReason;
  takenAt: string;
}

export function parsePlacementAnswer(raw: unknown): PlacementAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'multiple_choice' && typeof a.selectedIndex === 'number' && Number.isInteger(a.selectedIndex)) {
    return { type: 'multiple_choice', selectedIndex: a.selectedIndex };
  }
  if (a.type === 'fill_blank' && typeof a.text === 'string') return { type: 'fill_blank', text: a.text };
  if (a.type === 'free_text' && typeof a.text === 'string') return { type: 'free_text', text: a.text };
  return null;
}
```

Create `lib/tutoring/placementTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePlacementAnswer } from './placementTypes';

describe('parsePlacementAnswer', () => {
  it('accepts each answer shape', () => {
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 2 })).toEqual({ type: 'multiple_choice', selectedIndex: 2 });
    expect(parsePlacementAnswer({ type: 'fill_blank', text: 'ein' })).toEqual({ type: 'fill_blank', text: 'ein' });
    expect(parsePlacementAnswer({ type: 'free_text', text: 'Ich heiße Tom.' })).toEqual({ type: 'free_text', text: 'Ich heiße Tom.' });
  });

  it('rejects malformed answers', () => {
    expect(parsePlacementAnswer(null)).toBeNull();
    expect(parsePlacementAnswer({ type: 'multiple_choice', selectedIndex: 1.5 })).toBeNull();
    expect(parsePlacementAnswer({ type: 'fill_blank' })).toBeNull();
    expect(parsePlacementAnswer({ type: 'flashcard', text: 'x' })).toBeNull();
  });
});
```

- [ ] **Step 3: Write the fixtures**

Create `test/placementFixtures.ts`:

```ts
import { LEVELS } from '@/lib/tutoring/levels';
import type { PlacementQuestion } from '@/lib/tutoring/placementExamFormat';
import type { PlacementAnswer } from '@/lib/tutoring/placementTypes';

// One multiple choice and one fill-blank per level: 10 questions, max score 30,
// thresholds A2 1.5, B1 4.5, B2 9, C1 15.
export function smallPlacementExam(): PlacementQuestion[] {
  return LEVELS.flatMap((level): PlacementQuestion[] => [
    { id: `${level}-mc`, level, type: 'multiple_choice', content: { question: `${level} question`, options: ['right', 'wrong'], correctIndex: 0 } },
    { id: `${level}-fill`, level, type: 'fill_blank', content: { textWithBlank: `${level} ___`, correctAnswer: 'ja' } },
  ]);
}

export function rightAnswer(question: PlacementQuestion): PlacementAnswer {
  if (question.type === 'multiple_choice') return { type: 'multiple_choice', selectedIndex: question.content.correctIndex };
  if (question.type === 'fill_blank') return { type: 'fill_blank', text: question.content.correctAnswer };
  return { type: 'free_text', text: question.content.modelAnswer };
}

export function wrongAnswer(question: PlacementQuestion): PlacementAnswer {
  if (question.type === 'multiple_choice') {
    return { type: 'multiple_choice', selectedIndex: question.content.correctIndex === 0 ? 1 : 0 };
  }
  if (question.type === 'fill_blank') return { type: 'fill_blank', text: 'definitely wrong' };
  return { type: 'free_text', text: 'definitely wrong' };
}
```

- [ ] **Step 4: Write the service tests**

Create `lib/services/placementService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { createProfileService } from './profileService';
import { createPlacementService, PlacementError, toPlacementErrorResponse, type PlacementDeps } from './placementService';
import type { PlacementQuestion } from '../tutoring/placementExamFormat';
import type { PlacementState } from '../tutoring/placementTypes';
import { smallPlacementExam, rightAnswer, wrongAnswer } from '@/test/placementFixtures';

function setup(exam: PlacementQuestion[] = smallPlacementExam(), deps?: PlacementDeps) {
  const db = createDbClient(':memory:');
  const service = createPlacementService(db, deps ?? { gradeFreeText: vi.fn() });
  service.replaceExam(exam);
  return { db, service, profiles: createProfileService(db), exam };
}

// Answers questions in order, right for the first `rightCount` and wrong after,
// until the test finishes or `limit` questions have been answered.
async function answerInOrder(
  service: ReturnType<typeof createPlacementService>,
  exam: PlacementQuestion[],
  rightCount: number,
  limit = exam.length
): Promise<PlacementState> {
  let state = service.start();
  for (let i = 0; i < limit && state.status === 'in_progress'; i++) {
    const q = exam[i];
    state = await service.answer(q.id, i < rightCount ? rightAnswer(q) : wrongAnswer(q));
  }
  return state;
}

describe('placementService', () => {
  it('loads the bundled exam only into an empty table', () => {
    const db = createDbClient(':memory:');
    const service = createPlacementService(db, { gradeFreeText: vi.fn() });
    const file = join(mkdtempSync(join(tmpdir(), 'gait-exam-')), 'exam.json');
    writeFileSync(file, JSON.stringify({ questions: smallPlacementExam() }));

    service.loadSeedExamIfEmpty(file);
    expect(service.questionCount()).toBe(10);

    service.replaceExam(smallPlacementExam().slice(0, 3));
    service.loadSeedExamIfEmpty(file);
    expect(service.questionCount()).toBe(3);
  });

  it('shows the first question without its answer', () => {
    const { service } = setup();
    const state = service.start();
    expect(state).toEqual({
      status: 'in_progress',
      question: { id: 'A1-mc', position: 1, total: 10, level: 'A1', type: 'multiple_choice', question: 'A1 question', options: ['right', 'wrong'] },
    });
  });

  it('refuses to start without an exam', () => {
    const { service } = setup([]);
    expect(() => service.start()).toThrow(PlacementError);
  });

  it('answering everything right finishes at C1 and sets the levels on a first placement', async () => {
    const { service, profiles, exam } = setup();
    const state = await answerInOrder(service, exam, exam.length);
    expect(state).toMatchObject({
      status: 'finished',
      outcome: { score: 30, maxScore: 30, placedLevel: 'C1', stopReason: 'finished', isNewBest: true },
    });
    expect(profiles.getProfile()).toMatchObject({
      highestUnlockedLevel: 'C1',
      activeLevel: 'C1',
      placementStatus: 'taken',
      unlockNoticeLevel: null,
    });
    expect(service.getBestResult()).toMatchObject({ score: 30, placedLevel: 'C1', stopReason: 'finished' });
  });

  it('stops automatically at the fifth wrong answer', async () => {
    const { service, exam } = setup();
    const state = await answerInOrder(service, exam, 0);
    expect(state).toMatchObject({ status: 'finished', outcome: { stopReason: 'five_mistakes', placedLevel: 'A1', score: 0 } });
    if (state.status === 'finished') expect(state.outcome.answers).toHaveLength(5);
  });

  it('stops with Beyond my knowledge and places from the score so far', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    expect(service.stop()).toMatchObject({
      status: 'finished',
      outcome: { score: 2, placedLevel: 'A2', stopReason: 'beyond_my_knowledge' },
    });
  });

  it('records each answer for the end screen', async () => {
    const { service, exam } = setup();
    await answerInOrder(service, exam, 1, 2);
    const state = service.stop();
    expect(state.status === 'finished' && state.outcome.answers).toEqual([
      { questionId: 'A1-mc', level: 'A1', type: 'multiple_choice', question: 'A1 question', given: 'right', correctAnswer: 'right', result: 'correct', feedback: null },
      { questionId: 'A1-fill', level: 'A1', type: 'fill_blank', question: 'A1 ___', given: 'definitely wrong', correctAnswer: 'ja', result: 'wrong', feedback: null },
    ]);
  });

  it('rejects an answer to a question that is not the current one', async () => {
    const { service } = setup();
    service.start();
    await expect(service.answer('B1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects an answer of the wrong type', async () => {
    const { service } = setup();
    service.start();
    await expect(service.answer('A1-mc', { type: 'fill_blank', text: 'x' })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('rejects answers when no test is in progress', async () => {
    const { service } = setup();
    await expect(service.answer('A1-mc', { type: 'multiple_choice', selectedIndex: 0 })).rejects.toMatchObject({ kind: 'no_session' });
    expect(() => service.stop()).toThrow(PlacementError);
  });

  it('grades free text with the AI, giving half points for almost', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: true, result: 'almost', feedback: 'Check the verb.' });
    const free: PlacementQuestion = { id: 'free', level: 'A2', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();
    await service.answer('free', { type: 'free_text', text: 'Ich schreib.' });
    const state = service.stop();
    expect(gradeFreeText).toHaveBeenCalledWith({
      prompt: 'Write.',
      modelAnswer: 'Ich schreibe.',
      studentAnswer: 'Ich schreib.',
      level: 'A2',
      uiLanguage: 'en',
    });
    expect(state).toMatchObject({ outcome: { score: 1, answers: [{ result: 'almost', feedback: 'Check the verb.' }] } });
  });

  it('keeps the test at the same question when free-text grading fails', async () => {
    const gradeFreeText = vi.fn().mockResolvedValue({ ok: false, error: 'Anthropic returned 429' });
    const free: PlacementQuestion = { id: 'free', level: 'A1', type: 'free_text', content: { prompt: 'Write.', modelAnswer: 'Ich schreibe.' } };
    const { service } = setup([free, ...smallPlacementExam()], { gradeFreeText });
    service.start();
    await expect(service.answer('free', { type: 'free_text', text: 'x' })).rejects.toMatchObject({
      kind: 'grading_failed',
      message: 'Anthropic returned 429',
    });
    gradeFreeText.mockResolvedValue({ ok: true, result: 'correct', feedback: 'Good.' });
    const state = await service.answer('free', { type: 'free_text', text: 'x' });
    expect(state).toMatchObject({ status: 'in_progress', question: { position: 2 } });
  });

  it('a lower retake changes neither the levels nor the best result', async () => {
    const { service, profiles, exam } = setup();
    await answerInOrder(service, exam, exam.length);
    const state = await answerInOrder(service, exam, 0);
    expect(state).toMatchObject({ outcome: { placedLevel: 'A1', isNewBest: false } });
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'C1', activeLevel: 'C1' });
    expect(service.getBestResult()).toMatchObject({ placedLevel: 'C1', score: 30 });
  });

  it('a higher retake raises the unlock and sets the notice, keeping the active level', async () => {
    const { service, profiles, exam } = setup();
    await answerInOrder(service, exam, 2, 2);
    service.stop();
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'A2', activeLevel: 'A2' });

    await answerInOrder(service, exam, exam.length);
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'C1', activeLevel: 'A2', unlockNoticeLevel: 'C1' });
    expect(service.getBestResult()).toMatchObject({ placedLevel: 'C1' });
  });

  it('a first placement never lowers levels already unlocked', async () => {
    const { service, profiles, exam } = setup();
    profiles.writeLevelState({ highestUnlockedLevel: 'B1', placementStatus: 'skipped' });
    await answerInOrder(service, exam, 0);
    expect(profiles.getProfile()).toMatchObject({ highestUnlockedLevel: 'B1', activeLevel: 'B1', placementStatus: 'taken' });
  });

  it('skipping marks a pending placement as skipped but never undoes a taken one', async () => {
    const { service, profiles, exam } = setup();
    expect(service.skip().placementStatus).toBe('skipped');
    profiles.writeLevelState({ placementStatus: 'pending' });
    await answerInOrder(service, exam, 0);
    expect(service.skip().placementStatus).toBe('taken');
  });

  it('replacing the exam discards an attempt in progress', () => {
    const { service } = setup();
    service.start();
    service.replaceExam(smallPlacementExam());
    expect(() => service.stop()).toThrow(PlacementError);
  });
});

describe('toPlacementErrorResponse', () => {
  it('maps each error kind to a status', () => {
    expect(toPlacementErrorResponse(new PlacementError('x', 'bad_request'))).toEqual({ status: 400, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'grading_failed'))).toEqual({ status: 502, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_session'))).toEqual({ status: 409, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new PlacementError('x', 'no_exam'))).toEqual({ status: 409, body: { error: 'x' } });
    expect(toPlacementErrorResponse(new Error('other'))).toBeNull();
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx vitest run lib/tutoring/placementTypes.test.ts lib/services/placementService.test.ts`
Expected: `placementTypes.test.ts` PASS; `placementService.test.ts` FAIL — `./placementService` does not exist.

- [ ] **Step 6: Implement the service**

Create `lib/services/placementService.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { CefrLevel, Profile } from '../types';
import { gradeFillBlank, gradeMultipleChoice } from '../tutoring/grading';
import type { FreeTextGradingInput } from '../tutoring/freeTextGrading';
import { higherLevel } from '../tutoring/levels';
import { validatePlacementExam, type PlacementQuestion } from '../tutoring/placementExamFormat';
import { maxScore, placedLevel, pointsFor, stopReasonAfterAnswer, type PlacementStopReason } from '../tutoring/placementScoring';
import type {
  PlacementAnswer,
  PlacementAnswerRecord,
  PlacementBestResult,
  PlacementOutcome,
  PlacementQuestionView,
  PlacementState,
} from '../tutoring/placementTypes';
import { gradeFreeText, type FreeTextGradeOutcome } from './freeTextGradingService';
import { createProfileService } from './profileService';
import { createUnlockService } from './unlockService';

export type PlacementErrorKind = 'no_exam' | 'no_session' | 'bad_request' | 'grading_failed';

export class PlacementError extends Error {
  constructor(
    message: string,
    readonly kind: PlacementErrorKind
  ) {
    super(message);
  }
}

export function toPlacementErrorResponse(err: unknown): { status: number; body: { error: string } } | null {
  if (!(err instanceof PlacementError)) return null;
  const status = err.kind === 'bad_request' ? 400 : err.kind === 'grading_failed' ? 502 : 409;
  return { status, body: { error: err.message } };
}

export interface PlacementDeps {
  gradeFreeText: (input: FreeTextGradingInput) => Promise<FreeTextGradeOutcome>;
}

interface QuestionRow {
  id: string;
  position: number;
  level: CefrLevel;
  type: PlacementQuestion['type'];
  content: string;
}

interface SessionRow {
  next_position: number;
  score: number;
  mistakes: number;
  answers: string;
}

interface BestRow {
  score: number;
  max_score: number;
  placed_level: CefrLevel;
  stop_reason: PlacementStopReason;
  taken_at: string;
}

function toView(question: PlacementQuestion, position: number, total: number): PlacementQuestionView {
  const base = { id: question.id, position, total, level: question.level };
  switch (question.type) {
    case 'multiple_choice':
      return { ...base, type: 'multiple_choice', question: question.content.question, options: question.content.options };
    case 'fill_blank':
      return { ...base, type: 'fill_blank', textWithBlank: question.content.textWithBlank };
    case 'free_text':
      return { ...base, type: 'free_text', prompt: question.content.prompt };
  }
}

export function createPlacementService(db: Database.Database, deps?: PlacementDeps) {
  const gradeFree = deps?.gradeFreeText ?? ((input: FreeTextGradingInput) => gradeFreeText(db, input));
  const profiles = createProfileService(db);
  const unlocks = createUnlockService(db);

  function getExam(): PlacementQuestion[] {
    const rows = db.prepare('SELECT * FROM placement_questions ORDER BY position').all() as QuestionRow[];
    return rows.map((r) => ({ id: r.id, level: r.level, type: r.type, content: JSON.parse(r.content) }) as PlacementQuestion);
  }

  function questionCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM placement_questions').get() as { n: number }).n;
  }

  // An attempt in progress refers to the old questions, so it goes too.
  function replaceExam(questions: PlacementQuestion[]): void {
    db.transaction(() => {
      db.prepare('DELETE FROM placement_session').run();
      db.prepare('DELETE FROM placement_questions').run();
      const insert = db.prepare('INSERT INTO placement_questions (id, position, level, type, content) VALUES (?, ?, ?, ?, ?)');
      questions.forEach((q, i) => insert.run(q.id, i + 1, q.level, q.type, JSON.stringify(q.content)));
    })();
  }

  function loadSeedExamIfEmpty(filePath: string): void {
    if (questionCount() > 0 || !existsSync(filePath)) return;
    const parsed = validatePlacementExam(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!parsed.ok) throw new Error(`Bundled placement exam is invalid: ${parsed.errors.join('; ')}`);
    replaceExam(parsed.questions);
  }

  function getSession(): SessionRow {
    const row = db.prepare('SELECT * FROM placement_session WHERE id = 1').get() as SessionRow | undefined;
    if (!row) throw new PlacementError('No placement test is in progress', 'no_session');
    return row;
  }

  function start(): PlacementState {
    const exam = getExam();
    if (exam.length === 0) throw new PlacementError('No placement exam is loaded', 'no_exam');
    db.prepare(
      `INSERT INTO placement_session (id, started_at, next_position, score, mistakes, answers)
       VALUES (1, datetime('now'), 1, 0, 0, '[]')
       ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at, next_position = 1, score = 0, mistakes = 0, answers = '[]'`
    ).run();
    return { status: 'in_progress', question: toView(exam[0], 1, exam.length) };
  }

  async function gradeAnswer(question: PlacementQuestion, answer: PlacementAnswer): Promise<PlacementAnswerRecord> {
    const base = { questionId: question.id, level: question.level, type: question.type };
    if (question.type === 'multiple_choice' && answer.type === 'multiple_choice') {
      const { content } = question;
      return {
        ...base,
        question: content.question,
        given: content.options[answer.selectedIndex] ?? '',
        correctAnswer: content.options[content.correctIndex],
        result: gradeMultipleChoice(content, answer.selectedIndex),
        feedback: null,
      };
    }
    if (question.type === 'fill_blank' && answer.type === 'fill_blank') {
      const { content } = question;
      return {
        ...base,
        question: content.textWithBlank,
        given: answer.text,
        correctAnswer: content.correctAnswer,
        result: gradeFillBlank(content, answer.text),
        feedback: null,
      };
    }
    if (question.type === 'free_text' && answer.type === 'free_text') {
      const { content } = question;
      const graded = await gradeFree({
        prompt: content.prompt,
        modelAnswer: content.modelAnswer,
        studentAnswer: answer.text,
        level: question.level,
        uiLanguage: profiles.getProfile().uiLanguage,
      });
      if (!graded.ok) throw new PlacementError(graded.error, 'grading_failed');
      return {
        ...base,
        question: content.prompt,
        given: answer.text,
        correctAnswer: content.modelAnswer,
        result: graded.result,
        feedback: graded.feedback,
      };
    }
    throw new PlacementError('The answer does not match the question type', 'bad_request');
  }

  async function answer(questionId: string, given: PlacementAnswer): Promise<PlacementState> {
    const exam = getExam();
    const session = getSession();
    const question = exam[session.next_position - 1];
    if (!question || question.id !== questionId) {
      throw new PlacementError('That question is not the current one', 'bad_request');
    }
    const record = await gradeAnswer(question, given);

    // Re-read after the await: a double submit may already have moved the test on.
    const current = getSession();
    if (current.next_position !== session.next_position) {
      throw new PlacementError('That question is not the current one', 'bad_request');
    }
    const answered = current.next_position;
    const score = current.score + pointsFor(question.level, record.result);
    const mistakes = current.mistakes + (record.result === 'wrong' ? 1 : 0);
    const records = [...(JSON.parse(current.answers) as PlacementAnswerRecord[]), record];
    db.prepare('UPDATE placement_session SET next_position = ?, score = ?, mistakes = ?, answers = ? WHERE id = 1').run(
      answered + 1,
      score,
      mistakes,
      JSON.stringify(records)
    );

    const stopReason = stopReasonAfterAnswer(mistakes, answered, exam.length);
    if (stopReason) return { status: 'finished', outcome: finish(stopReason) };
    return { status: 'in_progress', question: toView(exam[answered], answered + 1, exam.length) };
  }

  function stop(): PlacementState {
    getSession();
    return { status: 'finished', outcome: finish('beyond_my_knowledge') };
  }

  function finish(stopReason: PlacementStopReason): PlacementOutcome {
    return db.transaction((): PlacementOutcome => {
      const exam = getExam();
      const session = getSession();
      const placed = placedLevel(session.score, exam);
      const max = maxScore(exam);
      const best = getBestResult();
      const isNewBest = best === null || session.score > best.score;
      if (isNewBest) {
        db.prepare(
          `INSERT INTO placement_best_result (id, score, max_score, placed_level, stop_reason, taken_at)
           VALUES (1, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET score = excluded.score, max_score = excluded.max_score,
             placed_level = excluded.placed_level, stop_reason = excluded.stop_reason, taken_at = excluded.taken_at`
        ).run(session.score, max, placed, stopReason);
      }

      const profile = profiles.getProfile();
      if (profile.placementStatus !== 'taken') {
        // First placement: land on the highest unlocked level, never lowering one already open.
        const highest = higherLevel(profile.highestUnlockedLevel, placed);
        profiles.writeLevelState({ highestUnlockedLevel: highest, activeLevel: highest, placementStatus: 'taken' });
      } else {
        unlocks.raiseUnlockedLevel(placed, { notify: true });
      }

      db.prepare('DELETE FROM placement_session').run();
      return {
        score: session.score,
        maxScore: max,
        placedLevel: placed,
        stopReason,
        answers: JSON.parse(session.answers) as PlacementAnswerRecord[],
        isNewBest,
      };
    })();
  }

  function skip(): Profile {
    const profile = profiles.getProfile();
    if (profile.placementStatus !== 'pending') return profile;
    return profiles.writeLevelState({ placementStatus: 'skipped' });
  }

  function getBestResult(): PlacementBestResult | null {
    const row = db.prepare('SELECT * FROM placement_best_result WHERE id = 1').get() as BestRow | undefined;
    if (!row) return null;
    return {
      score: row.score,
      maxScore: row.max_score,
      placedLevel: row.placed_level,
      stopReason: row.stop_reason,
      takenAt: row.taken_at,
    };
  }

  return { getExam, replaceExam, loadSeedExamIfEmpty, questionCount, start, answer, stop, skip, getBestResult };
}

export type PlacementService = ReturnType<typeof createPlacementService>;
```

- [ ] **Step 7: Verify**

Run: `npx vitest run lib/tutoring/placementTypes.test.ts lib/services/placementService.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/tutoring/placementTypes.ts lib/tutoring/placementTypes.test.ts lib/services/placementService.ts lib/services/placementService.test.ts test/placementFixtures.ts
git commit -m "feat: add placement tables and the placement service"
```

---

### Task 11: Placement API routes and loading the bundled exam

**Files:**
- Create: `app/api/placement/route.ts`, `app/api/placement/start/route.ts`, `app/api/placement/answer/route.ts`, `app/api/placement/stop/route.ts`, `app/api/placement/skip/route.ts`, `app/api/placement/routes.test.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `createPlacementService`, `toPlacementErrorResponse`, `parsePlacementAnswer` (Task 10).
- Produces: `GET /api/placement` → `{ best: PlacementBestResult | null, questionCount: number }`; `POST /api/placement/start` → `PlacementState`; `POST /api/placement/answer` with `{ questionId, answer }` → `PlacementState` (`400` bad request, `409` no test in progress, `502` grading failed; body `{ error }`); `POST /api/placement/stop` → `PlacementState`; `POST /api/placement/skip` → `Profile`.

- [ ] **Step 1: Write the route tests**

Create `app/api/placement/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { smallPlacementExam } from '@/test/placementFixtures';
import { GET } from './route';
import { POST as start } from './start/route';
import { POST as answer } from './answer/route';
import { POST as stop } from './stop/route';
import { POST as skip } from './skip/route';

function answerRequest(body: unknown) {
  return answer(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/placement', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-placement-'));
    createPlacementService(getDb()).replaceExam(smallPlacementExam());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('GET reports the question count and no best result yet', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ best: null, questionCount: 10 });
  });

  it('runs a test from start to Beyond my knowledge', async () => {
    const started = await (await start()).json();
    expect(started).toMatchObject({ status: 'in_progress', question: { id: 'A1-mc', position: 1 } });

    const next = await answerRequest({ questionId: 'A1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({ status: 'in_progress', question: { id: 'A1-fill' } });

    const stopped = await (await stop()).json();
    expect(stopped).toMatchObject({ status: 'finished', outcome: { score: 1, stopReason: 'beyond_my_knowledge' } });
    expect((await (await GET()).json()).best).toMatchObject({ score: 1, placedLevel: 'A1' });
  });

  it('answer returns 400 for a malformed body or the wrong question', async () => {
    await start();
    expect((await answerRequest({ questionId: 'A1-mc' })).status).toBe(400);
    const wrongQuestion = await answerRequest({ questionId: 'C1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(wrongQuestion.status).toBe(400);
    expect(await wrongQuestion.json()).toEqual({ error: 'That question is not the current one' });
  });

  it('answer and stop return 409 when no test is in progress', async () => {
    const res = await answerRequest({ questionId: 'A1-mc', answer: { type: 'multiple_choice', selectedIndex: 0 } });
    expect(res.status).toBe(409);
    expect((await stop()).status).toBe(409);
  });

  it('skip marks the placement as skipped', async () => {
    expect(await (await skip()).json()).toMatchObject({ placementStatus: 'skipped' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/placement/routes.test.ts`
Expected: FAIL — route modules do not exist.

- [ ] **Step 3: Implement the routes**

Create `app/api/placement/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createPlacementService(getDb());
  return NextResponse.json({ best: service.getBestResult(), questionCount: service.questionCount() });
}
```

Create `app/api/placement/start/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService, toPlacementErrorResponse } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(createPlacementService(getDb()).start());
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Create `app/api/placement/answer/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService, toPlacementErrorResponse } from '@/lib/services/placementService';
import { parsePlacementAnswer } from '@/lib/tutoring/placementTypes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const questionId = body?.questionId;
  const answer = parsePlacementAnswer(body?.answer);
  if (typeof questionId !== 'string' || !answer) {
    return NextResponse.json({ error: 'questionId and a valid answer are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createPlacementService(getDb()).answer(questionId, answer));
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Create `app/api/placement/stop/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService, toPlacementErrorResponse } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(createPlacementService(getDb()).stop());
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
```

Create `app/api/placement/skip/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(createPlacementService(getDb()).skip());
}
```

- [ ] **Step 4: Load the bundled exam at startup**

In `app/layout.tsx`, add the import:

```ts
import { createPlacementService } from '@/lib/services/placementService';
```

and add this line directly after the existing `loadSeedIfNeeded(...)` call:

```ts
createPlacementService(getDb()).loadSeedExamIfEmpty(join(process.cwd(), 'data', 'placement-exam.json'));
```

- [ ] **Step 5: Verify**

Run: `npx vitest run app/api/placement/routes.test.ts`
Expected: PASS (5 tests).
Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/api/placement app/layout.tsx
git commit -m "feat: add placement API routes and load the bundled exam"
```

---

### Task 12: The placement test component and page

**Files:**
- Create: `components/placement/PlacementTest.tsx`, `components/placement/PlacementTest.test.tsx`, `components/placement/PlacementPage.tsx`, `app/placement/page.tsx`, `app/placement/page.test.tsx`
- Modify: `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: the placement routes (Task 11); `PlacementState`, `PlacementQuestionView`, `PlacementOutcome`, `PlacementAnswer` types (Task 10); `renderWithIntl`, `delayedResponse` (Task 1).
- Produces: `PlacementTest({ onFinished: () => void; onSkip?: () => void })` — used by the `/placement` page and by onboarding (Task 13); the `placement` catalog namespace.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add this top-level key:

```json
  "placement": {
    "title": "Placement test",
    "intro": "Answer the questions one at a time. They get harder as you go. When a question is beyond what you know, press “Beyond my knowledge”: the test ends there and places you. The test also ends after 5 wrong answers. You will see your answers at the end.",
    "start": "Start the test",
    "skip": "Skip, start at A1",
    "questionOf": "Question {current} of {total}",
    "answerLabel": "Your answer",
    "submit": "Submit answer",
    "submitting": "Checking…",
    "beyond": "Beyond my knowledge",
    "gradingFailed": "Your answer could not be graded: {error}. Your answer is kept, so you can try again.",
    "genericError": "Something went wrong: {error}",
    "resultTitle": "Your result",
    "placedAt": "You placed at {level}.",
    "score": "Score: {score} of {max} points",
    "stopReason": {
      "beyond_my_knowledge": "You stopped with “Beyond my knowledge”.",
      "five_mistakes": "The test ended after 5 wrong answers.",
      "finished": "You answered every question."
    },
    "review": "Your answers",
    "given": "Your answer: {answer}",
    "correctAnswer": "Correct answer: {answer}",
    "modelAnswer": "Model answer: {answer}",
    "feedback": "Feedback: {feedback}",
    "result": {
      "correct": "Correct",
      "almost": "Almost",
      "wrong": "Wrong"
    },
    "noAnswer": "(no answer)",
    "continue": "Continue"
  }
```

In `messages/de.json`, add:

```json
  "placement": {
    "title": "Einstufungstest",
    "intro": "Beantworte die Fragen nacheinander. Sie werden mit der Zeit schwieriger. Wenn eine Frage über dein Wissen hinausgeht, drücke „Übersteigt mein Wissen“: Der Test endet dann und stuft dich ein. Nach 5 falschen Antworten endet der Test ebenfalls. Deine Antworten siehst du am Ende.",
    "start": "Test starten",
    "skip": "Überspringen und mit A1 beginnen",
    "questionOf": "Frage {current} von {total}",
    "answerLabel": "Deine Antwort",
    "submit": "Antwort abschicken",
    "submitting": "Wird geprüft …",
    "beyond": "Übersteigt mein Wissen",
    "gradingFailed": "Deine Antwort konnte nicht bewertet werden: {error}. Deine Antwort bleibt erhalten, du kannst es noch einmal versuchen.",
    "genericError": "Etwas ist schiefgelaufen: {error}",
    "resultTitle": "Dein Ergebnis",
    "placedAt": "Du wurdest auf {level} eingestuft.",
    "score": "Punkte: {score} von {max}",
    "stopReason": {
      "beyond_my_knowledge": "Du hast mit „Übersteigt mein Wissen“ beendet.",
      "five_mistakes": "Der Test endete nach 5 falschen Antworten.",
      "finished": "Du hast alle Fragen beantwortet."
    },
    "review": "Deine Antworten",
    "given": "Deine Antwort: {answer}",
    "correctAnswer": "Richtige Antwort: {answer}",
    "modelAnswer": "Musterantwort: {answer}",
    "feedback": "Rückmeldung: {feedback}",
    "result": {
      "correct": "Richtig",
      "almost": "Fast richtig",
      "wrong": "Falsch"
    },
    "noAnswer": "(keine Antwort)",
    "continue": "Weiter"
  }
```

- [ ] **Step 2: Write the component tests**

Create `components/placement/PlacementTest.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { PlacementTest } from './PlacementTest';

const MC_QUESTION = {
  id: 'q1',
  position: 1,
  total: 3,
  level: 'A1',
  type: 'multiple_choice',
  question: 'Ich ___ Anna.',
  options: ['heißt', 'heiße'],
};
const FREE_QUESTION = { id: 'q2', position: 2, total: 3, level: 'A2', type: 'free_text', prompt: 'Schreib etwas.' };
const OUTCOME = {
  score: 1,
  maxScore: 8,
  placedLevel: 'A1',
  stopReason: 'beyond_my_knowledge',
  isNewBest: true,
  answers: [
    {
      questionId: 'q1',
      level: 'A1',
      type: 'multiple_choice',
      question: 'Ich ___ Anna.',
      given: 'heiße',
      correctAnswer: 'heiße',
      result: 'correct',
      feedback: null,
    },
  ],
};

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PlacementTest', () => {
  it('offers Skip only when onSkip is given', () => {
    const onSkip = vi.fn();
    const { unmount } = renderWithIntl(<PlacementTest onFinished={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText('Skip, start at A1'));
    expect(onSkip).toHaveBeenCalled();
    unmount();

    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    expect(screen.queryByText('Skip, start at A1')).not.toBeInTheDocument();
  });

  it('starts the test and shows the first question', async () => {
    stubFetch({ '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }) });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    expect(await screen.findByText('Ich ___ Anna.')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
  });

  it('keeps Submit disabled until an answer is chosen, then sends it and shows the next question', async () => {
    const fetchMock = stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/answer': () => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    await screen.findByText('Ich ___ Anna.');
    expect(screen.getByText('Submit answer')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('heiße'));
    fireEvent.click(screen.getByText('Submit answer'));

    expect(await screen.findByText('Schreib etwas.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: 'q1', answer: { type: 'multiple_choice', selectedIndex: 1 } }),
    });
  });

  it('keeps the typed answer and shows the error when grading fails', async () => {
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: FREE_QUESTION }),
      '/api/placement/answer': () => delayedResponse({ error: 'Anthropic returned 429' }, { ok: false, status: 502 }),
    });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    const textarea = await screen.findByLabelText('Your answer');
    fireEvent.change(textarea, { target: { value: 'Ich lerne Deutsch.' } });
    fireEvent.click(screen.getByText('Submit answer'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Your answer could not be graded: Anthropic returned 429')
    );
    expect(screen.getByLabelText('Your answer')).toHaveValue('Ich lerne Deutsch.');
  });

  it('ends the test with Beyond my knowledge and shows the result', async () => {
    const onFinished = vi.fn();
    stubFetch({
      '/api/placement/start': () => delayedResponse({ status: 'in_progress', question: MC_QUESTION }),
      '/api/placement/stop': () => delayedResponse({ status: 'finished', outcome: OUTCOME }),
    });
    renderWithIntl(<PlacementTest onFinished={onFinished} />);
    fireEvent.click(screen.getByText('Start the test'));
    await screen.findByText('Ich ___ Anna.');
    fireEvent.click(screen.getByText('Beyond my knowledge'));

    expect(await screen.findByText('You placed at A1.')).toBeInTheDocument();
    expect(screen.getByText('Score: 1 of 8 points')).toBeInTheDocument();
    expect(screen.getByText('You stopped with “Beyond my knowledge”.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: heiße')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue'));
    expect(onFinished).toHaveBeenCalled();
  });

  it('shows an error when the test cannot start', async () => {
    stubFetch({ '/api/placement/start': () => delayedResponse({ error: 'No placement exam is loaded' }, { ok: false, status: 409 }) });
    renderWithIntl(<PlacementTest onFinished={vi.fn()} />);
    fireEvent.click(screen.getByText('Start the test'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong: No placement exam is loaded')
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/placement/PlacementTest.test.tsx`
Expected: FAIL — `./PlacementTest` does not exist.

- [ ] **Step 4: Implement the component**

Create `components/placement/PlacementTest.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  PlacementAnswer,
  PlacementOutcome,
  PlacementQuestionView,
  PlacementState,
} from '@/lib/tutoring/placementTypes';

type Phase = 'intro' | 'question' | 'result';

export function PlacementTest({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) {
  const t = useTranslations('placement');
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<PlacementQuestionView | null>(null);
  const [outcome, setOutcome] = useState<PlacementOutcome | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyState(state: PlacementState) {
    setError(null);
    if (state.status === 'finished') {
      setOutcome(state.outcome);
      setQuestion(null);
      setPhase('result');
      return;
    }
    setQuestion(state.question);
    setSelectedIndex(null);
    setText('');
    setPhase('question');
  }

  async function send(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applyState(data as PlacementState);
      } else {
        const detail = typeof data.error === 'string' ? data.error : String(res.status);
        setError(res.status === 502 ? t('gradingFailed', { error: detail }) : t('genericError', { error: detail }));
      }
    } catch (err) {
      setError(t('genericError', { error: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function currentAnswer(): PlacementAnswer | null {
    if (!question) return null;
    if (question.type === 'multiple_choice') {
      return selectedIndex === null ? null : { type: 'multiple_choice', selectedIndex };
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return question.type === 'fill_blank' ? { type: 'fill_blank', text: trimmed } : { type: 'free_text', text: trimmed };
  }

  if (phase === 'intro') {
    return (
      <div>
        <h2>{t('title')}</h2>
        <p>{t('intro')}</p>
        <button type="button" onClick={() => send('/api/placement/start')} disabled={busy}>
          {t('start')}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} disabled={busy}>
            {t('skip')}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (phase === 'question' && question) {
    const answer = currentAnswer();
    return (
      <div>
        <p>{t('questionOf', { current: question.position, total: question.total })}</p>
        {question.type === 'multiple_choice' && (
          <fieldset>
            <legend>{question.question}</legend>
            {question.options.map((option, index) => (
              <label key={index}>
                <input
                  type="radio"
                  name="placement-option"
                  checked={selectedIndex === index}
                  onChange={() => setSelectedIndex(index)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        )}
        {question.type === 'fill_blank' && (
          <div>
            <p>{question.textWithBlank}</p>
            <input aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        {question.type === 'free_text' && (
          <div>
            <p>{question.prompt}</p>
            <textarea aria-label={t('answerLabel')} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <button
          type="button"
          disabled={busy || answer === null}
          onClick={() => answer && send('/api/placement/answer', { questionId: question.id, answer })}
        >
          {busy ? t('submitting') : t('submit')}
        </button>
        <button type="button" disabled={busy} onClick={() => send('/api/placement/stop')}>
          {t('beyond')}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (!outcome) return null;
  return (
    <div>
      <h2>{t('resultTitle')}</h2>
      <p>{t('placedAt', { level: outcome.placedLevel })}</p>
      <p>{t('score', { score: outcome.score, max: outcome.maxScore })}</p>
      <p>{t(`stopReason.${outcome.stopReason}`)}</p>
      <h3>{t('review')}</h3>
      <ol>
        {outcome.answers.map((a) => (
          <li key={a.questionId}>
            <p>{a.question}</p>
            <p>
              {t('given', { answer: a.given || t('noAnswer') })} — {t(`result.${a.result}`)}
            </p>
            <p>
              {a.type === 'free_text'
                ? t('modelAnswer', { answer: a.correctAnswer })
                : t('correctAnswer', { answer: a.correctAnswer })}
            </p>
            {a.feedback && <p>{t('feedback', { feedback: a.feedback })}</p>}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onFinished}>
        {t('continue')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run components/placement/PlacementTest.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Write the page test**

Create `app/placement/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockGetProfile } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetProfile: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/components/placement/PlacementPage', () => ({ PlacementPage: () => null }));

import Placement from './page';

describe('Placement page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('sends a student who has not finished onboarding to onboarding', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: false });
    Placement();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('renders the test otherwise', () => {
    mockGetProfile.mockReturnValue({ onboardingComplete: true });
    expect(Placement()).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run app/placement/page.test.tsx`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 8: Implement the page**

Create `components/placement/PlacementPage.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { PlacementTest } from './PlacementTest';

export function PlacementPage() {
  const router = useRouter();
  return <PlacementTest onFinished={() => router.push('/')} />;
}
```

Create `app/placement/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { PlacementPage } from '@/components/placement/PlacementPage';

export const dynamic = 'force-dynamic';

export default function Placement() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) {
    redirect('/onboarding');
  }
  return <PlacementPage />;
}
```

- [ ] **Step 9: Verify**

Run: `npx vitest run components/placement app/placement messages/catalogs.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add components/placement app/placement messages
git commit -m "feat: add the placement test component and page"
```

---

### Task 13: Onboarding — translations, saved choices, and the placement step

**Files:**
- Modify: `components/onboarding/OnboardingWizard.tsx`, `components/onboarding/OnboardingWizard.test.tsx`, `app/onboarding/page.tsx`, `messages/en.json`, `messages/de.json`
- Create: `app/onboarding/page.test.tsx`

**Interfaces:**
- Consumes: `PlacementTest` (Task 12); `POST /api/placement/skip` (Task 11); profile `onboardingChoicesSaved` (Task 3).
- Produces: `OnboardingWizard({ initialStep?: 'welcome' | 'placement' })`; the `onboarding` and `tracks` catalog namespaces (`tracks` is also used by Settings in Task 15).

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add these top-level keys:

```json
  "tracks": {
    "generic": "Generic",
    "telc": "TELC",
    "goethe": "Goethe"
  },
  "onboarding": {
    "welcomeTitle": "Welcome to German AI Tutor",
    "getStarted": "Get started",
    "providerTitle": "Connect an AI provider",
    "providerType": "Provider",
    "ollamaHost": "Ollama host",
    "apiKey": "API key",
    "testConnection": "Test connection",
    "connected": "Connected!",
    "model": "Model",
    "next": "Next",
    "saveFailed": "Failed to save provider connection",
    "connectionFailed": "Connection failed",
    "noModels": "No models reported by this provider",
    "modelsFailed": "Could not load models",
    "trackTitle": "Choose your track",
    "languageTitle": "Choose your interface language",
    "saveChoicesFailed": "Could not save your choices. Please try again.",
    "finishFailed": "Could not finish setup. Please try again."
  }
```

In `messages/de.json`, add:

```json
  "tracks": {
    "generic": "Allgemein",
    "telc": "TELC",
    "goethe": "Goethe"
  },
  "onboarding": {
    "welcomeTitle": "Willkommen bei German AI Tutor",
    "getStarted": "Los geht’s",
    "providerTitle": "KI-Anbieter verbinden",
    "providerType": "Anbieter",
    "ollamaHost": "Ollama-Host",
    "apiKey": "API-Schlüssel",
    "testConnection": "Verbindung testen",
    "connected": "Verbunden!",
    "model": "Modell",
    "next": "Weiter",
    "saveFailed": "Die Anbieterverbindung konnte nicht gespeichert werden",
    "connectionFailed": "Verbindung fehlgeschlagen",
    "noModels": "Dieser Anbieter meldet keine Modelle",
    "modelsFailed": "Modelle konnten nicht geladen werden",
    "trackTitle": "Wähle deinen Lernweg",
    "languageTitle": "Wähle die Sprache der Oberfläche",
    "saveChoicesFailed": "Deine Auswahl konnte nicht gespeichert werden. Bitte versuche es noch einmal.",
    "finishFailed": "Die Einrichtung konnte nicht abgeschlossen werden. Bitte versuche es noch einmal."
  }
```

- [ ] **Step 2: Update the wizard tests**

In `components/onboarding/OnboardingWizard.test.tsx`:
- Replace `import { render, screen, fireEvent, waitFor } from '@testing-library/react';` with `import { screen, fireEvent, waitFor } from '@testing-library/react';` and add `import { renderWithIntl } from '@/test/renderWithIntl';`.
- Replace the `vi.mock('next/navigation', ...)` line with:

```ts
const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));
vi.mock('@/components/placement/PlacementTest', () => ({
  PlacementTest: ({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) => (
    <div>
      <button onClick={onFinished}>fake finish</button>
      <button onClick={onSkip}>fake skip</button>
    </div>
  ),
}));
```

- Replace every `render(<OnboardingWizard />);` with `renderWithIntl(<OnboardingWizard />);`.
- In the existing `beforeEach`, add `pushMock.mockClear();` and `refreshMock.mockClear();` so each test's router assertions only see its own calls.
- Replace `await screen.findByText('Choose your track and level');` with `await screen.findByText('Choose your track');`.
- In `stubFetch`, add these two entries to the `routes` object (before `...overrides`):

```ts
    '/api/profile': { ok: true, json: async () => ({}) },
    '/api/placement/skip': { ok: true, json: async () => ({}) },
```

- Add these tests before the final `});`:

```tsx
  it('saves the track and language before the placement step', async () => {
    const fetchMock = stubFetch();
    await connectSuccessfully();
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    fireEvent.change(await screen.findByLabelText('Choose your track'), { target: { value: 'telc' } });
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(screen.getByLabelText('Choose your interface language'), { target: { value: 'de' } });
    fireEvent.click(screen.getByText('Next'));

    await screen.findByText('fake finish');
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeTrack: 'telc', uiLanguage: 'de', onboardingChoicesSaved: true }),
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows an error and stays on the language step when saving the choices fails', async () => {
    stubFetch({ '/api/profile': { ok: false, json: async () => ({}) } });
    renderWithIntl(<OnboardingWizard initialStep="language" />);
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save your choices. Please try again.')
    );
    expect(screen.queryByText('fake finish')).not.toBeInTheDocument();
  });

  it('finishes onboarding after the placement test', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<OnboardingWizard initialStep="placement" />);
    fireEvent.click(screen.getByText('fake finish'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingComplete: true }),
    });
  });

  it('skipping the placement test records the skip and finishes onboarding', async () => {
    const fetchMock = stubFetch();
    renderWithIntl(<OnboardingWizard initialStep="placement" />);
    fireEvent.click(screen.getByText('fake skip'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/skip', { method: 'POST' });
  });
```

The existing `stubFetch` ignores the second fetch argument when matching, so the new entries serve both calls.

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL — `initialStep` isn't supported and the track step still says "Choose your track and level".

- [ ] **Step 4: Rewrite the wizard**

Replace `components/onboarding/OnboardingWizard.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ModelInfo } from '@/lib/providers/types';
import { PlacementTest } from '@/components/placement/PlacementTest';

type Step = 'welcome' | 'provider' | 'track' | 'language' | 'placement';

const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
const TRACKS = ['generic', 'telc', 'goethe'] as const;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function OnboardingWizard({ initialStep = 'welcome' }: { initialStep?: Step }) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const tTracks = useTranslations('tracks');
  const [step, setStep] = useState<Step>(initialStep);
  const [providerType, setProviderType] = useState<(typeof PROVIDER_TYPES)[number]>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [ollamaHost, setOllamaHost] = useState('http://localhost:11434');
  const [validated, setValidated] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [track, setTrack] = useState<(typeof TRACKS)[number]>('generic');
  const [uiLanguage, setUiLanguage] = useState<'en' | 'de'>('en');
  const [saving, setSaving] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  async function handleConnectAndTest() {
    setSaving(true);
    setTestError(null);
    const body = providerType === 'ollama' ? { providerType, ollamaHost } : { providerType, apiKey };
    const createRes = await fetch('/api/providers', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    if (!createRes.ok) {
      setSaving(false);
      setTestError(t('saveFailed'));
      return;
    }
    const created = await createRes.json();
    const testRes = await fetch(`/api/providers/${created.id}/test`, { method: 'POST' });
    const result = await testRes.json();
    setSaving(false);
    if (result.ok) {
      setValidated(true);
      setConnectionId(created.id);
      await fetch('/api/providers/active', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: created.id }),
      });
      await loadModels(created.id);
    } else {
      setTestError(result.error ?? t('connectionFailed'));
    }
  }

  // A provider can be unreachable even after a successful test (e.g. Ollama
  // stopped in between), so a failure here degrades to "no models" rather than
  // blocking onboarding.
  async function loadModels(id: number) {
    setModelsError(null);
    try {
      const res = await fetch(`/api/providers/${id}/models`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setModels(data);
        setSelectedModel(data[0]?.id ?? '');
        if (data.length === 0) setModelsError(t('noModels'));
      } else {
        setModels([]);
        setModelsError(data?.error ?? t('modelsFailed'));
      }
    } catch {
      setModels([]);
      setModelsError(t('modelsFailed'));
    }
  }

  async function handleProviderNext() {
    if (connectionId !== null && selectedModel) {
      await fetch(`/api/providers/${connectionId}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ selectedModel }),
      });
    }
    setStep('track');
  }

  // Saved before the placement test so leaving mid-test can resume there.
  async function handleLanguageNext() {
    setSaving(true);
    setChoicesError(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ activeTrack: track, uiLanguage, onboardingChoicesSaved: true }),
    });
    setSaving(false);
    if (!res.ok) {
      setChoicesError(t('saveChoicesFailed'));
      return;
    }
    router.refresh();
    setStep('placement');
  }

  async function finishOnboarding() {
    setFinishError(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ onboardingComplete: true }),
    });
    if (!res.ok) {
      setFinishError(t('finishFailed'));
      return;
    }
    router.push('/');
  }

  async function skipPlacement() {
    setFinishError(null);
    const res = await fetch('/api/placement/skip', { method: 'POST' });
    if (!res.ok) {
      setFinishError(t('finishFailed'));
      return;
    }
    await finishOnboarding();
  }

  if (step === 'welcome') {
    return (
      <div>
        <h1>{t('welcomeTitle')}</h1>
        <button onClick={() => setStep('provider')}>{t('getStarted')}</button>
      </div>
    );
  }

  if (step === 'provider') {
    return (
      <div>
        <h2>{t('providerTitle')}</h2>
        <select
          aria-label={t('providerType')}
          value={providerType}
          onChange={(e) => setProviderType(e.target.value as typeof providerType)}
        >
          {PROVIDER_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {providerType === 'ollama' ? (
          <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder={t('ollamaHost')} />
        ) : (
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('apiKey')} type="password" />
        )}
        <button onClick={handleConnectAndTest} disabled={saving}>
          {t('testConnection')}
        </button>
        {testError && <p role="alert">{testError}</p>}
        {validated && <p>{t('connected')}</p>}
        {validated && models.length > 0 && (
          <label>
            {t('model')}
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {validated && modelsError && <p>{modelsError}</p>}
        <button onClick={handleProviderNext} disabled={!validated}>
          {t('next')}
        </button>
      </div>
    );
  }

  if (step === 'track') {
    return (
      <div>
        <h2>{t('trackTitle')}</h2>
        <select aria-label={t('trackTitle')} value={track} onChange={(e) => setTrack(e.target.value as typeof track)}>
          {TRACKS.map((trackOption) => (
            <option key={trackOption} value={trackOption}>
              {tTracks(trackOption)}
            </option>
          ))}
        </select>
        <button onClick={() => setStep('language')}>{t('next')}</button>
      </div>
    );
  }

  if (step === 'language') {
    return (
      <div>
        <h2>{t('languageTitle')}</h2>
        <select
          aria-label={t('languageTitle')}
          value={uiLanguage}
          onChange={(e) => setUiLanguage(e.target.value as 'en' | 'de')}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
        <button onClick={handleLanguageNext} disabled={saving}>
          {t('next')}
        </button>
        {choicesError && <p role="alert">{choicesError}</p>}
      </div>
    );
  }

  return (
    <div>
      {finishError && <p role="alert">{finishError}</p>}
      <PlacementTest onFinished={finishOnboarding} onSkip={skipPlacement} />
    </div>
  );
}
```

- [ ] **Step 5: Run the wizard tests**

Run: `npx vitest run components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the onboarding page test**

Create `app/onboarding/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';

const { mockGetProfile, mockGetActiveConnection } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockGetActiveConnection: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/crypto/keyfile', () => ({ defaultKeyFilePath: () => '/tmp/unused.key' }));
vi.mock('@/lib/services/profileService', () => ({
  createProfileService: () => ({ getProfile: mockGetProfile }),
}));
vi.mock('@/lib/services/providerService', () => ({
  createProviderService: () => ({ getActiveConnection: mockGetActiveConnection }),
}));
vi.mock('@/components/onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => null }));

import OnboardingPage from './page';

describe('Onboarding page', () => {
  it('resumes at the placement step when choices are saved and the provider works', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: true });
    mockGetActiveConnection.mockReturnValue({ lastValidatedStatus: 'valid' });
    expect(OnboardingPage().props).toEqual({ initialStep: 'placement' });
  });

  it('starts from the welcome step when the choices were never saved', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: false });
    mockGetActiveConnection.mockReturnValue({ lastValidatedStatus: 'valid' });
    expect(OnboardingPage().props).toEqual({ initialStep: 'welcome' });
  });

  it('starts from the welcome step when there is no working provider', () => {
    mockGetProfile.mockReturnValue({ onboardingChoicesSaved: true });
    mockGetActiveConnection.mockReturnValue(null);
    expect(OnboardingPage().props).toEqual({ initialStep: 'welcome' });
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run app/onboarding/page.test.tsx`
Expected: FAIL — the page renders the wizard without an `initialStep` prop.

- [ ] **Step 8: Update the onboarding page**

Replace `app/onboarding/page.tsx` with:

```tsx
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProfileService } from '@/lib/services/profileService';
import { createProviderService } from '@/lib/services/providerService';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  const db = getDb();
  const profile = createProfileService(db).getProfile();
  const active = createProviderService(db, defaultKeyFilePath()).getActiveConnection();
  const resumeAtPlacement = profile.onboardingChoicesSaved && active?.lastValidatedStatus === 'valid';
  return <OnboardingWizard initialStep={resumeAtPlacement ? 'placement' : 'welcome'} />;
}
```

- [ ] **Step 9: Verify**

Run: `npx vitest run components/onboarding app/onboarding messages/catalogs.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add components/onboarding app/onboarding messages
git commit -m "feat: add the placement step to onboarding and translate it"
```

---

### Task 14: Home notices — pending placement and unlocked levels

**Files:**
- Create: `components/home/HomeNotices.tsx`, `components/home/HomeNotices.test.tsx`
- Modify: `app/page.tsx`, `app/page.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/profile`, `POST /api/placement/skip` (Task 11), `POST /api/tutoring/unlock-notice` (Task 4).
- Produces: `HomeNotices` component (Plan 1B places it in the tree); the `notices` catalog namespace.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add:

```json
  "notices": {
    "placementPrompt": "Find your level: the placement test unlocks the levels that fit you.",
    "takeTest": "Take the placement test",
    "skip": "Skip, start at A1",
    "unlocked": "{level} unlocked — switch to {level}?",
    "switch": "Switch",
    "dismiss": "Dismiss",
    "error": "Something went wrong. Please reload the page."
  }
```

In `messages/de.json`, add:

```json
  "notices": {
    "placementPrompt": "Finde dein Niveau: Der Einstufungstest schaltet die passenden Niveaus für dich frei.",
    "takeTest": "Einstufungstest machen",
    "skip": "Überspringen und mit A1 beginnen",
    "unlocked": "{level} freigeschaltet – zu {level} wechseln?",
    "switch": "Wechseln",
    "dismiss": "Ausblenden",
    "error": "Etwas ist schiefgelaufen. Bitte lade die Seite neu."
  }
```

- [ ] **Step 2: Write the tests**

Create `components/home/HomeNotices.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { HomeNotices } from './HomeNotices';

const BASE_PROFILE = { placementStatus: 'taken', unlockNoticeLevel: null };

function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('HomeNotices', () => {
  it('prompts for the placement test while it is pending, and skipping hides the prompt', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, placementStatus: 'pending' }),
      '/api/placement/skip': () => delayedResponse({ ...BASE_PROFILE, placementStatus: 'skipped' }),
    });
    renderWithIntl(<HomeNotices />);
    expect(await screen.findByRole('link', { name: 'Take the placement test' })).toHaveAttribute('href', '/placement');

    fireEvent.click(screen.getByText('Skip, start at A1'));
    await waitFor(() => expect(screen.queryByText('Take the placement test')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/placement/skip', { method: 'POST' });
  });

  it('offers to switch to a newly unlocked level', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse(BASE_PROFILE),
    });
    renderWithIntl(<HomeNotices />);
    expect(await screen.findByText('A2 unlocked — switch to A2?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Switch'));
    await waitFor(() => expect(screen.queryByText('A2 unlocked — switch to A2?')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/unlock-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch' }),
    });
  });

  it('dismisses the unlock notice', async () => {
    const fetchMock = stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'B1' }),
      '/api/tutoring/unlock-notice': () => delayedResponse(BASE_PROFILE),
    });
    renderWithIntl(<HomeNotices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('B1 unlocked — switch to B1?')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/tutoring/unlock-notice', expect.objectContaining({
      body: JSON.stringify({ action: 'dismiss' }),
    }));
  });

  it('shows nothing when nothing is pending', async () => {
    const fetchMock = stubFetch({ '/api/profile': () => delayedResponse(BASE_PROFILE) });
    const { container } = renderWithIntl(<HomeNotices />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an alert when the profile cannot be loaded', async () => {
    stubFetch({ '/api/profile': () => delayedResponse({}, { ok: false, status: 500 }) });
    renderWithIntl(<HomeNotices />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please reload the page.')
    );
  });

  it('shows an alert when an action fails', async () => {
    stubFetch({
      '/api/profile': () => delayedResponse({ ...BASE_PROFILE, unlockNoticeLevel: 'A2' }),
      '/api/tutoring/unlock-notice': () => delayedResponse({}, { ok: false, status: 500 }),
    });
    renderWithIntl(<HomeNotices />);
    fireEvent.click(await screen.findByText('Switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/home/HomeNotices.test.tsx`
Expected: FAIL — `./HomeNotices` does not exist.

- [ ] **Step 4: Implement the component**

Create `components/home/HomeNotices.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/types';

export function HomeNotices() {
  const t = useTranslations('notices');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(
        url,
        body === undefined
          ? { method: 'POST' }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error(String(res.status));
      setProfile(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <p role="alert">{t('error')}</p>;
  if (!profile) return null;
  if (profile.placementStatus !== 'pending' && !profile.unlockNoticeLevel) return null;

  return (
    <div>
      {profile.placementStatus === 'pending' && (
        <div>
          <p>{t('placementPrompt')}</p>
          <Link href="/placement">{t('takeTest')}</Link>{' '}
          <button type="button" disabled={busy} onClick={() => post('/api/placement/skip')}>
            {t('skip')}
          </button>
        </div>
      )}
      {profile.unlockNoticeLevel && (
        <div>
          <p>{t('unlocked', { level: profile.unlockNoticeLevel })}</p>
          <button type="button" disabled={busy} onClick={() => post('/api/tutoring/unlock-notice', { action: 'switch' })}>
            {t('switch')}
          </button>
          <button
            type="button"
            aria-label={t('dismiss')}
            disabled={busy}
            onClick={() => post('/api/tutoring/unlock-notice', { action: 'dismiss' })}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Show it on the home page**

In `app/page.tsx`, add `import { HomeNotices } from '@/components/home/HomeNotices';` and render `<HomeNotices />` between `<ActiveProviderBanner />` and `<HomeIntro />`.

In `app/page.test.tsx`, add:

```ts
vi.mock('@/components/home/HomeNotices', () => ({ HomeNotices: () => null }));
```

- [ ] **Step 6: Verify**

Run: `npx vitest run components/home app/page.test.tsx messages/catalogs.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/home app/page.tsx app/page.test.tsx messages
git commit -m "feat: show placement and unlocked-level notices on the home page"
```

---

### Task 15: Settings — translations, unlocked levels, and the placement result

**Files:**
- Modify: `components/settings/SettingsPage.tsx`, `components/settings/SettingsPage.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `GET /api/placement` (Task 11); profile PATCH returning `400 { error }` for a locked level (Task 3); `levelsUpTo` (Task 3); `tracks` namespace (Task 13).
- Produces: the `settings` catalog namespace.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add:

```json
  "settings": {
    "backHome": "Back to home",
    "loadFailed": "Could not load your settings. Please reload the page.",
    "providers": "Providers",
    "activeMarker": "— active",
    "makeActive": "Make active",
    "retest": "Re-test",
    "remove": "Remove",
    "usage": "{requests} requests, {tokens} tokens (last {days} days)",
    "addProvider": "Add provider",
    "newProviderType": "New provider type",
    "ollamaHost": "Ollama host",
    "apiKey": "API key",
    "saveProvider": "Save provider",
    "cancel": "Cancel",
    "saveFailed": "Failed to save provider connection",
    "chooseModel": "Choose a model",
    "model": "Model",
    "noModelsAvailable": "No models available",
    "noModels": "No models reported by this provider",
    "modelsFailed": "Could not load models",
    "done": "Done",
    "trackLevel": "Track & level",
    "trackLabel": "Track",
    "levelLabel": "Level",
    "levelHint": "Levels above {level} unlock as you finish lessons or place higher in the placement test.",
    "profileSaveFailed": "Could not save this setting: {error}",
    "placement": "Placement test",
    "placementBest": "Best result: {level} ({score} of {max} points, {date})",
    "placementNone": "You have not taken the placement test yet.",
    "placementTake": "Take the placement test",
    "placementRetake": "Retake the placement test",
    "placementLoadFailed": "Could not load your placement result.",
    "language": "Language",
    "freestyle": "Freestyle mode",
    "freestyleDefault": "Default to freestyle mode",
    "backup": "Backup",
    "exportBackup": "Export backup",
    "dangerZone": "Danger zone",
    "resetConfirm": "This deletes all local data permanently. Are you sure?",
    "resetYes": "Yes, reset everything",
    "reset": "Reset app data"
  }
```

In `messages/de.json`, add:

```json
  "settings": {
    "backHome": "Zurück zur Startseite",
    "loadFailed": "Deine Einstellungen konnten nicht geladen werden. Bitte lade die Seite neu.",
    "providers": "KI-Anbieter",
    "activeMarker": "— aktiv",
    "makeActive": "Aktivieren",
    "retest": "Erneut testen",
    "remove": "Entfernen",
    "usage": "{requests} Anfragen, {tokens} Tokens (letzte {days} Tage)",
    "addProvider": "Anbieter hinzufügen",
    "newProviderType": "Neuer Anbietertyp",
    "ollamaHost": "Ollama-Host",
    "apiKey": "API-Schlüssel",
    "saveProvider": "Anbieter speichern",
    "cancel": "Abbrechen",
    "saveFailed": "Die Anbieterverbindung konnte nicht gespeichert werden",
    "chooseModel": "Modell auswählen",
    "model": "Modell",
    "noModelsAvailable": "Keine Modelle verfügbar",
    "noModels": "Dieser Anbieter meldet keine Modelle",
    "modelsFailed": "Modelle konnten nicht geladen werden",
    "done": "Fertig",
    "trackLevel": "Lernweg & Niveau",
    "trackLabel": "Lernweg",
    "levelLabel": "Niveau",
    "levelHint": "Niveaus über {level} werden freigeschaltet, wenn du Lektionen abschließt oder im Einstufungstest höher eingestuft wirst.",
    "profileSaveFailed": "Diese Einstellung konnte nicht gespeichert werden: {error}",
    "placement": "Einstufungstest",
    "placementBest": "Bestes Ergebnis: {level} ({score} von {max} Punkten, {date})",
    "placementNone": "Du hast den Einstufungstest noch nicht gemacht.",
    "placementTake": "Einstufungstest machen",
    "placementRetake": "Einstufungstest wiederholen",
    "placementLoadFailed": "Dein Einstufungsergebnis konnte nicht geladen werden.",
    "language": "Sprache",
    "freestyle": "Freestyle-Modus",
    "freestyleDefault": "Standardmäßig im Freestyle-Modus starten",
    "backup": "Sicherung",
    "exportBackup": "Sicherung exportieren",
    "dangerZone": "Gefahrenbereich",
    "resetConfirm": "Dadurch werden alle lokalen Daten dauerhaft gelöscht. Bist du sicher?",
    "resetYes": "Ja, alles zurücksetzen",
    "reset": "App-Daten zurücksetzen"
  }
```

- [ ] **Step 2: Update the settings tests**

In `components/settings/SettingsPage.test.tsx`:
- Replace `import { render, screen, fireEvent, waitFor } from '@testing-library/react';` with `import { screen, fireEvent, waitFor } from '@testing-library/react';`, and add `import { renderWithIntl } from '@/test/renderWithIntl';` plus, before the `SettingsPage` import:

```ts
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));
```

- Replace every `render(<SettingsPage />);` with `renderWithIntl(<SettingsPage />);`.
- Replace the `PROFILE` constant with:

```ts
const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  freestyleDefault: false,
  onboardingComplete: true,
  highestUnlockedLevel: 'B1',
  placementStatus: 'taken',
  unlockNoticeLevel: null,
  onboardingChoicesSaved: true,
  updatedAt: '',
};
```

- Add these tests before the final `});`:

```tsx
  it('offers only the unlocked levels', async () => {
    stubFetch();
    renderWithIntl(<SettingsPage />);
    const levelSelect = await screen.findByLabelText('Level');
    const options = Array.from(levelSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['A1', 'A2', 'B1']);
    expect(screen.getByText('Levels above B1 unlock as you finish lessons or place higher in the placement test.')).toBeInTheDocument();
  });

  it('shows an error when a setting cannot be saved', async () => {
    stubFetch({ 'PATCH /api/profile': { ok: false, status: 400, json: async () => ({ error: 'Level B1 is locked' }) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Level'), { target: { value: 'B1' } });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save this setting: Level B1 is locked')
    );
  });

  it('refreshes the page after changing the interface language', async () => {
    stubFetch({ 'PATCH /api/profile': { ok: true, json: async () => ({ ...PROFILE, uiLanguage: 'de' }) } });
    renderWithIntl(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'de' } });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows the best placement result and a retake link', async () => {
    stubFetch({
      'GET /api/placement': {
        ok: true,
        json: async () => ({
          best: { score: 24, maxScore: 120, placedLevel: 'B1', stopReason: 'five_mistakes', takenAt: '2026-09-24 10:00:00' },
          questionCount: 40,
        }),
      },
    });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByText('Best result: B1 (24 of 120 points, 2026-09-24)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retake the placement test' })).toHaveAttribute('href', '/placement');
  });

  it('offers the placement test when it was never taken', async () => {
    stubFetch({ 'GET /api/placement': { ok: true, json: async () => ({ best: null, questionCount: 40 }) } });
    renderWithIntl(<SettingsPage />);
    expect(await screen.findByText('You have not taken the placement test yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the placement test' })).toBeInTheDocument();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    stubFetch({ 'GET /api/profile': { ok: false, status: 500, json: async () => ({}) } });
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load your settings. Please reload the page.')
    );
  });
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx vitest run components/settings/SettingsPage.test.tsx`
Expected: FAIL — no labelled Level select, no placement section.

- [ ] **Step 4: Rewrite the settings page**

Replace `components/settings/SettingsPage.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ProviderConnection, Profile, ProviderType, Track } from '@/lib/types';
import type { ModelInfo } from '@/lib/providers/types';
import type { PlacementBestResult } from '@/lib/tutoring/placementTypes';
import { levelsUpTo } from '@/lib/tutoring/levels';

const PROVIDER_TYPES: ProviderType[] = ['anthropic', 'openai', 'gemini', 'ollama'];
const TRACKS: Track[] = ['generic', 'telc', 'goethe'];
const USAGE_WINDOW_DAYS = 7;

interface UsageTotals {
  requestCount: number;
  tokenCount: number;
}

export function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tTracks = useTranslations('tracks');
  const tCommon = useTranslations('common');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [placementBest, setPlacementBest] = useState<PlacementBestResult | null | undefined>(undefined);
  const [placementFailed, setPlacementFailed] = useState(false);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [usage, setUsage] = useState<Record<number, UsageTotals>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('anthropic');
  const [newApiKey, setNewApiKey] = useState('');
  const [newOllamaHost, setNewOllamaHost] = useState('http://localhost:11434');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedConnectionId, setAddedConnectionId] = useState<number | null>(null);
  const [newModels, setNewModels] = useState<ModelInfo[]>([]);
  const [newSelectedModel, setNewSelectedModel] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setProfile(await res.json());
      })
      .catch(() => setLoadFailed(true));
    fetch('/api/placement')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setPlacementBest(data.best ?? null);
      })
      .catch(() => setPlacementFailed(true));
    fetch('/api/providers').then((r) => r.json()).then(setConnections);
  }, []);

  // Powers the spec's "approaching your limit" view: a per-connection rollup of
  // the last week's requests/tokens, refreshed whenever the list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      connections.map(async (c) => {
        const res = await fetch(`/api/usage?connectionId=${c.id}&days=${USAGE_WINDOW_DAYS}`);
        const days = await res.json();
        const totals: UsageTotals = Array.isArray(days)
          ? days.reduce(
              (acc, d) => ({
                requestCount: acc.requestCount + (d.requestCount ?? 0),
                tokenCount: acc.tokenCount + (d.tokenCount ?? 0),
              }),
              { requestCount: 0, tokenCount: 0 }
            )
          : { requestCount: 0, tokenCount: 0 };
        return [c.id, totals] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setUsage(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setUsage({});
      });
    return () => {
      cancelled = true;
    };
  }, [connections]);

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

  function closeAddProvider() {
    setNewProviderType('anthropic');
    setNewApiKey('');
    setNewOllamaHost('http://localhost:11434');
    setAddError(null);
    setAddedConnectionId(null);
    setNewModels([]);
    setNewSelectedModel('');
    setModelsError(null);
    setShowAddProvider(false);
  }

  async function handleAddProvider() {
    setAdding(true);
    setAddError(null);
    const body =
      newProviderType === 'ollama'
        ? { providerType: newProviderType, ollamaHost: newOllamaHost }
        : { providerType: newProviderType, apiKey: newApiKey };
    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (!res.ok) {
      setAddError(t('saveFailed'));
      return;
    }
    const created = await res.json();
    await refreshConnections();
    setAddedConnectionId(created.id);
    await loadModels(created.id);
  }

  // The provider may be unreachable (Ollama not running, bad key); the
  // connection is already saved, so degrade to "no models" instead of failing.
  async function loadModels(id: number) {
    setModelsError(null);
    try {
      const res = await fetch(`/api/providers/${id}/models`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setNewModels(data);
        setNewSelectedModel(data[0]?.id ?? '');
        if (data.length === 0) setModelsError(t('noModels'));
      } else {
        setNewModels([]);
        setModelsError(data?.error ?? t('modelsFailed'));
      }
    } catch {
      setNewModels([]);
      setModelsError(t('modelsFailed'));
    }
  }

  async function handleSaveModel() {
    if (addedConnectionId !== null && newSelectedModel) {
      await fetch(`/api/providers/${addedConnectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModel: newSelectedModel }),
      });
      await refreshConnections();
    }
    closeAddProvider();
  }

  async function handleProfileChange(patch: Partial<Profile>) {
    setProfileError(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(t('profileSaveFailed', { error: data.error ?? String(res.status) }));
      return;
    }
    setProfile(data);
    // The interface language is applied by the server layout, so re-render it.
    if (patch.uiLanguage) router.refresh();
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

  if (loadFailed) return <p role="alert">{t('loadFailed')}</p>;
  if (!profile) return <p>{tCommon('loading')}</p>;

  return (
    <div>
      <nav>
        <Link href="/">{t('backHome')}</Link>
      </nav>
      {profileError && <p role="alert">{profileError}</p>}
      <section>
        <h2>{t('providers')}</h2>
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              {c.providerType} ({c.lastValidatedStatus}){c.selectedModel ? ` — ${c.selectedModel}` : ''}
              {c.isActive ? ` ${t('activeMarker')}` : ''}
              <button onClick={() => handleSetActive(c.id)} disabled={c.isActive}>
                {t('makeActive')}
              </button>
              <button onClick={() => handleRetest(c.id)}>{t('retest')}</button>
              <button onClick={() => handleDelete(c.id)}>{t('remove')}</button>
              <span>
                {' '}
                {t('usage', {
                  requests: String(usage[c.id]?.requestCount ?? 0),
                  tokens: String(usage[c.id]?.tokenCount ?? 0),
                  days: String(USAGE_WINDOW_DAYS),
                })}
              </span>
            </li>
          ))}
        </ul>

        {!showAddProvider && <button onClick={() => setShowAddProvider(true)}>{t('addProvider')}</button>}

        {showAddProvider && addedConnectionId === null && (
          <div>
            <h3>{t('addProvider')}</h3>
            <select
              aria-label={t('newProviderType')}
              value={newProviderType}
              onChange={(e) => setNewProviderType(e.target.value as ProviderType)}
            >
              {PROVIDER_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {newProviderType === 'ollama' ? (
              <input
                value={newOllamaHost}
                onChange={(e) => setNewOllamaHost(e.target.value)}
                placeholder={t('ollamaHost')}
              />
            ) : (
              <input
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={t('apiKey')}
                type="password"
              />
            )}
            <button onClick={handleAddProvider} disabled={adding}>
              {t('saveProvider')}
            </button>
            <button onClick={closeAddProvider}>{t('cancel')}</button>
            {addError && <p role="alert">{addError}</p>}
          </div>
        )}

        {showAddProvider && addedConnectionId !== null && (
          <div>
            <h3>{t('chooseModel')}</h3>
            {newModels.length > 0 ? (
              <label>
                {t('model')}
                <select value={newSelectedModel} onChange={(e) => setNewSelectedModel(e.target.value)}>
                  {newModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{modelsError ?? t('noModelsAvailable')}</p>
            )}
            <button onClick={handleSaveModel}>{t('done')}</button>
          </div>
        )}
      </section>

      <section>
        <h2>{t('trackLevel')}</h2>
        <select
          aria-label={t('trackLabel')}
          value={profile.activeTrack}
          onChange={(e) => handleProfileChange({ activeTrack: e.target.value as Track })}
        >
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {tTracks(track)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('levelLabel')}
          value={profile.activeLevel}
          onChange={(e) => handleProfileChange({ activeLevel: e.target.value as Profile['activeLevel'] })}
        >
          {levelsUpTo(profile.highestUnlockedLevel).map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        {profile.highestUnlockedLevel !== 'C1' && <p>{t('levelHint', { level: profile.highestUnlockedLevel })}</p>}
      </section>

      <section>
        <h2>{t('placement')}</h2>
        {placementFailed && <p role="alert">{t('placementLoadFailed')}</p>}
        {placementBest === null && <p>{t('placementNone')}</p>}
        {placementBest && (
          <p>
            {t('placementBest', {
              level: placementBest.placedLevel,
              score: placementBest.score,
              max: placementBest.maxScore,
              date: placementBest.takenAt.slice(0, 10),
            })}
          </p>
        )}
        {placementBest !== undefined && (
          <Link href="/placement">{placementBest ? t('placementRetake') : t('placementTake')}</Link>
        )}
      </section>

      <section>
        <h2>{t('language')}</h2>
        <select
          aria-label={t('language')}
          value={profile.uiLanguage}
          onChange={(e) => handleProfileChange({ uiLanguage: e.target.value as 'en' | 'de' })}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </section>

      <section>
        <h2>{t('freestyle')}</h2>
        <label>
          <input
            type="checkbox"
            checked={profile.freestyleDefault}
            onChange={(e) => handleProfileChange({ freestyleDefault: e.target.checked })}
          />
          {t('freestyleDefault')}
        </label>
      </section>

      <section>
        <h2>{t('backup')}</h2>
        <button onClick={handleExport}>{t('exportBackup')}</button>
        <input
          type="file"
          accept=".gaitbackup"
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
        />
      </section>

      <section>
        <h2>{t('dangerZone')}</h2>
        {confirmingReset ? (
          <>
            <p>{t('resetConfirm')}</p>
            <button onClick={handleReset}>{t('resetYes')}</button>
            <button onClick={() => setConfirmingReset(false)}>{t('cancel')}</button>
          </>
        ) : (
          <button onClick={() => setConfirmingReset(true)}>{t('reset')}</button>
        )}
      </section>
    </div>
  );
}
```

The usage numbers are passed as strings on purpose: next-intl formats numeric arguments with locale grouping, which would turn `2000` into `2,000` and change the text the existing usage test checks.

- [ ] **Step 5: Verify**

Run: `npx vitest run components/settings/SettingsPage.test.tsx messages/catalogs.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/settings messages
git commit -m "feat: translate Settings, limit levels to unlocked ones, show placement result"
```

---

### Task 16: Flashcards only in vocabulary lessons

**Files:**
- Modify: `lib/services/lessonAdminService.ts`, `lib/services/lessonAdminService.test.ts`, `components/admin/ExerciseEditor.tsx`, `components/admin/ExerciseEditor.test.tsx`, `components/admin/LessonEditorForm.tsx`

**Interfaces:**
- Produces: `flashcardRuleViolation(skill: Skill, exercises: { type: ExerciseType }[]): string | null` exported from `lessonAdminService.ts`; `createLesson`/`updateLesson` throw that message; `ExerciseEditor` accepts `allowFlashcards?: boolean` (default `true`).

- [ ] **Step 1: Write the service tests**

In `lib/services/lessonAdminService.test.ts`:
- Change `import { createLessonAdminService } from './lessonAdminService';` to `import { createLessonAdminService, flashcardRuleViolation, type UpdateLessonInput } from './lessonAdminService';` and add `import type { ExerciseInput } from '../curriculum-admin/exerciseReconciliation';`.
- The existing test that creates the `modal-verbs` lesson (it checks that a new exercise gets a minted `a1-modal-verbs__ex-…` id) creates a **grammar** lesson with a flashcard, which the new rule rejects. In that test's `createLesson({ ... })` call, change `skill: 'grammar',` to `skill: 'vocabulary',`. The test is about id minting, not skill, so this keeps it testing the same thing.
- Append this `describe` block at the end of the file:

```ts
describe('flashcard rule', () => {
  function setupRule() {
    const db = createDbClient(':memory:');
    seedMilestoneAndSection(db);
    return { db, service: createLessonAdminService(db) };
  }

  const flashcard: ExerciseInput = { type: 'flashcard', content: { front: 'der Hund', back: 'the dog' } };
  const multipleChoice: ExerciseInput = {
    type: 'multiple_choice',
    content: { question: 'Q', options: ['a', 'b'], correctIndex: 0 },
  };

  function lessonFields(skill: 'grammar' | 'vocabulary', exercises: ExerciseInput[]): UpdateLessonInput {
    return {
      track: 'generic',
      sourceLevel: 'A1',
      skill,
      title: 'Rule test',
      explanation: null,
      examples: null,
      exercises,
      prerequisiteIds: [],
      placement: { sectionId: 's1' },
    };
  }

  it('describes a violation with the exact message', () => {
    expect(flashcardRuleViolation('grammar', [flashcard, flashcard, multipleChoice])).toBe(
      'This lesson has 2 flashcards, which are only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(flashcardRuleViolation('grammar', [flashcard])).toBe(
      'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(flashcardRuleViolation('vocabulary', [flashcard])).toBeNull();
    expect(flashcardRuleViolation('grammar', [multipleChoice])).toBeNull();
  });

  it('allows flashcards in a vocabulary lesson', () => {
    const { service } = setupRule();
    expect(service.createLesson({ slug: 'rule-test', ...lessonFields('vocabulary', [flashcard]) }).id).toBe('a1-rule-test');
  });

  it('refuses to create a non-vocabulary lesson with a flashcard', () => {
    const { db, service } = setupRule();
    expect(() =>
      service.createLesson({ slug: 'rule-test', ...lessonFields('grammar', [flashcard, multipleChoice]) })
    ).toThrow('This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.');
    expect(db.prepare('SELECT COUNT(*) AS n FROM lessons').get()).toEqual({ n: 0 });
  });

  it('refuses to change a vocabulary lesson with flashcards to another skill', () => {
    const { db, service } = setupRule();
    service.createLesson({ slug: 'rule-test', ...lessonFields('vocabulary', [flashcard]) });
    expect(() => service.updateLesson('a1-rule-test', lessonFields('grammar', [flashcard]))).toThrow(
      'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    );
    expect(db.prepare('SELECT skill FROM lessons WHERE id = ?').get('a1-rule-test')).toEqual({ skill: 'vocabulary' });
  });
});
```

`seedMilestoneAndSection` is the helper already defined at the top of this test file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: FAIL — `flashcardRuleViolation` is not exported.

- [ ] **Step 3: Enforce the rule in the service**

In `lib/services/lessonAdminService.ts`:
- Add `ExerciseType` to the import from `'../curriculum/types'` (it becomes `import type { Skill, Lesson, ExerciseType } from '../curriculum/types';`).
- Add above `export function createLessonAdminService`:

```ts
export function flashcardRuleViolation(skill: Skill, exercises: { type: ExerciseType }[]): string | null {
  if (skill === 'vocabulary') return null;
  const count = exercises.filter((e) => e.type === 'flashcard').length;
  if (count === 0) return null;
  return count === 1
    ? 'This lesson has 1 flashcard, which is only allowed in vocabulary lessons. Remove or change them first.'
    : `This lesson has ${count} flashcards, which are only allowed in vocabulary lessons. Remove or change them first.`;
}

function assertFlashcardRule(skill: Skill, exercises: { type: ExerciseType }[]): void {
  const violation = flashcardRuleViolation(skill, exercises);
  if (violation) throw new Error(violation);
}
```

- In `createLesson`, add `assertFlashcardRule(input.skill, input.exercises);` as the first line inside the `db.transaction(() => { ... })` callback.
- In `updateLesson`, add `assertFlashcardRule(input.skill, input.exercises);` as the first line inside its `db.transaction(() => { ... })` callback.

- [ ] **Step 4: Run the service tests**

Run: `npx vitest run lib/services/lessonAdminService.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the editor tests**

Add these tests to `components/admin/ExerciseEditor.test.tsx`. If the file doesn't already import them, add `import { render, screen, fireEvent } from '@testing-library/react';`, `import { describe, it, expect, vi } from 'vitest';` and `import { ExerciseEditor } from './ExerciseEditor';`.

```tsx
describe('ExerciseEditor flashcard rule', () => {
  it('adds a multiple-choice exercise by default when flashcards are not allowed', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} allowFlashcards={false} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([
      { type: 'multiple_choice', content: { question: '', options: ['', ''], correctIndex: 0 } },
    ]);
  });

  it('hides the flashcard type for a non-flashcard exercise when flashcards are not allowed', () => {
    render(
      <ExerciseEditor
        exercises={[{ type: 'fill_blank', content: { textWithBlank: 'a ___', correctAnswer: 'b' } }]}
        onChange={vi.fn()}
        allowFlashcards={false}
      />
    );
    const options = Array.from(screen.getByLabelText('Exercise 1 type').querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['multiple_choice', 'fill_blank', 'free_text']);
  });

  it('still shows an existing flashcard as a flashcard so it can be changed', () => {
    render(
      <ExerciseEditor
        exercises={[{ type: 'flashcard', content: { front: 'x', back: 'y' } }]}
        onChange={vi.fn()}
        allowFlashcards={false}
      />
    );
    expect(screen.getByLabelText('Exercise 1 type')).toHaveValue('flashcard');
  });

  it('keeps adding flashcards by default in vocabulary lessons', () => {
    const onChange = vi.fn();
    render(<ExerciseEditor exercises={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add exercise'));
    expect(onChange).toHaveBeenCalledWith([{ type: 'flashcard', content: { front: '', back: '' } }]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run components/admin/ExerciseEditor.test.tsx`
Expected: FAIL — `allowFlashcards` is ignored.

- [ ] **Step 7: Update the editor and pass the prop**

In `components/admin/ExerciseEditor.tsx`:
- Change the component signature to:

```tsx
export function ExerciseEditor({
  exercises,
  onChange,
  allowFlashcards = true,
}: {
  exercises: ExerciseFormEntry[];
  onChange: (exercises: ExerciseFormEntry[]) => void;
  allowFlashcards?: boolean;
}) {
```

- Replace `addExercise` with:

```tsx
  function addExercise() {
    const type: ExerciseType = allowFlashcards ? 'flashcard' : 'multiple_choice';
    onChange([...exercises, { type, content: blankContentFor(type) }]);
  }
```

- Replace `<option value="flashcard">Flashcard</option>` with:

```tsx
            {(allowFlashcards || exercise.type === 'flashcard') && <option value="flashcard">Flashcard</option>}
```

In `components/admin/LessonEditorForm.tsx`, replace `<ExerciseEditor exercises={exercises} onChange={setExercises} />` with:

```tsx
      <ExerciseEditor exercises={exercises} onChange={setExercises} allowFlashcards={skill === 'vocabulary'} />
```

- [ ] **Step 8: Verify**

Run: `npx vitest run components/admin lib/services/lessonAdminService.test.ts app/api/admin/curriculum/lessons`
Expected: PASS. (The route tests under `app/api/admin/curriculum/lessons` and the `LessonEditorForm` tests don't create flashcards, so they need no changes; `exerciseReconciliation` and `dependencyRepair` tests write flashcards below the service and are unaffected.)
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/services/lessonAdminService.ts lib/services/lessonAdminService.test.ts components/admin app/api/admin
git commit -m "feat: allow flashcards only in vocabulary lessons"
```

---

### Task 17: The list of flashcards outside vocabulary lessons

**Files:**
- Create: `lib/services/curriculumAuditService.ts`, `lib/services/curriculumAuditService.test.ts`, `app/api/admin/curriculum/flashcard-violations/route.ts`, `app/api/admin/curriculum/flashcard-violations/route.test.ts`, `app/admin/curriculum/flashcard-violations/page.tsx`, `app/admin/curriculum/flashcard-violations/page.test.tsx`
- Modify: `app/admin/curriculum/page.tsx`

**Interfaces:**
- Produces: `FlashcardViolation { lessonId; title; track: Track; level: CefrLevel; skill: Skill; flashcardCount: number }`; `createCurriculumAuditService(db).listFlashcardViolations(): FlashcardViolation[]` (ordered by track, level, lesson id); `GET /api/admin/curriculum/flashcard-violations` → `FlashcardViolation[]`.

- [ ] **Step 1: Write the service test**

Create `lib/services/curriculumAuditService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { createCurriculumAuditService } from './curriculumAuditService';

function seed() {
  const db = createDbClient(':memory:');
  db.exec(`
    INSERT INTO lessons (id, track, source_level, skill, title) VALUES
      ('a1-vocab', 'generic', 'A1', 'vocabulary', 'Vocab'),
      ('a1-grammar', 'generic', 'A1', 'grammar', 'Grammar'),
      ('a2-speaking', 'goethe', 'A2', 'speaking', 'Speaking'),
      ('a1-clean', 'telc', 'A1', 'reading', 'Clean');
    INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('e1', 'a1-vocab', 'flashcard', '{}'),
      ('e2', 'a1-grammar', 'flashcard', '{}'),
      ('e3', 'a1-grammar', 'flashcard', '{}'),
      ('e4', 'a1-grammar', 'multiple_choice', '{}'),
      ('e5', 'a2-speaking', 'flashcard', '{}'),
      ('e6', 'a1-clean', 'free_text', '{}');
  `);
  return db;
}

describe('curriculumAuditService', () => {
  it('lists every non-vocabulary lesson that has flashcards, with a count', () => {
    expect(createCurriculumAuditService(seed()).listFlashcardViolations()).toEqual([
      { lessonId: 'a1-grammar', title: 'Grammar', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 2 },
      { lessonId: 'a2-speaking', title: 'Speaking', track: 'goethe', level: 'A2', skill: 'speaking', flashcardCount: 1 },
    ]);
  });

  it('is empty when every flashcard is in a vocabulary lesson', () => {
    const db = seed();
    db.exec("DELETE FROM exercises WHERE id IN ('e2', 'e3', 'e5')");
    expect(createCurriculumAuditService(db).listFlashcardViolations()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/curriculumAuditService.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the service**

Create `lib/services/curriculumAuditService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import type { Skill } from '../curriculum/types';

export interface FlashcardViolation {
  lessonId: string;
  title: string;
  track: Track;
  level: CefrLevel;
  skill: Skill;
  flashcardCount: number;
}

export function createCurriculumAuditService(db: Database.Database) {
  function listFlashcardViolations(): FlashcardViolation[] {
    const rows = db
      .prepare(
        `SELECT l.id, l.title, l.track, l.source_level, l.skill, COUNT(e.id) AS flashcard_count
         FROM lessons l JOIN exercises e ON e.lesson_id = l.id
         WHERE e.type = 'flashcard' AND l.skill != 'vocabulary'
         GROUP BY l.id
         ORDER BY l.track, l.source_level, l.id`
      )
      .all() as { id: string; title: string; track: Track; source_level: CefrLevel; skill: Skill; flashcard_count: number }[];
    return rows.map((r) => ({
      lessonId: r.id,
      title: r.title,
      track: r.track,
      level: r.source_level,
      skill: r.skill,
      flashcardCount: r.flashcard_count,
    }));
  }

  return { listFlashcardViolations };
}
```

- [ ] **Step 4: Write the route and page tests**

Create `app/api/admin/curriculum/flashcard-violations/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { GET } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

describe('/api/admin/curriculum/flashcard-violations', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-violations-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    expect((await GET()).status).toBe(401);
  });

  it('lists the violations', async () => {
    getDb().exec(`
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES ('a1-g', 'generic', 'A1', 'grammar', 'G');
      INSERT INTO exercises (id, lesson_id, type, content) VALUES ('e1', 'a1-g', 'flashcard', '{}');
    `);
    expect(await (await GET()).json()).toEqual([
      { lessonId: 'a1-g', title: 'G', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 1 },
    ]);
  });
});
```

Create `app/admin/curriculum/flashcard-violations/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { redirectMock, isAdminSessionValidMock, listMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  isAdminSessionValidMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: isAdminSessionValidMock }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/services/curriculumAuditService', () => ({
  createCurriculumAuditService: () => ({ listFlashcardViolations: listMock }),
}));

import FlashcardViolationsPage from './page';

describe('FlashcardViolationsPage', () => {
  it('redirects to /admin/login when not authenticated', () => {
    isAdminSessionValidMock.mockReturnValue(false);
    expect(() => FlashcardViolationsPage()).toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('links each lesson to its edit form', () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listMock.mockReturnValue([
      { lessonId: 'a1-g', title: 'Pronouns', track: 'generic', level: 'A1', skill: 'grammar', flashcardCount: 3 },
    ]);
    render(FlashcardViolationsPage());
    expect(screen.getByRole('link', { name: 'Pronouns' })).toHaveAttribute(
      'href',
      '/admin/curriculum/lesson/a1-g/edit?track=generic'
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listMock.mockReturnValue([]);
    render(FlashcardViolationsPage());
    expect(screen.getByText('None — every flashcard is in a vocabulary lesson.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx vitest run app/api/admin/curriculum/flashcard-violations app/admin/curriculum/flashcard-violations`
Expected: FAIL — modules do not exist.

- [ ] **Step 6: Implement the route, page, and link**

Create `app/api/admin/curriculum/flashcard-violations/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumAuditService } from '@/lib/services/curriculumAuditService';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(createCurriculumAuditService(getDb()).listFlashcardViolations());
}
```

Create `app/admin/curriculum/flashcard-violations/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumAuditService } from '@/lib/services/curriculumAuditService';

export const dynamic = 'force-dynamic';

export default function FlashcardViolationsPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const violations = createCurriculumAuditService(getDb()).listFlashcardViolations();
  return (
    <div>
      <a href="/admin/curriculum">Back to curriculum</a>
      <h1>Flashcards outside vocabulary lessons</h1>
      <p>
        Flashcards are only allowed in vocabulary lessons. Each lesson below must have its flashcards removed or changed
        to another exercise type before it can be saved again.
      </p>
      {violations.length === 0 ? (
        <p>None — every flashcard is in a vocabulary lesson.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Track</th>
              <th>Level</th>
              <th>Skill</th>
              <th>Flashcards</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.lessonId}>
                <td>
                  <a href={`/admin/curriculum/lesson/${v.lessonId}/edit?track=${v.track}`}>{v.title}</a>
                </td>
                <td>{v.track}</td>
                <td>{v.level}</td>
                <td>{v.skill}</td>
                <td>{v.flashcardCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

In `app/admin/curriculum/page.tsx`, add directly after `<h1>Curriculum</h1>`:

```tsx
      <p>
        <a href="/admin/curriculum/flashcard-violations">Flashcards outside vocabulary lessons</a>
      </p>
```

- [ ] **Step 7: Verify**

Run: `npx vitest run lib/services/curriculumAuditService.test.ts app/api/admin/curriculum/flashcard-violations app/admin/curriculum`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/services/curriculumAuditService.ts lib/services/curriculumAuditService.test.ts app/api/admin/curriculum/flashcard-violations app/admin/curriculum
git commit -m "feat: list flashcards outside vocabulary lessons for admins"
```

---

### Task 18: Concept links in the seed format

**Files:**
- Modify: `lib/services/curriculumSeedLoader.ts`
- Create: `lib/services/curriculumSeedLoader.conceptLinks.test.ts`

**Interfaces:**
- Produces: `export interface SeedFile` (was internal) with a new optional `conceptLinks?: { lessonAId: string; lessonBId: string }[]`. `loadSeedIfNeeded` upserts concept links in canonical order, skipping pairs whose lessons don't both exist yet.

- [ ] **Step 1: Write the tests**

Create `lib/services/curriculumSeedLoader.conceptLinks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded, type SeedFile } from './curriculumSeedLoader';

function seedFile(
  track: 'generic' | 'goethe',
  lessonIds: string[],
  conceptLinks?: SeedFile['conceptLinks']
): SeedFile {
  const milestoneId = `${track}-a1-m`;
  const sectionId = `${track}-a1-s`;
  return {
    seedVersion: '9',
    track,
    level: 'A1',
    milestones: [
      {
        milestone: { id: milestoneId, track, level: 'A1', title: 'M', description: null, orderIndex: 0 },
        sections: [
          {
            section: { id: sectionId, milestoneId, title: 'S', description: null, orderIndex: 0 },
            lessonRefs: lessonIds.map((lessonId, orderIndex) => ({ lessonId, orderIndex })),
          },
        ],
      },
    ],
    lessons: lessonIds.map((id) => ({
      id,
      track,
      sourceLevel: 'A1',
      skill: 'grammar',
      title: id,
      explanation: null,
      examples: null,
    })),
    exercises: [],
    prerequisites: [],
    ...(conceptLinks ? { conceptLinks } : {}),
  };
}

function writeSeedDir(files: Record<string, SeedFile>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gait-seed-links-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}

function links(db: ReturnType<typeof createDbClient>) {
  return db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links ORDER BY lesson_a_id').all();
}

describe('curriculum seed loader — concept links', () => {
  it('creates a link listed in both files it touches exactly once', () => {
    const link = { lessonAId: 'a1-gen-pronouns', lessonBId: 'a1-goe-pronouns' };
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-gen-pronouns'], [link]),
      'goethe-a1.json': seedFile('goethe', ['a1-goe-pronouns'], [link]),
    });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(links(db)).toEqual([{ lesson_a_id: 'a1-gen-pronouns', lesson_b_id: 'a1-goe-pronouns' }]);
  });

  it('stores a link in canonical order whatever order the file lists it in', () => {
    const reversed = { lessonAId: 'a1-z', lessonBId: 'a1-a' };
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-z'], [reversed]),
      'goethe-a1.json': seedFile('goethe', ['a1-a'], [reversed]),
    });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(links(db)).toEqual([{ lesson_a_id: 'a1-a', lesson_b_id: 'a1-z' }]);
  });

  it('skips a link whose other lesson does not exist', () => {
    const dir = writeSeedDir({
      'generic-a1.json': seedFile('generic', ['a1-alone'], [{ lessonAId: 'a1-alone', lessonBId: 'a1-missing' }]),
    });
    const db = createDbClient(':memory:');
    expect(() => loadSeedIfNeeded(db, dir)).not.toThrow();
    expect(links(db)).toEqual([]);
  });

  it('still loads files that have no conceptLinks list', () => {
    const dir = writeSeedDir({ 'generic-a1.json': seedFile('generic', ['a1-plain']) });
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, dir);
    expect(db.prepare('SELECT id FROM lessons').all()).toEqual([{ id: 'a1-plain' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/curriculumSeedLoader.conceptLinks.test.ts`
Expected: FAIL — `SeedFile` is not exported (type error in the test) and links are not created.

- [ ] **Step 3: Load concept links**

In `lib/services/curriculumSeedLoader.ts`:
- Change `interface SeedFile {` to `export interface SeedFile {` and add this field after `prerequisites`:

```ts
  conceptLinks?: { lessonAId: string; lessonBId: string }[];
```

- At the end of `upsertSeedFile`, after the prerequisites loop, add:

```ts
  // Each link is listed in both files it touches; a pair whose other lesson hasn't
  // loaded yet is skipped here and inserted when that lesson's file loads.
  const lessonExists = db.prepare('SELECT 1 FROM lessons WHERE id = ?');
  const insertLink = db.prepare('INSERT OR IGNORE INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES (?, ?)');
  for (const link of seed.conceptLinks ?? []) {
    const [a, b] = link.lessonAId < link.lessonBId ? [link.lessonAId, link.lessonBId] : [link.lessonBId, link.lessonAId];
    if (a === b || !lessonExists.get(a) || !lessonExists.get(b)) continue;
    insertLink.run(a, b);
  }
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/services/curriculumSeedLoader.conceptLinks.test.ts lib/services/curriculumSeedLoader.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/curriculumSeedLoader.ts lib/services/curriculumSeedLoader.conceptLinks.test.ts
git commit -m "feat: load concept links from curriculum seed files"
```

---

### Task 19: Curriculum export to seed JSON

**Files:**
- Create: `lib/services/curriculumExportService.ts`, `lib/services/curriculumExportService.test.ts`

**Interfaces:**
- Consumes: `SeedFile` (Task 18), `LEVELS` (Task 3).
- Produces: `TRACKS: readonly Track[]`, `seedFileName(track, level): string`, `createCurriculumExportService(db)` with `exportTrackLevel(track, level): SeedFile` and `exportAll(): { fileName: string; seed: SeedFile }[]` (15 entries, tracks × levels).

- [ ] **Step 1: Write the tests**

Create `lib/services/curriculumExportService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDbClient } from '../db/client';
import { loadSeedIfNeeded } from './curriculumSeedLoader';
import { createCurriculumExportService, seedFileName } from './curriculumExportService';

const REPO_SEED_DIR = join(process.cwd(), 'data', 'curriculum-seed');

function count(db: ReturnType<typeof createDbClient>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('curriculumExportService', () => {
  it('names files the way data/curriculum-seed does', () => {
    expect(seedFileName('generic', 'A1')).toBe('generic-a1.json');
    expect(seedFileName('goethe', 'C1')).toBe('goethe-c1.json');
  });

  it('exports all 15 track+level files with the current seed version', () => {
    const db = createDbClient(':memory:');
    loadSeedIfNeeded(db, REPO_SEED_DIR);
    const files = createCurriculumExportService(db).exportAll();
    expect(files.map((f) => f.fileName)).toHaveLength(15);
    expect(files.map((f) => f.fileName)).toContain('telc-b2.json');
    const version = (db.prepare('SELECT seed_version FROM curriculum_meta').get() as { seed_version: string }).seed_version;
    expect(new Set(files.map((f) => f.seed.seedVersion))).toEqual(new Set([version]));
    expect(files.every((f) => f.seed.lessons.every((l) => !('conceptId' in l)))).toBe(true);
  });

  it('round-trips the whole curriculum through the seed loader', () => {
    const source = createDbClient(':memory:');
    loadSeedIfNeeded(source, REPO_SEED_DIR);
    const exported = createCurriculumExportService(source).exportAll();

    const dir = mkdtempSync(join(tmpdir(), 'gait-export-'));
    for (const { fileName, seed } of exported) writeFileSync(join(dir, fileName), JSON.stringify(seed));
    const target = createDbClient(':memory:');
    loadSeedIfNeeded(target, dir);

    for (const table of ['lessons', 'exercises', 'milestones', 'sections', 'lesson_placements', 'lesson_prerequisites']) {
      expect({ table, n: count(target, table) }).toEqual({ table, n: count(source, table) });
    }
    expect(createCurriculumExportService(target).exportAll()).toEqual(exported);
  });

  it('includes concept links touching the file and keeps exercises in the order they were added', () => {
    const db = createDbClient(':memory:');
    db.exec(`
      INSERT INTO milestones (id, track, level, title, order_index) VALUES ('g-m', 'generic', 'A1', 'M', 0), ('o-m', 'goethe', 'A1', 'M', 0);
      INSERT INTO sections (id, milestone_id, title, order_index) VALUES ('g-s', 'g-m', 'S', 0), ('o-s', 'o-m', 'S', 0);
      INSERT INTO lessons (id, track, source_level, skill, title) VALUES
        ('a1-g', 'generic', 'A1', 'grammar', 'G'), ('a1-o', 'goethe', 'A1', 'grammar', 'O');
      INSERT INTO lesson_placements (lesson_id, section_id, order_index) VALUES ('a1-g', 'g-s', 0), ('a1-o', 'o-s', 0);
      INSERT INTO exercises (id, lesson_id, type, content) VALUES
        ('a1-g__ex10', 'a1-g', 'free_text', '{"prompt":"p","modelAnswer":"m"}'),
        ('a1-g__ex2', 'a1-g', 'free_text', '{"prompt":"p","modelAnswer":"m"}');
      INSERT INTO lesson_concept_links (lesson_a_id, lesson_b_id) VALUES ('a1-g', 'a1-o');
    `);
    const seed = createCurriculumExportService(db).exportTrackLevel('generic', 'A1');
    expect(seed.conceptLinks).toEqual([{ lessonAId: 'a1-g', lessonBId: 'a1-o' }]);
    expect(seed.exercises.map((e) => e.id)).toEqual(['a1-g__ex10', 'a1-g__ex2']);
    expect(seed.milestones[0].sections[0].lessonRefs).toEqual([{ lessonId: 'a1-g', orderIndex: 0 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/services/curriculumExportService.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the export**

Create `lib/services/curriculumExportService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Track, CefrLevel } from '../types';
import { LEVELS } from '../tutoring/levels';
import type { SeedFile } from './curriculumSeedLoader';

export const TRACKS: readonly Track[] = ['generic', 'telc', 'goethe'];

export function seedFileName(track: Track, level: CefrLevel): string {
  return `${track}-${level.toLowerCase()}.json`;
}

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
  track: Track;
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

export function createCurriculumExportService(db: Database.Database) {
  function currentSeedVersion(): string {
    const row = db.prepare('SELECT seed_version FROM curriculum_meta WHERE id = 1').get() as
      | { seed_version: string }
      | undefined;
    return row?.seed_version ?? '0';
  }

  // Reads directly rather than through getTrackStructure, which writes (it ensures Unsorted exists).
  function exportTrackLevel(track: Track, level: CefrLevel): SeedFile {
    const milestoneRows = db
      .prepare('SELECT * FROM milestones WHERE track = ? AND level = ? ORDER BY order_index, id')
      .all(track, level) as MilestoneRow[];
    const sectionStmt = db.prepare('SELECT * FROM sections WHERE milestone_id = ? ORDER BY order_index, id');
    const placementStmt = db.prepare(
      'SELECT lesson_id, order_index FROM lesson_placements WHERE section_id = ? ORDER BY order_index, id'
    );

    const lessonIds: string[] = [];
    const milestones = milestoneRows.map((m) => ({
      milestone: { id: m.id, track: m.track, level: m.level, title: m.title, description: m.description, orderIndex: m.order_index },
      sections: (sectionStmt.all(m.id) as SectionRow[]).map((s) => {
        const refs = placementStmt.all(s.id) as { lesson_id: string; order_index: number }[];
        lessonIds.push(...refs.map((r) => r.lesson_id));
        return {
          section: { id: s.id, milestoneId: s.milestone_id, title: s.title, description: s.description, orderIndex: s.order_index },
          lessonRefs: refs.map((r) => ({ lessonId: r.lesson_id, orderIndex: r.order_index })),
        };
      }),
    }));

    const lessonStmt = db.prepare('SELECT * FROM lessons WHERE id = ?');
    const lessons = lessonIds.map((id) => {
      const l = lessonStmt.get(id) as LessonRow;
      return {
        id: l.id,
        track: l.track,
        sourceLevel: l.source_level,
        skill: l.skill,
        title: l.title,
        explanation: l.explanation,
        examples: l.examples ? (JSON.parse(l.examples) as string[]) : null,
      };
    });

    const exerciseStmt = db.prepare('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY rowid');
    const exercises = lessonIds.flatMap((id) =>
      (exerciseStmt.all(id) as ExerciseRow[]).map((e) => ({
        id: e.id,
        lessonId: e.lesson_id,
        track: e.track,
        type: e.type,
        content: JSON.parse(e.content) as unknown,
      }))
    );

    const inFile = new Set(lessonIds);
    const prerequisites = (
      db
        .prepare('SELECT lesson_id, prerequisite_lesson_id FROM lesson_prerequisites ORDER BY lesson_id, prerequisite_lesson_id')
        .all() as { lesson_id: string; prerequisite_lesson_id: string }[]
    )
      .filter((p) => inFile.has(p.lesson_id))
      .map((p) => ({ lessonId: p.lesson_id, prerequisiteLessonId: p.prerequisite_lesson_id }));

    const conceptLinks = (
      db.prepare('SELECT lesson_a_id, lesson_b_id FROM lesson_concept_links ORDER BY lesson_a_id, lesson_b_id').all() as {
        lesson_a_id: string;
        lesson_b_id: string;
      }[]
    )
      .filter((c) => inFile.has(c.lesson_a_id) || inFile.has(c.lesson_b_id))
      .map((c) => ({ lessonAId: c.lesson_a_id, lessonBId: c.lesson_b_id }));

    return { seedVersion: currentSeedVersion(), track, level, milestones, lessons, exercises, prerequisites, conceptLinks };
  }

  function exportAll(): { fileName: string; seed: SeedFile }[] {
    return TRACKS.flatMap((track) =>
      LEVELS.map((level) => ({ fileName: seedFileName(track, level), seed: exportTrackLevel(track, level) }))
    );
  }

  return { exportTrackLevel, exportAll };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/services/curriculumExportService.test.ts`
Expected: PASS (4 tests).
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/curriculumExportService.ts lib/services/curriculumExportService.test.ts
git commit -m "feat: export the curriculum to seed JSON"
```

---

### Task 20: Export downloads for admins

**Files:**
- Modify: `package.json` (via npm), `app/admin/curriculum/page.tsx`, `app/admin/curriculum/page.test.tsx`
- Create: `app/api/admin/curriculum/export/route.ts`, `app/api/admin/curriculum/export/[track]/[level]/route.ts`, `app/api/admin/curriculum/export/routes.test.ts`

**Interfaces:**
- Consumes: `createCurriculumExportService`, `TRACKS`, `seedFileName` (Task 19); `isCefrLevel` (Task 3).
- Produces: `GET /api/admin/curriculum/export` → `curriculum-seed.zip` (15 JSON files); `GET /api/admin/curriculum/export/[track]/[level]` → one JSON file download (`400` for an unknown track or level).

- [ ] **Step 1: Install fflate**

Run: `npm install fflate@^0.8.2`

- [ ] **Step 2: Write the route tests**

Create `app/api/admin/curriculum/export/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync, strFromU8 } from 'fflate';
import { closeDb } from '@/lib/db/client';
import { GET as exportAll } from './route';
import { GET as exportOne } from './[track]/[level]/route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function one(track: string, level: string) {
  return exportOne(new Request('http://localhost'), { params: { track, level } });
}

describe('/api/admin/curriculum/export', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-export-routes-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    expect((await exportAll()).status).toBe(401);
    expect((await one('generic', 'A1')).status).toBe(401);
  });

  it('downloads a zip of all 15 seed files', async () => {
    const res = await exportAll();
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="curriculum-seed.zip"');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(15);
    expect(JSON.parse(strFromU8(files['goethe-b1.json']))).toMatchObject({ track: 'goethe', level: 'B1' });
  });

  it('downloads one track+level file', async () => {
    const res = await one('telc', 'A2');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="telc-a2.json"');
    expect(await res.json()).toMatchObject({ track: 'telc', level: 'A2' });
  });

  it('rejects an unknown track or level', async () => {
    expect((await one('duolingo', 'A1')).status).toBe(400);
    expect((await one('generic', 'C2')).status).toBe(400);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run app/api/admin/curriculum/export/routes.test.ts`
Expected: FAIL — route modules do not exist.

- [ ] **Step 4: Implement the routes**

Create `app/api/admin/curriculum/export/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumExportService } from '@/lib/services/curriculumExportService';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const files = Object.fromEntries(
    createCurriculumExportService(getDb())
      .exportAll()
      .map(({ fileName, seed }) => [fileName, strToU8(`${JSON.stringify(seed, null, 2)}\n`)])
  );
  return new Response(zipSync(files), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="curriculum-seed.zip"',
    },
  });
}
```

Create `app/api/admin/curriculum/export/[track]/[level]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumExportService, seedFileName, TRACKS } from '@/lib/services/curriculumExportService';
import { isCefrLevel } from '@/lib/tutoring/levels';
import type { Track } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { track: string; level: string } }) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const track = params.track as Track;
  if (!TRACKS.includes(track) || !isCefrLevel(params.level)) {
    return NextResponse.json({ error: 'Unknown track or level' }, { status: 400 });
  }
  const seed = createCurriculumExportService(getDb()).exportTrackLevel(track, params.level);
  return new Response(`${JSON.stringify(seed, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${seedFileName(track, params.level)}"`,
    },
  });
}
```

- [ ] **Step 5: Link the downloads from the admin page**

Replace `app/admin/curriculum/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createCurriculumService } from '@/lib/services/curriculumService';

export const dynamic = 'force-dynamic';

export default function AdminCurriculumPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  const tracks = createCurriculumService(getDb()).listTracks();
  return (
    <div>
      <h1>Curriculum</h1>
      <p>
        <a href="/admin/curriculum/flashcard-violations">Flashcards outside vocabulary lessons</a>
        {' · '}
        <a href="/admin/placement-exam">Placement exam</a>
        {' · '}
        <a href="/api/admin/curriculum/export">Download all as seed files (zip)</a>
      </p>
      <ul>
        {tracks.map(({ track, levels }) => (
          <li key={track}>
            {track}:{' '}
            {levels.map((level) => (
              <span key={level}>
                <a href={`/admin/curriculum/${track}/${level}`}>{level}</a>{' '}
                <a href={`/api/admin/curriculum/export/${track}/${level}`}>(export)</a>{' '}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

In `app/admin/curriculum/page.test.tsx`, add `import { render, screen } from '@testing-library/react';` at the top and add this test before the final `});`:

```tsx
  it('links to the admin tools and the seed exports', () => {
    isAdminSessionValidMock.mockReturnValue(true);
    listTracksMock.mockReturnValue([{ track: 'generic', levels: ['A1'] }]);
    render(AdminCurriculumPage());
    expect(screen.getByRole('link', { name: 'Download all as seed files (zip)' })).toHaveAttribute(
      'href',
      '/api/admin/curriculum/export'
    );
    expect(screen.getByRole('link', { name: '(export)' })).toHaveAttribute('href', '/api/admin/curriculum/export/generic/A1');
    expect(screen.getByRole('link', { name: 'Placement exam' })).toHaveAttribute('href', '/admin/placement-exam');
  });
```

- [ ] **Step 6: Verify**

Run: `npx vitest run app/api/admin/curriculum/export app/admin/curriculum/page.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json app/api/admin/curriculum/export app/admin/curriculum/page.tsx app/admin/curriculum/page.test.tsx
git commit -m "feat: let admins download the curriculum as seed files"
```

---

### Task 21: Placement exam download and upload for admins

**Files:**
- Create: `app/api/admin/placement-exam/route.ts`, `app/api/admin/placement-exam/route.test.ts`, `app/admin/placement-exam/page.tsx`, `components/admin/PlacementExamAdmin.tsx`, `components/admin/PlacementExamAdmin.test.tsx`

**Interfaces:**
- Consumes: `createPlacementService` `getExam`/`replaceExam`/`questionCount` (Task 10); `parsePlacementExam`, `serializePlacementExam`, `ExamFormat` (Task 8); `delayedResponse` (Task 1).
- Produces: `GET /api/admin/placement-exam?format=json|yaml` → the active exam as a file download; `PUT /api/admin/placement-exam?format=json|yaml` with the file as the text body → `{ ok: true, questionCount }` or `400 { errors: string[] }`.

- [ ] **Step 1: Write the route tests**

Create `app/api/admin/placement-exam/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { serializePlacementExam } from '@/lib/tutoring/placementExamFormat';
import { smallPlacementExam } from '@/test/placementFixtures';
import { GET, PUT } from './route';

vi.mock('@/lib/auth/adminSession', () => ({ isAdminSessionValid: vi.fn(() => true) }));
import { isAdminSessionValid } from '@/lib/auth/adminSession';

function put(body: string, format = 'json') {
  return PUT(new Request(`http://localhost/api/admin/placement-exam?format=${format}`, { method: 'PUT', body }));
}

describe('/api/admin/placement-exam', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-exam-admin-'));
    vi.mocked(isAdminSessionValid).mockReturnValue(true);
    createPlacementService(getDb()).replaceExam(smallPlacementExam());
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAdminSessionValid).mockReturnValue(false);
    expect((await GET(new Request('http://localhost/api/admin/placement-exam'))).status).toBe(401);
    expect((await put('{}')).status).toBe(401);
  });

  it('downloads the exam as JSON by default and as YAML on request', async () => {
    const json = await GET(new Request('http://localhost/api/admin/placement-exam'));
    expect(json.headers.get('Content-Disposition')).toBe('attachment; filename="placement-exam.json"');
    expect(await json.text()).toBe(serializePlacementExam(smallPlacementExam(), 'json'));

    const yaml = await GET(new Request('http://localhost/api/admin/placement-exam?format=yaml'));
    expect(yaml.headers.get('Content-Disposition')).toBe('attachment; filename="placement-exam.yaml"');
    expect(await yaml.text()).toBe(serializePlacementExam(smallPlacementExam(), 'yaml'));
  });

  it('replaces the exam with a valid upload', async () => {
    // One multiple-choice question per level: 5 questions, still covering A1 to C1.
    const exam = smallPlacementExam().filter((q) => q.type === 'multiple_choice');
    const res = await put(serializePlacementExam(exam, 'yaml'), 'yaml');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, questionCount: 5 });
    expect(createPlacementService(getDb()).questionCount()).toBe(5);
  });

  it('rejects an invalid upload with every error and changes nothing', async () => {
    const res = await put(JSON.stringify({ questions: [{ id: 'x', level: 'A1', type: 'flashcard', content: {} }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toContain('Question 1 (x): type must be one of multiple_choice, fill_blank, free_text');
    expect(createPlacementService(getDb()).questionCount()).toBe(10);
  });

  it('rejects an unknown format', async () => {
    expect((await put('{}', 'xml')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/admin/placement-exam/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/placement-exam/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPlacementService } from '@/lib/services/placementService';
import { parsePlacementExam, serializePlacementExam, type ExamFormat } from '@/lib/tutoring/placementExamFormat';

export const dynamic = 'force-dynamic';

function formatFrom(request: Request): ExamFormat | null {
  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  return format === 'json' || format === 'yaml' ? format : null;
}

export async function GET(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const format = formatFrom(request);
  if (!format) return NextResponse.json({ error: 'format must be json or yaml' }, { status: 400 });
  const text = serializePlacementExam(createPlacementService(getDb()).getExam(), format);
  return new Response(text, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json' : 'application/yaml',
      'Content-Disposition': `attachment; filename="placement-exam.${format}"`,
    },
  });
}

export async function PUT(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const format = formatFrom(request);
  if (!format) return NextResponse.json({ errors: ['format must be json or yaml'] }, { status: 400 });
  const parsed = parsePlacementExam(await request.text(), format);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  const service = createPlacementService(getDb());
  service.replaceExam(parsed.questions);
  return NextResponse.json({ ok: true, questionCount: service.questionCount() });
}
```

- [ ] **Step 4: Run the route tests**

Run: `npx vitest run app/api/admin/placement-exam/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the component test**

Create `components/admin/PlacementExamAdmin.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PlacementExamAdmin } from './PlacementExamAdmin';

function chooseFile(name: string, content: string) {
  const file = new File([content], name, { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Exam file'), { target: { files: [file] } });
}

describe('PlacementExamAdmin', () => {
  it('offers JSON and YAML downloads', () => {
    render(<PlacementExamAdmin questionCount={40} />);
    expect(screen.getByText('The active exam has 40 questions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'JSON' })).toHaveAttribute('href', '/api/admin/placement-exam?format=json');
    expect(screen.getByRole('link', { name: 'YAML' })).toHaveAttribute('href', '/api/admin/placement-exam?format=yaml');
  });

  it('uploads a YAML file and reports the new question count', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ ok: true, questionCount: 12 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlacementExamAdmin questionCount={40} />);
    chooseFile('exam.yaml', 'questions: []');
    fireEvent.click(screen.getByText('Upload'));

    expect(await screen.findByText('Exam replaced: 12 questions.')).toBeInTheDocument();
    expect(screen.getByText('The active exam has 12 questions.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/placement-exam?format=yaml', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'questions: []',
    });
  });

  it('lists every error when the upload is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => delayedResponse({ errors: ['Question 1: bad', 'Question 2: worse'] }, { ok: false, status: 400 }))
    );
    render(<PlacementExamAdmin questionCount={40} />);
    chooseFile('exam.json', '{}');
    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Question 1: bad'));
    expect(screen.getByRole('alert')).toHaveTextContent('Question 2: worse');
    expect(screen.getByText('The active exam has 40 questions.')).toBeInTheDocument();
  });

  it('keeps Upload disabled until a file is chosen', () => {
    render(<PlacementExamAdmin questionCount={40} />);
    expect(screen.getByText('Upload')).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run components/admin/PlacementExamAdmin.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement the component and page**

Create `components/admin/PlacementExamAdmin.tsx`:

```tsx
'use client';

import { useState } from 'react';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

export function PlacementExamAdmin({ questionCount }: { questionCount: number }) {
  const [count, setCount] = useState(questionCount);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) return;
    const format = /\.ya?ml$/i.test(file.name) ? 'yaml' : 'json';
    setUploading(true);
    setErrors([]);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/placement-exam?format=${format}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: await readText(file),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCount(data.questionCount);
        setMessage(`Exam replaced: ${data.questionCount} questions.`);
      } else {
        setErrors(Array.isArray(data.errors) ? data.errors : [data.error ?? `Upload failed (${res.status})`]);
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <a href="/admin/curriculum">Back to curriculum</a>
      <h1>Placement exam</h1>
      <p>The active exam has {count} questions.</p>
      <p>
        Download: <a href="/api/admin/placement-exam?format=json">JSON</a> ·{' '}
        <a href="/api/admin/placement-exam?format=yaml">YAML</a>
      </p>
      <h2>Replace the exam</h2>
      <p>
        Upload a JSON or YAML file in the same format as the download. The whole exam is replaced. A file with any problem
        is rejected and nothing changes. Past placement results and unlocked levels are kept.
      </p>
      <input
        type="file"
        aria-label="Exam file"
        accept=".json,.yaml,.yml"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={upload} disabled={!file || uploading}>
        Upload
      </button>
      {message && <p>{message}</p>}
      {errors.length > 0 && (
        <div role="alert">
          <p>The upload was rejected:</p>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

Create `app/admin/placement-exam/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { PlacementExamAdmin } from '@/components/admin/PlacementExamAdmin';

export const dynamic = 'force-dynamic';

export default function PlacementExamAdminPage() {
  if (!isAdminSessionValid()) redirect('/admin/login');
  return <PlacementExamAdmin questionCount={createPlacementService(getDb()).questionCount()} />;
}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run app/api/admin/placement-exam components/admin/PlacementExamAdmin.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/placement-exam app/admin/placement-exam components/admin/PlacementExamAdmin.tsx components/admin/PlacementExamAdmin.test.tsx
git commit -m "feat: let admins download and replace the placement exam"
```
