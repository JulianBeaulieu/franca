# Franca Phase 3 — Stats, Leaderboard, Lesson UX & Theming

**Date:** 2026-07-14 · **Status:** Approved by Julian (interactive session)

Six user-requested features, built on one shared foundation (per-learner settings) and one
cross-cutting change (dark mode), then three independent feature tracks.

## User decisions (locked)

- Leaderboard: **both** a weekly XP leaderboard (main tab) and an all-time comparison tab.
- Sounds: **synthesized Web Audio chimes** — but Julian auditions them via a preview page
  before they are considered final; keep all synthesis parameters in one module.
- Auto-continue default: **3 seconds**, user-adjustable, opt-outable.
- Everything ships together; subagents execute; Opus/Sonnet chosen per task complexity.

## Defaults

| Setting | Key | Default |
| --- | --- | --- |
| Theme | `theme` | `system` (`light` \| `dark` \| `system`) |
| Auto-continue | `autoContinue` | `true` |
| Auto-continue seconds | `autoContinueSeconds` | `3` (range 1–10, integer) |
| Haptics | `haptics` | `true` |
| Sounds | `sounds` | `true` |
| Leaderboard visibility | `leaderboardOptIn` | `false` (strictly opt-in) |

## 1. Settings foundation (everything depends on this)

- **Migration `002_settings.sql`:** `ALTER TABLE learner ADD COLUMN IF NOT EXISTS settings
  jsonb NOT NULL DEFAULT '{}'::jsonb;` Unset keys fall back to code defaults in
  `src/lib/settings.ts` (pure, unit-tested: schema, defaults, validation/clamping, merge).
- **API `/api/settings`:** GET returns merged settings; PATCH accepts a partial object,
  validates/clamps (unknown keys rejected, seconds clamped 1–10), persists, returns merged
  result. Auth required like every other route.
- **Client `SettingsProvider`** (React context): server layout reads learner settings and
  passes as initial value; `useSettings()` exposes values + `update(partial)` with optimistic
  update and PATCH persist. Settings therefore roam across devices.
- **Theme cookie `franca-theme`** (`light`/`dark`/`system`) mirrored on every settings change
  so SSR can render the correct theme class with no flash (see §2).
- **`/settings` page:** Duolingo-style cards with toggle switches — theme selector
  (Light/Dark/System segmented control), auto-continue toggle + seconds slider (disabled when
  off), haptics toggle, sounds toggle, leaderboard opt-in toggle with a short privacy note
  ("your name, picture, XP and streak become visible to other learners on this server").
- **Navigation:** this task also adds all new nav destinations (Settings, Stats, Leaderboard)
  to `UserMenu`/`TopBar` in one pass so later parallel agents never touch shared chrome.
  Stats/Leaderboard links may 404 until their tracks land; acceptable inside one release.

## 2. Dark mode (cross-cutting; runs alone before parallel tracks)

- Tailwind `darkMode: 'class'`; `<html>` gets `class="dark"` from an inline no-FOUC script:
  cookie value, else `prefers-color-scheme` when `system`. Server layout also renders the
  class from the cookie so hydration matches.
- Duolingo dark palette as CSS variables consumed by Tailwind semantic tokens
  (`bg-surface`, `bg-card`, `border-line`, `text-body`, `text-muted`…):
  background `#131F24`, raised card `#202F36`, border `#37464F`, primary text `#F1F7FB`,
  muted text `#DCE6EC`/`#52656D`, accents stay brand (green `#58CC02`, blue `#1CB0F6`,
  red `#FF4B4B`) with dark-tuned pressed/soft variants (e.g. green-soft `#203C28`-style tints
  instead of `#D7FFB8`).
- Sweep every page/component (including inline-hex spots like `FeedbackBanner`, exercise
  views, `ResultsScreen`, path, profile, settings) to semantic tokens; keep light mode
  pixel-identical. `theme-color` meta + manifest updated for dark.

## 3. Stats page — `/stats`

- **API `/api/stats`:** one JSON payload:
  - Global: current/longest streak, total XP, days active, lessons completed, achievements.
  - Per course (each enrolled course): XP total, words seen / words mastered
    (`srs_state` joined to course items; mastered = `interval >= 21` or `state='review'` with
    high reps — pick one rule, document it), lessons completed, average accuracy and perfect
    count (`lesson_session` by `course_id`), best combo.
  - Time series: last 30 days of `daily_activity` (XP/day) for a bar chart.
- **UI:** overview stat cards on top, XP bar chart (7d/30d toggle, inline SVG — no chart
  library), then one breakdown card per course with flag emoji and its metrics.
- Mobile-first like the rest of the app; uses semantic tokens so dark mode works.

## 4. Leaderboard — `/leaderboard`

- **API `/api/leaderboard`:** only learners with `leaderboardOptIn=true` are ever included in
  responses (enforced server-side, not client-side). Returns display name, picture, current
  streak, total XP, and XP earned this ISO week (Mon–Sun, from `daily_activity`).
- **UI:** two tabs — **This week** (ranked by weekly XP, rank medals for top 3) and
  **All time** (table comparing total XP, streak, longest streak). Current user's row
  highlighted. A caller who has not opted in sees a full-page prompt explaining the feature
  with a link to Settings instead of data (they can't view without sharing).

## 5. Auto-continue timer (lesson flow)

- In `FeedbackBanner`: when `autoContinue` is on, the Continue button renders a fill-from-
  left progress overlay animating over `autoContinueSeconds`, then fires `onContinue`.
  Clicking continues immediately and cancels the timer.
- Implementation: `requestAnimationFrame` loop (not CSS animation) so it can pause when
  `document.hidden` and cancel cleanly on unmount/answer change. Timer restarts per exercise.
- When the setting is off, banner behaves exactly as today.

## 6. Haptics & sounds (lesson feel)

- **Haptics:** integrate the library from https://haptics.lochie.me (agent must fetch the
  site/repo to determine the real package name or vendor the code with license/attribution —
  it is a tiny web-haptics shim over `navigator.vibrate` + the iOS `input[switch]` trick).
  Trigger: light tap on correct, error pattern on incorrect, success pattern on lesson
  complete. Gated by `settings.haptics`; must be a no-op where unsupported.
- **Sounds:** `src/lib/sfx.ts` — Web Audio synthesis, all frequencies/envelopes as named
  constants in one place: `correct` (short rising major chime), `incorrect` (soft low
  two-tone buzz), `complete` (short fanfare arpeggio). AudioContext created lazily on first
  user gesture. Gated by `settings.sounds`.
- **Preview gate:** produce a standalone preview page (artifact) with buttons to audition
  each chime — Julian approves or tweaks before release; parameters live in `sfx.ts` only.
- Both hook into the same feedback events in the lesson client, so this track owns all
  lesson-client edits together with §5 (single agent — avoids merge conflicts).

## 7. Path auto-scroll (user-reported papercut)

- Opening the app (`/` learning path) currently leaves you at the top / stale scroll
  position. It must auto-scroll so the **next uncompleted lesson node** (the "active" node)
  is centered in the viewport on load — like Duolingo.
- Instant positioning on initial load (no janky animated scroll from the top); smooth
  behavior acceptable when returning from a lesson. Respect `prefers-reduced-motion`.
- No effect when the active node is already near the viewport top naturally (short paths).

## Release policy (user decision)

- Task commits live on `feature/phase3-ux` for review granularity, but the branch lands on
  `main` as **one squashed commit**.
- "Tested" means: unit gates (`test`, `typecheck`, `lint`, `build`) + live end-to-end pass
  against the running dev stack (drive the real app: settings persist, dark mode, stats,
  leaderboard opt-in/out, lesson timer/haptics/sounds gating, path auto-scroll) before the
  squash-merge. Sounds additionally gated on Julian's audition of the preview page.

## Execution plan (subagent waves)

| Wave | Task | Files (main) | Model |
| --- | --- | --- | --- |
| 1 | Settings foundation + nav | migration, `settings.ts`, API, provider, `/settings`, TopBar/UserMenu | Sonnet |
| 2 | Dark mode sweep | tailwind config, globals.css, all components | Opus |
| 3a | Stats page | `/api/stats`, `/stats` | Sonnet |
| 3b | Leaderboard | `/api/leaderboard`, `/leaderboard` | Sonnet |
| 3c | Lesson UX: auto-continue + haptics + sounds | FeedbackBanner, LessonClient/useLessonSession, `sfx.ts`, haptics lib | Opus |
| 4 | Verify: typecheck, lint, tests, build, smoke; sounds preview to Julian | — | — |

Waves are sequential; 3a/3b/3c run in parallel (disjoint files by construction).

## Error handling & testing

- All new API routes: 401 unauthenticated (match existing pattern), zod-free manual
  validation consistent with codebase style, parameterized SQL only.
- Pure logic (`settings.ts` merge/clamp, week-window computation, mastered-word rule,
  timer state machine if extracted) gets Vitest unit tests, matching the repo's
  "pure functions in `src/lib`, fully tested" convention.
- Quality gates must pass: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
