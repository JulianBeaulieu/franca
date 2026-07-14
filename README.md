# Franca

**Franca** is a self-hosted, multi-user, gamified language-learning PWA. Think spaced-repetition
flashcards fused with bite-sized, streak-driven lessons — running entirely on your own hardware,
behind your own single sign-on, with your data in your own Postgres.

It ships with **five ready-to-learn courses** and a simple CSV format so you can add any language
you like. Built with Next.js (App Router, TypeScript strict), PostgreSQL, and Tailwind CSS, with
OIDC single sign-on (Auth.js v5).

- Gamified lessons: XP, streaks, hearts, daily goals, per-lesson combos.
- A spaced-repetition core (SM-2-Lite) with an in-lesson re-queue engine.
- Multi-user from the ground up — every learner's progress keyed to their OIDC identity.
- Installable as a native-feeling app (PWA) on desktop, Android, and iOS.
- Pure-function pedagogy core, fully unit-tested; raw `pg`, no ORM.

---

## Quickstart (prebuilt image)

The fastest way to run Franca is the published multi-arch image (`linux/amd64` + `linux/arm64`).
Save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
name: franca

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: franca
      POSTGRES_USER: franca
      POSTGRES_PASSWORD: franca
    volumes:
      - franca-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U franca -d franca']
      interval: 3s
      timeout: 3s
      retries: 20

  app:
    image: ghcr.io/julianbeaulieu/franca:latest
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://franca:franca@db:5432/franca
      NEXT_PUBLIC_BASE_URL: http://localhost:3000
      # --- Auth: generate a strong secret with `openssl rand -base64 33` ---
      AUTH_SECRET: ${AUTH_SECRET:?generate with: openssl rand -base64 33}
      OIDC_ISSUER: ${OIDC_ISSUER:?your OIDC issuer URL}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?your OIDC client id}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?your OIDC client secret}
      AUTH_TRUST_HOST: 'true'
    ports:
      - '3000:3000'

volumes:
  franca-pgdata:
```

The app container waits for Postgres, applies the migration chain, seeds the five bundled courses
idempotently, then serves at http://localhost:3000. Re-running never duplicates data.

Franca **requires** an OIDC provider — see [Authentication](#authentication) below. For a
zero-config local trial, the [from-source dev stack](#development) bundles a **Dex** identity
provider with ready-made dev users; the prebuilt image expects you to point it at your own IdP
(Authentik, Keycloak, Auth0, Dex, or any compliant OIDC server).

> **Fail-fast guard:** if `AUTH_SECRET` is left at the committed dev default while `OIDC_ISSUER`
> is anything other than the bundled Dex issuer, the app refuses to start. Always set a real
> `AUTH_SECRET` in production.

---

## What's included

Five courses seed out of the box (vocabulary / sentences / conjugation drills):

| Course              | Code     | Vocab | Sentences | Conjugations |
| ------------------- | -------- | ----: | --------: | -----------: |
| **Lebanese Arabic** | `ar-leb` |  2412 |      1181 |          565 |
| **German**          | `de`     |   572 |       265 |          100 |
| **Spanish**         | `es`     |   671 |       262 |          100 |
| **French**          | `fr`     |   641 |       259 |          105 |
| **Italian**         | `it`     |   545 |       284 |           99 |

Lebanese Arabic uses arabizi (Latin-letter) transliteration. All content is baked into the image,
so the courses above work with **no mounts**. Switch the active course from the flag menu in the
top bar. **Streak and daily goal are global** per learner; **XP is tracked per course** and also
summed globally.

---

## Add your own language

A course is just a directory named by its code containing three CSVs (plus an optional
`course.json`):

```
courses/
  <code>/
    vocab.csv
    sentences.csv
    conjugations.csv
    course.json        # optional metadata
```

**`vocab.csv`** — two columns, header required:

```csv
arabizi_word,english_translation
der,the (masculine)
Hallo,hello
```

**`sentences.csv`** — two columns; quote fields containing commas (RFC-4180):

```csv
arabizi_sentence,english_translation
"Hallo, wie geht es dir?","Hello, how are you?"
```

**`conjugations.csv`** — a verb plus eight person forms. The column names are historical (Lebanese
Arabic pronouns) but map to generic persons: `ana`=I, `ni7na`=we, `inta`=you (m), `inte`=you (f),
`into`=you (pl), `huwe`=he, `hiyye`=she, `hinne`=they:

```csv
base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne
sein,to be,bin,sind,bist,bist,seid,ist,ist,sind
```

**`course.json`** (optional) — display metadata; without it the directory name is used:

```json
{ "code": "de", "name": "German", "nativeName": "Deutsch", "emoji": "🇩🇪" }
```

### Mounting your courses over the baked ones

`COURSES_DIR_PATH` accepts a **colon-separated list** of directories (PATH-style). Each existing
directory is scanned in order; on a duplicate course code the **last directory wins**. The image
bakes `COURSES_DIR_PATH=/app/courses`, so to add or override courses, mount your directory and
prepend the baked path:

```yaml
  app:
    image: ghcr.io/julianbeaulieu/franca:latest
    environment:
      # baked courses first, then yours — yours override on a duplicate code,
      # and the bundled de/es/fr/it/ar-leb stay available.
      COURSES_DIR_PATH: /app/courses:/data/courses
    volumes:
      - ./my-courses:/data/courses:ro
```

Seeding is idempotent — existing rows are upserted, never duplicated — so re-running
`docker compose up` after editing a CSV just updates the content.

---

## Authentication

The whole app requires login via OIDC (Auth.js v5, JWT sessions — no server-side session store).
First login auto-provisions a learner keyed on the stable OIDC `sub`. The provider is a generic
OIDC client; only these env vars change between setups:

| Variable             | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `AUTH_SECRET`        | Session encryption key — `openssl rand -base64 33`   |
| `OIDC_ISSUER`        | Your IdP's issuer URL                                |
| `OIDC_CLIENT_ID`     | Client/application ID from your IdP                  |
| `OIDC_CLIENT_SECRET` | Client secret from your IdP                          |
| `AUTH_URL`           | Public app URL (set when behind a proxy)             |
| `AUTH_TRUST_HOST`    | `true` for LAN / reverse-proxy deployments           |

### Production (Authentik / any OIDC IdP)

Point the env keys at your real IdP and set a strong secret:

```bash
AUTH_SECRET=$(openssl rand -base64 33)
AUTH_URL=https://franca.example-home.lan
AUTH_TRUST_HOST=true
OIDC_ISSUER=https://auth.example-home.lan/application/o/franca/
OIDC_CLIENT_ID=<from Authentik>
OIDC_CLIENT_SECRET=<from Authentik>
```

Register Franca as a confidential OIDC client in your IdP with the redirect URI
`<AUTH_URL>/api/auth/callback/oidc`.

### Development (bundled Dex)

The from-source dev stack ships a **Dex** provider with three static dev users (dev-only, not real
secrets), defined in `db/dex.config.yaml`:

| email               | password   | Dex userID     |
| ------------------- | ---------- | -------------- |
| `alice@franca.test` | `password` | `u-alice-0001` |
| `bob@franca.test`   | `password` | `u-bob-0002`   |
| `carol@franca.test` | `password` | `u-carol-0003` |

**One-time host setup:** the dev OIDC issuer is `http://dex:5556/dex`, and that exact URL must
resolve from both your browser and the app container. Docker DNS handles the container side; for
your browser add a hosts entry (Dex's port 5556 is published to the host):

```bash
grep -q '127.0.0.1  dex' /etc/hosts || echo '127.0.0.1  dex' | sudo tee -a /etc/hosts
```

The `sub` stored in `learner.oidc_sub` is Dex's base64/protobuf encoding of (userID, connector) —
e.g. `u-alice-0001` → `Cgx1LWFsaWNlLTAwMDESBWxvY2Fs` — not the raw userID. Look learners up by
email in dev.

---

## Install as an app (PWA)

Over `localhost` or an HTTPS LAN hostname, Franca is installable (web app manifest + service
worker). On desktop/Android use the browser's install action; on iOS use Share → Add to Home
Screen.

---

## Architecture

- **Learning path** (`/`): units of lessons, frequency/theme-ordered, precomputed at seed time.
- **Lessons**: a lesson plan is assembled per request (due SRS reviews + gated new words), fetched
  once, then the whole session — including the in-lesson **re-queue engine** — runs client-side as
  pure functions. Each answer POSTs an incremental SRS update; completion POSTs XP/streak.
- **SRS**: SM-2-Lite (soft lapse + fuzz + leech) in `src/lib/srs.ts`.
- **Re-queue**: a missed item returns +3 positions later and must be answered correctly twice to
  clear the lesson (`src/lib/lesson-runner.ts`).
- **Exercises**: multiple choice (both directions), word-bank assembly, type-the-translation,
  matching pairs, and conjugation drills — no audio.
- **Data**: raw `pg` (no ORM). Schema lives in `db/migrations/NNN_*.sql`, applied in order by
  `scripts/migrate.ts` and tracked in a `schema_migrations` table. Fresh and existing databases
  both upgrade by running the same chain (automatic on container start).

All pedagogy logic lives as pure, unit-tested functions in `src/lib/`.

---

## Development

Build and run the full stack from source, with the bundled Dex identity provider:

```bash
# one-time: browser + app container must agree on the OIDC issuer host
grep -q '127.0.0.1  dex' /etc/hosts || echo '127.0.0.1  dex' | sudo tee -a /etc/hosts

docker compose up --build
```

This stands up Postgres, Dex, applies migrations, seeds courses, and serves at
http://localhost:3000. On first visit you are redirected to Dex — log in as
`alice@franca.test` / `password`.

### Without Docker

```bash
npm install
# start a local Postgres reachable at the DATABASE_URL below, then:
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npm run migrate
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npm run seed
npm run dev
```

You still need a reachable OIDC issuer (point `OIDC_ISSUER` at the Dockerized Dex, or your own
IdP) and `AUTH_SECRET` set. See `.env.example`.

### Quality gates

```bash
npm test          # Vitest unit tests for all pure logic in src/lib
npm run typecheck # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run lint      # ESLint (typescript-eslint strict-type-checked)
npm run build     # Next.js production build
```

### End-to-end smoke

With the dev stack up, run the authenticated smoke. It forges an Auth.js session cookie for the
seeded dev learner (provisioned when `SEED_SMOKE_LEARNER=1`, which the dev compose sets by
default), then exercises courses → path → lesson → answer → complete → profile, asserts the SRS
row is course-scoped and XP is awarded exactly once (repeat completion → 409), checks the PWA
files are public, and asserts unauthenticated requests are rejected (401):

```bash
docker compose up -d
AUTH_SECRET=dev-only-secret-change-me-0123456789abcdef \
  DATABASE_URL=postgres://franca:franca@localhost:5432/franca \
  node scripts/smoke.mjs
```

The `AUTH_SECRET` passed here **must equal** the app container's `AUTH_SECRET` — otherwise the
forged cookie fails to decrypt and every request 401s.

---

## Versioning & releases

Images are published to GHCR on date-based tags of the form **`vDD.MM.YYYY`** (day-first), e.g.
`v14.07.2026`. Pushing such a tag triggers the release workflow, which builds and pushes
`ghcr.io/julianbeaulieu/franca:<DD.MM.YYYY>` and `:latest` for `linux/amd64` and `linux/arm64`.
Pin a specific date tag for reproducible deploys, or track `:latest`.

---

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Julian Beaulieu.
