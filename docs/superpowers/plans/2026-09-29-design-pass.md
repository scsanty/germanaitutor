# App-wide Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 8 and 9 are visual-design tasks: the implementer also invokes the `frontend-design` skill for them.

**Goal:** Give every page one NaDoch!-branded visual system: tokens, components, a thumb-zone shell, Dashboard and Profile pages, focus mode, sound and motion, themes, and an installable PWA.

**Architecture:**
- **Foundations** (Tasks 1–7), with full code and tests:
  - React 19;
  - Tailwind v4, reading CSS variables from `app/theme.css`;
  - shadcn/ui components generated into `components/ui`;
  - a nav registry that drives the shell;
  - a profile-backed theme and sound preference applied on the server;
  - new Dashboard and Profile pages;
  - a `FocusLayout` shared by every exercise run.
- **Restyling** (Tasks 8–9) applies the components page by page. It is judged against explicit acceptance criteria, and the existing role/label-based tests guard behaviour.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Radix), lucide-react, next/font (Nunito, Inter), next-intl 4, vitest 5 with Testing Library, sharp and opentype.js (dev, icons).

**Spec:** `docs/superpowers/specs/2026-09-29-design-pass-design.md`

**Precondition:** Tutoring Phase 2, the Curriculum Restructure and Bilingual Content are merged.

## Global Constraints

- **One tokens file:** `app/theme.css` holds every colour, the radius and the brand gradient, for dark (default), light, and system. Components use only token-backed utilities; there are no raw hex colours outside `theme.css` and the logo and icon art.
- **Palette:**
  - dark: background `#121212`, primary `#22d3ee`, orange highlight `#fb923c`;
  - brand gradient: `linear-gradient(135deg, #0284c7, #06b6d4 48%, #0d9488)`;
  - correct and wrong always use `--success` and `--danger`.
- **Contrast:** every token text/background pair meets WCAG AA. A test enforces it.
- **Type and icons:** Nunito for headings (600–900), Inter for body text, both through `next/font`. Lucide icons.
- **Phone layout** (< 768 px): logo top-left, Settings top-right; floating Freestyle, Flashcards and Review, built ones only; bottom bar with Dashboard (left) and Profile (right).
- **Desktop layout** (≥ 1024 px): a left sidebar, with Profile and Settings at the bottom. **Tablet** (768–1023 px): an icon-only sidebar.
- **Hidden items:** nav items for unbuilt features are hidden. They're controlled by `enabled` in `lib/nav/navItems.ts`.
- **Content Admin** appears inside Settings, only with an admin session. Admin text stays English.
- **Focus mode:** exercise runs hide the shell and show a top ✕ and progress bar, with Check/Next at the bottom. Exiting mid-run asks for confirmation. `1`–`4` pick an option, `Enter` checks and continues, `Esc` exits.
- **Motion:** 150–250 ms, and none under `prefers-reduced-motion`.
- **Sound:** generated with WebAudio, on by default, and switchable in Settings.
- **Theme:** Dark / Light / System, stored on the profile, and applied through `<html data-theme>` on the server, so there's no flash.
- **PWA:** installable and online-only, with no service worker.
- **Text:** all new student-facing text is in en and de. The Generic track is displayed as "NaDoch!"; its id stays `generic`.
- **Existing tests keep passing.** When restyling changes a role (e.g. a panel becomes a dialog), update the query to the new role and nothing else.

## Review Focus

1. **Invalid theme:** a `theme` value in the profile PATCH that isn't one of the three is rejected with 400, not stored (Task 2).
2. **Keyboard shortcuts while typing:** in focus mode, keys typed into a text input ("1", Enter) must type or submit normally, not trigger shortcuts (Task 7).
3. **Double confirmation:** a Daily Queue with zero items asks for no confirmation on exit, and neither does a finished run (Task 7).
4. **Activity outside the window:** attempts older than 84 days are excluded, and days without attempts are 0, not missing (Task 5).
5. **Review badge failure:** the badge fetch failing leaves the button without a badge instead of breaking the shell (Task 4).

## File Structure

| File | Responsibility |
|---|---|
| `app/theme.css` (new) | The editable tokens for dark, light and system |
| `app/globals.css` (new) | Tailwind import, token → utility mapping, base styles |
| `postcss.config.mjs`, `components.json` (new) | Tailwind v4 and shadcn config |
| `lib/utils.ts` (new) | `cn()` |
| `lib/design/contrast.ts` (new) | WCAG contrast ratio |
| `components/ui/*` (generated) | shadcn components |
| `components/brand/Logo.tsx` (new), `scripts/build-icons.ts` (new), `app/icon.svg`, `app/apple-icon.png`, `public/icons/*`, `app/manifest.ts` (new) | Brand and PWA |
| `lib/nav/navItems.ts` (new) | Nav registry |
| `components/shell/*` (new) | AppShell, TopBar, BottomBar, Fabs, Sidebar, ShellContext |
| `components/providers/PreferencesProvider.tsx` (new) | Theme and sound on the client |
| `lib/services/dashboardService.ts`, `app/api/tutoring/dashboard/route.ts`, `app/api/tutoring/queue/count/route.ts`, `app/dashboard/page.tsx`, `components/dashboard/*` (new) | Dashboard |
| `app/profile/page.tsx`, `components/profile/ProfilePage.tsx` (new) | Profile |
| `lib/sound/sounds.ts`, `lib/sound/useSound.ts`, `components/focus/FocusLayout.tsx`, `components/focus/useExerciseShortcuts.ts` (new) | Focus mode, sound, shortcuts |
| Every page and component under `app/` and `components/` | Restyled (Tasks 8–9) |

## Task Order

1. React 19, Tailwind v4, shadcn, tokens, fonts, contrast test
2. Profile: theme and sound; drop freestyle default; server-applied theme; preferences provider
3. Brand: logo, icons, manifest, the "NaDoch!" track name
4. Nav registry and app shell
5. Dashboard
6. Profile page and Settings split
7. Focus mode, sounds, shortcuts, celebration
8. Restyle the student pages (visual task)
9. Restyle the admin pages (visual task)
10. Accessibility checks and the final visual pass

---

### Task 1: React 19, Tailwind v4, shadcn, tokens, fonts

**Files:**
- Create:
  - `postcss.config.mjs`, `components.json`
  - `app/theme.css`, `app/globals.css`
  - `lib/utils.ts`
  - `lib/design/contrast.ts`, `lib/design/themeTokens.test.ts`
  - `components/ui/*` (generated)
- Modify: `package.json`, `package-lock.json`, `app/layout.tsx`

**Interfaces:**
- Produces:
  - Tailwind utilities `bg-background`, `bg-surface`, `bg-surface-raised`, `text-text`, `text-text-muted`, `border-border`, `bg-primary`, `text-primary`, `text-primary-foreground`, `bg-highlight`, `text-highlight`, `text-success`, `text-danger`, `bg-brand-gradient`, `font-heading`, `font-sans`.
  - shadcn's expected names are mapped as well: `card`, `popover`, `muted`, `accent` (shadcn's hover surface, **not** our orange; ours is `highlight`), `secondary`, `destructive`, `input`, `ring`, `foreground`.
  - `cn(...classes)` in `lib/utils.ts`.
  - `contrastRatio(hexA, hexB): number` in `lib/design/contrast.ts`.

- [ ] **Step 1: Upgrade React and add the styling packages**

Run:

```bash
npm install react@^19 react-dom@^19 lucide-react clsx tailwind-merge class-variance-authority
npm install -D @types/react@^19 @types/react-dom@^19 tailwindcss@^4 @tailwindcss/postcss postcss
```

Then `npx tsc --noEmit && npm test`. React 19 type changes may surface: `useRef` needs an initial argument, and the global `JSX` namespace moves to `React.JSX`. Fix each reported line with the smallest change: `useRef<T>(null)`, or `React.JSX.Element`. Expect green before continuing.

- [ ] **Step 2: Write the contrast test**

Create `lib/design/contrast.ts`:

```ts
// WCAG 2.x relative luminance and contrast ratio for #rrggbb colours.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

Create `lib/design/themeTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from './contrast';

const css = readFileSync(join(process.cwd(), 'app', 'theme.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const THEMES = { dark: block(":root[data-theme='dark']"), light: block(":root[data-theme='light']") };

// Body text needs 4.5:1; large text and UI parts (buttons on the background) need 3:1.
const PAIRS: [string, string, number][] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-raised', 4.5],
  ['text-muted', 'background', 4.5],
  ['text-muted', 'surface', 4.5],
  ['primary', 'background', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['accent', 'background', 3],
  ['success', 'background', 4.5],
  ['danger', 'background', 4.5],
  ['warning', 'background', 3],
  ['focus-ring', 'background', 3],
];

describe('theme tokens', () => {
  it.each(Object.entries(THEMES))('%s theme meets WCAG AA for every listed pair', (_name, tokens) => {
    for (const [fg, bg, min] of PAIRS) {
      expect(tokens[fg], `--${fg}`).toBeDefined();
      expect(contrastRatio(tokens[fg], tokens[bg]), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(min);
    }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run lib/design/themeTokens.test.ts`
Expected: FAIL, because `app/theme.css` doesn't exist.

- [ ] **Step 4: Tokens, Tailwind, fonts, shadcn**

Create `app/theme.css`. It's the one file to edit to recolour the app:

```css
/*
 * NaDoch! theme tokens — the one place to change colours.
 * Dark is the default. data-theme on <html> comes from the profile (Settings → Theme).
 * Teal/cyan = primary; orange = highlight (celebrations, the next test-out); success/danger
 * are only for right/wrong. Every text pair here is checked for WCAG AA by
 * lib/design/themeTokens.test.ts.
 */
:root[data-theme='dark'] {
  --background: #121212;
  --surface: #1a1a1a;
  --surface-raised: #242424;
  --border: #2e2e2e;
  --text: #f5f5f5;
  --text-muted: #a3a3a3;
  --primary: #22d3ee;
  --primary-foreground: #042f2e;
  --accent: #fb923c;
  --success: #4ade80;
  --danger: #f87171;
  --warning: #facc15;
  --focus-ring: #22d3ee;
}

:root[data-theme='light'] {
  --background: #ffffff;
  --surface: #f8fafc;
  --surface-raised: #ffffff;
  --border: #e2e8f0;
  --text: #0f172a;
  --text-muted: #475569;
  --primary: #0e7490;
  --primary-foreground: #ffffff;
  --accent: #c2410c;
  --success: #15803d;
  --danger: #b91c1c;
  --warning: #a16207;
  --focus-ring: #0e7490;
}

:root {
  --brand-gradient: linear-gradient(135deg, #0284c7, #06b6d4 48%, #0d9488);
  --highlight-gradient: linear-gradient(135deg, #fb923c, #ea580c);
  --radius: 14px;
}

/* System: dark values unless the OS asks for light. Keep in sync with the two blocks above. */
:root[data-theme='system'] {
  --background: #121212;
  --surface: #1a1a1a;
  --surface-raised: #242424;
  --border: #2e2e2e;
  --text: #f5f5f5;
  --text-muted: #a3a3a3;
  --primary: #22d3ee;
  --primary-foreground: #042f2e;
  --accent: #fb923c;
  --success: #4ade80;
  --danger: #f87171;
  --warning: #facc15;
  --focus-ring: #22d3ee;
}
@media (prefers-color-scheme: light) {
  :root[data-theme='system'] {
    --background: #ffffff;
    --surface: #f8fafc;
    --surface-raised: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --text-muted: #475569;
    --primary: #0e7490;
    --primary-foreground: #ffffff;
    --accent: #c2410c;
    --success: #15803d;
    --danger: #b91c1c;
    --warning: #a16207;
    --focus-ring: #0e7490;
  }
}
```

Create `app/globals.css`:

```css
@import 'tailwindcss';
@import './theme.css';

/* Token → utility mapping. shadcn's "accent" is its hover surface; our orange is "highlight". */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--text);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border: var(--border);
  --color-input: var(--border);
  --color-ring: var(--focus-ring);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-highlight: var(--accent);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-card: var(--surface-raised);
  --color-card-foreground: var(--text);
  --color-popover: var(--surface-raised);
  --color-popover-foreground: var(--text);
  --color-muted: var(--surface);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--surface-raised);
  --color-accent-foreground: var(--text);
  --color-secondary: var(--surface-raised);
  --color-secondary-foreground: var(--text);
  --color-destructive: var(--danger);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 4px);
  --radius-sm: calc(var(--radius) - 8px);
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-heading: var(--font-nunito), var(--font-inter), system-ui, sans-serif;
}

@utility bg-brand-gradient {
  background-image: var(--brand-gradient);
}
@utility bg-highlight-gradient {
  background-image: var(--highlight-gradient);
}

@layer base {
  html {
    color-scheme: dark;
  }
  html[data-theme='light'] {
    color-scheme: light;
  }
  body {
    background-color: var(--background);
    color: var(--text);
    font-family: var(--font-sans);
  }
  h1,
  h2,
  h3,
  h4 {
    font-family: var(--font-heading);
    font-weight: 800;
  }
  :focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Create `postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

Create `lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide"
}
```

Generate the components. Don't run `shadcn init`: it would overwrite `globals.css`.

```bash
npx shadcn@latest add button card badge progress tabs dialog alert-dialog sheet dropdown-menu tooltip toggle-group input textarea select radio-group checkbox switch separator alert skeleton sonner --yes
```

If the CLI asks to change `app/globals.css`, answer no. Our `@theme inline` block already provides every variable the components use.

In `app/layout.tsx`:
- import `./globals.css`;
- load the fonts;
- put the font variables on `<html>` (the `data-theme` attribute arrives in Task 2):

```tsx
import './globals.css';
import { Inter, Nunito } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-nunito', display: 'swap' });
```

```tsx
    <html lang={locale} data-theme="dark" className={`${inter.variable} ${nunito.variable}`}>
```

- [ ] **Step 5: Run the tests and the build**

Run: `npx vitest run lib/design && npx tsc --noEmit && npm test && npm run build`
Expected: PASS. If a light-theme pair fails the contrast test, darken that token in `theme.css` (and its copy in the system block) until it passes. Report every value you changed.

- [ ] **Step 6: Commit**

```bash
git add -A package.json package-lock.json postcss.config.mjs components.json app/theme.css app/globals.css app/layout.tsx lib/utils.ts lib/design components/ui
git commit -m "feat: add React 19, Tailwind v4, shadcn/ui, the NaDoch! theme tokens, and fonts"
```

---

### Task 2: Profile theme and sound; server-applied theme; preferences provider

**Files:**
- Create: `components/providers/PreferencesProvider.tsx`, `components/providers/PreferencesProvider.test.tsx`, `lib/db/profilePreferencesMigration.test.ts`
- Modify:
  - `lib/db/schema.ts`, `lib/types.ts`
  - `lib/services/profileService.ts`, `lib/services/profileService.test.ts`
  - `app/api/profile/route.test.ts`, `app/layout.tsx`
  - `components/settings/SettingsPage.tsx`, `components/settings/SettingsPage.test.tsx`
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Produces:
  - `Profile` gains `theme: 'dark' | 'light' | 'system'; soundEnabled: boolean` and loses `freestyleDefault`.
  - `ProfileUpdate` gains `theme?` and `soundEnabled?`.
  - `PreferencesProvider({ initial: { theme; soundEnabled }, children })`
  - `usePreferences(): { theme; soundEnabled; setTheme(t): Promise<void>; setSoundEnabled(b): Promise<void> }`. The setters PATCH the profile, update `document.documentElement.dataset.theme`, and roll back on failure.

- [ ] **Step 1: Write the failing tests**

Create `lib/db/profilePreferencesMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from './client';

describe('profile preferences', () => {
  it('defaults to the dark theme with sound on, and has no freestyle default', () => {
    const db = createDbClient(':memory:');
    db.prepare('INSERT INTO profile (id) VALUES (1)').run();
    expect(db.prepare('SELECT theme, sound_enabled FROM profile').get()).toEqual({ theme: 'dark', sound_enabled: 1 });
    const columns = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('freestyle_default');
  });
});
```

In `lib/services/profileService.test.ts`:
- remove every `freestyleDefault` expectation;
- add:

```ts
  it('updates the theme and sound, and rejects an unknown theme', () => {
    const service = createProfileService(createDbClient(':memory:'));
    expect(service.updateProfile({ theme: 'light', soundEnabled: false })).toMatchObject({ theme: 'light', soundEnabled: false });
    expect(() => service.updateProfile({ theme: 'neon' as never })).toThrow('Theme must be dark, light or system');
    expect(service.getProfile().theme).toBe('light');
  });
```

In `app/api/profile/route.test.ts`, add a PATCH with `{ theme: 'neon' }` that expects status 400 (Review Focus 1).

Create `components/providers/PreferencesProvider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PreferencesProvider, usePreferences } from './PreferencesProvider';

function Probe() {
  const { theme, soundEnabled, setTheme, setSoundEnabled } = usePreferences();
  return (
    <div>
      <p>{`${theme} ${soundEnabled ? 'on' : 'off'}`}</p>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setSoundEnabled(false)}>mute</button>
    </div>
  );
}

describe('PreferencesProvider', () => {
  it('saves a theme change, applies it to <html>, and rolls back when saving fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => delayedResponse({ theme: 'light' }))
      .mockImplementationOnce(() => delayedResponse({ error: 'nope' }, { ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    document.documentElement.dataset.theme = 'dark';
    render(
      <PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}>
        <Probe />
      </PreferencesProvider>
    );
    fireEvent.click(screen.getByText('light'));
    await waitFor(() => expect(screen.getByText('light on')).toBeInTheDocument());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'light' }),
    });

    fireEvent.click(screen.getByText('mute'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('light on')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/db/profilePreferencesMigration.test.ts lib/services/profileService.test.ts app/api/profile components/providers`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/db/schema.ts`:
- in the `profile` definition, remove `freestyle_default …` and add:

```sql
      theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
      sound_enabled INTEGER NOT NULL DEFAULT 1,
```

- add and call last in `runMigrations`:

```ts
// Design pass: theme and sound preferences; the freestyle default setting is removed (Freestyle decision).
function migrateProfilePreferences(db: Database.Database): void {
  const columns = (db.prepare('PRAGMA table_info(profile)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('theme')) {
    db.exec("ALTER TABLE profile ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system'))");
  }
  if (!columns.includes('sound_enabled')) db.exec('ALTER TABLE profile ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1');
  if (columns.includes('freestyle_default')) db.exec('ALTER TABLE profile DROP COLUMN freestyle_default');
}
```

`lib/types.ts`: in `Profile`, remove `freestyleDefault` and add `theme: 'dark' | 'light' | 'system'; soundEnabled: boolean;`. Export `type Theme = Profile['theme']`.

`lib/services/profileService.ts`:
- the `Row` gets `theme` and `sound_enabled` in place of `freestyle_default`;
- `rowToProfile` maps `theme: row.theme, soundEnabled: row.sound_enabled === 1`;
- `ProfileUpdate` drops `freestyleDefault` and adds `theme?: Theme; soundEnabled?: boolean`;
- in `updateProfile`, before the UPDATE:

```ts
    if (input.theme !== undefined && !['dark', 'light', 'system'].includes(input.theme)) {
      throw new ProfileUpdateError('Theme must be dark, light or system');
    }
```

- the UPDATE replaces `freestyle_default = ?` with `theme = ?, sound_enabled = ?` and passes `input.theme ?? current.theme` and `(input.soundEnabled ?? current.soundEnabled) ? 1 : 0`.

If Phase 2 gave `ProfileUpdateError` a code argument, pass `'bad_request'`.

Create `components/providers/PreferencesProvider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '@/lib/types';

interface Preferences {
  theme: Theme;
  soundEnabled: boolean;
  setTheme: (theme: Theme) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
}

const PreferencesContext = createContext<Preferences | null>(null);

async function save(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Spec: Theme selection. The server already rendered <html data-theme>; this keeps it in sync
// after a change, and puts the old value back if saving fails.
export function PreferencesProvider({ initial, children }: { initial: { theme: Theme; soundEnabled: boolean }; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial.theme);
  const [soundEnabled, setSoundState] = useState(initial.soundEnabled);

  const setTheme = useCallback(
    async (next: Theme) => {
      const previous = theme;
      setThemeState(next);
      document.documentElement.dataset.theme = next;
      if (!(await save({ theme: next }))) {
        setThemeState(previous);
        document.documentElement.dataset.theme = previous;
      }
    },
    [theme]
  );

  const setSoundEnabled = useCallback(
    async (next: boolean) => {
      const previous = soundEnabled;
      setSoundState(next);
      if (!(await save({ soundEnabled: next }))) setSoundState(previous);
    },
    [soundEnabled]
  );

  const value = useMemo(() => ({ theme, soundEnabled, setTheme, setSoundEnabled }), [theme, soundEnabled, setTheme, setSoundEnabled]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
```

`app/layout.tsx`:
- read the profile, and put `data-theme={profile.theme}` on `<html>`;
- wrap the children in `<PreferencesProvider initial={{ theme: profile.theme, soundEnabled: profile.soundEnabled }}>`, inside the intl provider.

`components/settings/SettingsPage.tsx`:
- delete the freestyle section;
- delete the `settings.freestyle` and `settings.freestyleDefault` keys from both catalogs;
- remove the matching test in `SettingsPage.test.tsx`.

The theme and sound controls arrive in Task 6.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Every test fixture that builds a `Profile` needs `theme: 'dark', soundEnabled: true` in place of `freestyleDefault`. Update each one tsc reports.

- [ ] **Step 5: Commit**

```bash
git add -A lib app components messages
git commit -m "feat: store theme and sound on the profile and apply the theme on the server"
```

---

### Task 3: Brand — logo, icons, manifest, "NaDoch!" track name

**Files:**
- Create:
  - `components/brand/Logo.tsx`, `components/brand/Logo.test.tsx`
  - `scripts/build-icons.ts`
  - `app/icon.svg`, `app/apple-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` (generated)
  - `app/manifest.ts`, `app/manifest.test.ts`
- Modify: `package.json` (dev dependencies), `messages/en.json`, `messages/de.json`, and admin places that print the raw track id

**Interfaces:**
- Produces:
  - `Logo({ variant?: 'full' | 'compact'; className?: string; title?: string })`, an inline SVG with unique gradient ids per instance.
  - `app/manifest.ts` default-exports `manifest(): MetadataRoute.Manifest`.

- [ ] **Step 1: Write the failing tests**

Create `components/brand/Logo.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an accessible wordmark, with the tagline only in the full variant', () => {
    const { container, unmount } = render(<Logo />);
    expect(screen.getByRole('img', { name: 'NaDoch!' })).toBeInTheDocument();
    expect(container.textContent).toContain('Ach so!');
    unmount();
    const compact = render(<Logo variant="compact" />);
    expect(compact.container.textContent).not.toContain('Ach so!');
  });

  it('gives each instance its own gradient ids', () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

Create `app/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('makes NaDoch! installable, standalone, with its icons', () => {
    expect(manifest()).toMatchObject({
      name: 'NaDoch!',
      short_name: 'NaDoch!',
      start_url: '/',
      display: 'standalone',
      background_color: '#121212',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
        expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
      ]),
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/brand app/manifest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the logo and manifest**

Create `components/brand/Logo.tsx`. The shapes come from `docs/design/nadoch-logo.svg`, and the text uses the self-hosted Nunito:

```tsx
import { useId } from 'react';

// Spec: Brand. The user's logo as an inline component. Text renders in the self-hosted Nunito,
// so there is no font request at runtime. "compact" drops the tagline for the header and sidebar.
export function Logo({ variant = 'full', className, title = 'NaDoch!' }: { variant?: 'full' | 'compact'; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const bubble = `bubble-${uid}`;
  const accent = `accent-${uid}`;
  const viewBox = variant === 'full' ? '100 50 640 330' : '105 55 630 250';
  return (
    <svg role="img" aria-label={title} viewBox={viewBox} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={bubble} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="48%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id={accent} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path
        d="M 188,72 L 642,66 C 685,66 718,98 720,140 L 722,216 C 722,258 688,292 646,294 L 285,302 L 192,368 C 180,376 166,368 170,352 L 178,300 C 138,296 112,260 114,218 L 118,142 C 120,98 152,72 188,72 Z"
        stroke={`url(#${accent})`}
        strokeWidth="5"
        strokeLinejoin="round"
        transform="translate(-4, 6)"
      />
      <path
        d="M 192,68 L 646,62 C 686,62 718,94 720,134 L 722,212 C 722,252 690,286 650,288 L 285,296 L 196,360 C 187,366 174,360 177,348 L 184,295 C 144,290 118,256 120,216 L 124,138 C 126,96 156,68 192,68 Z"
        fill={`url(#${bubble})`}
      />
      <g transform="rotate(-3.5 255 186)">
        <text x="255" y="186" textAnchor="middle" fill="#ffffff" style={{ fontFamily: 'var(--font-nunito)', fontWeight: 900, fontSize: 88, letterSpacing: -1 }}>
          Na
        </text>
      </g>
      <g transform="rotate(1 435 188)">
        <text x="435" y="188" textAnchor="middle" fill="#ffffff" style={{ fontFamily: 'var(--font-nunito)', fontWeight: 900, fontSize: 96, letterSpacing: -1.5 }}>
          Doch
        </text>
      </g>
      <g transform="rotate(11 590 162)">
        <path d="M 584,98 C 584,88 606,88 606,98 L 600,152 C 600,156 595,159 590,159 C 585,159 580,156 580,152 Z" fill={`url(#${accent})`} stroke="#ffffff" strokeWidth="5" />
        <circle cx="590" cy="180" r="10.5" fill={`url(#${accent})`} stroke="#ffffff" strokeWidth="5" />
      </g>
      {variant === 'full' && (
        <g transform="translate(0, 4)">
          <rect x="190" y="226" width="455" height="40" rx="20" fill="#ffffff" fillOpacity="0.14" stroke="#ffffff" strokeOpacity="0.28" />
          <text x="417" y="253" textAnchor="middle" style={{ fontFamily: 'var(--font-nunito)', fontSize: 19 }}>
            <tspan fill="#bae6fd" fontWeight={600}>Von </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Na?“</tspan>
            <tspan fill="#bae6fd" fontWeight={600}> über </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Ach so!“</tspan>
            <tspan fill="#bae6fd" fontWeight={600}> zu </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Doch!“</tspan>
          </text>
        </g>
      )}
    </svg>
  );
}
```

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

// Spec: PWA — installable, online-only (no service worker).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NaDoch!',
    short_name: 'NaDoch!',
    description: 'Learn German — von „Na?“ über „Ach so!“ zu „Doch!“',
    start_url: '/',
    display: 'standalone',
    background_color: '#121212',
    theme_color: '#121212',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

In `app/layout.tsx`, export `viewport` with `themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#121212' }, { media: '(prefers-color-scheme: light)', color: '#ffffff' }]`, and `metadata` with `title: 'NaDoch!'` and `appleWebApp: { capable: true, title: 'NaDoch!' }`.

- [ ] **Step 4: Build the icons**

Run: `npm install -D sharp opentype.js @fontsource/nunito @types/opentype.js`

Create `scripts/build-icons.ts`:

```ts
// Builds the favicon and app icons (spec: Brand): a white "D" and an orange "!" on the
// gradient speech bubble. The "D" is converted to a path from Nunito 900, so the icons don't
// depend on any font. Run: npx tsx scripts/build-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = process.cwd();
const fontPath = join(root, 'node_modules', '@fontsource', 'nunito', 'files', 'nunito-latin-900-normal.woff');
const font = opentype.parse(readFileSync(fontPath).buffer);
const d = font.getPath('D', 128, 318, 250).toPathData(2);

function iconSvg(padding: number): string {
  // A 512 canvas; `padding` shrinks the bubble for the maskable safe zone.
  const s = (512 - padding * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0284c7"/><stop offset=".48" stop-color="#06b6d4"/><stop offset="1" stop-color="#0d9488"/></linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
  </defs>
  ${padding > 0 ? '<rect width="512" height="512" fill="#121212"/>' : ''}
  <g transform="translate(${padding} ${padding}) scale(${s})">
    <path d="M96 40h320c44 0 80 36 80 80v200c0 44-36 80-80 80H224l-104 84c-12 10-28 0-24-14l14-70h-14c-44 0-80-36-80-80V120c0-44 36-80 80-80z" fill="url(#b)"/>
    <path d="${d}" fill="#ffffff"/>
    <g transform="rotate(11 382 215)">
      <path d="M368 110c0-18 30-18 30 0l-8 150c0 8-7 12-7 12s-7-4-7-12z" fill="url(#a)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="383" cy="310" r="20" fill="url(#a)" stroke="#fff" stroke-width="8"/>
    </g>
  </g>
</svg>`;
}

async function main() {
  mkdirSync(join(root, 'public', 'icons'), { recursive: true });
  const plain = iconSvg(0);
  writeFileSync(join(root, 'app', 'icon.svg'), plain);
  await sharp(Buffer.from(plain)).resize(180, 180).png().toFile(join(root, 'app', 'apple-icon.png'));
  await sharp(Buffer.from(plain)).resize(192, 192).png().toFile(join(root, 'public', 'icons', 'icon-192.png'));
  await sharp(Buffer.from(plain)).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-512.png'));
  await sharp(Buffer.from(iconSvg(64))).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-maskable-512.png'));
  console.log('icons written');
}

main();
```

Run `npx tsx scripts/build-icons.ts`, then open `app/icon.svg` in a browser. Check that the "D" sits inside the bubble and the "!" doesn't overlap it. If needed, adjust the `font.getPath('D', x, y, size)` numbers and the `rotate(11 382 215)` group's coordinates, and re-run. Report the final numbers.

If `nunito-latin-900-normal.woff` isn't at that path, list `node_modules/@fontsource/nunito/files/` and use the latin 900 normal `.woff` file.

- [ ] **Step 5: The "NaDoch!" track name**

- `messages/en.json` and `messages/de.json`: `"tracks": { "generic": "NaDoch!", … }`.
- Admin pages that print the raw id `generic` as a label (the curriculum browser headings and `TrackLevelStructure`'s `<h1>{track} — {level}</h1>`) show `NaDoch!` for `generic`. Add `export const TRACK_LABEL: Record<Track, string> = { generic: 'NaDoch!', telc: 'telc', goethe: 'Goethe' };` to `lib/tutoring/levels.ts` and use it there.
- Update the tests that expect the text "Generic" or "Allgemein" (e.g. the tree heading `'Generic A1'` becomes `'NaDoch! A1'`).

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: PASS. In the running app, the tab shows the new favicon.

- [ ] **Step 7: Commit**

```bash
git add -A components/brand scripts/build-icons.ts app/icon.svg app/apple-icon.png public/icons app/manifest.ts app/manifest.test.ts app/layout.tsx package.json package-lock.json messages lib/tutoring/levels.ts components app
git commit -m "feat: add the NaDoch! logo, app icons, manifest, and track name"
```

---

### Task 4: Nav registry and app shell

**Files:**
- Create:
  - `lib/nav/navItems.ts`, `lib/nav/navItems.test.ts`
  - `components/shell/ShellContext.tsx`, `components/shell/AppShell.tsx`, `components/shell/AppShell.test.tsx`
  - `hooks/useMediaQuery.ts`
  - `app/api/tutoring/queue/count/route.ts`
- Modify:
  - `app/layout.tsx`
  - `messages/en.json`, `messages/de.json`
  - `app/api/tutoring/routes.test.ts`

**Interfaces:**
- Produces:
  - `NavItem { id: 'learn' | 'dashboard' | 'review' | 'flashcards' | 'freestyle' | 'profile' | 'settings'; href: string; icon: LucideIcon; labelKey: string; placements: ('sidebar' | 'fab' | 'bottom' | 'top')[]; enabled: boolean; badge?: 'reviewsDue' }`
  - `NAV_ITEMS`, and `navFor(placement): NavItem[]`, which returns enabled items only.
  - `ShellProvider`, and `useShell(): { focus: boolean; setFocus(b: boolean): void }`.
  - `AppShell({ children })`, which hides itself on `/onboarding`, `/admin/login` and whenever `focus` is true.
  - `useMediaQuery(query): boolean`.
  - `GET /api/tutoring/queue/count` → `{ due: number }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/nav/navItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { navFor } from './navItems';

describe('nav registry', () => {
  it('places each built item per the thumb-zone layout, and hides unbuilt ones', () => {
    expect(navFor('top').map((i) => i.id)).toEqual(['settings']);
    expect(navFor('bottom').map((i) => i.id)).toEqual(['dashboard', 'profile']);
    expect(navFor('fab').map((i) => i.id)).toEqual(['review']);
    expect(navFor('sidebar').map((i) => i.id)).toEqual(['learn', 'dashboard', 'review', 'profile', 'settings']);
  });
});
```

Create `components/shell/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { AppShell } from './AppShell';
import { ShellProvider, useShell } from './ShellContext';

const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

function setWidth(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop && query.includes('min-width: 1024px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function FocusOn() {
  const { setFocus } = useShell();
  return <button onClick={() => setFocus(true)}>focus</button>;
}

function renderShell() {
  return renderWithIntl(
    <ShellProvider>
      <AppShell>
        <p>page</p>
        <FocusOn />
      </AppShell>
    </ShellProvider>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    pathname.value = '/';
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ due: 7 })));
  });

  it('on a phone: logo and Settings at the top, Review as a floating button with its badge, Dashboard and Profile at the bottom', async () => {
    setWidth(false);
    renderShell();
    expect(screen.getByRole('link', { name: 'NaDoch!' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(await screen.findByRole('link', { name: 'Review (7 due)' })).toHaveAttribute('href', '/queue');
    const bottom = screen.getByRole('navigation', { name: 'Main' });
    expect(bottom).toHaveTextContent('Dashboard');
    expect(bottom).toHaveTextContent('Profile');
    expect(screen.queryByRole('link', { name: /Freestyle/ })).not.toBeInTheDocument();
  });

  it('on a desktop: one sidebar with every built item', async () => {
    setWidth(true);
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Learn', 'Dashboard', 'Profile', 'Settings']) expect(sidebar).toHaveTextContent(name);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Review (7 due)' })).toBeInTheDocument());
  });

  it('hides itself in focus mode and on onboarding', () => {
    setWidth(false);
    const { unmount } = renderShell();
    screen.getByText('focus').click();
    return waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()).then(() => {
      unmount();
      pathname.value = '/onboarding';
      renderShell();
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
      expect(screen.getByText('page')).toBeInTheDocument();
    });
  });

  // Review Focus 5
  it('shows Review without a badge when the count cannot load', async () => {
    setWidth(false);
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({}, { ok: false, status: 500 })));
    renderShell();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument());
  });
});
```

In `app/api/tutoring/routes.test.ts`, add:

```ts
  it('GET /queue/count returns the number of reviews left today', async () => {
    const { GET: getCount } = await import('./queue/count/route');
    expect(await (await getCount()).json()).toEqual({ due: 0 });
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/nav components/shell app/api/tutoring/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/nav/navItems.ts`:

```ts
import { BookOpenCheck, Gauge, Layers, Repeat, Settings, Snowflake, TreeDeciduous, User, type LucideIcon } from 'lucide-react';

export type NavPlacement = 'sidebar' | 'fab' | 'bottom' | 'top';

export interface NavItem {
  id: 'learn' | 'dashboard' | 'review' | 'flashcards' | 'freestyle' | 'profile' | 'settings';
  href: string;
  icon: LucideIcon;
  labelKey: string;
  placements: NavPlacement[];
  // Spec: items for unbuilt features stay hidden. Each module's plan flips its own flag.
  enabled: boolean;
  badge?: 'reviewsDue';
}

// Order within a placement is the order shown. Spec: Shell and Navigation (thumb zone).
export const NAV_ITEMS: NavItem[] = [
  { id: 'learn', href: '/', icon: TreeDeciduous, labelKey: 'learn', placements: ['sidebar'], enabled: true },
  { id: 'dashboard', href: '/dashboard', icon: Gauge, labelKey: 'dashboard', placements: ['sidebar', 'bottom'], enabled: true },
  { id: 'freestyle', href: '/freestyle', icon: Snowflake, labelKey: 'freestyle', placements: ['sidebar', 'fab'], enabled: false },
  { id: 'flashcards', href: '/flashcards', icon: Layers, labelKey: 'flashcards', placements: ['sidebar', 'fab'], enabled: false },
  { id: 'review', href: '/queue', icon: Repeat, labelKey: 'review', placements: ['sidebar', 'fab'], enabled: true, badge: 'reviewsDue' },
  { id: 'profile', href: '/profile', icon: User, labelKey: 'profile', placements: ['sidebar', 'bottom'], enabled: true },
  { id: 'settings', href: '/settings', icon: Settings, labelKey: 'settings', placements: ['sidebar', 'top'], enabled: true },
];

export function navFor(placement: NavPlacement): NavItem[] {
  return NAV_ITEMS.filter((item) => item.enabled && item.placements.includes(placement));
}

export { BookOpenCheck };
```

(`BookOpenCheck` is re-exported for the Exam item, which Level exams adds.)

Create `hooks/useMediaQuery.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
```

Create `components/shell/ShellContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

const ShellContext = createContext<{ focus: boolean; setFocus: (focus: boolean) => void }>({ focus: false, setFocus: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState(false);
  return <ShellContext.Provider value={{ focus, setFocus }}>{children}</ShellContext.Provider>;
}

// Focus mode (exercise runs) hides the shell; FocusLayout turns it on and off.
export function useShell() {
  return useContext(ShellContext);
}
```

Create `components/shell/AppShell.tsx`:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { navFor, type NavItem } from '@/lib/nav/navItems';
import { cn } from '@/lib/utils';
import { useShell } from './ShellContext';

const BARE_ROUTES = ['/onboarding', '/admin/login'];

function useReviewsDue(): number | null {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/tutoring/queue/count')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { due?: unknown };
        if (typeof data.due === 'number') setDue(data.due);
      })
      .catch(() => undefined);
  }, []);
  return due;
}

function NavLink({ item, due, showLabel, className }: { item: NavItem; due: number | null; showLabel: boolean; className?: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const badge = item.badge === 'reviewsDue' && due !== null && due > 0 ? due : null;
  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-label={badge !== null ? t('withDue', { label, count: badge }) : label}
      aria-current={active ? 'page' : undefined}
      className={cn('relative flex items-center gap-3 rounded-lg px-3 py-2 text-text-muted hover:bg-surface-raised hover:text-text', active && 'text-primary', className)}
    >
      <Icon aria-hidden className="size-5" />
      {showLabel && <span>{label}</span>}
      {badge !== null && (
        <span aria-hidden className="absolute -top-1 -right-1 rounded-full bg-highlight px-1.5 text-xs font-bold text-background">
          {badge}
        </span>
      )}
    </Link>
  );
}

// Spec: Shell and Navigation. Phone: top bar + floating buttons + bottom bar (thumb zone).
// Tablet: icon sidebar. Desktop: labelled sidebar. Hidden in focus mode and on bare routes.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { focus } = useShell();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const tablet = useMediaQuery('(min-width: 768px)');
  const due = useReviewsDue();
  const tNav = useTranslations('nav');

  if (focus || BARE_ROUTES.some((route) => pathname.startsWith(route))) return <>{children}</>;

  if (tablet) {
    return (
      <div className="flex min-h-dvh">
        <nav aria-label={tNav('main')} className={cn('sticky top-0 flex h-dvh flex-col gap-1 border-r border-border bg-surface p-3', desktop ? 'w-60' : 'w-16')}>
          <Link href="/" aria-label="NaDoch!" className="mb-4 block">
            <Logo variant="compact" className={desktop ? 'h-12' : 'h-8'} title="NaDoch!" />
          </Link>
          {navFor('sidebar')
            .filter((item) => item.id !== 'profile' && item.id !== 'settings')
            .map((item) => (
              <NavLink key={item.id} item={item} due={due} showLabel={desktop} />
            ))}
          <div className="mt-auto flex flex-col gap-1">
            {navFor('sidebar')
              .filter((item) => item.id === 'profile' || item.id === 'settings')
              .map((item) => (
                <NavLink key={item.id} item={item} due={due} showLabel={desktop} />
              ))}
          </div>
        </nav>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
        <Link href="/" aria-label="NaDoch!">
          <Logo variant="compact" className="h-9" title="NaDoch!" />
        </Link>
        {navFor('top').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel={false} />
        ))}
      </header>
      <main className="flex-1 px-4 pt-4 pb-32">{children}</main>
      <div className="fixed right-4 bottom-20 z-10 flex gap-3">
        {navFor('fab').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel={false} className="size-14 justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary hover:text-primary-foreground" />
        ))}
      </div>
      <nav aria-label={tNav('main')} className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-border bg-surface px-6 py-2">
        {navFor('bottom').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel className="flex-col gap-0.5 text-xs" />
        ))}
      </nav>
    </div>
  );
}
```

Create `app/api/tutoring/queue/count/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProgressService } from '@/lib/services/progressService';
import { localDate } from '@/lib/tutoring/dates';

export const dynamic = 'force-dynamic';

// The review badge: reviews still to do today (already capped by the daily limit).
export async function GET() {
  return NextResponse.json({ due: createProgressService(getDb()).getDailyQueue(localDate()).items.length });
}
```

Catalogs, a new `nav` namespace:
- en: `{ "main": "Main", "learn": "Learn", "dashboard": "Dashboard", "review": "Review", "flashcards": "Flashcards", "freestyle": "Freestyle", "profile": "Profile", "settings": "Settings", "withDue": "{label} ({count} due)" }`
- de: `{ "main": "Hauptmenü", "learn": "Lernen", "dashboard": "Übersicht", "review": "Wiederholen", "flashcards": "Karteikarten", "freestyle": "Freestyle", "profile": "Profil", "settings": "Einstellungen", "withDue": "{label} ({count} fällig)" }`

`app/layout.tsx`: wrap the children as `<ShellProvider><AppShell>{children}</AppShell></ShellProvider>`, inside `PreferencesProvider`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/nav components/shell app/api/tutoring messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS. Page-level tests that render pages without the layout are unaffected.

- [ ] **Step 5: Commit**

```bash
git add -A lib/nav components/shell hooks app/api/tutoring/queue app/layout.tsx messages app/api/tutoring/routes.test.ts
git commit -m "feat: add the thumb-zone app shell driven by a nav registry"
```

---

### Task 5: Dashboard

**Files:**
- Create:
  - `lib/tutoring/dashboardViews.ts`
  - `lib/services/dashboardService.ts`, `lib/services/dashboardService.test.ts`
  - `app/api/tutoring/dashboard/route.ts`
  - `app/dashboard/page.tsx`
  - `components/dashboard/DashboardPage.tsx`, `components/dashboard/DashboardPage.test.tsx`, `components/dashboard/Heatmap.tsx`, `components/dashboard/SkillProgress.tsx`
- Modify: `components/home/HomeScreen.tsx`, `components/home/HomeScreen.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `loadLevelGating` (restructure), `createContentText` (bilingual), `progressService.getDailyQueue`, `localDate`, `addDays`.
- Produces:
  - `DashboardView { continueLesson: { id: string; title: string } | null; reviewsDue: number; skills: { skill: Skill; done: number; total: number }[]; activity: { date: string; count: number }[] }`
  - `createDashboardService(db, deps?: { now?: () => Date }).getDashboard(): DashboardView`
  - `ACTIVITY_DAYS = 84`
  - `GET /api/tutoring/dashboard`

- [ ] **Step 1: Write the failing tests**

Create `lib/services/dashboardService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { ACTIVITY_DAYS, createDashboardService } from './dashboardService';
import { addAttempt, markComplete, seedTutoringCurriculum } from '@/test/tutoringFixtures';

function setup() {
  const db = createDbClient(':memory:');
  seedTutoringCurriculum(db);
  const service = createDashboardService(db, { now: () => new Date(2026, 8, 29, 10, 0) });
  return { db, service };
}

describe('dashboardService', () => {
  it('continues the most recently attempted lesson that is not complete', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'wrong', { on: '2026-09-27' });
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-greet', title: 'Saying hello' });
  });

  it('falls back to the suggested next lesson when every attempted lesson is complete', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-09-27' });
    markComplete(db, 'a1-greet');
    expect(service.getDashboard().continueLesson).toEqual({ id: 'a1-sein', title: 'The verb sein' });
  });

  it('counts done lessons per skill in the active track and level', () => {
    const { db, service } = setup();
    markComplete(db, 'a1-greet');
    expect(service.getDashboard().skills).toEqual([
      { skill: 'grammar', done: 0, total: 1 },
      { skill: 'vocabulary', done: 1, total: 1 },
    ]);
  });

  // Review Focus 4: a full 84-day window ending today, zeros for quiet days, older attempts excluded.
  it('returns 84 days of activity, oldest first, with zeros and nothing older', () => {
    const { db, service } = setup();
    addAttempt(db, 'a1-greet__ex1', 'wrong', { on: '2026-09-29' });
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-09-29', source: 'queue' });
    addAttempt(db, 'a1-greet__ex1', 'correct', { on: '2026-07-01' });
    const { activity } = service.getDashboard();
    expect(activity).toHaveLength(ACTIVITY_DAYS);
    expect(activity[0]).toEqual({ date: '2026-07-08', count: 0 });
    expect(activity[ACTIVITY_DAYS - 1]).toEqual({ date: '2026-09-29', count: 2 });
    expect(activity.reduce((sum, d) => sum + d.count, 0)).toBe(2);
  });

  it('reports the reviews left today', () => {
    expect(setup().service.getDashboard().reviewsDue).toBe(0);
  });
});
```

Create `components/dashboard/DashboardPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { DashboardPage } from './DashboardPage';

const days = Array.from({ length: 84 }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, count: i === 83 ? 5 : 0 }));
const VIEW = {
  continueLesson: { id: 'a1-sein', title: 'The verb sein' },
  reviewsDue: 3,
  skills: [
    { skill: 'grammar', done: 2, total: 5 },
    { skill: 'reading', done: 0, total: 3 },
  ],
  activity: days,
};

describe('DashboardPage', () => {
  it('shows continue, reviews, progress by skill, and the activity heatmap', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse(VIEW)));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'Continue: The verb sein' })).toHaveAttribute('href', '/lesson/a1-sein');
    expect(screen.getByRole('link', { name: 'Start today’s 3 reviews' })).toHaveAttribute('href', '/queue');
    expect(screen.getByText('Grammar')).toBeInTheDocument();
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(84);
    expect(screen.getByRole('gridcell', { name: /5 answers/ })).toBeInTheDocument();
  });

  it('says when nothing is due and when there is nothing to continue', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({ ...VIEW, continueLesson: null, reviewsDue: 0 })));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByText('No reviews due today.')).toBeInTheDocument();
    expect(screen.getByText('Pick a lesson from your tree to get started.')).toBeInTheDocument();
  });

  it('shows an error when the dashboard cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => delayedResponse({}, { ok: false, status: 500 })));
    renderWithIntl(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your dashboard. Please reload the page.');
  });
});
```

In `components/home/HomeScreen.test.tsx`, add an assertion that a `link` named `Dashboard` points to `/dashboard`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/services/dashboardService.test.ts components/dashboard components/home`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/tutoring/dashboardViews.ts`:

```ts
import type { Skill } from '../curriculum/types';

export interface DashboardView {
  continueLesson: { id: string; title: string } | null;
  reviewsDue: number;
  skills: { skill: Skill; done: number; total: number }[];
  // ACTIVITY_DAYS local dates, oldest first; count = lesson answers + review answers that day
  activity: { date: string; count: number }[];
}
```

Create `lib/services/dashboardService.ts`:

```ts
import type Database from 'better-sqlite3';
import type { Skill } from '../curriculum/types';
import { addDays, localDate } from '../tutoring/dates';
import type { DashboardView } from '../tutoring/dashboardViews';
import { createContentText } from './contentText';
import { loadLevelGating } from './levelGating';
import { createProfileService } from './profileService';
import { createProgressService } from './progressService';

export const ACTIVITY_DAYS = 84;
const SKILL_ORDER: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

// Spec: Pages, Dashboard.
export function createDashboardService(db: Database.Database, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());
  const profiles = createProfileService(db);
  const progress = createProgressService(db);
  const text = createContentText(db);

  function getDashboard(): DashboardView {
    const { activeTrack, activeLevel, uiLanguage } = profiles.getProfile();
    const today = localDate(now());
    const queue = progress.getDailyQueue(today);

    const recent = db
      .prepare(
        `SELECT a.lesson_id FROM lesson_attempts a
         WHERE a.source = 'lesson' AND NOT EXISTS (SELECT 1 FROM lesson_completions c WHERE c.lesson_id = a.lesson_id)
         ORDER BY a.id DESC LIMIT 1`
      )
      .get() as { lesson_id: string } | undefined;
    const continueLesson = recent
      ? { id: recent.lesson_id, title: text.lessonTitle(recent.lesson_id, uiLanguage) }
      : queue.suggestedLesson;

    const gating = loadLevelGating(db, activeTrack, activeLevel);
    const skillOf = db.prepare('SELECT skill FROM lessons WHERE id = ?');
    const tally = new Map<Skill, { done: number; total: number }>();
    for (const id of gating.milestones.flatMap((m) => m.lessonIds)) {
      const { skill } = skillOf.get(id) as { skill: Skill };
      const entry = tally.get(skill) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (gating.isDone(id)) entry.done += 1;
      tally.set(skill, entry);
    }
    const skills = SKILL_ORDER.filter((skill) => tally.has(skill)).map((skill) => ({ skill, ...tally.get(skill)! }));

    const start = addDays(today, -(ACTIVITY_DAYS - 1));
    const counts = new Map(
      (
        db
          .prepare('SELECT answered_on AS date, COUNT(*) AS count FROM lesson_attempts WHERE answered_on BETWEEN ? AND ? GROUP BY answered_on')
          .all(start, today) as { date: string; count: number }[]
      ).map((r) => [r.date, r.count])
    );
    const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const date = addDays(start, i);
      return { date, count: counts.get(date) ?? 0 };
    });

    return { continueLesson, reviewsDue: queue.items.length, skills, activity };
  }

  return { getDashboard };
}
```

Create `app/api/tutoring/dashboard/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDashboardService } from '@/lib/services/dashboardService';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(createDashboardService(getDb()).getDashboard());
}
```

Create `components/dashboard/Heatmap.tsx`:

```tsx
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// 12 weeks as columns of 7 days. Colour steps are shades of the primary token.
function shade(count: number): string {
  if (count === 0) return 'bg-surface-raised';
  if (count < 5) return 'bg-primary/30';
  if (count < 15) return 'bg-primary/60';
  return 'bg-primary';
}

export function Heatmap({ days }: { days: { date: string; count: number }[] }) {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  return (
    <div role="grid" aria-label={t('activity')} className="grid grid-flow-col grid-rows-7 gap-1">
      {days.map((day) => {
        const label = t('activityCell', { date: format.dateTime(new Date(`${day.date}T12:00:00`), { dateStyle: 'medium' }), count: day.count });
        return <div key={day.date} role="gridcell" aria-label={label} title={label} className={cn('size-3.5 rounded-sm', shade(day.count))} />;
      })}
    </div>
  );
}
```

Create `components/dashboard/SkillProgress.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import type { Skill } from '@/lib/curriculum/types';

export function SkillProgress({ skills }: { skills: { skill: Skill; done: number; total: number }[] }) {
  const t = useTranslations('dashboard');
  return (
    <ul className="flex flex-col gap-3">
      {skills.map((s) => (
        <li key={s.skill}>
          <div className="flex justify-between text-sm">
            <span>{t(`skill.${s.skill}`)}</span>
            <span className="text-text-muted">{t('ofTotal', { done: s.done, total: s.total })}</span>
          </div>
          <Progress value={s.total === 0 ? 0 : (s.done / s.total) * 100} aria-label={t(`skill.${s.skill}`)} />
        </li>
      ))}
    </ul>
  );
}
```

Create `components/dashboard/DashboardPage.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardView } from '@/lib/tutoring/dashboardViews';
import { Heatmap } from './Heatmap';
import { SkillProgress } from './SkillProgress';

export function DashboardPage() {
  const t = useTranslations('dashboard');
  const [view, setView] = useState<DashboardView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/tutoring/dashboard')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setView((await res.json()) as DashboardView);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    );
  }
  if (!view) return <Skeleton className="h-64 w-full" aria-label={t('loading')} />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <h1 className="md:col-span-2 text-3xl">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('continueTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.continueLesson ? (
            <Link className="text-primary font-semibold" href={`/lesson/${view.continueLesson.id}`}>
              {t('continue', { title: view.continueLesson.title })}
            </Link>
          ) : (
            <p className="text-text-muted">{t('nothingToContinue')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('reviewsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.reviewsDue > 0 ? (
            <Link className="text-primary font-semibold" href="/queue">
              {t('startReviews', { count: view.reviewsDue })}
            </Link>
          ) : (
            <p className="text-text-muted">{t('noReviews')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('skillsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillProgress skills={view.skills} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('activity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap days={view.activity} />
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `app/dashboard/page.tsx` (with the onboarding gate, like `app/lesson/[id]/page.tsx`):

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { DashboardPage } from '@/components/dashboard/DashboardPage';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  if (!createProfileService(getDb()).getProfile().onboardingComplete) redirect('/onboarding');
  return <DashboardPage />;
}
```

`components/home/HomeScreen.tsx`: add `<Link href="/dashboard">{t('dashboardButton')}</Link>` above the tree, using the `home` namespace key `dashboardButton` ("Dashboard" / "Übersicht").

Catalogs, a new `dashboard` namespace:
- en:

```json
  "dashboard": {
    "title": "Dashboard",
    "loading": "Loading your dashboard",
    "loadFailed": "Could not load your dashboard. Please reload the page.",
    "continueTitle": "Continue",
    "continue": "Continue: {title}",
    "nothingToContinue": "Pick a lesson from your tree to get started.",
    "reviewsTitle": "Today's reviews",
    "startReviews": "Start today’s {count} reviews",
    "noReviews": "No reviews due today.",
    "skillsTitle": "Progress by skill",
    "ofTotal": "{done} of {total}",
    "skill": { "grammar": "Grammar", "vocabulary": "Vocabulary", "reading": "Reading", "listening": "Listening", "writing": "Writing", "speaking": "Speaking" },
    "activity": "Activity (12 weeks)",
    "activityCell": "{date}: {count, plural, one {# answer} other {# answers}}"
  },
```

- de:

```json
  "dashboard": {
    "title": "Übersicht",
    "loading": "Deine Übersicht wird geladen",
    "loadFailed": "Deine Übersicht konnte nicht geladen werden. Bitte lade die Seite neu.",
    "continueTitle": "Weitermachen",
    "continue": "Weiter: {title}",
    "nothingToContinue": "Wähle eine Lektion aus deinem Baum, um loszulegen.",
    "reviewsTitle": "Heutige Wiederholungen",
    "startReviews": "Heutige {count} Wiederholungen starten",
    "noReviews": "Heute ist nichts fällig.",
    "skillsTitle": "Fortschritt nach Fertigkeit",
    "ofTotal": "{done} von {total}",
    "skill": { "grammar": "Grammatik", "vocabulary": "Wortschatz", "reading": "Lesen", "listening": "Hören", "writing": "Schreiben", "speaking": "Sprechen" },
    "activity": "Aktivität (12 Wochen)",
    "activityCell": "{date}: {count, plural, one {# Antwort} other {# Antworten}}"
  },
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/services/dashboardService.test.ts components/dashboard components/home messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A lib/tutoring/dashboardViews.ts lib/services/dashboardService.ts lib/services/dashboardService.test.ts app/api/tutoring/dashboard app/dashboard components/dashboard components/home messages
git commit -m "feat: add the Dashboard with continue, reviews, progress by skill, and activity"
```

---

### Task 6: Profile page and Settings split

**Files:**
- Create: `app/profile/page.tsx`, `components/profile/ProfilePage.tsx`, `components/profile/ProfilePage.test.tsx`
- Modify: `components/settings/SettingsPage.tsx`, `components/settings/SettingsPage.test.tsx`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `usePreferences` (Task 2), `GET /api/admin/auth` → `{ passwordSet, authenticated }`.
- Produces: `ProfilePage` (name, track and level, placement, UI language). `SettingsPage` gains theme, sounds and Content Admin, and loses the three moved sections.

- [ ] **Step 1: Write the failing tests**

Create `components/profile/ProfilePage.test.tsx`:
- **Move** every existing `SettingsPage.test.tsx` case about track and level, placement, or UI language into it, rendering `<ProfilePage />` instead of `<SettingsPage />`. Keep their stubs and assertions; the moved sections keep their `settings.*` catalog keys, so the texts are identical.
- Add:

```tsx
  it('saves the display name on blur', async () => {
    const fetchMock = stubProfileRoutes({ displayName: 'Anna' }); // the moved tests' stub helper, returning this profile
    renderWithIntl(<ProfilePage />);
    const name = await screen.findByLabelText('Your name');
    fireEvent.change(name, { target: { value: 'Santy' } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Santy' }),
      })
    );
  });
```

`stubProfileRoutes` is the helper already defined in `SettingsPage.test.tsx` that stubs `/api/profile`, `/api/placement` and `/api/providers`. Copy it into the new file as it is, and add `/api/admin/auth` → `{ passwordSet: true, authenticated: false }` to it in both files.

In `components/settings/SettingsPage.test.tsx`:
- delete the moved cases;
- wrap renders in `<PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}>`;
- add:

```tsx
  it('changes the theme and the sound setting', async () => {
    const fetchMock = stubProfileRoutes({});
    renderSettings();
    fireEvent.click(await screen.findByRole('radio', { name: 'Light' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ body: JSON.stringify({ theme: 'light' }) }))
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Sounds' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ body: JSON.stringify({ soundEnabled: false }) }))
    );
  });

  it('shows Content Admin only with an admin session', async () => {
    stubProfileRoutes({}, { authenticated: true });
    renderSettings();
    expect(await screen.findByRole('link', { name: 'Content Admin' })).toHaveAttribute('href', '/admin/curriculum');
  });

  it('has no admin link without an admin session', async () => {
    stubProfileRoutes({});
    renderSettings();
    await screen.findByRole('heading', { name: 'Providers' });
    expect(screen.queryByRole('link', { name: 'Content Admin' })).not.toBeInTheDocument();
  });
```

`renderSettings()` is `renderWithIntl(<PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}><SettingsPage /></PreferencesProvider>)`. `stubProfileRoutes(profilePatch, adminAuth = { authenticated: false })` gains the second parameter for `/api/admin/auth`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/profile components/settings`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/profile/ProfilePage.tsx`: a client component that loads `/api/profile` and `/api/placement`, the same way `SettingsPage` does today. Move into it **unchanged**:
- the three JSX sections (track and level, placement, language);
- the state and handlers they use: `profile`, `placementBest`, `placementFailed`, `handleProfileChange`, and the error state it sets.

It uses `useTranslations('settings')` for those sections, and `useTranslations('profile')` for:
- the page title `<h1>{tProfile('title')}</h1>`;
- the name field:

```tsx
      <section>
        <h2>{tProfile('name')}</h2>
        <Input
          aria-label={tProfile('nameLabel')}
          defaultValue={profile.displayName}
          onBlur={(e) => e.target.value !== profile.displayName && handleProfileChange({ displayName: e.target.value })}
        />
      </section>
```

Create `app/profile/page.tsx` (onboarding gate, like `app/dashboard/page.tsx`) rendering `<ProfilePage />`.

`components/settings/SettingsPage.tsx`:
- Delete the three moved sections, and the state and effects only they used.
- Add, after the daily-review section:

```tsx
      <section>
        <h2>{t('appearance')}</h2>
        <RadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)} aria-label={t('theme')}>
          {(['dark', 'light', 'system'] as const).map((option) => (
            <label key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} aria-label={t(`themeOption.${option}`)} />
              {t(`themeOption.${option}`)}
            </label>
          ))}
        </RadioGroup>
        <label className="flex items-center gap-2">
          <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} aria-label={t('sounds')} />
          {t('sounds')}
        </label>
      </section>
```

  with `const { theme, soundEnabled, setTheme, setSoundEnabled } = usePreferences();`.
- Fetch `/api/admin/auth` on mount. When `authenticated` is true, render at the end:

```tsx
      {adminSession && (
        <section>
          <h2>{t('contentAdmin')}</h2>
          <Link href="/admin/curriculum">{t('contentAdmin')}</Link>
        </section>
      )}
```

Catalogs:
- `profile`: en `{ "title": "Profile", "name": "Name", "nameLabel": "Your name" }`, de `{ "title": "Profil", "name": "Name", "nameLabel": "Dein Name" }`.
- `settings` additions: en `"appearance": "Appearance", "theme": "Theme", "themeOption": { "dark": "Dark", "light": "Light", "system": "System" }, "sounds": "Sounds", "contentAdmin": "Content Admin"`; de `"appearance": "Darstellung", "theme": "Farbschema", "themeOption": { "dark": "Dunkel", "light": "Hell", "system": "System" }, "sounds": "Töne", "contentAdmin": "Inhaltsverwaltung"`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/profile components/settings messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A app/profile components/profile components/settings messages
git commit -m "feat: split Profile from Settings and add theme, sound, and Content Admin settings"
```

---

### Task 7: Focus mode, sounds, shortcuts, celebration

**Files:**
- Create:
  - `lib/sound/sounds.ts`, `lib/sound/useSound.ts`, `lib/sound/sounds.test.ts`
  - `components/focus/FocusLayout.tsx`, `components/focus/FocusLayout.test.tsx`
  - `components/focus/useExerciseShortcuts.ts`
  - `components/focus/Celebration.tsx`
- Modify:
  - `components/tutoring/LessonPage.tsx`, `components/tutoring/QueuePage.tsx`, `components/tutoring/PracticeRun.tsx`, `components/tutoring/TestOutPage.tsx`, `components/placement/PlacementTest.tsx`
  - `components/tutoring/ExerciseCard.tsx`
  - their tests where the exit or shortcut behaviour is asserted
  - `messages/en.json`, `messages/de.json`

**Interfaces:**
- Produces:
  - `playTone(kind: 'correct' | 'wrong' | 'complete', ctx?: AudioContext): void` and `TONES: Record<kind, { frequency: number; start: number; duration: number }[]>`
  - `useSound(): (kind) => void`, which is a no-op when `soundEnabled` is false or WebAudio is missing.
  - `FocusLayout({ progress: { current: number; total: number } | null; confirmExit: boolean; onExit: () => void; children })`: sets `useShell().setFocus(true)` while mounted, renders the ✕ and the progress bar, and asks for confirmation on exit when `confirmExit` is true.
  - `useExerciseShortcuts({ onPick?(index), onEnter?(), onEscape?() })`, which ignores keys while focus is in an input, textarea, select or contenteditable.
  - `Celebration({ show })`.

- [ ] **Step 1: Write the failing tests**

Create `lib/sound/sounds.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { playTone, TONES } from './sounds';

function fakeContext() {
  const oscillators: { frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => {
      const o = { type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(o);
      return o;
    }),
    createGain: vi.fn(() => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })),
  };
  return { ctx: ctx as unknown as AudioContext, oscillators };
}

describe('sounds', () => {
  it('plays one oscillator per note of the tone', () => {
    for (const kind of ['correct', 'wrong', 'complete'] as const) {
      const { ctx, oscillators } = fakeContext();
      playTone(kind, ctx);
      expect(oscillators).toHaveLength(TONES[kind].length);
      expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(TONES[kind][0].frequency, TONES[kind][0].start);
    }
  });
});
```

Create `components/focus/FocusLayout.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { ShellProvider, useShell } from '@/components/shell/ShellContext';
import { FocusLayout } from './FocusLayout';
import { useExerciseShortcuts } from './useExerciseShortcuts';

function ShellState() {
  return <p>{useShell().focus ? 'focus on' : 'focus off'}</p>;
}

function Shortcuts({ onPick, onEnter }: { onPick: (i: number) => void; onEnter: () => void }) {
  useExerciseShortcuts({ onPick, onEnter });
  return <input aria-label="Your answer" />;
}

describe('FocusLayout', () => {
  it('turns focus mode on while shown and off when gone', () => {
    const { unmount } = renderWithIntl(
      <ShellProvider>
        <ShellState />
        <FocusLayout progress={{ current: 2, total: 5 }} confirmExit={false} onExit={vi.fn()}>
          <p>exercise</p>
        </FocusLayout>
      </ShellProvider>
    );
    expect(screen.getByText('focus on')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Exercise 2 of 5' })).toBeInTheDocument();
    unmount();
  });

  it('asks before leaving mid-run, and exits straight away when nothing is at stake', () => {
    const onExit = vi.fn();
    const { rerender } = renderWithIntl(
      <FocusLayout progress={{ current: 2, total: 5 }} confirmExit onExit={onExit}>
        <p>exercise</p>
      </FocusLayout>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Leave this exercise? Your progress on answered exercises is kept.');
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(onExit).toHaveBeenCalledTimes(1);

    // Review Focus 3: no confirmation when nothing is in progress.
    rerender(
      <FocusLayout progress={null} confirmExit={false} onExit={onExit}>
        <p>done</p>
      </FocusLayout>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('opens the confirmation with Esc', () => {
    renderWithIntl(
      <FocusLayout progress={{ current: 1, total: 3 }} confirmExit onExit={vi.fn()}>
        <p>exercise</p>
      </FocusLayout>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('useExerciseShortcuts', () => {
  // Review Focus 2: typing in an input never triggers a shortcut.
  it('maps 1–4 and Enter, but not while typing in an input', () => {
    const onPick = vi.fn();
    const onEnter = vi.fn();
    renderWithIntl(<Shortcuts onPick={onPick} onEnter={onEnter} />);
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Your answer'), { key: '3' });
    fireEvent.keyDown(screen.getByLabelText('Your answer'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/sound components/focus`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/sound/sounds.ts`:

```ts
// Spec: Motion and Sound. Short tones generated in the browser: no audio files to license.
export type ToneKind = 'correct' | 'wrong' | 'complete';

export const TONES: Record<ToneKind, { frequency: number; start: number; duration: number }[]> = {
  correct: [
    { frequency: 660, start: 0, duration: 0.12 },
    { frequency: 880, start: 0.1, duration: 0.18 },
  ],
  wrong: [{ frequency: 196, start: 0, duration: 0.25 }],
  complete: [
    { frequency: 523, start: 0, duration: 0.12 },
    { frequency: 659, start: 0.12, duration: 0.12 },
    { frequency: 784, start: 0.24, duration: 0.3 },
  ],
};

let shared: AudioContext | null = null;

export function playTone(kind: ToneKind, ctx?: AudioContext): void {
  const context = ctx ?? (shared ??= new AudioContext());
  for (const note of TONES[kind]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.frequency, context.currentTime + note.start);
    gain.gain.setValueAtTime(0.15, context.currentTime + note.start);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + note.start + note.duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(context.currentTime + note.start);
    osc.stop(context.currentTime + note.start + note.duration);
  }
}
```

Create `lib/sound/useSound.ts`:

```ts
'use client';

import { useCallback } from 'react';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { playTone, type ToneKind } from './sounds';

// A no-op when sounds are off (Settings) or the browser has no WebAudio.
export function useSound(): (kind: ToneKind) => void {
  const { soundEnabled } = usePreferences();
  return useCallback(
    (kind: ToneKind) => {
      if (!soundEnabled || typeof window === 'undefined' || !('AudioContext' in window)) return;
      try {
        playTone(kind);
      } catch {
        // Audio is a nicety; never break the exercise.
      }
    },
    [soundEnabled]
  );
}
```

Create `components/focus/useExerciseShortcuts.ts`:

```ts
'use client';

import { useEffect } from 'react';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

// Spec: Focus mode shortcuts. 1–4 pick an option, Enter checks/continues, Esc exits.
// Ignored while typing, so answers can contain digits and Enter submits the form normally.
export function useExerciseShortcuts(handlers: { onPick?: (index: number) => void; onEnter?: () => void; onEscape?: () => void }): void {
  const { onPick, onEnter, onEscape } = handlers;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[1-4]$/.test(event.key) && onPick) {
        event.preventDefault();
        onPick(Number(event.key) - 1);
      } else if (event.key === 'Enter' && onEnter) {
        event.preventDefault();
        onEnter();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onPick, onEnter, onEscape]);
}
```

Create `components/focus/FocusLayout.tsx`:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useShell } from '@/components/shell/ShellContext';
import { useExerciseShortcuts } from './useExerciseShortcuts';

// Spec: Focus mode. Hides the shell; ✕ + progress at the top; content with its Check/Next at the bottom.
export function FocusLayout({
  progress,
  confirmExit,
  onExit,
  children,
}: {
  progress: { current: number; total: number } | null;
  confirmExit: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('focus');
  const { setFocus } = useShell();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setFocus(true);
    return () => setFocus(false);
  }, [setFocus]);

  function requestExit() {
    if (confirmExit) setAsking(true);
    else onExit();
  }

  useExerciseShortcuts({ onEscape: requestExit });

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background py-3">
        <Button variant="ghost" size="icon" aria-label={t('leave')} onClick={requestExit}>
          <X aria-hidden />
        </Button>
        {progress && (
          <Progress
            className="flex-1"
            value={(progress.current / progress.total) * 100}
            aria-label={t('progress', { current: progress.current, total: progress.total })}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col pb-6">{children}</div>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('leaveBody')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('stay')}</AlertDialogCancel>
            <AlertDialogAction onClick={onExit}>{t('leaveAnyway')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

The test expects the dialog text "Leave this exercise? Your progress on answered exercises is kept." That's `leaveTitle` + `leaveBody`, which render adjacent in the dialog.

Create `components/focus/Celebration.tsx`:

```tsx
'use client';

// Spec: a short celebration when a lesson completes: orange and teal particles, CSS only,
// removed entirely under prefers-reduced-motion by globals.css.
export function Celebration({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className={i % 2 ? 'bg-highlight' : 'bg-primary'}
          style={{
            position: 'absolute',
            left: `${(i * 37) % 100}%`,
            top: '-2rem',
            width: '0.5rem',
            height: '0.9rem',
            borderRadius: '2px',
            animation: `nadoch-fall ${1.2 + (i % 5) * 0.15}s ease-in ${(i % 6) * 0.05}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes nadoch-fall { to { transform: translateY(110vh) rotate(540deg); opacity: 0; } }`}</style>
    </div>
  );
}
```

Catalogs, a `focus` namespace:
- en `{ "leave": "Leave", "progress": "Exercise {current} of {total}", "leaveTitle": "Leave this exercise?", "leaveBody": "Your progress on answered exercises is kept.", "stay": "Stay", "leaveAnyway": "Leave anyway", "keysHint": "Keys: 1–4 choose · Enter check · Esc leave" }`
- de `{ "leave": "Verlassen", "progress": "Übung {current} von {total}", "leaveTitle": "Diese Übung verlassen?", "leaveBody": "Dein Fortschritt bei beantworteten Übungen bleibt erhalten.", "stay": "Bleiben", "leaveAnyway": "Trotzdem verlassen", "keysHint": "Tasten: 1–4 wählen · Enter prüfen · Esc verlassen" }`

- [ ] **Step 4: Wire focus mode into every exercise run**

- **`LessonPage`:** while `run` shows an exercise, render it inside `<FocusLayout progress={{ current: position, total }} confirmExit={answeredThisRun > 0 && !finished} onExit={() => setRun(null)}>`, where `position` and `total` come from the run's existing counter. The explanation view stays in the shell.
- **`QueuePage`:** wrap the item run with `confirmExit={answered > 0 && items remain}`. An empty queue, or a finished one, renders without `FocusLayout` (Review Focus 3).
- **`PracticeRun`:** while running, `confirmExit={index > 0}`.
- **`TestOutPage`:** while answering, `confirmExit={answered > 0}`, with `onExit` → `router.push('/')`.
- **`PlacementTest`:** in the question phase, `confirmExit`, with `onExit` → back to its intro phase.

In `ExerciseCard`:
- call `useExerciseShortcuts`:
  - `onPick`: for multiple choice, select that option;
  - `onEnter`: press Check when an answer is chosen, or Next after a result.
- play `useSound()` with `'correct'` or `'wrong'` when a graded result arrives. "almost" counts as correct for the sound.
- show the keys hint on wide screens: `<p className="hidden lg:block text-xs text-text-muted">{tFocus('keysHint')}</p>`.

When a lesson or practice batch completes, play `'complete'` and render `<Celebration show />` for 1.5 s.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/sound components messages/catalogs.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.
- Where existing page tests render a run, they now also find the ✕ button named "Leave".
- Tests that navigate back with a "back" link during a run now use "Leave". Update only those queries.
- `useSound` needs the preferences context: page tests that render `ExerciseCard` get a `PreferencesProvider` through `renderWithIntl`. Add it there once, in `test/renderWithIntl.tsx`, with `initial={{ theme: 'dark', soundEnabled: false }}` so tests stay silent.

- [ ] **Step 6: Commit**

```bash
git add -A lib/sound components messages test/renderWithIntl.tsx
git commit -m "feat: add focus mode with shortcuts and exit confirmation, sounds, and a completion celebration"
```

---

### Task 8: Restyle the student pages (visual task)

This is a visual-design task. **Invoke the `frontend-design` skill first**, and design within the tokens, components and layout that Tasks 1–7 established.

The behaviour, texts and roles of every component stay the same; the existing tests are the guard, and they must stay green without assertion changes other than role updates. What changes is markup structure, classes, and the shadcn components used.

**Files (modify):**
- `components/tutoring/CurriculumTree.tsx`, `LessonPage.tsx`, `ExerciseCard.tsx`, `LessonChat.tsx`, `QueuePage.tsx`, `PracticeRun.tsx`, `TestOutPage.tsx`
- `components/placement/*`, `components/onboarding/OnboardingWizard.tsx`, `components/home/*`
- `components/ActiveProviderBanner.tsx`, `components/LanguageToggle.tsx`
- `components/dashboard/*`, `components/profile/ProfilePage.tsx`, `components/settings/SettingsPage.tsx`

**Mapping rules (apply everywhere):**

| Before | After |
|---|---|
| `<button>` | `Button`: `default` variant for the primary action on a screen, `secondary` for the rest, `ghost` for icon-only, `destructive` for delete and reset |
| `<p role="alert">…</p>` | `<Alert variant="destructive" role="alert"><AlertDescription>…</AlertDescription></Alert>`, with the same text |
| Loading text | `Skeleton` blocks, keeping an accessible label with the same "Loading…" text (`aria-label`) |
| `<section>` groups on settings, profile, dashboard | `Card` with `CardHeader`/`CardTitle`/`CardContent` |
| `<select>` | `Select` (keep `aria-label`) |
| `<input type="checkbox">` | `Checkbox` or `Switch`, keeping the label |
| radio lists (multiple choice) | `RadioGroup`, with each option as a large tappable card |
| `<input>`, `<textarea>` | `Input`, `Textarea` |
| status words ("Complete", "Locked") | `Badge` |
| the lesson chat panel | `Sheet`: `side="bottom"` under 768 px, `side="right"` above. The toggle button keeps its label. |
| the language toggles | `ToggleGroup` with the same "EN"/"DE" item names and `aria-pressed` semantics |

**Page targets:**

1. **Tree (home):**
   - Each milestone is a `Card` band: title (Nunito), a `Badge` with "Step n", state, and a `Progress` of done / total.
   - Lessons are **round nodes** (56 px, 72 px on desktop) on the grid from `branch`, `column` and `row`: ✓ on `success` when done, a filled `primary` circle when open, a muted circle with a lock icon when locked. The title sits below the node.
   - An **SVG connector layer** behind the nodes draws each `edges` entry as a rounded path from the prerequisite's bottom centre to the dependent's top centre.
   - "Builds on" chips are small outline `Badge`s. The test-out entry is a `Button` with the `bg-highlight-gradient` style.
   - On phones, a milestone wider than the screen scrolls sideways inside its band; the page never scrolls sideways.
2. **Lesson page:**
   - the title and `LanguageToggle` in a header row;
   - the explanation as readable prose (max 65ch, line-height 1.6);
   - examples as a list of quote-styled cards;
   - "Start the exercises" as the primary `Button`, pinned in the thumb zone on phones;
   - prerequisites as links with `Badge` status.
3. **Exercise card** (inside `FocusLayout`):
   - the instruction in muted text above the task;
   - the task text large (1.25 rem);
   - options as full-width tappable rows (≥ 48 px high) with a number hint (1–4) on desktop;
   - Check / Next as a full-width primary `Button` at the bottom.
   - The result banner slides up (200 ms) from the bottom: `success` with a check icon for correct, `warning` for almost, `danger` with an x icon for wrong, plus the correct/model answer and the feedback with its toggle.
   - "Ask AI" is a secondary button.
4. **Queue, practice run, test-out and placement** use the same exercise card inside `FocusLayout`. Their result and summary screens are centred cards with the score in large Nunito and a primary button onward.
5. **Onboarding:**
   - a centred card wizard with the full `Logo` on top and step dots;
   - the provider form uses `Input` and `Select`;
   - no shell.
6. **Dashboard, Profile and Settings:**
   - `Card` grids: 1 column on phones, 2 on desktop.
   - The heatmap cells use the primary shades defined in `Heatmap.tsx`.
7. **ActiveProviderBanner and home notices:** `Alert` variants, `default` for information and `destructive` for problems.

**Acceptance criteria (check each at 375 px, 768 px and 1280 px, in dark and light):**
- Nothing scrolls sideways at page level. Tap targets are ≥ 44 px.
- Every interactive element shows the focus ring when reached by keyboard.
- Only token-backed colours are used: `grep -rnE "#[0-9a-fA-F]{3,6}" components app --include=*.tsx | grep -v "components/brand"` prints nothing.
- The tree reads clearly: locked, open and done are distinguishable without colour alone (icon plus colour).
- `npx tsc --noEmit && npm test && npm run build` pass.

- [ ] **Step 1: Invoke the `frontend-design` skill and restyle the pages in the order above, committing after each page**, e.g. `git commit -m "style: restyle the curriculum tree"`. Run `npx vitest run components` after each.
- [ ] **Step 2: Walk the acceptance criteria.** Take screenshots at the three widths in both themes with the browser's device toolbar, and list any criterion you had to trade off in your report.
- [ ] **Step 3: Final commit** (if the last page commit didn't already include everything): `git commit -am "style: restyle the student pages"`.

---

### Task 9: Restyle the admin pages (visual task)

**Invoke the `frontend-design` skill.** Admin pages use the same tokens and components in a denser layout. The text stays English.

**Files (modify):**
- `app/admin/**/page.tsx`, and a new `app/admin/layout.tsx`
- `components/admin/*`
- Phase 2's `components/admin/PracticePoolList.tsx`

**Targets:**
- **`app/admin/layout.tsx`** (new) renders an admin sub-navigation (Curriculum, Flashcard violations, Placement exam, Practice review), as a `Tabs`-style link row on desktop and a `Select` on phones. It renders nothing extra for `/admin/login`.
- **Tables** (curriculum browser lists, flashcard violations, the practice pool) use a simple styled `<table>` with sticky headers.
- **Structure editor:** milestone `Card`s with rank `Input`s, "Move to…" `Select`s, and delete as a `destructive` ghost button with an `AlertDialog`, replacing `window.confirm`.
  - Update `TrackLevelStructure.test.tsx`: instead of stubbing `window.confirm`, click the dialog's confirm button.
- **Lesson editor:** labelled fields in two columns on desktop (English | German), one column on phones. The exercise editor is a list of `Card`s.
- **Dependency diagram:** node and edge colours from the tokens (nodes `surface-raised` with `border`, edges `text-muted`).
- **Login:** a centred `Card` with the compact `Logo`.

**Acceptance criteria:** the same as Task 8. The existing admin tests stay green (the one `confirm` → dialog change above is the only assertion change).

- [ ] **Step 1: Restyle page by page, committing after each** (`style: restyle the admin <page>`).
- [ ] **Step 2: Walk the acceptance criteria and report.**

---

### Task 10: Accessibility checks and the final visual pass

**Files:**
- Create: `test/axe.ts`, `components/a11y.test.tsx`
- Modify: `package.json` (dev dependency `vitest-axe`), `vitest.setup.ts` (or the setup file the config names)

- [ ] **Step 1: Add automated checks**

Run: `npm install -D vitest-axe`

Create `test/axe.ts`:

```ts
import { configureAxe } from 'vitest-axe';

// Colour contrast is checked by lib/design/themeTokens.test.ts (jsdom has no layout or computed colours).
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
```

In the vitest setup file, add `import 'vitest-axe/extend-expect';`.

Create `components/a11y.test.tsx`. It renders the main screens with their usual stubbed data and asserts no axe violations:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { axe } from '@/test/axe';
import { screen } from '@testing-library/react';
import { DashboardPage } from './dashboard/DashboardPage';
import { CurriculumTree } from './tutoring/CurriculumTree';

describe('accessibility', () => {
  it('the dashboard has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        delayedResponse({
          continueLesson: { id: 'a1-sein', title: 'The verb sein' },
          reviewsDue: 2,
          skills: [{ skill: 'grammar', done: 1, total: 2 }],
          activity: Array.from({ length: 84 }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, count: i % 3 })),
        })
      )
    );
    const { container } = renderWithIntl(<DashboardPage />);
    await screen.findByText('Dashboard');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the tree has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        delayedResponse({
          track: 'generic',
          level: 'A1',
          milestones: [
            {
              id: 'm1',
              title: 'Basics',
              description: null,
              rank: 1,
              state: 'open',
              edges: [],
              testOut: { status: 'none' },
              lessons: [
                {
                  id: 'a1-greet',
                  title: 'Saying hello',
                  skill: 'vocabulary',
                  status: 'not_started',
                  coveredVia: null,
                  locked: false,
                  earlierPrerequisites: [],
                  branch: 0,
                  column: 0,
                  row: 0,
                },
              ],
            },
          ],
        })
      )
    );
    const { container } = renderWithIntl(<CurriculumTree reloadKey={0} />);
    await screen.findByText('Basics');
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

Add one more case in the same style for each of: `LessonPage` (open lesson), `ExerciseCard` (a multiple-choice question), `SettingsPage`, `ProfilePage`, and `TestOutPage` (intro). Reuse the stubs from each component's own test file.

- [ ] **Step 2: Run and fix**

Run: `npx vitest run components/a11y.test.tsx`
Fix each violation at its source (a missing label, the wrong heading order, a nested interactive element), not in the test. Expected: PASS.

- [ ] **Step 3: Final pass**

Run: `npx tsc --noEmit && npm test && npm run build`. Then, with `npm run dev`, walk the whole app once at 375 px, 768 px and 1280 px in Dark, Light and System (flip the OS setting):
- onboarding → home tree → a lesson → its exercises (focus mode, the shortcuts, the exit confirmation, sound on and off) → the queue → the dashboard → profile → settings (theme switch, no flash on reload) → the admin pages → install the app (browser menu → Install) and open it standalone.

Report anything that didn't meet the spec.

- [ ] **Step 4: Commit**

```bash
git add -A test/axe.ts components/a11y.test.tsx package.json package-lock.json vitest.setup.ts
git commit -m "test: add accessibility checks for the main screens"
```

---

## Self-review notes (planner)

- **Spec coverage:**
  - Foundation: Task 1.
  - Brand and PWA: Task 3.
  - Tokens and contrast: Task 1.
  - Data: Task 2.
  - Shell and navigation: Task 4.
  - Dashboard: Task 5.
  - Profile and Settings: Task 6.
  - Focus mode, shortcuts, motion and sound: Task 7.
  - Page restyle: Tasks 8–9.
  - Quality and accessibility: Tasks 1, 10, 8 and 9.
- **Visual work:** Tasks 8–9 are judgment tasks by design. They carry a mapping table, per-page targets and checkable acceptance criteria instead of full markup, which the `frontend-design` skill produces during execution.
