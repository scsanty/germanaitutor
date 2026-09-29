# App-wide Design Pass — Design Spec

## Overview

The app has no styling at all today: no CSS, no class names, plain HTML. This sub-project gives every page, student and admin, one visual system under the **NaDoch!** brand. It also adds a navigation shell, a Dashboard and a Profile page, focus mode for exercises, feedback sounds and motion, a light/dark/system theme, and makes the app installable (PWA).

It follows the Curriculum Restructure and Bilingual Content in the build order, so it styles the milestone tree with branches, the test-out page and the language toggles those sub-projects add. The implementation uses the `frontend-design` skill for the visual work.

### In scope

- **Foundation:**
  - React 19 upgrade;
  - Tailwind CSS v4 and shadcn/ui (Radix), with components owned in `components/ui`;
  - an editable theme tokens file;
  - fonts: Nunito for headings, Inter for body text, self-hosted through `next/font`;
  - icons from Lucide.
- **Brand:**
  - the NaDoch! logo (`docs/design/nadoch-logo.svg`, supplied by the user);
  - a header wordmark;
  - a favicon and app icons built from the "D" and "!" on the gradient speech bubble;
  - the Generic track renamed to "NaDoch!" in display text only.
- **Shell:**
  - the phone thumb-zone layout and a desktop left sidebar;
  - floating action buttons;
  - items for unbuilt features stay hidden;
  - Content Admin reached through Settings for admins.
- **New pages:** Dashboard (`/dashboard`) and Profile (`/profile`). Settings is trimmed to app settings.
- **Focus mode** for exercise runs: lesson exercises, Daily Queue, practice run, test-out, placement test. It includes keyboard shortcuts.
- **Feedback:** subtle motion (respecting reduced motion) and sounds generated in the browser, on by default and mutable in Settings.
- **Theme:** Dark / Light / System, default Dark, stored on the profile, applied with no flash.
- **PWA:** installable, online-only.
- **Restyle every page:** onboarding, tree (home), lesson, queue, placement, test-out, practice run, chat, dashboard, profile, settings, and every admin page.
- **Quality:**
  - WCAG AA contrast in both themes;
  - full keyboard navigation with visible focus;
  - all new interface text in en and de;
  - every existing test still passes, with new tests for shell, theme, dashboard and sounds.

### Out of scope

- Features of later sub-projects. Their nav items appear only when they ship:
  - Freestyle 🏂, the Flashcards deck 🗂️, the Exam node 📝, readiness and error-log cards.
- Gamification: streaks, XP and badges.
- Offline use: the PWA is online-only.

## Brand

- **Logo** (`docs/design/nadoch-logo.svg`): a speech bubble in a sky → cyan → teal gradient (`#0284c7` → `#06b6d4` → `#0d9488`) with an orange rim, the words "Na" and "Doch" in white Nunito 900, an orange "!" (`#fb923c` → `#ea580c`), and the tagline „Von „Na?“ über „Ach so!“ zu „Doch!““.
- **Wordmark** (header and sidebar): an inline SVG React component, `components/brand/Logo.tsx`, based on the logo. Its text uses the self-hosted Nunito, so there's no Google Fonts request at runtime. A compact variant omits the tagline.
- **App icon:** a white "D" and an orange "!" on the gradient squircle bubble. `scripts/build-icons.ts` converts the text to paths with `opentype.js` and the Nunito 900 font file from `@fontsource/nunito`, and renders the PNG sizes with `sharp`. Both are dev dependencies. It writes:
  - `app/icon.svg` (favicon);
  - `app/apple-icon.png` (180);
  - `public/icons/icon-192.png`, `icon-512.png` and `icon-maskable-512.png`.
- **Generic → "NaDoch!":** the `tracks.generic` catalog entry becomes "NaDoch!" in en and de. Admin labels do the same. The internal id stays `generic`.

## Theme Tokens

`app/theme.css` is the single editable file. It defines CSS custom properties for both palettes, and Tailwind v4's `@theme inline` maps utilities onto them.

| Token | Dark (default) | Light |
|---|---|---|
| `--background` | `#121212` | `#ffffff` |
| `--surface` | `#1a1a1a` | `#f8fafc` |
| `--surface-raised` | `#242424` | `#ffffff` |
| `--border` | `#2e2e2e` | `#e2e8f0` |
| `--text` | `#f5f5f5` | `#0f172a` |
| `--text-muted` | `#a3a3a3` | `#475569` |
| `--primary` (teal/cyan) | `#22d3ee` | `#0e7490` |
| `--primary-foreground` | `#042f2e` | `#ffffff` |
| `--brand-gradient` | `linear-gradient(135deg, #0284c7, #06b6d4 48%, #0d9488)` | same |
| `--accent` (orange highlight) | `#fb923c` | `#c2410c` |
| `--success` | `#4ade80` | `#15803d` |
| `--danger` | `#f87171` | `#b91c1c` |
| `--warning` | `#facc15` | `#a16207` |
| `--focus-ring` | `#22d3ee` | `#0e7490` |
| `--radius` | `14px` | `14px` |

- **Roles:** teal/cyan is the primary colour: buttons, links, progress, the current lesson node, and focus. Orange is a sparing highlight for celebrations, the "!" moments and the next test-out. Correct and wrong use `--success` and `--danger`, never the brand colours.
- **Contrast:** every text and background pair used meets WCAG AA (4.5:1 for body text, 3:1 for large text and UI parts). The light values are darker shades picked to reach AA on white. A test checks the listed pairs with a contrast function.
- **Theme selection:**
  - `<html data-theme="dark|light|system">` is set on the server from the profile, so nothing flashes.
  - `system` uses a `@media (prefers-color-scheme: light)` block.
  - The Settings choice saves to the profile.

## Data

```sql
ALTER TABLE profile ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system'));
ALTER TABLE profile ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profile DROP COLUMN freestyle_default;   -- the Freestyle decision: the setting is removed
```

`Profile` gains `theme` and `soundEnabled`, and loses `freestyleDefault`. The profile API accepts `theme` and `soundEnabled`.

## Shell and Navigation

**Phone** (< 768 px), following Steven Hoober's thumb zone:

```
╭──────────────────────────────────╮
│ NaDoch! (→ home)             ⚙️  │  stretch zone: rare actions
├──────────────────────────────────┤
│                                  │
│   page content                   │
│   (home = the learning tree)     │
│                        🏂 🗂️ 🔁  │  floating buttons (built ones only)
├──────────────────────────────────┤
│   🎛️ Dashboard        👤 Profile │  bottom bar: natural thumb zone
╰──────────────────────────────────╯
```

- The logo links home, which is the tree.
- ⚙️ opens Settings.
- The floating buttons stack at the bottom-right above the bar. Today only 🔁 Review exists, with a due-count badge; Flashcards and Freestyle add theirs when built.
- The bottom bar holds Dashboard and Profile.

**Desktop** (≥ 1024 px): a left sidebar. The logo sits at the top and links home. The items are Learn (the tree), Dashboard, Review (with badge), then Flashcards and Freestyle when built. Profile and Settings are pinned at the bottom. There are no floating buttons.

**Tablet** (768–1023 px): the sidebar collapses to icons, with tooltips.

**Nav registry:** `lib/nav/navItems.ts` lists every item with its route, icon, label key, placement (`sidebar`, `fab`, `bottom`, `top`) and an `enabled` flag. Later sub-projects flip their flag, so there's one place to add a module.

**Admin:**
- Settings shows a "Content Admin" link only when an admin session exists.
- `/admin` asks for a login when there's no admin cookie, as today.
- Admin pages use the same shell, with an admin sub-navigation: Curriculum, Flashcard violations, Placement exam, Practice review. Admin text stays English.

**Focus mode:**
- **Hidden shell:** the lesson exercise run, a Daily Queue session, the practice run, a test-out and the placement test hide the shell.
- **Top:** ✕ (exit) and a progress bar.
- **Bottom** (thumb zone): Check / Next, and the right/wrong banner, which slides up.
- **Confirmation:** exiting mid-run asks first, "Leave this exercise? Your progress on answered exercises is kept."
- **Keyboard:** `1`–`4` pick a multiple-choice option, `Enter` checks and then continues, `Esc` exits (with the confirmation). A small hint lists the keys on wide screens.

## Pages

- **Home `/`:** the learning tree (restructure and bilingual data). Each milestone is a card band showing rank, state and progress. Lessons are round nodes on the branch grid, joined by SVG connectors that follow `edges`. Nodes show ✓ done, a filled teal circle when open, and 🔒 when locked. Chips show "builds on" links, and the test-out button uses the orange highlight. A "Dashboard" button sits at the top.
- **Dashboard `/dashboard`** (new):
  - **Continue:** the most recently attempted lesson that isn't complete, or else the suggested next lesson.
  - **Today's reviews:** the due count and a Start button.
  - **Level progress by skill:** done / total for each of the six skills in the active track+level.
  - **Activity:** a 12-week calendar heatmap in teal shades. Each cell counts lesson answers plus review answers that day, and a tooltip gives the date and numbers.
  - Data comes from `GET /api/tutoring/dashboard` → `{ continueLesson: { id, title } | null, reviewsDue: number, skills: { skill, done, total }[], activity: { date, count }[] }` (84 days, oldest first, in local dates).
- **Profile `/profile`** (new): display name, track and level (levels limited to unlocked ones), the placement test with its best result and a "take it again" link, and UI language. These move here from Settings.
- **Settings `/settings`:** AI providers, theme (Dark / Light / System), sounds on/off, daily review limit, backup/import/reset, and Content Admin (admin only).
- **Lesson `/lesson/[id]`:** the explanation view sits inside the shell, and the exercise run is in focus mode. The chat panel is a Sheet: bottom on phones, right side on desktop.
- **Queue, practice run, test-out, placement:** focus mode, with the same card and banner components.
- **Onboarding:** full-screen wizard steps in the new style (no shell).
- **Admin pages:** the same components in a denser layout: tables, forms, the structure editor, diagrams.

## Motion and Sound

- **Motion:** transitions of 150–250 ms for the banner, cards and page changes. The lesson-complete celebration is a short burst of orange and teal CSS particles. `@media (prefers-reduced-motion: reduce)` turns motion off, with instant state changes.
- **Sound:** `lib/sound/sounds.ts` generates short tones with WebAudio. There are no audio files.
  - **correct:** a rising two-note chime;
  - **wrong:** a soft low tone;
  - **complete:** a three-note arpeggio.

  A `useSound()` hook reads `soundEnabled` from the profile context. It's on by default, and Settings has the switch. Nothing plays before the first user interaction, which browsers require anyway.

## PWA

`app/manifest.ts`:
- name "NaDoch!", short name "NaDoch!";
- `start_url: '/'`, `display: 'standalone'`;
- `background_color: '#121212'` and a `theme_color` taken from the tokens;
- the 192, 512 and maskable icons.

There's no service worker and no offline mode. `<meta name="theme-color">` follows the active theme.

## Components (`components/ui`, shadcn-generated, owned)

Button (primary, secondary, ghost, danger), Card, Badge, Progress, Tabs, Dialog, AlertDialog (exit confirmation), Sheet, DropdownMenu, Tooltip, ToggleGroup (language toggles), Input, Textarea, Select, RadioGroup, Checkbox, Switch, Separator, Alert (the `role="alert"` messages), Skeleton (loading), Sonner (toasts).

App components built on them:
- `AppShell`, `Sidebar`, `TopBar`, `BottomBar`, `Fabs`;
- `FocusLayout`;
- `ExerciseCard` (restyled, same behaviour);
- `ResultBanner`, `TreeNode`, `MilestoneBand`, `Heatmap`, `SkillProgress`, `Logo`.

Behaviour, props and text don't change, except where this spec adds focus mode, the shortcuts and the confirmation.

## Error Handling

- **Load errors:** existing `role="alert"` messages become the Alert component, with the same text, and loading text becomes Skeletons. Every "Loading…" string stays available to screen readers.
- **Theme or sound save fails:** a toast with the error, and the previous value is restored.

## Testing

- **Unit:**
  - the contrast checker over the token pairs;
  - the nav registry (only enabled items render per placement);
  - `useSound` (muted when disabled; the tones use the AudioContext mock);
  - the dashboard service (continue-lesson choice, due count, skill progress, the 84-day activity series with gaps as zero);
  - the profile migration (theme and sound columns, `freestyle_default` removed).
- **Components:**
  - **AppShell:** phone versus desktop markup, driven by a `matchMedia` mock; hidden items; admin link only with a session.
  - **FocusLayout:** exit confirmation; `1`–`4`, `Enter` and `Esc` shortcuts.
  - **Dashboard** cards and **Heatmap** tooltips.
  - **Theme switch** writes the profile.
- **Existing tests:** they keep passing. Queries rely on roles and labels, not classes, so restyling doesn't break them. Where markup changes a role (e.g. the chat panel becomes a dialog), the test is updated to the new role.
- **Build:** `next build` passes, and a manual pass checks each page at 375 px, 768 px and 1280 px in both themes.

## Decisions (2026-09-29)

- **Brand:** NaDoch!, using the user's logo. The palette is teal/cyan primary and orange highlight on a neutral charcoal `#121212`. Nunito for headings, Inter for body text, Lucide icons.
- **Stack:** shadcn/ui on Radix and Tailwind v4, with React 19 as the first task. Implemented with the frontend-design skill.
- **Layout:** mobile-first thumb zone.
  - Phone: logo top-left, Settings top-right; floating Freestyle, Flashcards and Review; Dashboard and Profile in the bottom bar.
  - Desktop: a left sidebar.
  - Items for unbuilt features stay hidden.
- **Admin:** Content Admin is inside Settings, for admins only.
- **Home:** the tree stays home, and the Dashboard is a button and nav item.
- **Dashboard contents:** continue, today's reviews, progress by skill, and a 12-week heatmap.
- **Profile versus Settings:** Profile covers "me and learning"; Settings covers the app.
- **Exercises:** focus mode with shortcuts, subtle motion, and generated sounds that are on by default and mutable.
- **Theme:** Dark / Light / System, default Dark.
- **Scope:** all pages at once, admin included, and an installable online-only PWA.
