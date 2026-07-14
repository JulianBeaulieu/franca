# Franca as an installable PWA — research notes (2026)

Context: Next.js 15 App Router, Tailwind, self-hosted via Docker on LAN. Primary use:
installed PWA on household iOS + Android phones; secondary use: desktop browser. OIDC
login (redirect flow) is planned. Offline lesson caching is a nice-to-have, not a
requirement now.

---

## 1. Web app manifest (`app/manifest.ts`)

Next.js 15 has a first-class file convention: `app/manifest.ts` (or `.js`/`.json`).
Next automatically emits `<link rel="manifest">` in `<head>` — no manual wiring needed.
Docs: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps),
[manifest.json file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest).

```ts
// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Franca',
    short_name: 'Franca',
    description: 'Self-hosted language learning for the household',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0f172a', // matches splash / cold-start background
    theme_color: '#0f172a',      // matches browser chrome / status bar
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

### Installability checklist (Chrome/Android minimum bar)
- `name` **and** `short_name` present.
- At least one icon ≥ 192×192 **and** one ≥ 512×512, `image/png` (or maskable SVG).
- `start_url` resolvable, ideally with no query-string session leakage.
- `display: 'standalone'` (or `'fullscreen'`/`'minimal-ui'`) — required, `'browser'` blocks the install prompt.
- Served over HTTPS (or `localhost`) — **note:** LAN self-hosting over plain `http://192.168.x.x` will NOT satisfy this; see §2 caveat below on TLS.
- `theme_color` should also be set in `viewport`/metadata export (see below) — Chrome reads both; keep them identical.

### Maskable icons — do this right
- Provide **separate files** for `purpose: 'any'` and `purpose: 'maskable'`. Do not combine as `"any maskable"` in one entry — web.dev/Chrome DevTools explicitly warn against it, because a maskable icon has ~20% padding baked in and reusing it as `any` makes your logo look shrunken everywhere else.
- Maskable icons need an **80% safe zone**: keep all meaningful content inside a circle of radius 40% of the icon's width, centered; fill the outer 20% with a solid brand color (not transparent — the OS may composite it as white or black).
- Generate both variants once from a single 512×512 source (e.g. via `pwa-asset-generator` or a maskable-icon editor like maskable.app) and commit them under `public/icons/`.

### iOS extras that still matter in 2025/2026
iOS ignores several manifest fields Android relies on, so you still need classic `<meta>`/`<link>` tags via the App Router metadata APIs:

```ts
// app/layout.tsx
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Franca',
  appleWebApp: {
    capable: true,
    title: 'Franca',
    statusBarStyle: 'black-translucent', // or 'default' | 'black'
  },
  icons: {
    icon: '/icons/icon-512.png',
    apple: '/icons/apple-icon-180.png', // Next names the file-convention version "apple-icon.png"
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,       // pairs with input font-size fix in §3 to avoid iOS zoom-on-focus
  userScalable: false,   // consider leaving `true` for a11y; test with real users first
  viewportFit: 'cover',  // required for safe-area-inset-* to have non-zero values
  themeColor: '#0f172a',
}
```

`appleWebApp.capable: true` emits the legacy `apple-mobile-web-app-capable` meta tag, which is still what makes Safari treat "Add to Home Screen" as a standalone launch (no browser chrome) rather than a bookmark. `apple-mobile-web-app-status-bar-style` controls whether content draws under the status bar (`black-translucent`) or the status bar reserves its own bar (`default`/`black`).

`viewport` is a **separate export** from `metadata` in Next.js 15 (the old `metadata.viewport` field is deprecated/removed) — putting viewport keys inside `metadata` silently does nothing.

**Apple touch icon note:** Next's file convention wants `app/apple-icon.png` (not `apple-touch-icon.png`); Next auto-generates the `<link rel="apple-touch-icon">` tag from it. 180×180 px is the current largest size Apple actually requests (iPhone Pro Max @3x); ship one 180×180 PNG, no transparency (iOS renders transparent pixels as black).

---

## 2. Service worker: recommendation for Franca

**Recommendation: skip Serwist/next-pwa entirely for now; ship a ~15-line hand-rolled service worker that does nothing but enable install-ability, and revisit Serwist later if/when offline lesson caching becomes an actual feature.**

Reasoning:
- Chrome's installability heuristic no longer strictly requires a service worker with a fetch handler (Chrome 89+ relaxed this — a manifest + HTTPS is enough for the install prompt on Android/desktop). But shipping a trivial SW is still cheap insurance across engines and unlocks push notifications later.
- Franca is a **dynamic, session-aware, LAN-hosted app**. A caching service worker (Serwist's `defaultCache` / Workbox `NetworkFirst`/`StaleWhileRevalidate` runtime caching) is exactly the kind of thing that cache-poisons API responses, serves stale auth state, or replays a logged-out shell after OIDC login — all failure modes worse than not having a SW. Precaching + `skipWaiting`/`clientsClaim` (Serwist defaults) are tuned for marketing sites/blogs, not an app with a session cookie and per-user API data.
- Serwist (`@serwist/next`) is the actively maintained successor to `next-pwa` (which is unmaintained and breaks on Next 14+ builds). If offline support is added later, Serwist is the correct choice — but its own docs flag it "currently requires webpack configuration," which is friction against Next 15's Turbopack-first direction.

### Minimal SW that just satisfies installability (recommended now)

```js
// public/sw.js
// Intentionally does not cache anything. Its only job is to exist and
// register, so Chrome/Edge/Samsung Internet treat the app as installable
// and (later) so we have a hook for Web Push. Do NOT add fetch-event
// caching here without deliberately scoping it away from API routes/auth.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// No 'fetch' listener — all requests pass straight through to the network.
```

Registration (client component, mounted once near the root):

```tsx
// src/app/register-sw.tsx
'use client'
import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }
  }, [])
  return null
}
```

Mount it once in the root layout: `<RegisterServiceWorker />` inside `<body>`.

Add response headers so the SW file itself is never stale-cached by proxies/browsers (important since Franca is behind a LAN reverse proxy):

```js
// next.config.mjs
async headers() {
  return [
    {
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ]
}
```

### If/when offline lesson caching is wanted later (Serwist path)

```bash
npm i @serwist/next && npm i -D serwist
```

```ts
// next.config.mjs
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development', // avoid dev cache confusion
})

export default withSerwist({ /* next config */ })
```

```ts
// src/app/sw.ts
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // CRITICAL for Franca: force API + auth routes to bypass the cache entirely.
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    { matcher: ({ url }) => url.pathname.startsWith('/auth/'), handler: new NetworkOnly() },
    ...defaultCache, // static assets / navigations only
  ],
  fallbacks: { entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }] },
})
serwist.addEventListeners()
```

`tsconfig.json` needs `"types": ["@serwist/next/typings"]` and `"lib": [..., "webworker"]`, and `public/sw.js` should be gitignored (generated) plus excluded from the TS project.

Whichever path: **never** cache `Set-Cookie`-bearing responses or the OIDC callback route — that's the "cache-poisoning" failure mode explicitly called out for dynamic/session apps.

### LAN + HTTPS caveat
Service workers (and thus the install prompt in Chrome) require a "secure context": HTTPS or `localhost`. Plain `http://192.168.1.x` on the LAN will not register a SW and Chrome/Edge/Firefox will not offer install. Practical options: run Caddy/Traefik with a locally-trusted CA (mkcert) or an internal DNS name + Let's Encrypt via DNS challenge, or Tailscale's built-in HTTPS certs if the household already uses Tailscale. This is a prerequisite for everything in this doc, not optional polish.

---

## 3. Mobile-first layout audit checklist (Tailwind)

| Item | What to check / do |
|---|---|
| **Viewport meta** | App Router does **not** inject a sane default automatically for App Router pages — you must export `viewport` from `layout.tsx` (see §1). Confirm no leftover `<meta name="viewport">` in a stray `_document`/head component; duplicates cause Next to warn and can conflict. |
| **`viewport-fit=cover`** | Required for `env(safe-area-inset-*)` to resolve to non-zero values on notch/Dynamic-Island/home-indicator devices. Set via the `viewport.viewportFit` export, not raw meta. |
| **Safe-area insets** | Add Tailwind utilities for the four insets and apply to fixed/sticky bars: `padding-bottom: max(1rem, env(safe-area-inset-bottom))` on bottom action bars, `padding-top: env(safe-area-inset-top)` on any custom top bar drawn under the status bar. In Tailwind config, extend `spacing` with `'safe-b': 'env(safe-area-inset-bottom)'` etc., or use arbitrary values `pb-[env(safe-area-inset-bottom)]`. |
| **Touch target size** | Minimum 44×44pt (Apple HIG) / 48×48dp (Material) for interactive elements — lesson answer chips, check/continue buttons, close icons. Audit `h-`/`w-`/`p-` on buttons; add `min-h-11 min-w-11` (44px at default rem) as a Tailwind baseline for tappables. |
| **Double-tap zoom on buttons** | Apply `touch-action: manipulation` (Tailwind: `touch-manipulation` utility, built into Tailwind core) globally on interactive game elements (answer buttons, check/continue). This removes the double-tap-to-zoom gesture and the legacy 300ms tap delay, without disabling pinch-zoom/pan elsewhere. Don't set `touch-action: none` app-wide — that also blocks scrolling. |
| **100vh vs 100dvh** | `100vh` is computed against the *largest* possible viewport (address bar retracted), so content gets clipped under the collapsed toolbar on load. `100dvh` (dynamic viewport height) tracks the real visible viewport and is the 2025+ recommendation for full-bleed screens — **except**: in installed PWA/standalone mode on iOS, `100dvh` has been reported to report a stale/incorrect value on cold start until an orientation change occurs. Practical rule for Franca: use `100dvh` for standard in-browser layout, but for the installed-standalone lesson screen prefer a JS-measured `--vh` custom property (`window.innerHeight` via `visualViewport` + `resize` listener) or `100svh` (small viewport height, stable on load) as a safer floor, with `100dvh` as a progressive enhancement (`@supports (height: 100dvh)`). |
| **Fixed bottom action bar vs keyboard** | Fixed/`position: sticky` bars can get shoved around or hidden by the iOS keyboard's accessory view. Use the `VisualViewport` API (`window.visualViewport.height`) to reposition the bar above the keyboard rather than relying on `position: fixed; bottom: 0` alone, especially for any text-input lesson types (typing exercises). For non-input screens (multiple choice), fixed bottom bar + safe-area padding is sufficient since the keyboard never opens. |
| **Input font-size ≥ 16px** | iOS Safari auto-zooms the page when focusing an `<input>`/`<textarea>`/`<select>` with computed `font-size < 16px`. Ensure Tailwind's `text-base` (16px) or larger is applied to every form input, including the lesson "type the answer" field — a common regression is a `text-sm` input inherited from a compact design. |
| **Horizontal overflow** | Avoid `w-screen`/`100vw` combined with a vertical scrollbar (desktop) or notch insets (mobile) — both cause horizontal scroll/clipping. Prefer `w-full` inside a constrained container. |
| **Overscroll / pull-to-refresh** | Set `overscroll-behavior-y: contain` on the scrollable lesson container so rubber-banding doesn't trigger the OS pull-to-refresh gesture (Android Chrome) inside game screens — not applicable to iOS standalone, which has no pull-to-refresh in standalone mode at all (see §4). |

---

## 4. iOS PWA specifics

### Standalone-mode quirks
- **No pull-to-refresh chrome control**: standalone mode has no browser UI at all, so there's no native pull-to-refresh gesture to worry about suppressing (unlike Android Chrome tabs). If Franca wants a refresh gesture, it must be built manually.
- **Cookie/session persistence**: standalone PWAs on iOS get their **own** WKWebView-backed storage partition, which is generally persistent and separate from Safari's. This mostly works fine for session cookies, but historically iOS has been aggressive about clearing site data after ~7 days of no user interaction (ITP - Intelligent Tracking Prevention) for *Safari*, and installed PWAs have had inconsistent treatment across iOS versions. Practical mitigation for OIDC: don't rely purely on long-lived cookies — use a refresh-token rotation flow so re-auth is silent even if local storage is periodically cleared, and treat "was logged out unexpectedly" as an expected occasional event to handle gracefully (redirect to login, not a crash).
- **The auth-redirect-opens-Safari problem**: this is the single biggest iOS PWA gotcha for OIDC. iOS Safari uses the manifest's `scope` to decide which URLs may navigate *within* standalone mode; any navigation to a URL outside `scope` (including the OIDC provider's authorize/login domain, which is necessarily a different origin) drops out of standalone and opens full Safari. After completing login, the user is left in **Safari**, not back inside the installed app window — breaking the "app-like" illusion and potentially fragmenting session state between the Safari tab and the standalone instance's storage.
  - **Current mitigations (2025/2026), roughly in order of robustness**:
    1. **Same-window top-level redirect, not popup.** Popups (`window.open`) for OIDC are the worst case on iOS standalone — they can silently fail or open detached Safari windows with no way back. Use a full top-level `location.href` redirect to the IdP and back, which at least gives iOS a chance to redirect back into the PWA if the return URL matches on some iOS versions (behavior is inconsistent across iOS releases; test on the actual iOS version used at home).
    2. **Keep the OIDC provider on the same origin/subpath if at all possible** (e.g. a same-origin `/auth/*` proxy path in front of the IdP, so the whole flow never leaves `scope`). This is the most reliable fix but requires the IdP (or a thin reverse-proxy) to be reachable under Franca's own origin — worth checking if the planned OIDC provider (e.g. Authelia/Keycloak/Authentik self-hosted) can sit behind the same reverse-proxy host/path.
    3. If the flow must cross origins, accept that first-time login may open Safari once, and make the post-login redirect land back on a URL inside `scope` with clear instructions/a button ("Return to Franca") — worst case the user manually switches back to the home-screen icon. Test whether the session cookie set during the Safari-hosted step is visible to the standalone instance afterward (in-scope cookies generally are shared since both use the same underlying WebKit storage for the same origin — the problem is specifically the *navigation* leaving standalone, not the cookie jar).
    4. Avoid `iframe`-based silent-renew for OIDC entirely — third-party cookie restrictions and iOS's WebKit ITP largely break silent iframe refresh patterns already.
  - Given this is a **household LAN app** (not a public multi-tenant SaaS), the pragmatic recommendation is option 2: put the OIDC provider behind the same reverse-proxy domain/origin as Franca (different subpath, e.g. `app.home.lan/` for Franca and `app.home.lan/auth/` for the IdP, or at minimum the same eTLD+1) so the manifest `scope` covers the whole login round-trip and standalone mode never breaks.

### Splash screens
- iOS does **not** auto-generate a splash/startup screen from the manifest (`background_color`/icons) the way Android does — this is still true as of 2026. You must supply explicit `<link rel="apple-touch-startup-image" media="...">` tags, one per target device screen size/orientation, generated from a design (background color + centered logo, matching `background_color` in the manifest for visual continuity). Tools like `pwa-asset-generator` automate creating the full matrix of sizes from one source image/CSS.
- For a household app with a known, small set of physical devices, it's reasonable to just generate the exact sizes needed (e.g. iPhone 14/15/16 Pro/Pro Max, one iPad if used) rather than the full historical device matrix.

---

## 5. Install UX

### Android / desktop Chrome, Edge, Samsung Internet
- Listen for `beforeinstallprompt`, `preventDefault()` it, stash the event, and show a custom in-app "Install Franca" affordance (button in settings or a dismissible banner) rather than relying on the browser's automatic mini-infobar — this lets you add context ("Install for offline-ish, faster launch, full-screen lessons") and control *when* it's offered (e.g. after a completed first lesson, not on cold landing).
- Call `.prompt()` only on a user gesture (tap on your own "Install" button). The event can only be consumed once; if dismissed, no new prompt fires until the browser decides to re-offer it (heuristics, not scriptable).
- Always guard with `window.matchMedia('(display-mode: standalone)').matches` to hide install UI once already installed.

### iOS Safari
- `beforeinstallprompt` **never fires** on iOS (Safari, and also Chrome/Edge-on-iOS which are just Safari under the hood) — there is no programmatic install trigger. The only path is manual "Share → Add to Home Screen."
- Detect iOS (`/iPad|iPhone|iPod/.test(navigator.userAgent)`) and not-yet-standalone, then show a persistent but dismissible instructional banner: share-icon glyph → "Add to Home Screen" → home-icon glyph, mirroring the pattern in Next.js's own PWA guide. Only show this in non-standalone display mode (i.e. don't show install instructions to someone who already installed it).
- Since this is a closed household audience, a simple one-time onboarding message (or even a printed QR + instructions taped to the router) is a legitimate low-tech alternative to in-app detection logic.

---

## 6. Duolingo-style mobile UX conventions worth copying

- **Progress bar pinned to the very top of the lesson screen** — thin, full-width, fills left-to-right as questions are completed; gives constant "how much is left" feedback without taking real estate from the exercise itself. Pair with `safe-area-inset-top` padding so it clears the notch/status bar in standalone mode.
- **Bottom-anchored, full-width primary action button (Check / Continue)** — always in the same physical location regardless of exercise type (multiple choice, typing, matching), so muscle memory builds up. This is the single highest-leverage thumb-zone win: the primary action sits in the easiest one-handed reach zone (bottom third of screen) instead of requiring a stretch to a top-right "submit."
- **State-driven button, not two separate buttons** — the same bottom button reads "Check" pre-answer and morphs into "Continue" post-answer (with a color change, e.g. neutral → green/red), reducing layout shift and decision fatigue.
- **Answer feedback anchored near the button, not the answer** — correct/incorrect banners slide up from the bottom, adjacent to the action button, keeping the user's eyes/thumb in one zone instead of forcing a scan back up to the question.
- **Large, evenly-spaced tap targets for answer chips/tiles** — generous padding and gaps between selectable options minimizes mis-taps, especially important since this is a language app where letter/word tiles can be visually dense.
- **Thumb-zone hierarchy overall**: primary/frequent actions (check, continue, answer selection) in the bottom half of the screen; secondary/rare actions (settings, exit lesson, report a problem) in the top corners, accepting they require a hand-shift to reach — this asymmetry is intentional and matches one-handed phone-holding ergonomics.
- **Bottom tab/nav bar** (if Franca adds one outside lessons) should keep to 3–5 destinations, icon+label, sized to the same ≥44pt tap target, and — critically for installed PWA — padded with `env(safe-area-inset-bottom)` so it doesn't collide with the iPhone home-indicator gesture area.

---

## Summary of concrete next steps for Franca
1. Add `app/manifest.ts` (name/short_name/icons incl. maskable/standalone/colors) — needs a TLS-capable LAN hostname first (mkcert/Caddy/Tailscale) since SW + full installability require a secure context.
2. Add `viewport` export (`viewportFit: 'cover'`) and `metadata.appleWebApp` in root `layout.tsx`; generate `apple-icon.png` (180×180) and a small startup-image set for the household's actual devices.
3. Ship the ~15-line no-op `public/sw.js` (register on mount) rather than Serwist for now; keep Serwist noted as the upgrade path if/when offline lesson caching is prioritized, with API/auth routes explicitly excluded from any future runtime caching.
4. Route the OIDC provider through the same origin/reverse-proxy as Franca (or as close as possible) to avoid the iOS standalone-mode Safari-redirect trap; use top-level redirects, never popups/iframes, for the auth flow.
5. Sweep existing Tailwind layout for: `touch-manipulation` on game buttons, `min-h-11`/`min-w-11` tap targets, `text-base`+ on all inputs, safe-area padding on any fixed top/bottom bars, and `100dvh`/`100svh` fallback logic instead of bare `100vh`/`h-screen` on full-bleed lesson screens.
5. Add custom install UX: `beforeinstallprompt`-driven button for Android/desktop; iOS-detected "Add to Home Screen" instructional banner, both gated on `display-mode: standalone` to hide once installed.
6. Adopt the Duolingo layout pattern for the lesson screen: top progress bar (safe-area aware), bottom full-width state-driven Check/Continue button (safe-area aware), answer feedback anchored at the bottom.

## Sources
- [Next.js: Guides — Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Next.js: manifest.json file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)
- [Next.js: generateViewport / Viewport](https://nextjs.org/docs/app/api-reference/functions/generate-viewport)
- [Next.js: app-icons file conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons)
- [Serwist — @serwist/next getting started](https://serwist.pages.dev/docs/next/getting-started)
- [Serwist — register configuration](https://serwist.pages.dev/docs/next/configuring/register)
- [web.dev — Adaptive icon support in PWAs with maskable icons](https://web.dev/articles/maskable-icon)
- [web.dev — Installation prompt](https://web.dev/learn/pwa/installation-prompt)
- [MDN — Window: beforeinstallprompt event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [MDN — touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [firt.dev — iOS PWA Compatibility notes](https://firt.dev/notes/pwa-ios/)
- [PWA-POLICE/pwa-bugs — list of PWA bugs and workarounds](https://github.com/PWA-POLICE/pwa-bugs)
- [Apple Developer Forums — PWA freezing after OIDC authorizes user](https://developer.apple.com/forums/thread/649699)
- [web.dev — Progressive Web Apps in multi-origin sites](https://web.dev/articles/multi-origin-pwas)
- [MagicBell — PWA iOS Limitations and Safari Support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [openreplay — When 100vh Lies: Fixing Mobile Viewport Issues](https://blog.openreplay.com/fix-100vh-mobile-viewport/)
- [Usability Geek — UX Case Study: Duolingo](https://usabilitygeek.com/ux-case-study-duolingo/)
- [Duolingo Blog — The Science Behind Duolingo's Home Screen Redesign](https://blog.duolingo.com/new-duolingo-home-screen-design/)
