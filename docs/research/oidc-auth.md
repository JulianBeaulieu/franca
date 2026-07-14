# OIDC Authentication for Franca (Next.js 15 App Router, self-hosted)

Research date: 2026-07-14. Target: Franca — self-hosted language app, Next.js 15 (App
Router), TypeScript strict, raw `pg` + Postgres, docker-compose, LAN/homelab (no public
internet). Goal: household multi-user login via **generic OIDC** — **Dex** in dev/CI,
**Authentik** in the owner's prod — mapping the OIDC `sub` claim to a `learner` row
(auto-provision on first login).

---

## 1. Library choice — recommendation: **Auth.js (next-auth v5)**

| Option | Verdict for this app |
| --- | --- |
| **Auth.js / next-auth v5** | **RECOMMENDED.** Built-in OIDC discovery, PKCE, state, encrypted-JWT cookies, one `auth()` accessor for server components / route handlers / middleware. Generic single-provider OIDC is its sweet spot. |
| **Lucia** | **Do not use — deprecated.** Lucia v3 was deprecated in March 2025; it is now a "learn to build sessions yourself" resource, not a package. |
| **openid-client + iron-session** | Works, fully in your control, but you hand-roll the callback route, PKCE/state/nonce storage, token refresh, and cookie plumbing. More code to own and secure for zero benefit here. |
| **Hand-rolled oidc-client** | Rejected — most surface area to get wrong (nonce/state validation, discovery caching). |
| *(Better Auth)* | The de-facto Lucia successor; solid, DB-first, has a `generic-oauth` plugin. Viable, but for a **single** generic-OIDC provider it is more moving parts (plugin config + schema/adapter) than Auth.js. Keep as fallback if you later want passkeys/local accounts/admin UIs. |

### Version status (verify before install)

next-auth v5 has **not** shipped a non-beta tag as of July 2026 — it is a perpetual,
production-widely-used beta. **Pin an exact beta**, do not use `latest`/`beta`:

```jsonc
// package.json
"dependencies": {
  "next-auth": "5.0.0-beta.29"   // pin exact; @auth/core is pulled in transitively
}
```

Minimum Next.js for v5 is 14; Franca on 15 is fine. Note for a future Next.js 16 bump:
`middleware.ts` is renamed to `proxy.ts` and the export `middleware`→`proxy`. On Next 15
everything below uses `middleware.ts`.

### Session strategy: **JWT (stateless), not database sessions**

- **Use `session: { strategy: "jwt" }`** (the v5 default when no adapter is configured).
  The session lives in an encrypted (JWE) `HttpOnly` cookie. **No `@auth/pg-adapter`, no
  `accounts`/`sessions`/`verification_token` tables** — you keep raw `pg` and add only
  your own `learner` table.
- We still write to Postgres, but only **our** `learner` row (auto-provision, section 5),
  triggered from the `jwt` callback. The auth session itself stays in the cookie.
- DB sessions would only pay off if you need instant server-side revocation of individual
  sessions. For a 2-4 person homelab, JWT + a short `maxAge` is the simpler robust choice.

---

## 2. Generic OIDC provider config (one config, env-driven, Dex + Authentik)

Auth.js has first-class generic OIDC: give it `type: "oidc"` and an `issuer`, and it
fetches `${issuer}/.well-known/openid-configuration` to discover the authorization, token,
userinfo, and JWKS endpoints. **PKCE + state + nonce are enabled by default** for OIDC
providers — you do not configure them manually.

The **same** provider object drives Dex and Authentik; only three env vars differ.

```ts
// src/auth.ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import { upsertLearner } from "@/lib/learners"; // section 5

const config: NextAuthConfig = {
  // Self-hosted essentials: no VERCEL_URL here.
  trustHost: true,                       // trust the Host header (LAN / reverse proxy)
  secret: process.env.AUTH_SECRET,       // openssl rand -base64 33
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30d

  providers: [
    {
      id: "oidc",
      name: "Franca SSO",
      type: "oidc",
      issuer: process.env.OIDC_ISSUER!,        // Dex or Authentik issuer URL
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
      authorization: { params: { scope: "openid profile email" } },
      // checks default to ["pkce","state","nonce"] for oidc — leave as-is.
    },
  ],

  callbacks: {
    // Runs before the JWT is issued. `account`/`profile` are only present on the
    // first call right after a successful sign-in — that's when we provision.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const learner = await upsertLearner({
          oidcSub: profile.sub as string,          // STABLE key — never email
          email: (profile.email as string) ?? null,
          name: (profile.name as string) ?? null,
          picture: (profile.picture as string) ?? null,
        });
        token.learnerId = learner.id;              // carry our PK in the token
        token.sub = profile.sub as string;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose what the app needs on `session.user`.
      session.user.learnerId = token.learnerId as string;
      session.user.oidcSub = token.sub as string;
      return session;
    },
    // Route-wide gate (see section 6).
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
```

```ts
// src/types/next-auth.d.ts  — strict-mode typing for the extra fields
import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface Session {
    user: { learnerId: string; oidcSub: string } & DefaultSession["user"];
  }
}
declare module "next-auth/jwt" {
  interface JWT { learnerId?: string }
}
```

### The env vars (identical shape for both IdPs)

```dotenv
# .env  (dev = Dex)
AUTH_SECRET=<openssl rand -base64 33>
OIDC_ISSUER=http://dex:5556/dex        # see section 3 for WHY this exact host
OIDC_CLIENT_ID=franca
OIDC_CLIENT_SECRET=franca-dev-secret

# prod (Authentik) — same keys, different values
# OIDC_ISSUER=https://auth.example-home.lan/application/o/franca/
# OIDC_CLIENT_ID=<from Authentik>
# OIDC_CLIENT_SECRET=<from Authentik>
```

**Discovery gotcha (important):** there is an open bug where the `wellKnown` *override*
option fails discovery for some custom providers ("issuer property does not match"). The
fix is to **not** use `wellKnown` — pass only `issuer` (as above) and let Auth.js build the
`.well-known` URL itself. The other trigger of "issuer does not match" is a genuine
mismatch between `OIDC_ISSUER` and the `issuer` field inside the IdP's discovery document —
this is exactly the Docker hostname problem solved in section 3. Both Dex and Authentik are
spec-compliant, so plain `issuer` discovery works once the hostnames line up.

The **redirect/callback URL** Auth.js exposes for this provider (register it in both IdPs):

```
{APP_ORIGIN}/api/auth/callback/oidc      # the trailing "oidc" == provider id above
# dev:  http://localhost:3000/api/auth/callback/oidc
# prod: https://franca.example-home.lan/api/auth/callback/oidc
```

---

## 3. Dex in docker-compose (dev / CI) + the hostname problem

### The core problem: issuer must be ONE URL reachable identically from two places

OIDC discovery returns an `issuer` string, and the ID-token `iss` claim equals it. Auth.js
(server, inside the app container) **and** the user's browser both hit that same URL:

- The **browser** redirects to `${issuer}/auth?...` — so the issuer host must resolve from
  the host machine's browser.
- The **app container** calls `${issuer}/.well-known/...` and the token endpoint
  server-to-server — so the same host must resolve from inside Docker.

`localhost` breaks this: from the browser `localhost` = the host machine (good), but from
inside the app container `localhost` = the container itself (no Dex there). And a Docker
service name like `dex` resolves inside the network but **not** from the browser. If the two
sides use different hostnames, the discovery `issuer` will not match one of them and login
fails.

### Standard solution: pick ONE hostname that resolves the same on both sides

Use the service name **`dex`** as the issuer host, then make the developer's machine resolve
`dex` too, and publish Dex's port so the browser can reach it:

1. Set `OIDC_ISSUER=http://dex:5556/dex` and Dex's own `issuer: http://dex:5556/dex`.
2. Add one line to the host's `/etc/hosts`: `127.0.0.1  dex`
3. Publish `5556:5556` so the browser's `dex:5556` (→127.0.0.1) reaches the container.
4. Put the app and Dex on the same compose network so `dex` also resolves via Docker DNS.

Now `http://dex:5556/dex` is the *same* string everywhere: browser → 127.0.0.1:5556 (host
port) → Dex; app container → Docker DNS `dex` → Dex. Discovery `iss` matches both. Done.

> Alternative that avoids editing `/etc/hosts`: use `auth.localhost` (Chrome/Firefox
> auto-resolve `*.localhost`→127.0.0.1) as issuer host, and give the app container
> `extra_hosts: ["auth.localhost:host-gateway"]`. **Avoid on this project** — Safari does
> not reliably resolve `*.localhost`, and you will test PWA/iOS flows (section 7). The
> `/etc/hosts` + service-name approach above is browser-agnostic; prefer it.

### compose block

```yaml
# docker-compose.yml (excerpt)
services:
  dex:
    image: dexidp/dex:v2.41.1        # pin; check latest tag before use
    container_name: franca-dex
    command: ["dex", "serve", "/etc/dex/config.yaml"]
    ports:
      - "5556:5556"                  # browser reaches dex via published host port
    volumes:
      - ./db/dex.config.yaml:/etc/dex/config.yaml:ro
    networks: [franca]

  app:
    build: .
    environment:
      OIDC_ISSUER: http://dex:5556/dex
      OIDC_CLIENT_ID: franca
      OIDC_CLIENT_SECRET: franca-dev-secret
      AUTH_SECRET: dev-only-secret-change-me
      # AUTH_URL optional; trustHost:true covers LAN. Set if behind a proxy.
    ports: ["3000:3000"]
    depends_on: [dex, db]
    networks: [franca]

networks:
  franca: {}
```

### dex config (2-3 static test users)

```yaml
# db/dex.config.yaml
issuer: http://dex:5556/dex          # MUST equal OIDC_ISSUER exactly
storage:
  type: memory                       # fine for dev/CI; state resets on restart
web:
  http: 0.0.0.0:5556                 # bind all interfaces inside the container
oauth2:
  skipApprovalScreen: true           # no consent click in dev
staticClients:
  - id: franca
    name: Franca
    secret: franca-dev-secret
    redirectURIs:
      - http://localhost:3000/api/auth/callback/oidc
enablePasswordDB: true
staticPasswords:
  # password for all three below is "password" (bcrypt hash). Regenerate with:
  #   htpasswd -bnBC 10 "" password | tr -d ':\n'
  - email: "alice@franca.test"
    hash: "$2a$10$2b2cU8CPhOTaGrs1HRQuAueS7JTT5ZHsHSzYiFPm1leZck7Mc8T4W"
    username: "alice"
    userID: "u-alice-0001"
  - email: "bob@franca.test"
    hash: "$2a$10$2b2cU8CPhOTaGrs1HRQuAueS7JTT5ZHsHSzYiFPm1leZck7Mc8T4W"
    username: "bob"
    userID: "u-bob-0002"
  - email: "carol@franca.test"
    hash: "$2a$10$2b2cU8CPhOTaGrs1HRQuAueS7JTT5ZHsHSzYiFPm1leZck7Mc8T4W"
    username: "carol"
    userID: "u-carol-0003"
```

Notes: the browser is redirected to `http://dex:5556/dex/auth`, so ensure `dex` is in the
host `/etc/hosts`. The `redirectURIs` use `localhost:3000` because that is where the browser
returns *to the app*; that URL is validated by Dex against the browser's callback, and
`localhost:3000` is correct from the browser's point of view. Dex's `userID` becomes the
`sub` claim — stable per user, which is exactly what section 5 keys on.

---

## 4. Authentik specifics (owner's prod)

What the owner configures in Authentik (Admin interface):

1. **Create an OAuth2/OpenID Provider.**
   - **Client type:** Confidential. Record the generated **Client ID** and **Client
     Secret** → these become `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
   - **Authorization flow:** `default-provider-authorization-explicit-consent` (or implicit
     to skip the consent screen for a household).
   - **Redirect URIs:** add a **Strict** entry equal to the exact callback:
     `https://franca.example-home.lan/api/auth/callback/oidc`. Authentik validates strictly;
     a trailing-slash or scheme mismatch will reject the login.
   - **Signing key / PKCE:** leave default signing key; Authentik supports PKCE and Auth.js
     sends it automatically.
   - **Scopes:** ensure the `openid`, `profile`, `email` scope mappings are selected so the
     ID token carries `sub`, `name`, `email`, `preferred_username`, `picture`.
2. **Create an Application** and bind it to that provider (Authentik separates
   "Application" = the tile/policy object from "Provider" = the OAuth endpoints). Bindings
   here control *who* in the household may log in.
3. **Issuer URL for `OIDC_ISSUER`:** Authentik's issuer is
   `https://<authentik-host>/application/o/<application-slug>/` — note the **trailing
   slash** and the app slug. Its discovery doc is at
   `.../application/o/<slug>/.well-known/openid-configuration`. Auth.js appends
   `.well-known/...` to the issuer, so give it the full slug URL.

Authentik quirks to expect:
- **`sub` format:** Authentik's `sub` is an opaque hashed identifier by default (not the
  username/email), which is perfect — it is stable across email/username changes. Do not be
  surprised that it is not human-readable.
- **`groups` claim:** Authentik adds a `groups` array under the `profile`/`openid` scope by
  default. Franca can ignore it now but it is available if you later gate features by group.
- **`preferred_username`** carries the human handle; `name` may be blank if the user has no
  display name set — code defensively (section 5 already does `?? null`).
- **HTTPS:** prod issuer is HTTPS, so Auth.js will auto-enable secure cookies; make sure the
  reverse proxy forwards `X-Forwarded-Proto` and set `trustHost: true` (already in config).

---

## 5. Auto-provisioning: upsert `learner` by `oidc_sub`

**Rule: `sub` is the identity key, forever. Email is mutable and reassignable — never key on
it.** Persist `sub`, and treat `email`/`name`/`picture` as refreshable profile attributes.

```sql
-- db/migrations/00X_learners.sql
CREATE TABLE IF NOT EXISTS learner (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_sub    text UNIQUE NOT NULL,      -- the stable identity key
  email       text,
  name        text,
  picture     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_login  timestamptz NOT NULL DEFAULT now()
);
```

```ts
// src/lib/learners.ts
import { pool } from "@/lib/db"; // your existing raw pg Pool

export async function upsertLearner(p: {
  oidcSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO learner (oidc_sub, email, name, picture, last_login)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (oidc_sub) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           picture = EXCLUDED.picture,
           last_login = now()
     RETURNING id`,
    [p.oidcSub, p.email, p.name, p.picture],
  );
  return rows[0];
}
```

- Called from the `jwt` callback (section 2) only when `account && profile` — i.e. once per
  sign-in, not on every request. First login → INSERT; later logins → refresh + `last_login`.
- The returned `learner.id` is put on the token/session; **all app queries scope by
  `session.user.learnerId`**, never by email or by the raw `sub` string.
- If you later migrate IdPs (Dex→Authentik) the `sub` values differ, so a one-time backfill
  mapping table would be needed — an argument for keeping `learner.id` (your own UUID) as
  the FK target everywhere, which the schema above does.

---

## 6. Protecting routes (everything requires login)

Franca gates the entire app, so use **middleware as the coarse gate** plus **`auth()` checks
at each server boundary** for defence-in-depth (middleware alone is not a security boundary
for data access).

### Route handler wiring

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### Middleware — protect all pages and API routes except the auth endpoints

```ts
// middleware.ts (project root)  — Next 15; becomes proxy.ts in Next 16
export { auth as middleware } from "@/auth";

export const config = {
  // Run on everything EXCEPT: auth endpoints, next internals, static assets, PWA files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
```

Because the config exports `callbacks.authorized` (`return !!auth?.user`), exporting `auth`
as the middleware makes every matched request that lacks a session **redirect to the sign-in
page** automatically. Keep the matcher exclusions minimal — the PWA manifest, service worker,
and icons must stay public or the app cannot install/boot.

### Session helper for server components / route handlers / server actions

```ts
// src/lib/session.ts
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/** Server Components & Server Actions: throw-to-login if unauthenticated. */
export async function requireLearner() {
  const session = await auth();
  if (!session?.user?.learnerId) redirect("/api/auth/signin");
  return session.user; // { learnerId, oidcSub, email, name, ... }
}
```

```tsx
// Any Server Component
export default async function Page() {
  const { learnerId } = await requireLearner();
  const decks = await getDecksFor(learnerId);
  return <Decks decks={decks} />;
}
```

```ts
// A protected route handler (defence in depth even though middleware ran)
import { auth } from "@/auth";
export const POST = auth(async (req) => {
  if (!req.auth?.user) return new Response("Unauthorized", { status: 401 });
  const learnerId = req.auth.user.learnerId;
  // ...mutate scoped to learnerId
  return Response.json({ ok: true });
});
```

**Logout:**

```tsx
// Server Action form — CSRF-safe by construction on Next 15
import { signOut } from "@/auth";
export function LogoutButton() {
  return (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/api/auth/signin" }); }}>
      <button type="submit">Sign out</button>
    </form>
  );
}
```

**CSRF considerations:**
- Auth.js protects **its own** POST endpoints (`/api/auth/*`) with a double-submit CSRF
  token — you get that for free.
- **Server Actions** (Next 15) verify `Origin` against `Host` automatically → your mutations
  through actions are CSRF-safe. Prefer Server Actions for writes.
- For hand-written mutating **route handlers**, rely on `SameSite=Lax` session cookies
  (Auth.js default) *and* additionally check `Origin`/`Sec-Fetch-Site` on state-changing
  POSTs. Never accept GET for mutations.
- On a plain-HTTP LAN, cookies are non-`Secure` (Auth.js only sets `Secure` + `__Secure-`
  prefix when the origin is HTTPS). Behind an HTTPS reverse proxy in prod, secure cookies
  engage automatically given `trustHost` + forwarded proto.

---

## 7. PWA interaction (installed app on iOS/Android)

Franca is a PWA, so the OIDC redirect flow interacts with standalone-mode quirks:

- **Use full-page redirects, not popups.** Auth.js already does a top-level navigation for
  the sign-in flow — keep it. On iOS, popup/`window.open` OAuth flows never surface in an
  installed PWA (iOS won't open new windows from async handlers). The redirect model avoids
  this entirely.
- **iOS standalone → external browser hop.** On some iOS versions the IdP page may open in
  Safari/SFSafariViewController and then return to the standalone PWA. This works with the
  redirect flow but can look jarring; make sure `trustHost`/`AUTH_URL` produce the *exact*
  installed-app origin so the post-login redirect lands back inside the PWA, not a new Safari
  tab.
- **Cookie persistence.** iOS 16.7+ copies the domain's existing cookies into the PWA at
  install time, so a user who was logged in before installing stays logged in. Practical UX
  rule: **prompt "Add to Home Screen" only after a successful login**, so the installed PWA
  starts already authenticated and the user never meets a login redirect from a cold
  standalone launch.
- **Session longevity.** Standalone PWAs get evicted less predictably; the 30-day JWT
  `maxAge` (section 2) is a reasonable balance so household members are not re-prompted
  constantly. Because sessions are JWT (not DB), there is no server round-trip to keep them
  alive — the cookie is authoritative until expiry.
- **Third-party-cookie / iframe traps:** do **not** embed the IdP in an iframe. A top-level
  redirect keeps the IdP first-party during its own step and sidesteps ITP/third-party-cookie
  blocking. The design above never iframes Dex/Authentik.
- **Same-origin over LAN:** keep the app and its callback on one origin (e.g.
  `https://franca.example-home.lan`); the IdP is a *different* origin but only visited via
  full redirect, so no cross-site cookie issues arise for the app's own session cookie.

---

## Appendix — install & bring-up checklist

```bash
npm i next-auth@5.0.0-beta.29
openssl rand -base64 33            # -> AUTH_SECRET
echo "127.0.0.1  dex" | sudo tee -a /etc/hosts   # dev only, one-time
docker compose up dex db app
# browse http://localhost:3000 -> redirected to http://dex:5556/dex -> log in as alice/password
```

Files to add: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `middleware.ts`,
`src/lib/session.ts`, `src/lib/learners.ts`, `src/types/next-auth.d.ts`,
`db/dex.config.yaml`, `db/migrations/00X_learners.sql`, and the `dex` compose service.

## Sources

- Auth.js — Migrating to v5 / nextjs reference / configuring OAuth providers / session protecting: https://authjs.dev/getting-started/migrating-to-v5 , https://authjs.dev/reference/nextjs , https://authjs.dev/guides/configuring-oauth-providers , https://authjs.dev/getting-started/session-management/protecting
- next-auth beta status discussion: https://github.com/nextauthjs/next-auth/discussions/13382 and npm versions: https://www.npmjs.com/package/next-auth?activeTab=versions
- OIDC `wellKnown` discovery bug: https://github.com/nextauthjs/next-auth/issues/13016 , https://github.com/nextauthjs/next-auth/issues/13138
- Custom OIDC provider guide (v5): https://codeandscale.hashnode.dev/integrating-custom-oidc-provider-with-nextjs-and-next-auth-v5-a-step-by-step-guide
- Lucia deprecation: https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth , https://lucia-auth.com/lucia-v3/migrate
- Dex with Docker (config + staticClients/staticPasswords): https://docs.docker.com/guides/dex/ , https://blog.neisen.me/2024/07/running-dex-with-docker/ , https://dexidp.io/docs/connectors/local/
- Authentik OAuth2/OIDC provider: https://docs.goauthentik.io/add-secure-apps/providers/oauth2/
- PWA + OAuth on iOS/Android: https://intercom.help/progressier/en/articles/9519381-google-oauth2-is-not-working-in-my-pwa-on-ios-why , https://github.com/pocketbase/pocketbase/discussions/2429 , https://docs.oidc-spa.dev/resources/third-party-cookies-and-session-restoration
