# Franca Phase 2 — Multi-User (OIDC), Multi-Language Courses, Mobile-First PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Franca from a single-user Lebanese-Arabic app into a household **multi-user** app (OIDC login, per-learner data), a **multi-language course platform** (N courses, per-course content and progress, a Duolingo-style course picker), and an installable **mobile-first PWA** — without breaking any Phase 1 pure-lib contract, the "one-command `docker compose up`" promise, or the original Lebanese-Arabic seeding contract.

**Architecture:** Auth.js v5 (next-auth `5.0.0-beta.29`) with **stateless JWT sessions** fronts the whole app via `middleware.ts`; a generic env-driven OIDC provider talks to **Dex** in dev (in `docker-compose`, static test users) and the owner's **Authentik** in prod. First login auto-provisions a `learner` row keyed on the stable OIDC `sub`. The integer `learner.id` PK is **kept** (all Phase 1 FKs are integer), so provisioning returns an integer id that threads through every repo function and API route in place of the retired `LEARNER_ID = 1` constant. Content (`unit`/`vocab`/`sentence`/`conjugation`) gains a `course_id` FK; a new `course` table plus a `learner_course` join table (per-course XP) and `learner.active_course_id` model N languages; **streak + daily goal stay global per learner**, **XP is tracked per course and summed globally**. Schema evolves through a **numbered migration chain** (`db/migrations/NNN_*.sql`) applied idempotently by an upgraded `scripts/migrate.ts` with a `schema_migrations` tracking table — the same chain builds fresh installs and upgrades existing Phase 1 databases in place. Seeding generalizes to a `courses/<code>/` directory convention while preserving the legacy `VOCAB_CSV`/`SENTENCES_CSV`/`CONJUGATIONS_CSV` contract (those keep seeding the `ar-leb` course). PWA support is a `manifest.ts`, a no-op service worker, cedar-on-green icons, and a mobile-layout sweep (safe-area insets, `100dvh`, bottom-anchored lesson actions, touch/`≥16px` input fixes).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5 (strict + `noUncheckedIndexedAccess`), Tailwind CSS 3, PostgreSQL 16, `pg` (node-postgres, raw SQL, no ORM), **next-auth 5.0.0-beta.29**, **Dex** (`dexidp/dex`) in dev compose, Vitest, ESLint (`@typescript-eslint` strict-type-checked), Docker Compose.

---

## Global Constraints

These apply to **every** task. Each task's requirements implicitly include this section. The Phase 1 constraints (from `docs/superpowers/plans/2026-07-13-franca.md` lines 11-29) carry forward **unless explicitly superseded below**.

**Carried forward from Phase 1 (unchanged):**
- **App name is `Franca` everywhere.** The string **"Duolingo" must never appear** in code, config, DB, or UI copy (only in this plan and `docs/research/`). Mascot is the cedar emoji `🌲` (no owl).
- **Framework:** Next.js `^15`, **App Router**, **TypeScript `strict: true` + `noUncheckedIndexedAccess: true`**. App code at repo root (`/Users/julianbeaulieu/Code/duolingo`).
- **Database:** PostgreSQL via docker-compose. DB name/user/password `franca` (local dev only). Raw `pg` repository layer — **no ORM**.
- **Pure-function rule:** all logic in `src/lib/` (normalization, SRS, exercises, re-queue engine, lesson generator, scoring, streak, units, seed-plan) stays pure — no DB, no `Math.random()`, no `Date.now()` inside; `rng: () => number` and `now`/`today` are injected. **Do not move DB access into `src/lib/`.** Auth/session/OIDC glue is **not** pure-lib: it lives in `src/auth.ts`, `src/lib/session.ts`, `src/lib/learners.ts` (these do I/O and are exempt from the pure rule, like `src/db/`).
- **CSV parsing** uses the existing RFC-4180 parser in `src/lib/csv.ts` — never `split(',')`.
- **Answer normalization must NOT strip digits `2`,`3`,`7`.** Do not touch `src/lib/normalize.ts` behavior.
- **Idempotent seeding:** re-running the seed never duplicates rows (`INSERT ... ON CONFLICT ... DO UPDATE/NOTHING` on natural keys).
- **Engineering standards:** ESLint strict-type-checked, Prettier, Vitest. Every new `src/lib/` pure module ships a colocated `*.test.ts`. Prefer small, focused files.
- **`docker compose up` alone stands up the whole app** and must work out of the box with no manual steps beyond the one documented `/etc/hosts` line for dev OIDC.
- **Preserve every Phase 1 pure-lib contract:** SRS (SM-2-Lite), in-lesson re-queue (`REQUEUE_GAP=3`, `CLEAR_AFTER_MISS=2`, `MAX_REQUEUES=3`), lesson generation, `conceptId` parsing, XP/streak/scoring. **No signatures in `src/lib/*` pure modules change** except `buildSeedPlan` (Task 8), which gains course metadata.

**New in Phase 2 (binding; supersede Phase 1 where they conflict):**
- **SUPERSEDES "Single user, no auth":** The whole app requires OIDC login. Every page and API route (except `/api/auth/*` and PWA static files) is gated by `middleware.ts`. Every repo function and API route derives `learnerId` from the **session**, never a constant. **The `LEARNER_ID = 1` constant is deleted** (Task 6).
- **Auth library:** next-auth pinned to exact **`5.0.0-beta.29`** (never `latest`/`beta`). **JWT session strategy** (`session.strategy = "jwt"`), no DB adapter, no `accounts`/`sessions` tables. `trustHost: true`. Provider is a single **generic OIDC** provider, id `"oidc"`, env-driven (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `AUTH_SECRET`, optional `AUTH_URL`/`AUTH_TRUST_HOST`).
- **`learner.id` stays `integer` (serial).** Do **not** migrate it to uuid (the OIDC research doc's uuid example is overridden — all Phase 1 FKs are integer; migrating them is needless churn for a homelab). Provisioning keys on `oidc_sub` (text, unique) and returns the integer id. `session.user.learnerId` is typed **`number`**.
- **`sub` is the identity key forever** — never key on email. Persist `oidc_sub`; treat `email`/`display_name`/`picture` as refreshable.
- **Multi-course scoping (locked schema):** a `course` table scopes `unit`/`vocab`/`sentence`/`conjugation` via a `course_id` FK. Per-(learner,course) state: `srs_state`, `lesson_session`, `unit_progress` all carry `course_id`. Per-course XP lives in `learner_course`. `learner.active_course_id` points at the learner's current course.
- **Streak/XP scoping (locked):** `streak_count`, `longest_streak`, `streak_freezes`, `last_completed_date`, `daily_goal_xp`, `hearts`, `gems` are **global per learner** (stay on `learner`). `daily_activity` stays **global** (`PK (learner_id, activity_date)`, aggregates XP across all courses) — it is the streak/daily-goal input. XP is tracked **per course** in `learner_course.xp_total` **and** summed **globally** in `learner.xp_total`. (Rationale: streak is a habit metric — studying any course keeps the flame; per-course streaks would punish language-switching. XP wants both a per-course number for the picker and a global lifetime total for the profile.)
- **`conceptId` format stays `itemType:itemId:direction`** (verified: each content table keeps a single serial PK, so `vocab.id`/`sentence.id`/`conjugation.id` remain globally unique across courses even after adding `course_id`; `srs_state (learner_id,item_id,item_type,direction)` still uniquely resolves). No course segment is added to `conceptId`.
- **Migration strategy (locked, ONE path):** the **numbered migration chain is the single source of truth** for both fresh and existing installs. `db/schema.sql` is retired by moving its exact contents to `db/migrations/000_baseline.sql` (all `CREATE TABLE IF NOT EXISTS`, so it is a safe no-op against an already-populated Phase 1 DB). `db/migrations/001_phase2.sql` holds the Phase 2 ALTERs + new tables. `scripts/migrate.ts` applies every `db/migrations/*.sql` in lexical order inside a transaction, skipping versions already recorded in a `schema_migrations` table.
- **Seeding convention (locked, backward compatible):** `seed.ts` always ensures the built-in `ar-leb` course exists. The **legacy** `VOCAB_CSV_PATH`/`SENTENCES_CSV_PATH`/`CONJUGATIONS_CSV_PATH` env vars keep seeding those three files into `ar-leb` (original contract preserved). Additionally, `seed.ts` scans `${COURSES_DIR:-./courses}` (mounted at `/data/courses`) for `<code>/{vocab,sentences,conjugations}.csv` (+ optional `course.json`) and seeds each as its own course. Only Lebanese data ships today; other languages seed when the user drops CSVs in.
- **PWA:** `app/manifest.ts`, no-op `public/sw.js` + registration, `viewport`/`appleWebApp` metadata exports, committed cedar-on-green PNG icons, safe-area insets, `100dvh` fixes, bottom-anchored Check/Continue, `touch-action: manipulation` on game buttons, inputs `≥16px`. **Icons are committed PNG assets** generated once by a committed Node script (not generated at build time).
- **e2e smoke:** `scripts/smoke.mjs` is extended to authenticate via **Auth.js JWT session-cookie injection** (forge the session cookie with `AUTH_SECRET` using `encode` from `@auth/core/jwt`; resolve the smoke learner's integer id from Postgres by a known `oidc_sub` seeded in dev). It exercises path → lesson → answer → complete → profile as an authenticated learner, scoped to the active course.

---

## File Structure (created / modified across the plan)

**Created:**
- `db/migrations/000_baseline.sql` — Phase 1 schema, verbatim (moved from `db/schema.sql`).
- `db/migrations/001_phase2.sql` — Phase 2 schema changes.
- `db/dex.config.yaml` — Dex dev config (issuer, static clients + users).
- `src/lib/migrations.ts` + `src/lib/migrations.test.ts` — pure migration-file discovery/ordering helper.
- `src/auth.ts` — NextAuth config + exports (`handlers`, `auth`, `signIn`, `signOut`).
- `src/lib/learners.ts` — `upsertLearner()` (I/O; provisioning).
- `src/lib/session.ts` — `requireLearner()`, `requireLearnerId()`, `getSessionLearnerId()`.
- `src/types/next-auth.d.ts` — module augmentation for `session.user.learnerId`.
- `middleware.ts` (repo root) — coarse auth gate.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js handlers.
- `src/app/api/courses/route.ts` — list courses + learner's active course.
- `src/app/api/course/route.ts` — set active course (POST).
- `src/app/manifest.ts` — PWA manifest.
- `src/app/register-sw.tsx` — service-worker registration client component.
- `public/sw.js` — no-op service worker.
- `public/icons/*` — committed PNG icons (+ `scripts/gen-icons.mjs` that produces them).
- `src/app/apple-icon.png` — 180×180 Apple touch icon.
- `src/components/CourseMenu.tsx` — course picker (flag menu).
- `src/components/UserMenu.tsx` — user avatar + sign-out.
- `.env.example` — documents all env vars.

**Modified:**
- `scripts/migrate.ts` — chain runner + tracking table.
- `scripts/seed.ts` — multi-course orchestration + legacy compat.
- `src/lib/seed-plan.ts` (+ `.test.ts`) — `buildSeedPlan` takes course metadata.
- `src/db/repo.ts` — delete `LEARNER_ID`; thread `learnerId`/`courseId`; add course repo fns.
- `src/db/pool.ts` — unchanged (referenced only).
- `src/app/api/{path,lesson,answer,lesson/complete,profile}/route.ts` — session + course scoping.
- `src/app/layout.tsx` — viewport/appleWebApp metadata, SW registration, safe-area body.
- `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/lesson/[unitId]/LessonClient.tsx` — course-aware + mobile fixes.
- `src/components/TopBar.tsx` — user menu + course menu.
- `src/hooks/useLessonSession.ts` — include `courseId` in complete POST body.
- `tailwind.config.ts` — safe-area spacing + `dvh` utilities.
- `src/app/globals.css` — safe-area helpers, `touch-manipulation` baseline.
- `next.config.mjs` — `/sw.js` headers.
- `docker-compose.yml` — Dex service, courses dir mount, auth env.
- `package.json` — add `next-auth` dep; `smoke` env note; `gen:icons` script.
- `README.md` — auth/PWA/courses/migrations docs.
- `scripts/smoke.mjs` — cookie-injection auth.

---

## Task 1: Migration runner infrastructure (numbered chain + tracking table)

**Files:**
- Create: `src/lib/migrations.ts`
- Test: `src/lib/migrations.test.ts`
- Create: `db/migrations/000_baseline.sql` (move `db/schema.sql` contents here)
- Modify: `scripts/migrate.ts`
- Delete: `db/schema.sql` (after its contents are moved)

**Interfaces:**
- Produces: `orderMigrations(files: string[]): string[]` — pure; returns `.sql` filenames sorted ascending by their numeric `NNN_` prefix, ignoring non-`.sql` and files without a numeric prefix. Used by `scripts/migrate.ts` to apply migrations deterministically.
- Produces (runtime): `scripts/migrate.ts` creates `schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`, applies each not-yet-recorded migration file (whole file) inside its own transaction, then records `version` = the filename. Idempotent: re-running applies nothing.

- [ ] **Step 1: Write the failing test for `orderMigrations`**

```ts
// src/lib/migrations.test.ts
import { describe, expect, it } from 'vitest';
import { orderMigrations } from './migrations';

describe('orderMigrations', () => {
  it('sorts by numeric prefix ascending, not lexically', () => {
    expect(orderMigrations(['010_x.sql', '002_b.sql', '000_base.sql'])).toEqual([
      '000_base.sql',
      '002_b.sql',
      '010_x.sql',
    ]);
  });

  it('ignores files without a numeric prefix and non-sql files', () => {
    expect(
      orderMigrations(['000_base.sql', 'README.md', 'notes.txt', 'draft.sql']),
    ).toEqual(['000_base.sql']);
  });

  it('is stable and returns a new array', () => {
    const input = ['001_a.sql', '001_a.sql'];
    expect(orderMigrations(input)).toEqual(['001_a.sql', '001_a.sql']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/migrations.test.ts`
Expected: FAIL — "Failed to resolve import './migrations'".

- [ ] **Step 3: Implement `orderMigrations`**

```ts
// src/lib/migrations.ts

/** A migration file must be `<digits>_<name>.sql`. */
const MIGRATION_RE = /^(\d+)_.*\.sql$/;

/**
 * Pure: returns only valid migration filenames, sorted ascending by their
 * numeric prefix (so `010_*` sorts after `002_*`, unlike a lexical sort of the
 * raw strings when widths differ). Non-matching entries are dropped.
 */
export function orderMigrations(files: string[]): string[] {
  return files
    .filter((f) => MIGRATION_RE.test(f))
    .map((f) => {
      const m = MIGRATION_RE.exec(f);
      // m is non-null here because filter already matched the same regex.
      return { file: f, order: Number(m?.[1] ?? '0') };
    })
    .sort((a, b) => a.order - b.order)
    .map((e) => e.file);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/migrations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Move the baseline schema into the migrations directory**

Create `db/migrations/000_baseline.sql` containing the **exact current contents** of `db/schema.sql` (the Phase 1 schema — `learner`, `unit`, `vocab`, `sentence`, `conjugation`, `srs_state`, `lesson_session`, `daily_activity`, `unit_progress`, `seed_meta`, all `CREATE TABLE IF NOT EXISTS` + indexes). Do not alter a single line — copy verbatim. Then delete `db/schema.sql`.

```bash
git mv db/schema.sql db/migrations/000_baseline.sql
```

(If `git mv` is unavailable because the repo is not initialised, `mkdir -p db/migrations && cp db/schema.sql db/migrations/000_baseline.sql && rm db/schema.sql`.)

- [ ] **Step 6: Rewrite `scripts/migrate.ts` as a chain runner**

```ts
// scripts/migrate.ts
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../src/db/pool';
import { orderMigrations } from '../src/lib/migrations';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'db', 'migrations');

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );

  const files = orderMigrations(readdirSync(dir));
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? 'Migrations up to date.' : `Applied ${String(ran)} migration(s).`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Verify the runner applies the baseline against a clean DB**

Run:
```bash
docker compose up -d db
# wait for healthy, then:
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npx tsx scripts/migrate.ts
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npx tsx scripts/migrate.ts
```
Expected: first run prints `Applied migration 000_baseline.sql` then `Applied 1 migration(s).`; second run prints `Migrations up to date.` Confirm `schema_migrations` has one row (`SELECT * FROM schema_migrations;`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/migrations.ts src/lib/migrations.test.ts db/migrations/000_baseline.sql scripts/migrate.ts
git commit -m "feat: numbered migration chain runner with schema_migrations tracking"
```

---

## Task 2: Migration 001 — Phase 2 schema (auth, courses, per-course scoping)

**Files:**
- Create: `db/migrations/001_phase2.sql`

**Interfaces:**
- Consumes: the migration runner from Task 1 (applies this file in one transaction, records `001_phase2.sql`).
- Produces (schema other tasks depend on):
  - `course(id serial pk, code text unique, name text, native_name text, emoji text, source_config jsonb, created_at)`.
  - `learner` gains `oidc_sub text` (partial-unique where not null), `email text`, `display_name text`, `picture text`, `active_course_id integer references course(id)`.
  - `learner_course(learner_id int, course_id int, xp_total int default 0, created_at, last_active_at, pk(learner_id,course_id))`.
  - `unit`/`vocab`/`sentence`/`conjugation` gain `course_id integer references course(id)`; their single-column natural-key uniques become `(course_id, <key>)`.
  - `srs_state`/`lesson_session`/`unit_progress` gain `course_id integer references course(id)`.
  - `daily_activity` is **unchanged** (stays global).
  - The built-in `ar-leb` course row exists; all pre-existing Phase 1 content/progress rows are backfilled to it.

- [ ] **Step 1: Write migration 001**

```sql
-- db/migrations/001_phase2.sql
-- Phase 2: multi-user (OIDC), multi-language courses.
-- Safe to run against a fresh baseline DB (Task 1 000_baseline) OR an existing
-- Phase 1 DB. All ALTERs use IF [NOT] EXISTS; the migration runner also guards
-- against re-application via schema_migrations.

-- 1. Courses -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course (
  id            serial PRIMARY KEY,
  code          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  native_name   text        NOT NULL,
  emoji         text        NOT NULL DEFAULT '🌐',
  source_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Built-in Lebanese Arabic course (the only data that ships today). The seed
-- script also upserts this, but creating it here lets the backfill below run.
INSERT INTO course (code, name, native_name, emoji)
VALUES ('ar-leb', 'Lebanese Arabic', 'اللبناني', '🇱🇧')
ON CONFLICT (code) DO NOTHING;

-- 2. Learner auth + active course ---------------------------------------------
ALTER TABLE learner ADD COLUMN IF NOT EXISTS oidc_sub        text;
ALTER TABLE learner ADD COLUMN IF NOT EXISTS email           text;
ALTER TABLE learner ADD COLUMN IF NOT EXISTS display_name    text;
ALTER TABLE learner ADD COLUMN IF NOT EXISTS picture         text;
ALTER TABLE learner ADD COLUMN IF NOT EXISTS active_course_id integer REFERENCES course(id);

-- Partial unique: the legacy id=1 row may have NULL oidc_sub; provisioned
-- learners always have a stable, unique sub.
CREATE UNIQUE INDEX IF NOT EXISTS learner_oidc_sub_key
  ON learner (oidc_sub) WHERE oidc_sub IS NOT NULL;

-- Default every existing learner's active course to ar-leb.
UPDATE learner
   SET active_course_id = (SELECT id FROM course WHERE code = 'ar-leb')
 WHERE active_course_id IS NULL;

-- 3. learner_course (per-course XP) -------------------------------------------
CREATE TABLE IF NOT EXISTS learner_course (
  learner_id     integer     NOT NULL REFERENCES learner(id),
  course_id      integer     NOT NULL REFERENCES course(id),
  xp_total       integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, course_id)
);

-- Seed a learner_course row for each existing learner on ar-leb, carrying their
-- current global xp_total forward as their ar-leb xp (all Phase 1 XP was ar-leb).
INSERT INTO learner_course (learner_id, course_id, xp_total)
SELECT l.id, c.id, l.xp_total
  FROM learner l CROSS JOIN course c
 WHERE c.code = 'ar-leb'
ON CONFLICT (learner_id, course_id) DO NOTHING;

-- 4. Scope content by course --------------------------------------------------
ALTER TABLE unit        ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);
ALTER TABLE vocab       ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);
ALTER TABLE sentence    ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);
ALTER TABLE conjugation ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);

UPDATE unit        SET course_id = (SELECT id FROM course WHERE code = 'ar-leb') WHERE course_id IS NULL;
UPDATE vocab       SET course_id = (SELECT id FROM course WHERE code = 'ar-leb') WHERE course_id IS NULL;
UPDATE sentence    SET course_id = (SELECT id FROM course WHERE code = 'ar-leb') WHERE course_id IS NULL;
UPDATE conjugation SET course_id = (SELECT id FROM course WHERE code = 'ar-leb') WHERE course_id IS NULL;

-- Replace single-column natural-key uniques with course-scoped ones so the same
-- arabizi word/sentence/verb/ordinal can exist in different courses.
ALTER TABLE unit        DROP CONSTRAINT IF EXISTS unit_ordinal_key;
ALTER TABLE vocab       DROP CONSTRAINT IF EXISTS vocab_arabizi_word_key;
ALTER TABLE sentence    DROP CONSTRAINT IF EXISTS sentence_arabizi_sentence_key;
ALTER TABLE conjugation DROP CONSTRAINT IF EXISTS conjugation_base_verb_key;

CREATE UNIQUE INDEX IF NOT EXISTS unit_course_ordinal_key        ON unit        (course_id, ordinal);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_course_word_key          ON vocab       (course_id, arabizi_word);
CREATE UNIQUE INDEX IF NOT EXISTS sentence_course_sentence_key   ON sentence    (course_id, arabizi_sentence);
CREATE UNIQUE INDEX IF NOT EXISTS conjugation_course_verb_key    ON conjugation (course_id, base_verb);

-- 5. Scope per-(learner,course) progress --------------------------------------
ALTER TABLE srs_state      ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);
ALTER TABLE lesson_session ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);
ALTER TABLE unit_progress  ADD COLUMN IF NOT EXISTS course_id integer REFERENCES course(id);

-- Backfill srs_state.course_id from the content row it points at.
UPDATE srs_state s SET course_id = v.course_id
  FROM vocab v WHERE s.item_type = 'vocab' AND s.item_id = v.id AND s.course_id IS NULL;
UPDATE srs_state s SET course_id = se.course_id
  FROM sentence se WHERE s.item_type = 'sentence' AND s.item_id = se.id AND s.course_id IS NULL;
UPDATE srs_state s SET course_id = cj.course_id
  FROM conjugation cj WHERE s.item_type = 'conjugation' AND s.item_id = cj.id AND s.course_id IS NULL;

UPDATE lesson_session ls SET course_id = u.course_id
  FROM unit u WHERE ls.unit_id = u.id AND ls.course_id IS NULL;
UPDATE lesson_session SET course_id = (SELECT id FROM course WHERE code = 'ar-leb') WHERE course_id IS NULL;

UPDATE unit_progress up SET course_id = u.course_id
  FROM unit u WHERE up.unit_id = u.id AND up.course_id IS NULL;

CREATE INDEX IF NOT EXISTS srs_learner_course_due_idx
  ON srs_state (learner_id, course_id, due_at) WHERE state <> 'new';
CREATE INDEX IF NOT EXISTS lesson_session_learner_course_idx
  ON lesson_session (learner_id, course_id);
```

- [ ] **Step 2: Apply against a fresh DB and verify final shape**

Run:
```bash
docker compose down -v && docker compose up -d db   # clean volume
# wait healthy
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npx tsx scripts/migrate.ts
```
Expected: `Applied migration 000_baseline.sql`, `Applied migration 001_phase2.sql`, `Applied 2 migration(s).`
Verify columns exist:
```bash
docker exec -i franca-db psql -U franca -d franca -c "\d learner" -c "\d course" -c "\d learner_course" -c "\d vocab"
```
Expected: `learner` shows `oidc_sub`, `active_course_id`; `vocab` shows `course_id`; `course`/`learner_course` exist; `SELECT code FROM course;` returns `ar-leb`.

- [ ] **Step 3: Verify in-place upgrade of a simulated Phase 1 DB**

Run:
```bash
docker compose down -v && docker compose up -d db
# Apply ONLY the baseline to simulate a Phase 1 install, plus a legacy learner + unit row:
docker exec -i franca-db psql -U franca -d franca < db/migrations/000_baseline.sql
docker exec -i franca-db psql -U franca -d franca -c "INSERT INTO learner (id,name) VALUES (1,'learner') ON CONFLICT DO NOTHING; INSERT INTO unit (ordinal,title,description,theme_color) VALUES (1,'U1','d','#58CC02') ON CONFLICT DO NOTHING;"
# Now run the full chain — 000 is a no-op (tables exist), 001 upgrades in place:
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npx tsx scripts/migrate.ts
docker exec -i franca-db psql -U franca -d franca -c "SELECT id, active_course_id FROM learner; SELECT id, course_id FROM unit; SELECT * FROM learner_course;"
```
Expected: `Applied migration 000_baseline.sql` (recorded, its `CREATE TABLE IF NOT EXISTS` no-ops), `Applied migration 001_phase2.sql`; the legacy learner has `active_course_id` set, `unit.course_id` is the ar-leb id, and a `learner_course` row exists for learner 1 on ar-leb.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/001_phase2.sql
git commit -m "feat: migration 001 — courses, learner auth columns, per-course scoping"
```

---

## Task 3: Auth foundation — next-auth config, learner provisioning, session typing

**Files:**
- Modify: `package.json` (add `next-auth`)
- Create: `src/lib/learners.ts`
- Create: `src/auth.ts`
- Create: `src/types/next-auth.d.ts`

**Interfaces:**
- Produces: `upsertLearner(p: { oidcSub: string; email: string | null; displayName: string | null; picture: string | null }): Promise<{ id: number; activeCourseId: number | null }>` — inserts on first login, refreshes profile + `last_login` on later logins, keyed on `oidc_sub`; ensures the learner has an `active_course_id` (defaults to the `ar-leb` course when present). Returns the integer learner id.
- Produces: `src/auth.ts` exports `{ handlers, auth, signIn, signOut }`. `auth()` resolves a session whose `session.user.learnerId: number` and `session.user.oidcSub: string`.
- Produces: `session.user.learnerId` typed `number`; `JWT.learnerId?: number` (via `src/types/next-auth.d.ts`).
- Consumes: `pool`/`query` from `src/db/pool.ts`; the `learner`, `course`, `learner_course` tables from Task 2.

- [ ] **Step 1: Add the pinned dependency**

Edit `package.json` `dependencies` to add the exact pin (do **not** use `latest`/`beta`):

```jsonc
  "dependencies": {
    "next": "^15.1.0",
    "next-auth": "5.0.0-beta.29",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

Run: `npm install`
Expected: `next-auth@5.0.0-beta.29` and its transitive `@auth/core` are installed.

- [ ] **Step 2: Write `upsertLearner` (I/O helper — not pure-lib)**

```ts
// src/lib/learners.ts
import { pool } from '@/db/pool';

export interface UpsertLearnerInput {
  oidcSub: string;
  email: string | null;
  displayName: string | null;
  picture: string | null;
}

export interface ProvisionedLearner {
  id: number;
  activeCourseId: number | null;
}

/**
 * Auto-provision (first login) or refresh (later logins) a learner keyed on the
 * stable OIDC `sub`. On insert, defaults active_course_id to the ar-leb course
 * if it exists. Called once per sign-in from the NextAuth jwt callback.
 */
export async function upsertLearner(p: UpsertLearnerInput): Promise<ProvisionedLearner> {
  const { rows } = await pool.query<{ id: number; active_course_id: number | null }>(
    `INSERT INTO learner (name, oidc_sub, email, display_name, picture, active_course_id)
     VALUES (
       COALESCE($2, 'learner'), $1, $2, $3, $4,
       (SELECT id FROM course WHERE code = 'ar-leb')
     )
     ON CONFLICT (oidc_sub) WHERE oidc_sub IS NOT NULL DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           picture = EXCLUDED.picture
     RETURNING id, active_course_id`,
    [p.oidcSub, p.email, p.displayName, p.picture],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertLearner returned no row');
  return { id: row.id, activeCourseId: row.active_course_id };
}
```

> Note: `ON CONFLICT (oidc_sub) WHERE oidc_sub IS NOT NULL` targets the partial unique index `learner_oidc_sub_key` from Task 2. `name` is kept for backward compat with Phase 1's `NOT NULL DEFAULT 'learner'`; we seed it from the display name when available.

- [ ] **Step 3: Write the NextAuth config**

```ts
// src/auth.ts
import NextAuth, { type NextAuthConfig } from 'next-auth';
import { upsertLearner } from '@/lib/learners';

const config: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 }, // 30 days
  providers: [
    {
      id: 'oidc',
      name: 'Franca SSO',
      type: 'oidc',
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email' } },
      // checks default to ["pkce","state","nonce"] for oidc — leave as-is.
      // Do NOT pass `wellKnown` (known discovery bug); `issuer` alone is correct.
    },
  ],
  callbacks: {
    // `account` + `profile` are present only on the first call right after a
    // successful sign-in — provision exactly once per sign-in there.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const learner = await upsertLearner({
          oidcSub: String(profile.sub),
          email: typeof profile.email === 'string' ? profile.email : null,
          displayName:
            typeof profile.name === 'string'
              ? profile.name
              : typeof profile.preferred_username === 'string'
                ? profile.preferred_username
                : null,
          picture: typeof profile.picture === 'string' ? profile.picture : null,
        });
        token.learnerId = learner.id;
        token.sub = String(profile.sub);
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.learnerId === 'number') session.user.learnerId = token.learnerId;
      session.user.oidcSub = typeof token.sub === 'string' ? token.sub : '';
      return session;
    },
    // Coarse route gate consumed by middleware (Task 4).
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
```

- [ ] **Step 4: Add the strict-mode session typing**

```ts
// src/types/next-auth.d.ts
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { learnerId: number; oidcSub: string } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    learnerId?: number;
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`src/auth.ts` compiles; `session.user.learnerId` is typed `number` everywhere. `profile.preferred_username`/`profile.sub` are read defensively so `strict-type-checked` is satisfied.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/learners.ts src/auth.ts src/types/next-auth.d.ts
git commit -m "feat: Auth.js v5 OIDC config + learner auto-provisioning (JWT sessions)"
```

---

## Task 4: Auth wiring — route handler, middleware gate, session helpers

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts` (repo root)
- Create: `src/lib/session.ts`

**Interfaces:**
- Consumes: `handlers`, `auth` from `src/auth.ts` (Task 3).
- Produces: `requireLearnerId(): Promise<number>` — for API route handlers & server components; returns `session.user.learnerId` or, if unauthenticated, `redirect('/api/auth/signin')` (server component) — for API use, prefer `getSessionLearnerId()` which returns `number | null` so the handler can return a 401 JSON.
- Produces: `getSessionLearnerId(): Promise<number | null>` — returns the learner id or `null` (no redirect); used inside API route handlers.
- Produces: `requireLearner(): Promise<{ learnerId: number; oidcSub: string; email: string | null; displayName: string | null; picture: string | null }>` — server-component helper; redirects to sign-in when unauthenticated.
- Produces: `middleware.ts` gating every path except `api/auth`, `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `sw.js`, and `icons/`.

- [ ] **Step 1: Wire the Auth.js catch-all route**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 2: Add the middleware gate**

```ts
// middleware.ts  (repo root; becomes proxy.ts if this ever moves to Next 16)
export { auth as middleware } from '@/auth';

export const config = {
  // Everything EXCEPT: auth endpoints, Next internals, static assets, PWA files.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)',
  ],
};
```

- [ ] **Step 3: Write the session helpers**

```ts
// src/lib/session.ts
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/** API route handlers: learner id or null (caller returns 401 JSON). */
export async function getSessionLearnerId(): Promise<number | null> {
  const session = await auth();
  return session?.user.learnerId ?? null;
}

/** Server Components / Server Actions: throw-to-login when unauthenticated. */
export async function requireLearner(): Promise<{
  learnerId: number;
  oidcSub: string;
  email: string | null;
  displayName: string | null;
  picture: string | null;
}> {
  const session = await auth();
  if (!session?.user.learnerId) redirect('/api/auth/signin');
  return {
    learnerId: session.user.learnerId,
    oidcSub: session.user.oidcSub,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    picture: session.user.image ?? null,
  };
}

/** Server Components: learner id, redirecting to sign-in if unauthenticated. */
export async function requireLearnerId(): Promise<number> {
  return (await requireLearner()).learnerId;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verify the gate redirects unauthenticated requests (manual, after Dex exists — revisit in Task 5)**

Deferred to Task 5's bring-up (needs Dex running). For now just confirm the build compiles:
Run: `npm run build`
Expected: build succeeds; `/api/auth/[...nextauth]` and `middleware` are listed.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/\[...nextauth\]/route.ts middleware.ts src/lib/session.ts
git commit -m "feat: Auth.js route handler, middleware gate, session helpers"
```

---

## Task 5: Dex in docker-compose + dev OIDC bring-up

**Files:**
- Create: `db/dex.config.yaml`
- Modify: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md` (dev auth section — folded here; final README polish in Task 16)

**Interfaces:**
- Consumes: `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`AUTH_SECRET` read by `src/auth.ts` (Task 3).
- Produces: a working dev IdP at issuer `http://dex:5556/dex` reachable identically from the browser (via host `/etc/hosts` `127.0.0.1 dex` + published `5556`) and the app container (Docker DNS). Three static users (`alice`/`bob`/`carol`, password `password`) with stable `userID`s that become the OIDC `sub`.

- [ ] **Step 1: Write the Dex config**

```yaml
# db/dex.config.yaml
issuer: http://dex:5556/dex          # MUST equal OIDC_ISSUER exactly
storage:
  type: memory                       # dev/CI only; state resets on restart
web:
  http: 0.0.0.0:5556
oauth2:
  skipApprovalScreen: true
staticClients:
  - id: franca
    name: Franca
    secret: franca-dev-secret
    redirectURIs:
      - http://localhost:3000/api/auth/callback/oidc
enablePasswordDB: true
staticPasswords:
  # password for all three is "password". Regenerate a hash with:
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

- [ ] **Step 2: Update `docker-compose.yml` — Dex service, networks, auth env, courses mount**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: franca-db
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
    networks: [franca]

  dex:
    image: dexidp/dex:v2.41.1        # pin; verify latest tag before bumping
    container_name: franca-dex
    command: ['dex', 'serve', '/etc/dex/config.yaml']
    ports:
      - '5556:5556'                  # browser reaches dex via published host port
    volumes:
      - ./db/dex.config.yaml:/etc/dex/config.yaml:ro
    networks: [franca]

  app:
    build: .
    container_name: franca-app
    depends_on:
      db:
        condition: service_healthy
      dex:
        condition: service_started
    environment:
      DATABASE_URL: postgres://franca:franca@db:5432/franca
      NEXT_PUBLIC_BASE_URL: http://localhost:3000
      # --- Auth (dev defaults; override in prod with Authentik values) ---
      AUTH_SECRET: ${AUTH_SECRET:-dev-only-secret-change-me-0123456789abcdef}
      OIDC_ISSUER: ${OIDC_ISSUER:-http://dex:5556/dex}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-franca}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:-franca-dev-secret}
      # AUTH_URL optional; trustHost:true covers LAN. Set behind a proxy in prod.
      # --- Seeding: legacy single-course contract (preserved) ---
      VOCAB_CSV_PATH: /data/vocab.csv
      SENTENCES_CSV_PATH: /data/sentences.csv
      CONJUGATIONS_CSV_PATH: /data/conjugations.csv
      # --- Seeding: multi-course directory convention ---
      COURSES_DIR_PATH: /data/courses
      # --- Dev-only: provision a deterministic smoke learner (Task 16) ---
      SEED_SMOKE_LEARNER: ${SEED_SMOKE_LEARNER:-1}
    volumes:
      - ${VOCAB_CSV:-./vocab.csv}:/data/vocab.csv:ro
      - ${SENTENCES_CSV:-./sentences.csv}:/data/sentences.csv:ro
      - ${CONJUGATIONS_CSV:-./conjugations.csv}:/data/conjugations.csv:ro
      - ${COURSES_DIR:-./courses}:/data/courses:ro
    ports:
      - '3000:3000'
    networks: [franca]

volumes:
  franca-pgdata:

networks:
  franca: {}
```

> The `./courses` host directory must exist for the bind mount (even if empty). Create it with a `.gitkeep` in Step 4.

- [ ] **Step 3: Write `.env.example`**

```dotenv
# .env.example — copy to .env for non-Docker dev; docker-compose has built-in defaults.

# Auth (dev = Dex). Generate a real secret with: openssl rand -base64 33
AUTH_SECRET=dev-only-secret-change-me-0123456789abcdef
OIDC_ISSUER=http://dex:5556/dex
OIDC_CLIENT_ID=franca
OIDC_CLIENT_SECRET=franca-dev-secret

# Prod (Authentik) — same keys, different values:
# AUTH_SECRET=<openssl rand -base64 33>
# AUTH_URL=https://franca.example-home.lan
# AUTH_TRUST_HOST=true
# OIDC_ISSUER=https://auth.example-home.lan/application/o/franca/
# OIDC_CLIENT_ID=<from Authentik>
# OIDC_CLIENT_SECRET=<from Authentik>

# Database (non-Docker dev)
DATABASE_URL=postgres://franca:franca@localhost:5432/franca

# Seeding overrides (host paths). Legacy single-course contract:
# VOCAB_CSV=./vocab.csv
# SENTENCES_CSV=./sentences.csv
# CONJUGATIONS_CSV=./conjugations.csv
# Multi-course directory:
# COURSES_DIR=./courses
```

- [ ] **Step 4: Create the courses mount directory placeholder**

```bash
mkdir -p courses && touch courses/.gitkeep
```

- [ ] **Step 5: Add the one-time dev hosts entry and bring the stack up**

Run:
```bash
grep -q '127.0.0.1  dex' /etc/hosts || echo '127.0.0.1  dex' | sudo tee -a /etc/hosts
docker compose up --build
```
Expected: `db`, `dex`, `app` start. Browse `http://localhost:3000` → redirected to `http://dex:5556/dex/auth` → log in `alice@franca.test` / `password` → land back on the Franca path. (The path may error until Task 8 wires session-scoped data — for this task, success = the redirect round-trip completes and a `learner` row with `oidc_sub='u-alice-0001'` appears: `docker exec -i franca-db psql -U franca -d franca -c "SELECT id,oidc_sub,display_name FROM learner;"`.)

- [ ] **Step 6: Verify the middleware gate (deferred from Task 4)**

Run: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/`
Expected: a redirect (`307`/`302`) toward `/api/auth/signin` when no session cookie is present.

- [ ] **Step 7: Commit**

```bash
git add db/dex.config.yaml docker-compose.yml .env.example courses/.gitkeep
git commit -m "feat: Dex dev OIDC in docker-compose + env wiring + courses mount"
```

---

## Task 6: Retire `LEARNER_ID`; thread `learnerId` through learner/progress repo functions

**Files:**
- Modify: `src/db/repo.ts`

**Interfaces:**
- Consumes: nothing new (raw `pg`).
- Produces (new signatures — every function that touched `LEARNER_ID` now takes `learnerId: number` as its **first** parameter; course-scoped ones also take `courseId: number`, added in Task 7):
  - `getLearner(learnerId: number, now: string): Promise<LearnerRow>` — `LearnerRow` gains `oidc_sub: string | null`, `email: string | null`, `display_name: string | null`, `picture: string | null`, `active_course_id: number | null`.
  - `deductHeart(learnerId: number): Promise<number>`
  - `getSrsState(learnerId: number, itemId: number, itemType: ItemType, direction: Direction): Promise<SrsState | null>`
  - `upsertSrsState(learnerId: number, courseId: number, state: SrsState): Promise<void>`
  - `createLessonSession(learnerId: number, courseId: number, sessionId: string, unitId: number): Promise<void>`
  - `completeLesson(args: CompleteLessonArgs): Promise<CompleteLessonResult>` — `CompleteLessonArgs` gains `learnerId: number` and `courseId: number`.
  - `getXpToday(learnerId: number, today: string): Promise<number>`
  - `getActivityCalendar(learnerId: number): Promise<{ date: string; xp: number }[]>`
  - `getLessonsCompleted(learnerId: number, courseId: number): Promise<number>`
- Note: the `export const LEARNER_ID = 1;` line is **deleted**. Course-scoped read functions (`getUnitsWithProgress`, `getNewVocabForUnit`, `getNewSentences`, `getNewConjugations`, `getDistractorPool`, `getWordBankDistractorTokens`, `getDueReviews`, `getWordsLearned`) are updated in Task 7 (they need `courseId`). This task changes only the learner/session/streak/heart functions plus the three SRS functions.

- [ ] **Step 1: Delete the constant and update `LearnerRow` + `LEARNER_COLUMNS`**

In `src/db/repo.ts`, delete `export const LEARNER_ID = 1;`. Extend `LearnerRow` and `LEARNER_COLUMNS`:

```ts
export interface LearnerRow {
  id: number;
  name: string;
  oidc_sub: string | null;
  email: string | null;
  display_name: string | null;
  picture: string | null;
  active_course_id: number | null;
  xp_total: number;
  gems: number;
  hearts: number;
  hearts_updated_at: string;
  daily_goal_xp: number;
  streak_count: number;
  longest_streak: number;
  streak_freezes: number;
  last_completed_date: string | null;
}

const LEARNER_COLUMNS = `id, name, oidc_sub, email, display_name, picture,
  active_course_id, xp_total, gems, hearts,
  hearts_updated_at::text AS hearts_updated_at, daily_goal_xp,
  streak_count, longest_streak, streak_freezes,
  last_completed_date::text AS last_completed_date`;
```

- [ ] **Step 2: Rewrite `getLearner` to take `learnerId` (no auto-insert — provisioning owns creation)**

```ts
export async function getLearner(learnerId: number, now: string): Promise<LearnerRow> {
  const rows = await query<LearnerRow>(
    `SELECT ${LEARNER_COLUMNS} FROM learner WHERE id = $1`,
    [learnerId],
  );
  const learner = rows[0];
  if (!learner) throw new Error(`learner ${String(learnerId)} not found`);

  const regen = regenerateHearts(learner.hearts, learner.hearts_updated_at, now);
  if (regen.hearts !== learner.hearts) {
    await query(
      'UPDATE learner SET hearts = $1, hearts_updated_at = $2 WHERE id = $3',
      [regen.hearts, regen.heartsUpdatedAt, learnerId],
    );
    learner.hearts = regen.hearts;
    learner.hearts_updated_at = regen.heartsUpdatedAt;
  }
  return learner;
}
```

> The Phase 1 upsert-on-read is removed: with OIDC, provisioning (`upsertLearner`, Task 3) is the only creator of learner rows. A missing learner at read time is a real error.

- [ ] **Step 3: Thread `learnerId`/`courseId` through the SRS + session + streak functions**

```ts
export async function getSrsState(
  learnerId: number,
  itemId: number,
  itemType: ItemType,
  direction: Direction,
): Promise<SrsState | null> {
  const rows = await query<SrsDbRow>(
    `SELECT ${SRS_COLUMNS}
     FROM srs_state
     WHERE learner_id = $1 AND item_id = $2 AND item_type = $3 AND direction = $4`,
    [learnerId, itemId, itemType, direction],
  );
  const r = rows[0];
  return r ? toSrsState(r) : null;
}

export async function upsertSrsState(
  learnerId: number,
  courseId: number,
  state: SrsState,
): Promise<void> {
  await query(
    `INSERT INTO srs_state
       (learner_id, course_id, item_id, item_type, direction, reps, ease, interval,
        due_at, lapses, last_grade, last_reviewed_at, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (learner_id, item_id, item_type, direction) DO UPDATE SET
       course_id = EXCLUDED.course_id,
       reps = EXCLUDED.reps, ease = EXCLUDED.ease, interval = EXCLUDED.interval,
       due_at = EXCLUDED.due_at, lapses = EXCLUDED.lapses,
       last_grade = EXCLUDED.last_grade, last_reviewed_at = EXCLUDED.last_reviewed_at,
       state = EXCLUDED.state`,
    [
      learnerId, courseId, state.itemId, state.itemType, state.direction, state.reps,
      state.ease, state.interval, state.dueAt, state.lapses, state.lastGrade,
      state.lastReviewedAt, state.state,
    ],
  );
}

export async function deductHeart(learnerId: number): Promise<number> {
  const rows = await query<{ hearts: number }>(
    `UPDATE learner SET hearts = GREATEST(0, hearts - 1),
       hearts_updated_at = CASE WHEN hearts = 5 THEN now() ELSE hearts_updated_at END
     WHERE id = $1 RETURNING hearts`,
    [learnerId],
  );
  return rows[0]?.hearts ?? 0;
}

export async function createLessonSession(
  learnerId: number,
  courseId: number,
  sessionId: string,
  unitId: number,
): Promise<void> {
  await query(
    `INSERT INTO lesson_session (id, learner_id, course_id, unit_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [sessionId, learnerId, courseId, unitId],
  );
}
```

- [ ] **Step 4: Rewrite `completeLesson` to scope by learner + course and bump per-course XP**

```ts
export interface CompleteLessonArgs {
  learnerId: number;
  courseId: number;
  sessionId: string;
  unitId: number;
  today: string;
  xpEarned: number;
  gemsEarned: number;
  accuracy: number;
  comboMax: number;
  perfect: boolean;
  numCorrect: number;
  numWrong: number;
  newStreak: number;
  longestStreak: number;
  streakFreezes: number;
  lastCompletedDate: string | null;
}

export type CompleteLessonResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_completed' };

export async function completeLesson(args: CompleteLessonArgs): Promise<CompleteLessonResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRows = await client.query<{ completed_at: string | null }>(
      `SELECT completed_at FROM lesson_session WHERE id = $1 AND learner_id = $2 FOR UPDATE`,
      [args.sessionId, args.learnerId],
    );
    const session = sessionRows.rows[0];
    if (!session) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    if (session.completed_at !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'already_completed' };
    }

    await client.query(
      `UPDATE lesson_session SET completed_at = now(), xp_earned = $2, accuracy = $3,
         combo_max = $4, perfect = $5, num_correct = $6, num_wrong = $7
       WHERE id = $1`,
      [args.sessionId, args.xpEarned, args.accuracy, args.comboMax, args.perfect, args.numCorrect, args.numWrong],
    );
    // Global learner state: streak/gems/global XP total.
    await client.query(
      `UPDATE learner SET xp_total = xp_total + $2, gems = gems + $3,
         streak_count = $4, longest_streak = $5, streak_freezes = $6,
         last_completed_date = $7
       WHERE id = $1`,
      [args.learnerId, args.xpEarned, args.gemsEarned, args.newStreak, args.longestStreak, args.streakFreezes, args.lastCompletedDate],
    );
    // Per-course XP.
    await client.query(
      `INSERT INTO learner_course (learner_id, course_id, xp_total, last_active_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (learner_id, course_id) DO UPDATE SET
         xp_total = learner_course.xp_total + EXCLUDED.xp_total,
         last_active_at = now()`,
      [args.learnerId, args.courseId, args.xpEarned],
    );
    // Global daily activity (streak/daily-goal input; aggregates all courses).
    await client.query(
      `INSERT INTO daily_activity (learner_id, activity_date, xp_earned, lessons_completed)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (learner_id, activity_date) DO UPDATE SET
         xp_earned = daily_activity.xp_earned + EXCLUDED.xp_earned,
         lessons_completed = daily_activity.lessons_completed + 1`,
      [args.learnerId, args.today, args.xpEarned],
    );
    // Per-course unit progress.
    await client.query(
      `INSERT INTO unit_progress (learner_id, course_id, unit_id, lessons_completed)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (learner_id, unit_id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         lessons_completed = unit_progress.lessons_completed + 1`,
      [args.learnerId, args.courseId, args.unitId],
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Thread `learnerId` through the remaining profile/activity functions**

```ts
export async function getXpToday(learnerId: number, today: string): Promise<number> {
  const rows = await query<{ xp_earned: number }>(
    `SELECT xp_earned FROM daily_activity WHERE learner_id = $1 AND activity_date = $2`,
    [learnerId, today],
  );
  return rows[0]?.xp_earned ?? 0;
}

export async function getActivityCalendar(learnerId: number): Promise<{ date: string; xp: number }[]> {
  const rows = await query<{ activity_date: string; xp_earned: number }>(
    `SELECT activity_date::text AS activity_date, xp_earned FROM daily_activity
     WHERE learner_id = $1 ORDER BY activity_date ASC`,
    [learnerId],
  );
  return rows.map((r) => ({ date: r.activity_date, xp: r.xp_earned }));
}

export async function getLessonsCompleted(learnerId: number, courseId: number): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM lesson_session
     WHERE learner_id = $1 AND course_id = $2 AND completed_at IS NOT NULL`,
    [learnerId, courseId],
  );
  return rows[0]?.n ?? 0;
}
```

- [ ] **Step 6: Typecheck (expect errors in Task-7 functions + callers — that is fine here)**

Run: `npm run typecheck`
Expected: FAIL only where `getUnitsWithProgress`/`getNewVocabForUnit`/`getNewSentences`/`getNewConjugations`/`getDistractorPool`/`getWordBankDistractorTokens`/`getDueReviews`/`getWordsLearned` still reference `LEARNER_ID` (fixed in Task 7) and where API routes call the changed functions (fixed in Tasks 9-10). Confirm the errors are limited to those call sites and the not-yet-updated content readers — no error should mention a typo in the functions rewritten above.

- [ ] **Step 7: Commit**

```bash
git add src/db/repo.ts
git commit -m "refactor: retire LEARNER_ID; thread learnerId/courseId through learner+session+SRS repo fns"
```

---

## Task 7: Course-scope content repo functions + course/learner_course repo functions

**Files:**
- Modify: `src/db/repo.ts`

**Interfaces:**
- Consumes: `course`, `learner_course` tables (Task 2); `learnerId`/`courseId` conventions (Task 6).
- Produces (content readers, now course-scoped — `courseId: number` is the **first** param; `getUnitsWithProgress` additionally takes `learnerId`):
  - `getUnitsWithProgress(learnerId: number, courseId: number): Promise<UnitProgressRow[]>`
  - `getNewVocabForUnit(learnerId: number, unitId: number, limit: number): Promise<VocabItem[]>` (unit already implies course; keep `learnerId` for the srs anti-join)
  - `getNewSentences(learnerId: number, courseId: number, limit: number): Promise<SentenceItem[]>`
  - `getNewConjugations(learnerId: number, courseId: number, limit: number): Promise<ConjugationItem[]>`
  - `getDistractorPool(courseId: number, limit: number): Promise<VocabItem[]>`
  - `getWordBankDistractorTokens(courseId: number): Promise<string[]>`
  - `getDueReviews(learnerId: number, courseId: number, today: string, limit: number): Promise<DueReview[]>`
  - `getWordsLearned(learnerId: number, courseId: number): Promise<number>`
- Produces (course model):
  - `interface CourseRow { id: number; code: string; name: string; native_name: string; emoji: string }`
  - `getCourses(): Promise<CourseRow[]>` — all courses, ordered by `id`.
  - `getCourseById(courseId: number): Promise<CourseRow | null>`
  - `getLearnerCourses(learnerId: number): Promise<(CourseRow & { xp_total: number; started: boolean })[]>` — all courses with the learner's per-course XP (0 + `started:false` when no `learner_course` row).
  - `setActiveCourse(learnerId: number, courseId: number): Promise<void>` — updates `learner.active_course_id` and upserts a `learner_course` row (so switching to a course "starts" it).
  - `getActiveCourseId(learnerId: number): Promise<number | null>` — reads `learner.active_course_id`.

- [ ] **Step 1: Course-scope `getUnitsWithProgress`**

```ts
export async function getUnitsWithProgress(
  learnerId: number,
  courseId: number,
): Promise<UnitProgressRow[]> {
  return query<UnitProgressRow>(
    `SELECT u.id, u.ordinal, u.title, u.description, u.theme_color,
            COALESCE(up.lessons_completed, 0) AS lessons_completed,
            (SELECT count(*) FROM vocab v WHERE v.unit_id = u.id)::int AS total_words
     FROM unit u
     LEFT JOIN unit_progress up ON up.unit_id = u.id AND up.learner_id = $1
     WHERE u.course_id = $2
     ORDER BY u.ordinal ASC`,
    [learnerId, courseId],
  );
}
```

- [ ] **Step 2: Course-scope the new-item readers**

```ts
export async function getNewVocabForUnit(
  learnerId: number,
  unitId: number,
  limit: number,
): Promise<VocabItem[]> {
  const rows = await query<VocabDbRow>(
    `SELECT v.id, v.arabizi_word, v.primary_gloss, v.accepted_answers,
            v.is_verb, v.is_phrase, v.length_bucket
     FROM vocab v
     WHERE v.unit_id = $1 AND v.is_phrase = false
       AND NOT EXISTS (
         SELECT 1 FROM srs_state s
         WHERE s.learner_id = $2 AND s.item_type = 'vocab' AND s.item_id = v.id
       )
     ORDER BY v.unit_order ASC
     LIMIT $3`,
    [unitId, learnerId, limit],
  );
  return rows.map(toVocabItem);
}

export async function getNewSentences(
  learnerId: number,
  courseId: number,
  limit: number,
): Promise<SentenceItem[]> {
  const rows = await query<SentenceDbRow>(
    `SELECT s.id, s.arabizi_sentence, s.english_translation
     FROM sentence s
     WHERE s.course_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM srs_state st
         WHERE st.learner_id = $2 AND st.item_type = 'sentence' AND st.item_id = s.id
       )
     ORDER BY (s.tier = 'normal') DESC, s.id ASC
     LIMIT $3`,
    [courseId, learnerId, limit],
  );
  return rows.map(toSentenceItem);
}

export async function getNewConjugations(
  learnerId: number,
  courseId: number,
  limit: number,
): Promise<ConjugationItem[]> {
  const rows = await query<ConjugationDbRow>(
    `SELECT c.* FROM conjugation c
     WHERE c.course_id = $1 AND c.vocab_id IS NOT NULL
       AND c.vocab_id IN (
         SELECT item_id FROM srs_state
         WHERE learner_id = $2 AND item_type = 'vocab' AND state <> 'new'
       )
       AND NOT EXISTS (
         SELECT 1 FROM srs_state st
         WHERE st.learner_id = $2 AND st.item_type = 'conjugation' AND st.item_id = c.id
       )
     ORDER BY c.id ASC
     LIMIT $3`,
    [courseId, learnerId, limit],
  );
  return rows.map(toConjugationItem);
}

export async function getDistractorPool(courseId: number, limit: number): Promise<VocabItem[]> {
  const rows = await query<VocabDbRow>(
    `SELECT id, arabizi_word, primary_gloss, accepted_answers, is_verb, is_phrase, length_bucket
     FROM vocab WHERE course_id = $1 AND is_phrase = false ORDER BY freq_rank ASC LIMIT $2`,
    [courseId, limit],
  );
  return rows.map(toVocabItem);
}

export async function getWordBankDistractorTokens(courseId: number): Promise<string[]> {
  const rows = await query<{ arabizi_word: string }>(
    `SELECT arabizi_word FROM vocab
     WHERE course_id = $1 AND is_phrase = false AND length_bucket IN ('1-3','4-5')
     ORDER BY freq_rank ASC LIMIT 40`,
    [courseId],
  );
  return rows.map((r) => r.arabizi_word);
}
```

- [ ] **Step 3: Course-scope `getDueReviews` + `getWordsLearned`**

```ts
export async function getDueReviews(
  learnerId: number,
  courseId: number,
  today: string,
  limit: number,
): Promise<DueReview[]> {
  const srsRows = await query<SrsDbRow>(
    `SELECT ${SRS_COLUMNS}
     FROM srs_state
     WHERE learner_id = $1 AND course_id = $2 AND state <> 'new' AND due_at <= $3
     ORDER BY due_at ASC, ease ASC
     LIMIT $4`,
    [learnerId, courseId, today, limit],
  );

  const vocabIds = srsRows.filter((r) => r.item_type === 'vocab').map((r) => r.item_id);
  const sentenceIds = srsRows.filter((r) => r.item_type === 'sentence').map((r) => r.item_id);
  const conjIds = srsRows.filter((r) => r.item_type === 'conjugation').map((r) => r.item_id);

  const vocabById = new Map<number, VocabItem>();
  if (vocabIds.length > 0) {
    const rows = await query<VocabDbRow>(
      `SELECT id, arabizi_word, primary_gloss, accepted_answers, is_verb, is_phrase, length_bucket
       FROM vocab WHERE id = ANY($1)`,
      [vocabIds],
    );
    for (const r of rows) vocabById.set(r.id, toVocabItem(r));
  }

  const sentenceById = new Map<number, SentenceItem>();
  if (sentenceIds.length > 0) {
    const rows = await query<SentenceDbRow>(
      `SELECT id, arabizi_sentence, english_translation FROM sentence WHERE id = ANY($1)`,
      [sentenceIds],
    );
    for (const r of rows) sentenceById.set(r.id, toSentenceItem(r));
  }

  const conjById = new Map<number, ConjugationItem>();
  if (conjIds.length > 0) {
    const rows = await query<ConjugationDbRow>(`SELECT * FROM conjugation WHERE id = ANY($1)`, [conjIds]);
    for (const r of rows) conjById.set(r.id, toConjugationItem(r));
  }

  return srsRows.map((r) => {
    const state = toSrsState(r);
    if (r.item_type === 'vocab') return { state, vocab: vocabById.get(r.item_id) };
    if (r.item_type === 'sentence') return { state, sentence: sentenceById.get(r.item_id) };
    const person =
      CONJUGATION_PERSONS[hashString(`${String(r.item_id)}:${today}`) % CONJUGATION_PERSONS.length];
    return { state, conjugation: conjById.get(r.item_id), person };
  });
}

export async function getWordsLearned(learnerId: number, courseId: number): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(DISTINCT item_id)::int AS n FROM srs_state
     WHERE learner_id = $1 AND course_id = $2 AND item_type = 'vocab' AND state <> 'new'`,
    [learnerId, courseId],
  );
  return rows[0]?.n ?? 0;
}
```

- [ ] **Step 4: Add the course model functions (append to `src/db/repo.ts`)**

```ts
export interface CourseRow {
  id: number;
  code: string;
  name: string;
  native_name: string;
  emoji: string;
}

export async function getCourses(): Promise<CourseRow[]> {
  return query<CourseRow>(
    `SELECT id, code, name, native_name, emoji FROM course ORDER BY id ASC`,
  );
}

export async function getCourseById(courseId: number): Promise<CourseRow | null> {
  const rows = await query<CourseRow>(
    `SELECT id, code, name, native_name, emoji FROM course WHERE id = $1`,
    [courseId],
  );
  return rows[0] ?? null;
}

export async function getLearnerCourses(
  learnerId: number,
): Promise<(CourseRow & { xp_total: number; started: boolean })[]> {
  return query<CourseRow & { xp_total: number; started: boolean }>(
    `SELECT c.id, c.code, c.name, c.native_name, c.emoji,
            COALESCE(lc.xp_total, 0) AS xp_total,
            (lc.learner_id IS NOT NULL) AS started
     FROM course c
     LEFT JOIN learner_course lc ON lc.course_id = c.id AND lc.learner_id = $1
     ORDER BY c.id ASC`,
    [learnerId],
  );
}

export async function getActiveCourseId(learnerId: number): Promise<number | null> {
  const rows = await query<{ active_course_id: number | null }>(
    `SELECT active_course_id FROM learner WHERE id = $1`,
    [learnerId],
  );
  return rows[0]?.active_course_id ?? null;
}

export async function setActiveCourse(learnerId: number, courseId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE learner SET active_course_id = $2 WHERE id = $1`, [learnerId, courseId]);
    await client.query(
      `INSERT INTO learner_course (learner_id, course_id, last_active_at)
       VALUES ($1, $2, now())
       ON CONFLICT (learner_id, course_id) DO UPDATE SET last_active_at = now()`,
      [learnerId, courseId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Typecheck (errors should now be confined to API routes / seed / smoke)**

Run: `npm run typecheck`
Expected: FAIL only in `src/app/api/**` (Tasks 9-10), `scripts/seed.ts` (Task 8), and `scripts/smoke.mjs` (Task 16, `.mjs` not typechecked). No remaining reference to `LEARNER_ID` anywhere: `grep -rn "LEARNER_ID" src/` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add src/db/repo.ts
git commit -m "feat: course-scope content repo readers + course/learner_course repo functions"
```

---

## Task 8: Generalize seeding to N courses (preserving the legacy single-course contract)

**Files:**
- Modify: `src/lib/seed-plan.ts`
- Modify: `src/lib/seed-plan.test.ts` (if present; otherwise create)
- Modify: `scripts/seed.ts`

**Interfaces:**
- Consumes: `buildSeedPlan` (Phase 1 pure fn), `getCourses`-style upsert done inline in `scripts/seed.ts`.
- Produces (pure): `buildSeedPlan(course: CourseSeedMeta, vocabText, sentencesText, conjugationsText): SeedPlan` where `CourseSeedMeta = { code: string; name: string; nativeName: string; emoji: string }`; the returned `SeedPlan` is unchanged in shape (`units`/`vocab`/`sentences`/`conjugations`) but the function now also echoes `course: CourseSeedMeta` back on the plan so `scripts/seed.ts` can upsert the course row. Everything else about ranking/unit-building is byte-for-byte identical to Phase 1 (course metadata does not affect ordering).
- Produces (runtime, `scripts/seed.ts`): for each course, upserts the `course` row, then seeds its units/vocab/sentences/conjugations **scoped by `course_id`** with `ON CONFLICT (course_id, <natural key>)`. Legacy `VOCAB_CSV_PATH`/`SENTENCES_CSV_PATH`/`CONJUGATIONS_CSV_PATH` seed the built-in `ar-leb` course; `COURSES_DIR_PATH/<code>/{vocab,sentences,conjugations}.csv` (+ optional `course.json`) seed additional courses.

- [ ] **Step 1: Write/adjust the `buildSeedPlan` test to require course metadata**

```ts
// src/lib/seed-plan.test.ts  (add this test; keep existing ones, updating call sites)
import { describe, expect, it } from 'vitest';
import { buildSeedPlan } from './seed-plan';

const VOCAB = 'arabizi_word,english_translation\nbi,in\nana,I\n';
const SENTENCES = 'arabizi_sentence,english_translation\nana bi,I am in\n';
const CONJ =
  'base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne\n' +
  'raye7,to go,raye7,rey7in,raye7,ray7a,ray7in,raye7,ray7a,ray7in\n';

const COURSE = { code: 'ar-leb', name: 'Lebanese Arabic', nativeName: 'اللبناني', emoji: '🇱🇧' };

describe('buildSeedPlan (course-aware)', () => {
  it('echoes the course metadata onto the plan', () => {
    const plan = buildSeedPlan(COURSE, VOCAB, SENTENCES, CONJ);
    expect(plan.course).toEqual(COURSE);
  });

  it('still ranks and builds units deterministically regardless of course', () => {
    const a = buildSeedPlan(COURSE, VOCAB, SENTENCES, CONJ);
    const b = buildSeedPlan({ ...COURSE, code: 'fr' }, VOCAB, SENTENCES, CONJ);
    expect(a.units).toEqual(b.units);
    expect(a.vocab).toEqual(b.vocab);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/seed-plan.test.ts`
Expected: FAIL — `buildSeedPlan` currently takes 3 args, no `course` on the plan.

- [ ] **Step 3: Update `buildSeedPlan` to take + echo course metadata**

```ts
// src/lib/seed-plan.ts
import {
  parseConjugationsCsv,
  parseSentencesCsv,
  parseVocabCsv,
  type ConjugationRow,
} from './csv';
import { buildUnits, rankVocab, tokenizeSentence, type RankedVocab, type UnitPlan } from './units';

export interface CourseSeedMeta {
  code: string;
  name: string;
  nativeName: string;
  emoji: string;
}

export interface SeedVocab extends RankedVocab {
  unitOrdinal: number;
  unitOrder: number;
}

export interface SeedSentence {
  arabiziSentence: string;
  englishTranslation: string;
  wordCount: number;
  tier: 'normal' | 'advanced';
}

export type SeedConjugation = ConjugationRow;

export interface SeedPlan {
  course: CourseSeedMeta;
  units: UnitPlan[];
  vocab: SeedVocab[];
  sentences: SeedSentence[];
  conjugations: SeedConjugation[];
}

export function buildSeedPlan(
  course: CourseSeedMeta,
  vocabText: string,
  sentencesText: string,
  conjugationsText: string,
): SeedPlan {
  const vocabRows = parseVocabCsv(vocabText);
  const sentenceRows = parseSentencesCsv(sentencesText);
  const conjugationRows = parseConjugationsCsv(conjugationsText);

  const ranked = rankVocab(vocabRows, sentenceRows);
  const { units, vocabUnit } = buildUnits(ranked);

  const vocab: SeedVocab[] = ranked.map((r) => {
    const assignment = vocabUnit.get(r.arabiziWord);
    return {
      ...r,
      unitOrdinal: assignment?.ordinal ?? 1,
      unitOrder: assignment?.order ?? 0,
    };
  });

  const sentences: SeedSentence[] = sentenceRows.map((s) => {
    const wordCount = tokenizeSentence(s.arabiziSentence).length;
    return {
      arabiziSentence: s.arabiziSentence,
      englishTranslation: s.englishTranslation,
      wordCount,
      tier: wordCount >= 16 ? 'advanced' : 'normal',
    };
  });

  return { course, units, vocab, sentences, conjugations: conjugationRows };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/seed-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `scripts/seed.ts` for multi-course + legacy compat**

```ts
// scripts/seed.ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { buildSeedPlan, type CourseSeedMeta, type SeedPlan } from '../src/lib/seed-plan';
import { pool } from '../src/db/pool';

const AR_LEB: CourseSeedMeta = {
  code: 'ar-leb',
  name: 'Lebanese Arabic',
  nativeName: 'اللبناني',
  emoji: '🇱🇧',
};

interface CourseCsvPaths {
  meta: CourseSeedMeta;
  vocab: string;
  sentences: string;
  conjugations: string;
}

/** Legacy contract: the three env-var CSV paths seed the ar-leb course. */
function legacyCourse(): CourseCsvPaths | null {
  const vocab = process.env.VOCAB_CSV_PATH ?? './vocab.csv';
  const sentences = process.env.SENTENCES_CSV_PATH ?? './sentences.csv';
  const conjugations = process.env.CONJUGATIONS_CSV_PATH ?? './conjugations.csv';
  if (!existsSync(vocab) || !existsSync(sentences) || !existsSync(conjugations)) return null;
  return { meta: AR_LEB, vocab, sentences, conjugations };
}

/** Directory convention: <COURSES_DIR>/<code>/{vocab,sentences,conjugations}.csv (+ course.json). */
function directoryCourses(): CourseCsvPaths[] {
  const dir = process.env.COURSES_DIR_PATH ?? './courses';
  if (!existsSync(dir)) return [];
  const out: CourseCsvPaths[] = [];
  for (const entry of readdirSync(dir)) {
    const sub = join(dir, entry);
    if (!statSync(sub).isDirectory()) continue;
    const vocab = join(sub, 'vocab.csv');
    const sentences = join(sub, 'sentences.csv');
    const conjugations = join(sub, 'conjugations.csv');
    if (!existsSync(vocab) || !existsSync(sentences) || !existsSync(conjugations)) continue;
    let meta: CourseSeedMeta = { code: entry, name: entry, nativeName: entry, emoji: '🌐' };
    const metaPath = join(sub, 'course.json');
    if (existsSync(metaPath)) {
      const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<CourseSeedMeta>;
      meta = {
        code: parsed.code ?? entry,
        name: parsed.name ?? entry,
        nativeName: parsed.nativeName ?? entry,
        emoji: parsed.emoji ?? '🌐',
      };
    }
    out.push({ meta, vocab, sentences, conjugations });
  }
  return out;
}

/** De-dupe by course code; legacy ar-leb wins over a directory ar-leb (both are idempotent anyway). */
function collectCourses(): CourseCsvPaths[] {
  const byCode = new Map<string, CourseCsvPaths>();
  for (const c of directoryCourses()) byCode.set(c.meta.code, c);
  const legacy = legacyCourse();
  if (legacy) byCode.set(legacy.meta.code, legacy);
  return [...byCode.values()];
}

async function seedCourse(client: PoolClient, plan: SeedPlan): Promise<number> {
  const courseRows = await client.query<{ id: number }>(
    `INSERT INTO course (code, name, native_name, emoji)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name, native_name = EXCLUDED.native_name, emoji = EXCLUDED.emoji
     RETURNING id`,
    [plan.course.code, plan.course.name, plan.course.nativeName, plan.course.emoji],
  );
  const courseId = courseRows.rows[0]?.id;
  if (courseId === undefined) throw new Error(`course upsert failed for ${plan.course.code}`);

  for (const u of plan.units) {
    await client.query(
      `INSERT INTO unit (course_id, ordinal, title, description, theme_color)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (course_id, ordinal) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, theme_color = EXCLUDED.theme_color`,
      [courseId, u.ordinal, u.title, u.description, u.themeColor],
    );
  }

  for (const v of plan.vocab) {
    await client.query(
      `INSERT INTO vocab
         (course_id, arabizi_word, english_translation, primary_gloss, accepted_answers,
          is_verb, is_phrase, length_bucket, sentence_freq, freq_rank, unit_id, unit_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               (SELECT id FROM unit WHERE course_id = $1 AND ordinal = $11), $12)
       ON CONFLICT (course_id, arabizi_word) DO UPDATE SET
         english_translation = EXCLUDED.english_translation,
         primary_gloss = EXCLUDED.primary_gloss,
         accepted_answers = EXCLUDED.accepted_answers,
         is_verb = EXCLUDED.is_verb, is_phrase = EXCLUDED.is_phrase,
         length_bucket = EXCLUDED.length_bucket, sentence_freq = EXCLUDED.sentence_freq,
         freq_rank = EXCLUDED.freq_rank, unit_id = EXCLUDED.unit_id,
         unit_order = EXCLUDED.unit_order`,
      [
        courseId, v.arabiziWord, v.englishTranslation, v.primaryGloss, v.acceptedAnswers,
        v.isVerb, v.isPhrase, v.lengthBucket, v.sentenceFreq, v.freqRank, v.unitOrdinal, v.unitOrder,
      ],
    );
  }

  for (const s of plan.sentences) {
    await client.query(
      `INSERT INTO sentence (course_id, arabizi_sentence, english_translation, word_count, tier)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (course_id, arabizi_sentence) DO UPDATE SET
         english_translation = EXCLUDED.english_translation,
         word_count = EXCLUDED.word_count, tier = EXCLUDED.tier`,
      [courseId, s.arabiziSentence, s.englishTranslation, s.wordCount, s.tier],
    );
  }

  for (const c of plan.conjugations) {
    await client.query(
      `INSERT INTO conjugation
         (course_id, base_verb, english_meaning, ana, ni7na, inta, inte, "into", huwe, hiyye, hinne, vocab_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               (SELECT id FROM vocab WHERE course_id = $1 AND arabizi_word = $2))
       ON CONFLICT (course_id, base_verb) DO UPDATE SET
         english_meaning = EXCLUDED.english_meaning,
         ana = EXCLUDED.ana, ni7na = EXCLUDED.ni7na, inta = EXCLUDED.inta,
         inte = EXCLUDED.inte, "into" = EXCLUDED."into", huwe = EXCLUDED.huwe,
         hiyye = EXCLUDED.hiyye, hinne = EXCLUDED.hinne, vocab_id = EXCLUDED.vocab_id`,
      [courseId, c.baseVerb, c.englishMeaning, c.ana, c.ni7na, c.inta, c.inte, c.into, c.huwe, c.hiyye, c.hinne],
    );
  }

  return courseId;
}

async function maybeSeedSmokeLearner(client: PoolClient): Promise<void> {
  if (process.env.SEED_SMOKE_LEARNER !== '1') return;
  // Deterministic dev learner for scripts/smoke.mjs; sub matches Dex 'alice'.
  await client.query(
    `INSERT INTO learner (name, oidc_sub, email, display_name, active_course_id)
     VALUES ('alice', 'u-alice-0001', 'alice@franca.test', 'alice',
             (SELECT id FROM course WHERE code = 'ar-leb'))
     ON CONFLICT (oidc_sub) WHERE oidc_sub IS NOT NULL DO NOTHING`,
  );
}

async function main(): Promise<void> {
  const courses = collectCourses();
  if (courses.length === 0) throw new Error('no course CSVs found (legacy env vars or COURSES_DIR)');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary: string[] = [];
    for (const c of courses) {
      const plan = buildSeedPlan(
        c.meta,
        readFileSync(c.vocab, 'utf8'),
        readFileSync(c.sentences, 'utf8'),
        readFileSync(c.conjugations, 'utf8'),
      );
      await seedCourse(client, plan);
      summary.push(
        `${plan.course.code}: ${String(plan.units.length)}u/${String(plan.vocab.length)}v/` +
          `${String(plan.sentences.length)}s/${String(plan.conjugations.length)}c`,
      );
    }
    await maybeSeedSmokeLearner(client);

    await client.query(
      `INSERT INTO seed_meta (key, value, updated_at)
       VALUES ('last_seed', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [summary.join(' | ')],
    );

    await client.query('COMMIT');
    console.log(`Seed complete: ${summary.join(' | ')}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify a clean migrate + seed produces the ar-leb course from legacy CSVs**

Run:
```bash
docker compose down -v && docker compose up -d db && sleep 5
DATABASE_URL=postgres://franca:franca@localhost:5432/franca npx tsx scripts/migrate.ts
DATABASE_URL=postgres://franca:franca@localhost:5432/franca \
  VOCAB_CSV_PATH=./vocab.csv SENTENCES_CSV_PATH=./sentences.csv CONJUGATIONS_CSV_PATH=./conjugations.csv \
  COURSES_DIR_PATH=./courses SEED_SMOKE_LEARNER=1 npx tsx scripts/seed.ts
# idempotency:
DATABASE_URL=postgres://franca:franca@localhost:5432/franca \
  VOCAB_CSV_PATH=./vocab.csv SENTENCES_CSV_PATH=./sentences.csv CONJUGATIONS_CSV_PATH=./conjugations.csv \
  COURSES_DIR_PATH=./courses npx tsx scripts/seed.ts
docker exec -i franca-db psql -U franca -d franca -c \
  "SELECT c.code, count(DISTINCT u.id) units, count(DISTINCT v.id) vocab FROM course c LEFT JOIN unit u ON u.course_id=c.id LEFT JOIN vocab v ON v.course_id=c.id GROUP BY c.code; SELECT oidc_sub FROM learner WHERE oidc_sub='u-alice-0001';"
```
Expected: one `ar-leb` course with the Phase 1 unit/vocab counts; the smoke learner exists; re-seeding does not change counts (idempotent).

- [ ] **Step 7: Run the full unit suite (ensure no pure-lib regression)**

Run: `npm test`
Expected: PASS — all 94 pre-existing tests plus the new `migrations`/`seed-plan` tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/seed-plan.ts src/lib/seed-plan.test.ts scripts/seed.ts
git commit -m "feat: multi-course seeding with legacy single-course contract preserved"
```

---

## Task 9: Session + active-course scoping for `/api/path` and `/api/profile`

**Files:**
- Modify: `src/app/api/path/route.ts`
- Modify: `src/app/api/profile/route.ts`

**Interfaces:**
- Consumes: `getSessionLearnerId` (Task 4); `getLearner`, `getUnitsWithProgress`, `getActiveCourseId`, `getCourseById`, `getCourses` (Tasks 6-7); `getActivityCalendar`, `getWordsLearned`, `getLessonsCompleted`.
- Produces: `/api/path` returns `{ learner, units, activeUnitId, activeCourse: { id, code, name, native_name, emoji } }`, all scoped to the session learner + their active course; `401` JSON when unauthenticated.
- Produces: `/api/profile` returns per-course words/lessons and global streak/XP; adds `activeCourse` + `courseXpTotal` (per-course XP from `learner_course`).

- [ ] **Step 1: Rewrite `/api/path` route**

```ts
// src/app/api/path/route.ts
import { NextResponse } from 'next/server';
import {
  getActiveCourseId,
  getCourseById,
  getLearner,
  getUnitsWithProgress,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date().toISOString();
  const learner = await getLearner(learnerId, now);
  const courseId = learner.active_course_id ?? (await getActiveCourseId(learnerId));
  if (courseId === null) return NextResponse.json({ error: 'no active course' }, { status: 409 });

  const [course, units] = await Promise.all([
    getCourseById(courseId),
    getUnitsWithProgress(learnerId, courseId),
  ]);
  const activeUnit = units.find((u) => u.lessons_completed === 0) ?? units[units.length - 1];

  return NextResponse.json({
    learner: {
      xpTotal: learner.xp_total,
      gems: learner.gems,
      hearts: learner.hearts,
      streak: learner.streak_count,
      dailyGoalXp: learner.daily_goal_xp,
      displayName: learner.display_name ?? learner.name,
      picture: learner.picture,
    },
    activeCourse: course,
    units,
    activeUnitId: activeUnit?.id ?? null,
  });
}
```

- [ ] **Step 2: Rewrite `/api/profile` route**

```ts
// src/app/api/profile/route.ts
import { NextResponse } from 'next/server';
import {
  getActiveCourseId,
  getActivityCalendar,
  getCourseById,
  getLearner,
  getLearnerCourses,
  getLessonsCompleted,
  getWordsLearned,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const learner = await getLearner(learnerId, now);
  const courseId = learner.active_course_id ?? (await getActiveCourseId(learnerId));
  if (courseId === null) return NextResponse.json({ error: 'no active course' }, { status: 409 });

  const [course, wordsLearned, lessonsCompleted, calendar, learnerCourses] = await Promise.all([
    getCourseById(courseId),
    getWordsLearned(learnerId, courseId),
    getLessonsCompleted(learnerId, courseId),
    getActivityCalendar(learnerId),
    getLearnerCourses(learnerId),
  ]);
  const xpToday = calendar.find((d) => d.date === today)?.xp ?? 0;
  const courseXpTotal = learnerCourses.find((c) => c.id === courseId)?.xp_total ?? 0;

  return NextResponse.json({
    name: learner.display_name ?? learner.name,
    picture: learner.picture,
    xpTotal: learner.xp_total,
    courseXpTotal,
    gems: learner.gems,
    hearts: learner.hearts,
    streak: learner.streak_count,
    longestStreak: learner.longest_streak,
    dailyGoalXp: learner.daily_goal_xp,
    xpToday,
    wordsLearned,
    lessonsCompleted,
    activeCourse: course,
    calendar,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: remaining errors only in `/api/lesson`, `/api/answer`, `/api/lesson/complete` (Task 10). `/api/path` and `/api/profile` compile.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/path/route.ts src/app/api/profile/route.ts
git commit -m "feat: scope /api/path and /api/profile to session learner + active course"
```

---

## Task 10: Session + course scoping for `/api/lesson`, `/api/answer`, `/api/lesson/complete`

**Files:**
- Modify: `src/app/api/lesson/route.ts`
- Modify: `src/app/api/answer/route.ts`
- Modify: `src/app/api/lesson/complete/route.ts`
- Modify: `src/hooks/useLessonSession.ts` (add `courseId` to the complete POST body)

**Interfaces:**
- Consumes: `getSessionLearnerId`; the course-scoped repo readers (Task 7); `getLearner`, `getSrsState`, `upsertSrsState`, `deductHeart`, `createLessonSession`, `completeLesson` (Task 6).
- Produces: `/api/lesson?unitId=` derives learner + active course from the session, verifies the requested unit belongs to that course, and stamps `courseId` into `createLessonSession`. The `LessonPlan` returned to the client gains **`courseId: number`** (added at the route boundary via spread — the pure `LessonPlan` type in `src/lib/types.ts` is **not** changed; the route returns `{ ...plan, courseId }`).
- Produces: `/api/answer` derives learner + active course; persists SRS scoped to `(learnerId, courseId)`. Request body unchanged (client already sends `itemId`/`itemType`/`direction`).
- Produces: `/api/lesson/complete` derives learner from session and reads `courseId` from the POST body (client sends it); threads both into `completeLesson`, per-course XP, and the requeue due-date pull-in.
- `useLessonSession` complete POST body gains `courseId: plan.courseId`.

- [ ] **Step 1: Rewrite `/api/lesson` route (session + active course)**

```ts
// src/app/api/lesson/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  createLessonSession,
  getActiveCourseId,
  getDistractorPool,
  getDueReviews,
  getNewConjugations,
  getNewSentences,
  getNewVocabForUnit,
  getUnitsWithProgress,
  getWordBankDistractorTokens,
  getWordsLearned,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';
import { buildLessonPlan } from '@/lib/lesson-service';
import {
  REVIEW_BUDGET,
  MAX_NEW,
  NEW_CONJUGATIONS_PER_LESSON,
  NEW_SENTENCES_PER_LESSON,
} from '@/lib/config';
import { hashString } from '@/lib/hash';
import { mulberry32 } from '@/lib/rng';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const unitId = Number(req.nextUrl.searchParams.get('unitId'));
  if (!Number.isFinite(unitId) || unitId <= 0) {
    return NextResponse.json({ error: 'unitId required' }, { status: 400 });
  }

  const courseId = await getActiveCourseId(learnerId);
  if (courseId === null) return NextResponse.json({ error: 'no active course' }, { status: 409 });

  const today = new Date().toISOString().slice(0, 10);
  const units = await getUnitsWithProgress(learnerId, courseId);
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return NextResponse.json({ error: 'unknown unit' }, { status: 404 });

  const [
    dueReviews,
    newVocab,
    distractorPool,
    wordBankDistractors,
    newSentences,
    newConjugations,
    learnedVocabCount,
  ] = await Promise.all([
    getDueReviews(learnerId, courseId, today, REVIEW_BUDGET + 5),
    getNewVocabForUnit(learnerId, unitId, MAX_NEW),
    getDistractorPool(courseId, 300),
    getWordBankDistractorTokens(courseId),
    getNewSentences(learnerId, courseId, NEW_SENTENCES_PER_LESSON),
    getNewConjugations(learnerId, courseId, NEW_CONJUGATIONS_PER_LESSON),
    getWordsLearned(learnerId, courseId),
  ]);

  const sessionId = randomUUID();
  const rng = mulberry32(hashString(sessionId + today));
  const plan = buildLessonPlan(
    {
      sessionId,
      unitId,
      unitTitle: unit.title,
      dueReviews,
      newVocab,
      newSentences,
      newConjugations,
      learnedVocabCount,
      distractorPool,
      wordBankDistractors,
    },
    today,
    rng,
  );

  if (plan.exercises.length === 0) {
    return NextResponse.json({ empty: true, message: 'nothing to learn right now' }, { status: 200 });
  }

  await createLessonSession(learnerId, courseId, sessionId, unitId);
  // Course id rides alongside the plan so the client can echo it back on complete.
  return NextResponse.json({ ...plan, courseId });
}
```

- [ ] **Step 2: Rewrite `/api/answer` route (session + course-scoped SRS)**

```ts
// src/app/api/answer/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { deductHeart, getActiveCourseId, getSrsState, upsertSrsState } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';
import { applyAnswerToSrs } from '@/lib/srs';
import { mulberry32 } from '@/lib/rng';
import { hashString } from '@/lib/hash';
import type { AnswerResult, Direction, ItemType, SrsState } from '@/lib/types';

interface AnswerBody {
  itemId: number;
  itemType: ItemType;
  direction: Direction;
  firstGradedForConcept: boolean;
  result: AnswerResult;
}

const PERSISTABLE_ITEM_TYPES: ReadonlySet<string> = new Set(['vocab', 'sentence', 'conjugation']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const courseId = await getActiveCourseId(learnerId);
  if (courseId === null) return NextResponse.json({ error: 'no active course' }, { status: 409 });

  const body = (await req.json()) as AnswerBody;
  const today = new Date().toISOString().slice(0, 10);

  let hearts: number | undefined;
  if (!body.result.correct) hearts = await deductHeart(learnerId);

  if (!PERSISTABLE_ITEM_TYPES.has(body.itemType)) {
    return NextResponse.json({ ok: true, hearts });
  }

  const priorState = await getSrsState(learnerId, body.itemId, body.itemType, body.direction);
  const existing: SrsState =
    priorState ?? {
      itemId: body.itemId,
      itemType: body.itemType,
      direction: body.direction,
      reps: 0,
      ease: 2.5,
      interval: 0,
      dueAt: null,
      lapses: 0,
      lastGrade: null,
      lastReviewedAt: null,
      state: 'new',
    };

  const firstGradedForConcept = priorState === null ? true : body.firstGradedForConcept;

  const rng = mulberry32(hashString(`${body.itemType}:${String(body.itemId)}:${today}`));
  const next = applyAnswerToSrs(existing, body.result, firstGradedForConcept, today, rng);
  await upsertSrsState(learnerId, courseId, next);
  return NextResponse.json({ ok: true, hearts });
}
```

- [ ] **Step 3: Rewrite `/api/lesson/complete` route (session learner + body courseId)**

```ts
// src/app/api/lesson/complete/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import {
  completeLesson,
  getLearner,
  getSrsState,
  getXpToday,
  upsertSrsState,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';
import { computeLessonScore, updateStreak } from '@/lib/scoring';
import { addDays } from '@/lib/srs';
import type { Direction, ItemType } from '@/lib/types';

interface CompleteBody {
  sessionId: string;
  unitId: number;
  courseId: number;
  numCorrect: number;
  numWrong: number;
  comboMax: number;
  requeuedConcepts: { itemId: number; itemType: ItemType; direction: Direction }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as CompleteBody;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (body.numCorrect + body.numWrong === 0) {
    return NextResponse.json({ error: 'empty lesson cannot be completed' }, { status: 400 });
  }

  const score = computeLessonScore({
    numCorrect: body.numCorrect,
    numWrong: body.numWrong,
    comboMax: body.comboMax,
  });
  const gemsEarned = 5 + (score.perfect ? 5 : 0);

  const learner = await getLearner(learnerId, now);
  const xpTodayBefore = await getXpToday(learnerId, today);
  const streak = updateStreak({
    lastCompletedDate: learner.last_completed_date,
    today,
    currentStreak: learner.streak_count,
    longestStreak: learner.longest_streak,
    streakFreezes: learner.streak_freezes,
    dailyGoalXp: learner.daily_goal_xp,
    xpTodayBefore,
    xpEarned: score.totalXp,
  });

  for (const c of body.requeuedConcepts) {
    const st = await getSrsState(learnerId, c.itemId, c.itemType, c.direction);
    if (st?.dueAt) {
      const tomorrow = addDays(today, 1);
      if (st.dueAt > tomorrow) await upsertSrsState(learnerId, body.courseId, { ...st, dueAt: tomorrow });
    }
  }

  const result = await completeLesson({
    learnerId,
    courseId: body.courseId,
    sessionId: body.sessionId,
    unitId: body.unitId,
    today,
    xpEarned: score.totalXp,
    gemsEarned,
    accuracy: score.accuracy,
    comboMax: body.comboMax,
    perfect: score.perfect,
    numCorrect: body.numCorrect,
    numWrong: body.numWrong,
    newStreak: streak.extendedToday ? streak.streak : learner.streak_count,
    longestStreak: streak.longestStreak,
    streakFreezes: streak.streakFreezesRemaining,
    lastCompletedDate: streak.extendedToday ? today : learner.last_completed_date,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'lesson session not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'lesson session already completed' }, { status: 409 });
  }

  return NextResponse.json({ score, streak, gemsEarned });
}
```

- [ ] **Step 4: Thread `courseId` from the plan into the client's complete POST**

In `src/hooks/useLessonSession.ts`, the hook receives `plan: LessonPlan`. Because the route now returns `{ ...plan, courseId }`, extend the local plan type the hook accepts and include `courseId` in the body. Change the `useLessonSession` parameter type and the complete `fetch` body:

```ts
// src/hooks/useLessonSession.ts — parameter type (top of function signature)
export function useLessonSession(plan: LessonPlan & { courseId: number }): {
```

```ts
// src/hooks/useLessonSession.ts — inside cont(), the complete POST body
        body: JSON.stringify({
          sessionId: plan.sessionId,
          unitId: plan.unitId,
          courseId: plan.courseId,
          numCorrect: state.numCorrect,
          numWrong: state.numWrong,
          comboMax: state.comboMax,
          requeuedConcepts: extractRequeuedConcepts(state),
        }),
```

- [ ] **Step 5: Update `LessonClient` to carry `courseId` on the plan**

In `src/app/lesson/[unitId]/LessonClient.tsx`, the `LoadState` `ready` variant and `LessonRunner` prop become `LessonPlan & { courseId: number }`. Update the two type annotations:

```ts
// src/app/lesson/[unitId]/LessonClient.tsx — LoadState
type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; plan: LessonPlan & { courseId: number } };
```

```ts
// the fetch .then cast
        return (await r.json()) as (LessonPlan & { courseId: number }) | { empty: true };
```

```tsx
// LessonRunner signature
function LessonRunner({ plan }: { plan: LessonPlan & { courseId: number } }): React.JSX.Element {
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. All API routes compile; the client threads `courseId`.

- [ ] **Step 7: End-to-end manual verification (authenticated)**

Run: `docker compose up --build`, log in as `alice`, open a unit, answer through a lesson, complete it. Confirm the results screen shows XP, and:
```bash
docker exec -i franca-db psql -U franca -d franca -c \
 "SELECT l.oidc_sub, lc.xp_total AS course_xp, l.xp_total AS global_xp, l.streak_count FROM learner l JOIN learner_course lc ON lc.learner_id=l.id WHERE l.oidc_sub='u-alice-0001';"
```
Expected: `course_xp` and `global_xp` both incremented by the lesson XP; `streak_count` reflects the completion.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/lesson/route.ts src/app/api/answer/route.ts src/app/api/lesson/complete/route.ts src/hooks/useLessonSession.ts src/app/lesson/\[unitId\]/LessonClient.tsx
git commit -m "feat: scope lesson/answer/complete to session learner + active course"
```

---

## Task 11: Course list + set-active-course API endpoints

**Files:**
- Create: `src/app/api/courses/route.ts`
- Create: `src/app/api/course/route.ts`

**Interfaces:**
- Consumes: `getSessionLearnerId`; `getLearnerCourses`, `getActiveCourseId`, `setActiveCourse`, `getCourseById` (Task 7).
- Produces: `GET /api/courses` → `{ activeCourseId: number | null; courses: { id, code, name, native_name, emoji, xp_total, started }[] }`.
- Produces: `POST /api/course` with body `{ courseId: number }` → validates the course exists, calls `setActiveCourse`, returns `{ ok: true, activeCourseId }`; `400` for a bad/missing id, `404` for an unknown course.

- [ ] **Step 1: Write `GET /api/courses`**

```ts
// src/app/api/courses/route.ts
import { NextResponse } from 'next/server';
import { getActiveCourseId, getLearnerCourses } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [activeCourseId, courses] = await Promise.all([
    getActiveCourseId(learnerId),
    getLearnerCourses(learnerId),
  ]);
  return NextResponse.json({ activeCourseId, courses });
}
```

- [ ] **Step 2: Write `POST /api/course`**

```ts
// src/app/api/course/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getCourseById, setActiveCourse } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

interface SetCourseBody {
  courseId: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as Partial<SetCourseBody>;
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }

  const course = await getCourseById(courseId);
  if (!course) return NextResponse.json({ error: 'unknown course' }, { status: 404 });

  await setActiveCourse(learnerId, courseId);
  return NextResponse.json({ ok: true, activeCourseId: courseId });
}
```

- [ ] **Step 3: Typecheck + verify (authenticated, via the running stack)**

Run (with the stack up and a session cookie from a browser login, or defer full verification to Task 16's smoke run):
```bash
npm run typecheck
```
Expected: PASS. Manual: in the browser dev console while logged in, `await (await fetch('/api/courses')).json()` returns the ar-leb course with `started:true` and the active id.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/courses/route.ts src/app/api/course/route.ts
git commit -m "feat: /api/courses (list) + /api/course (set active) endpoints"
```

---

## Task 12: User menu + sign-out, and course picker in the TopBar

**Files:**
- Create: `src/components/UserMenu.tsx`
- Create: `src/components/CourseMenu.tsx`
- Modify: `src/components/TopBar.tsx`

**Interfaces:**
- Consumes: `signOut` server action from `src/auth.ts`; `GET /api/courses` + `POST /api/course` (Task 11).
- Produces: `TopBar` gains optional props `displayName?: string`, `picture?: string | null`, and renders a `CourseMenu` (flag button that opens a dropdown of courses; selecting one POSTs `/api/course` then reloads) and a `UserMenu` (avatar/initial that reveals a sign-out button). `TopBar`'s existing streak/gems/hearts props are unchanged. This is a UI task — verify by interaction, not unit tests.

- [ ] **Step 1: Write the sign-out `UserMenu` (client + server action)**

```tsx
// src/components/UserMenu.tsx
'use client';
import { useState } from 'react';

export function UserMenu({
  displayName,
  picture,
}: {
  displayName: string;
  picture: string | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-green text-lg font-black text-white"
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border-2 border-swan bg-white p-2 shadow-lg">
          <p className="px-3 py-2 text-sm font-extrabold text-eel">{displayName}</p>
          {/* Server Action form: CSRF-safe by construction on Next 15. */}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full touch-manipulation rounded-xl px-3 py-2 text-left text-sm font-extrabold text-red hover:bg-red-light"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
```

> Note: `/api/auth/signout` is Auth.js's built-in POST sign-out endpoint (it renders/handles a CSRF-tokened form). Using the native endpoint keeps the component a pure client component without importing the `signOut` server action into client code. Auth.js's signout page confirms then clears the session cookie and redirects to `/` (which middleware then bounces to sign-in).

- [ ] **Step 2: Write the `CourseMenu`**

```tsx
// src/components/CourseMenu.tsx
'use client';
import { useEffect, useState } from 'react';

interface CourseOption {
  id: number;
  code: string;
  name: string;
  native_name: string;
  emoji: string;
  xp_total: number;
  started: boolean;
}

export function CourseMenu({ activeEmoji }: { activeEmoji: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || courses !== null) return;
    void fetch('/api/courses')
      .then((r) => r.json() as Promise<{ activeCourseId: number | null; courses: CourseOption[] }>)
      .then((d) => {
        setCourses(d.courses);
        setActiveId(d.activeCourseId);
      })
      .catch(() => {
        setCourses([]);
      });
  }, [open, courses]);

  function choose(id: number): void {
    void fetch('/api/course', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ courseId: id }),
    })
      .then(() => {
        // Reload so the whole path/profile re-fetches under the new course.
        window.location.href = '/';
      })
      .catch(() => {
        setOpen(false);
      });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose course"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-2xl border-2 border-swan px-2 text-2xl"
      >
        {activeEmoji}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border-2 border-swan bg-white p-2 shadow-lg">
          {courses === null ? (
            <p className="px-3 py-2 text-sm font-bold text-hare">Loading…</p>
          ) : (
            courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  choose(c.id);
                }}
                className={`flex w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left ${
                  c.id === activeId ? 'bg-green-light' : 'hover:bg-subtle'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {c.emoji}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-extrabold text-eel">{c.name}</span>
                  <span className="block text-xs font-bold text-hare">{c.native_name}</span>
                </span>
                {c.started ? (
                  <span className="text-xs font-extrabold text-orange">{c.xp_total} XP</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Extend `TopBar` to render both menus**

```tsx
// src/components/TopBar.tsx
import { FlameIcon, GemIcon, HeartIcon } from './icons';
import { CourseMenu } from './CourseMenu';
import { UserMenu } from './UserMenu';

export function TopBar({
  streak,
  gems,
  hearts,
  displayName,
  picture,
  courseEmoji,
}: {
  streak: number;
  gems: number;
  hearts: number;
  displayName?: string;
  picture?: string | null;
  courseEmoji?: string;
}): React.JSX.Element {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-swan bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] font-extrabold text-eel">
      <span className="text-xl font-black text-green">Franca</span>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <FlameIcon /> <span style={{ color: '#FF9600' }}>{streak}</span>
        </span>
        <span className="flex items-center gap-1">
          <GemIcon /> <span style={{ color: '#1CB0F6' }}>{gems}</span>
        </span>
        <span className="flex items-center gap-1">
          <HeartIcon /> <span style={{ color: '#FF4B4B' }}>{hearts}</span>
        </span>
        {courseEmoji ? <CourseMenu activeEmoji={courseEmoji} /> : null}
        {displayName ? <UserMenu displayName={displayName} picture={picture ?? null} /> : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Pass the new props from the home page**

In `src/app/page.tsx`, extend the `PathData` interface and the `TopBar` usage:

```ts
// PathData interface — add fields returned by /api/path (Task 9)
interface PathData {
  learner: {
    xpTotal: number; gems: number; hearts: number; streak: number; dailyGoalXp: number;
    displayName: string; picture: string | null;
  };
  activeCourse: { id: number; code: string; name: string; native_name: string; emoji: string } | null;
  units: UnitRow[];
  activeUnitId: number | null;
}
```

```tsx
// TopBar usage in page.tsx
      <TopBar
        streak={data.learner.streak}
        gems={data.learner.gems}
        hearts={data.learner.hearts}
        displayName={data.learner.displayName}
        picture={data.learner.picture}
        courseEmoji={data.activeCourse?.emoji}
      />
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Manual verification**

With the stack up and logged in as `alice`: the TopBar shows the 🇱🇧 flag and an avatar. Clicking the flag lists "Lebanese Arabic" (marked active). Clicking the avatar reveals "Sign out"; clicking it clears the session and redirects to the Dex login.

- [ ] **Step 7: Commit**

```bash
git add src/components/UserMenu.tsx src/components/CourseMenu.tsx src/components/TopBar.tsx src/app/page.tsx
git commit -m "feat: TopBar user menu (sign out) + course picker"
```

---

## Task 13: Course-aware profile page

**Files:**
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: `/api/profile` (Task 9), now returning `activeCourse`, `courseXpTotal`, `picture`.
- Produces: the profile shows the active course name + native name, per-course XP (in addition to the global lifetime XP), and the learner's OIDC display name/avatar. UI task — verify by interaction.

- [ ] **Step 1: Extend the `Profile` interface and header**

In `src/app/profile/page.tsx`, extend the interface:

```ts
interface Profile {
  name: string;
  picture: string | null;
  xpTotal: number;
  courseXpTotal: number;
  streak: number;
  longestStreak: number;
  dailyGoalXp: number;
  xpToday: number;
  wordsLearned: number;
  lessonsCompleted: number;
  activeCourse: { id: number; code: string; name: string; native_name: string; emoji: string } | null;
  calendar: { date: string; xp: number }[];
}
```

- [ ] **Step 2: Render the avatar, active course, and per-course XP**

Replace the header block and the stat chips:

```tsx
      <div className="flex items-center gap-4">
        {p.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="text-5xl" aria-hidden>🌲</span>
        )}
        <div>
          <h1 className="text-2xl font-black text-eel">{p.name}</h1>
          {p.activeCourse ? (
            <p className="font-extrabold text-hare">
              {p.activeCourse.emoji} {p.activeCourse.name}
              <span className="ml-1 font-bold">({p.activeCourse.native_name})</span>
            </p>
          ) : null}
          <Link href="/" className="font-extrabold text-blue">← Back to path</Link>
        </div>
      </div>
```

```tsx
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip icon="🔥" value={String(p.streak)} label="Day streak" />
          <StatChip icon="⭐" value={String(p.courseXpTotal)} label="Course XP" />
          <StatChip icon="🏆" value={String(p.xpTotal)} label="Total XP" />
          <StatChip icon="📚" value={String(p.wordsLearned)} label="Words" />
        </div>
```

(Keep the `evaluateAchievements` call using `p.xpTotal` — achievements remain lifetime-global.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Logged in as `alice`, after a completed lesson, `/profile` shows the avatar/name, "🇱🇧 Lebanese Arabic (اللبناني)", separate Course XP and Total XP chips (equal for a single-course learner), and the words/streak counts.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: course-aware profile (active course, per-course XP, OIDC identity)"
```

---

## Task 14: PWA foundation — manifest, icons, service worker, metadata

**Files:**
- Create: `scripts/gen-icons.mjs` (+ `package.json` `gen:icons` script)
- Create (committed outputs): `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-192.png`, `public/icons/icon-maskable-512.png`, `src/app/apple-icon.png`
- Create: `src/app/manifest.ts`
- Create: `public/sw.js`
- Create: `src/app/register-sw.tsx`
- Modify: `src/app/layout.tsx` (viewport + appleWebApp metadata + SW registration)
- Modify: `next.config.mjs` (`/sw.js` headers)

**Interfaces:**
- Produces: `app/manifest.ts` (Next emits `<link rel="manifest">` automatically), a no-op `public/sw.js` registered once from the root layout, `viewport`/`metadata.appleWebApp` exports, and committed cedar-on-green PNG icons. UI/asset task — verify by Lighthouse/DevTools installability, not unit tests.

- [ ] **Step 1: Write the icon generator (cedar-on-green, no external deps)**

The icons are simple flat PNGs (green background `#58CC02`, white cedar glyph). Generate them programmatically with a tiny committed script that writes raw PNGs via Node's zlib (no npm image lib, keeping the dependency surface unchanged). Because hand-rolling a full glyph rasteriser is overkill, draw the cedar as a centered filled triangle + trunk on a solid field into an RGBA pixel buffer and encode with `zlib.deflateSync`.

```js
// scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const GREEN = [0x58, 0xcc, 0x02, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = pixels(x, y, size);
      raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3];
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Draw a cedar: a solid green field with a white triangle (foliage) + trunk.
// `pad` is the fraction of edge kept as background (maskable needs ~20%).
function cedar(pad) {
  return (x, y, size) => {
    const inset = size * pad;
    const w = size - 2 * inset;
    const cx = size / 2;
    // Foliage triangle from (inset*..) apex down to base at 78% height.
    const apexY = inset + w * 0.08;
    const baseY = inset + w * 0.72;
    const halfBase = w * 0.34;
    const trunkTop = baseY;
    const trunkBot = size - inset;
    const trunkHalf = w * 0.06;
    if (y >= apexY && y <= baseY) {
      const t = (y - apexY) / (baseY - apexY);
      const half = halfBase * t;
      if (x >= cx - half && x <= cx + half) return WHITE;
    }
    if (y >= trunkTop && y <= trunkBot && x >= cx - trunkHalf && x <= cx + trunkHalf) return WHITE;
    return GREEN;
  };
}

const outDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), encodePng(192, cedar(0.12)));
writeFileSync(join(outDir, 'icon-512.png'), encodePng(512, cedar(0.12)));
writeFileSync(join(outDir, 'icon-maskable-192.png'), encodePng(192, cedar(0.22)));
writeFileSync(join(outDir, 'icon-maskable-512.png'), encodePng(512, cedar(0.22)));
writeFileSync(join(process.cwd(), 'src', 'app', 'apple-icon.png'), encodePng(180, cedar(0.12)));
console.log('Icons written to public/icons and src/app/apple-icon.png');
```

Add the script to `package.json`:
```jsonc
    "gen:icons": "node scripts/gen-icons.mjs",
```

- [ ] **Step 2: Generate and commit the icons**

Run: `npm run gen:icons`
Expected: five PNG files written. Open `public/icons/icon-512.png` to eyeball a white cedar on green. These outputs are **committed** (the manifest references them at runtime; they are not regenerated during `docker build`).

- [ ] **Step 3: Write `app/manifest.ts`**

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Franca',
    short_name: 'Franca',
    description: 'Self-hosted language learning for the household',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#58CC02',
    theme_color: '#58CC02',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

> Next serves this at `/manifest.webmanifest` — which the middleware matcher (Task 4) already excludes so it stays public.

- [ ] **Step 4: Write the no-op service worker + registration**

```js
// public/sw.js
// Intentionally caches nothing. Its only jobs: exist so engines treat the app
// as installable, and provide a future Web-Push hook. Do NOT add a 'fetch'
// handler with caching without deliberately excluding /api/ and auth routes
// (would serve stale session/auth state).
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// No 'fetch' listener — all requests pass straight through to the network.
```

```tsx
// src/app/register-sw.tsx
'use client';
import { useEffect } from 'react';

export function RegisterServiceWorker(): null {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Registration failures are non-fatal (e.g. insecure context on plain-HTTP LAN).
      });
    }
  }, []);
  return null;
}
```

- [ ] **Step 5: Update the root layout — metadata, viewport, SW registration, safe-area body**

```tsx
// src/app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegisterServiceWorker } from './register-sw';

export const metadata: Metadata = {
  title: 'Franca',
  description: 'Learn Lebanese Arabic',
  appleWebApp: {
    capable: true,
    title: 'Franca',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icon-512.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#58CC02',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-[100dvh]">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Add `/sw.js` headers in `next.config.mjs`**

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    ];
  },
};
export default nextConfig;
```

- [ ] **Step 7: Typecheck + build + installability check**

Run: `npm run typecheck && npm run build`
Expected: PASS; the build lists `/manifest.webmanifest` and `/sw.js` as static.
Manual (stack up, logged in, Chrome DevTools → Application → Manifest): manifest parses with name/short_name/icons; "maskable" icons show a filled safe zone; the SW is registered and active. (Full install prompt requires a secure context — `localhost` qualifies; plain LAN IP does not, per the research doc's TLS caveat.)

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-icons.mjs package.json public/icons src/app/apple-icon.png src/app/manifest.ts public/sw.js src/app/register-sw.tsx src/app/layout.tsx next.config.mjs
git commit -m "feat: PWA foundation — manifest, cedar icons, no-op service worker, metadata"
```

---

## Task 15: Mobile-first layout sweep (safe-area, dvh, bottom-anchored actions, touch/inputs)

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/lesson/[unitId]/LessonClient.tsx`
- Modify: `src/components/FeedbackBanner.tsx`
- Modify: `src/app/page.tsx`, `src/app/profile/page.tsx`
- Modify: `src/components/exercises/TypeExerciseView.tsx`, `src/components/exercises/ConjugationExerciseView.tsx` (input font-size + touch)

**Interfaces:**
- Produces: Tailwind safe-area spacing utilities (`p-safe-*`), a `min-h-dvh` full-height helper, `touch-manipulation` on interactive game elements, `≥16px` inputs (via `text-base`), and a bottom-anchored feedback/action bar with `env(safe-area-inset-bottom)` padding. UI task — verify with mobile emulation, no unit tests.

- [ ] **Step 1: Extend the Tailwind config with safe-area spacing**

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      colors: {
        green: { DEFAULT: '#58CC02', dark: '#58A700', light: '#D7FFB8' },
        blue: { DEFAULT: '#1CB0F6', dark: '#1899D6', light: '#DDF4FF' },
        red: { DEFAULT: '#FF4B4B', dark: '#EA2B2B', light: '#FFDFE0' },
        yellow: { DEFAULT: '#FFC800', dark: '#E6B400' },
        orange: { DEFAULT: '#FF9600' },
        purple: { DEFAULT: '#CE82FF' },
        eel: '#4B4B4B',
        hare: '#777777',
        swan: '#E5E5E5',
        subtle: '#F7F7F7',
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Add global mobile helpers to `globals.css`**

Append to `src/app/globals.css`:

```css
/* Mobile-first baseline. */
html {
  /* Prevent iOS text-size auto-inflation in landscape. */
  -webkit-text-size-adjust: 100%;
}

/* Full dynamic-viewport height helper with a stable fallback (svh) first, then
   the dynamic value as progressive enhancement (research: 100dvh can report a
   stale value on iOS standalone cold-start; svh is a safe floor). */
.min-h-screen-safe {
  min-height: 100svh;
}
@supports (min-height: 100dvh) {
  .min-h-screen-safe {
    min-height: 100dvh;
  }
}

/* Every 3D button and interactive game chip suppresses double-tap zoom + 300ms delay. */
.btn-3d,
button {
  touch-action: manipulation;
}

/* Text inputs must be >= 16px so iOS Safari does not zoom on focus. */
input,
textarea,
select {
  font-size: 16px;
}
```

- [ ] **Step 3: Make the lesson screen full-height with a bottom-anchored action zone**

In `src/app/lesson/[unitId]/LessonClient.tsx`, the `LessonRunner` `main` becomes a flex column that fills the dynamic viewport, with the exercise area scrolling and the feedback/action bar pinned to the bottom with safe-area padding. Replace the `LessonRunner` return's outer structure:

```tsx
  return (
    <main className="flex min-h-screen-safe flex-col bg-white">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <button
          type="button"
          onClick={() => {
            router.push('/');
          }}
          className="touch-manipulation text-2xl font-black text-hare"
          aria-label="Exit lesson"
        >
          ✕
        </button>
        <ProgressBar done={session.progress.done} total={session.progress.total} />
        <span className="flex items-center gap-1 font-extrabold text-red">
          <HeartIcon /> {session.hearts}
        </span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-y-contain px-4 py-6">
        {(locked ? false : session.isRequeue) ? (
          <p className="mb-4 inline-block rounded-full bg-orange/10 px-3 py-1 text-sm font-extrabold text-orange">
            Previous mistake — try again
          </p>
        ) : null}
        {session.comboCurrent >= 5 ? (
          <p className="mb-4 text-center font-extrabold text-orange">🔥 {session.comboCurrent} in a row!</p>
        ) : null}
        {ex?.kind === 'mc' ? <McExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'word_bank' ? <WordBankExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'type_translation' ? <TypeExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'conjugation' ? <ConjugationExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'match' ? <MatchExerciseView key={ex.id} ex={ex} onSubmit={session.submit} /> : null}
      </div>

      {session.feedback ? (
        <FeedbackBanner
          status={session.feedback.status}
          correctAnswer={session.feedback.correctText}
          onContinue={session.cont}
        />
      ) : null}
    </main>
  );
```

- [ ] **Step 4: Give the feedback banner safe-area bottom padding**

In `src/components/FeedbackBanner.tsx`, change the fixed container padding to respect the home indicator:

```tsx
    <div
      className="fixed inset-x-0 bottom-0 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      style={{ backgroundColor: config.bg }}
    >
```

- [ ] **Step 5: Full-height + bottom padding for the path and profile pages**

In `src/app/page.tsx`, change the main wrapper class from `min-h-screen bg-subtle pb-24` to `min-h-screen-safe bg-subtle pb-[max(6rem,env(safe-area-inset-bottom))]`. In `src/app/profile/page.tsx`, change the main wrapper to include `min-h-screen-safe` and `pb-[max(1.5rem,env(safe-area-inset-bottom))]`.

- [ ] **Step 6: Ensure typing inputs are ≥16px and touch-friendly**

In `src/components/exercises/TypeExerciseView.tsx` and `src/components/exercises/ConjugationExerciseView.tsx`, ensure the `<input>` uses `text-base` (16px) and `touch-manipulation` (the global CSS from Step 2 already enforces 16px, but add the utility class for clarity where an input class list exists). Add `className="... text-base touch-manipulation"` and `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}` to the arabizi answer inputs (arabizi is not English; autocorrect corrupts it).

```tsx
// Example for the input in TypeExerciseView.tsx (match the existing element, add these attributes)
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="... text-base touch-manipulation"
```

- [ ] **Step 7: Typecheck + build + mobile emulation check**

Run: `npm run typecheck && npm run build`
Expected: PASS.
Manual (Chrome DevTools device toolbar, iPhone 14 Pro): lesson screen fills the viewport with no clipping under the status bar; Check/Continue stays pinned at the bottom clear of the home indicator; tapping answer chips twice does not zoom; focusing the typing input does not zoom the page; the path and profile scroll without horizontal overflow.

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/lesson/\[unitId\]/LessonClient.tsx src/components/FeedbackBanner.tsx src/app/page.tsx src/app/profile/page.tsx src/components/exercises/TypeExerciseView.tsx src/components/exercises/ConjugationExerciseView.tsx
git commit -m "feat: mobile-first layout sweep — safe-area, dvh, bottom-anchored actions, touch/input fixes"
```

---

## Task 16: Docker/README finalization + authenticated e2e smoke

**Files:**
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/start.mjs` (no functional change needed, but verify it still runs migrate→seed→start; confirm)
- Modify: `README.md`
- Modify: `package.json` (add `@auth/core` explicit dep only if smoke import needs it — see Step 1 note)

**Interfaces:**
- Consumes: the dev smoke learner seeded when `SEED_SMOKE_LEARNER=1` (Task 8, `oidc_sub='u-alice-0001'`); `AUTH_SECRET` from the environment; `DATABASE_URL` for the learner-id lookup.
- Produces: `scripts/smoke.mjs` authenticates by **forging an Auth.js JWT session cookie** with `AUTH_SECRET` (using `encode` from `@auth/core/jwt`) carrying `{ sub: 'u-alice-0001', learnerId }`, sets it on every request, and runs path → lesson → answer → complete → profile as that learner. Exits non-zero on any failure.

- [ ] **Step 1: Rewrite `scripts/smoke.mjs` with cookie-injection auth**

`next-auth@5` re-exports the JWT `encode`/`decode` from `@auth/core/jwt` (pulled in transitively). The dev cookie name for a non-HTTPS origin is `authjs.session-token`; `encode` requires the same `salt` (the cookie name) and `secret` (`AUTH_SECRET`) the app uses.

```js
// scripts/smoke.mjs
import pg from 'pg';
import { encode } from '@auth/core/jwt';

const base = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const secret = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me-0123456789abcdef';
const dbUrl = process.env.DATABASE_URL ?? 'postgres://franca:franca@localhost:5432/franca';
const SMOKE_SUB = 'u-alice-0001';
const COOKIE_NAME = 'authjs.session-token'; // non-HTTPS dev cookie name

async function resolveLearnerId() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT id FROM learner WHERE oidc_sub = $1', [SMOKE_SUB]);
    if (rows.length === 0) {
      throw new Error(`smoke learner ${SMOKE_SUB} not found — run seed with SEED_SMOKE_LEARNER=1`);
    }
    return rows[0].id;
  } finally {
    await client.end();
  }
}

async function makeCookie(learnerId) {
  // Mirror the app's JWT shape: token.sub + token.learnerId (see src/auth.ts callbacks).
  const token = { sub: SMOKE_SUB, learnerId, name: 'alice', email: 'alice@franca.test' };
  const jwt = await encode({ token, secret, salt: COOKIE_NAME, maxAge: 60 * 60 });
  return `${COOKIE_NAME}=${jwt}`;
}

async function json(res) {
  if (!res.ok) throw new Error(`${res.url} -> ${res.status}`);
  return res.json();
}

async function main() {
  const learnerId = await resolveLearnerId();
  const cookie = await makeCookie(learnerId);
  const headers = { cookie, 'content-type': 'application/json' };
  const get = (p) => fetch(`${base}${p}`, { headers });
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });

  // 0. courses (authenticated)
  const courses = await json(await get('/api/courses'));
  if (!Array.isArray(courses.courses) || courses.courses.length === 0) throw new Error('no courses');
  console.log(`courses OK: ${courses.courses.length} course(s), active ${courses.activeCourseId}`);

  // 1. path
  const path = await json(await get('/api/path'));
  if (!Array.isArray(path.units) || path.units.length === 0) throw new Error('no units seeded');
  const unitId = path.activeUnitId ?? path.units[0].id;
  const courseId = path.activeCourse?.id ?? courses.activeCourseId;
  console.log(`path OK: ${path.units.length} units, active ${unitId}, course ${courseId}`);

  // 2. lesson
  const plan = await json(await get(`/api/lesson?unitId=${unitId}`));
  if (!Array.isArray(plan.exercises) || plan.exercises.length === 0) throw new Error('empty lesson');
  if (plan.courseId !== courseId) throw new Error('lesson courseId mismatch');
  console.log(`lesson OK: ${plan.exercises.length} exercises, ${plan.conceptCount} concepts`);

  // 3. answer (first exercise correct)
  const first = plan.exercises[0];
  await json(
    await post('/api/answer', {
      itemId: first.itemId,
      itemType: first.itemType,
      direction: first.direction,
      firstGradedForConcept: true,
      result: { correct: true, firstTry: true, fast: true, usedHint: false },
    }),
  );
  console.log('answer OK');

  // 4. complete
  const done = await json(
    await post('/api/lesson/complete', {
      sessionId: plan.sessionId,
      unitId,
      courseId: plan.courseId,
      numCorrect: plan.conceptCount,
      numWrong: 0,
      comboMax: plan.conceptCount,
      requeuedConcepts: [],
    }),
  );
  if (typeof done.score.totalXp !== 'number') throw new Error('no score');
  console.log(`complete OK: +${done.score.totalXp} XP, streak ${done.streak.streak}`);

  // 5. profile reflects progress
  const profile = await json(await get('/api/profile'));
  if (profile.lessonsCompleted < 1) throw new Error('lesson not recorded');
  console.log(`profile OK: ${profile.lessonsCompleted} lessons, course XP ${profile.courseXpTotal}`);

  // 6. unauthenticated request is rejected by the API layer
  const noAuth = await fetch(`${base}/api/path`);
  if (noAuth.status !== 401 && noAuth.status !== 307 && noAuth.status !== 302) {
    throw new Error(`expected auth rejection, got ${noAuth.status}`);
  }
  console.log(`auth-gate OK: unauthenticated /api/path -> ${noAuth.status}`);

  console.log('\nSMOKE PASSED');
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err.message);
  process.exit(1);
});
```

> If `import { encode } from '@auth/core/jwt'` fails to resolve at runtime (transitive dep not hoisted), add `"@auth/core": "0.40.0"` — the exact version `next-auth@5.0.0-beta.29` depends on — to `package.json` `dependencies` and `npm install`. Verify the resolved version first with `npm ls @auth/core`.

- [ ] **Step 2: Confirm `scripts/start.mjs` still orchestrates migrate → seed → start**

Read `scripts/start.mjs`; it runs `waitForDb → migrate → seed → next start`. No change is required (migrate now runs the chain; seed now multi-course). Confirm by inspection that both `npx tsx scripts/migrate.ts` and `npx tsx scripts/seed.ts` are invoked in that order. If `SEED_SMOKE_LEARNER` needs to reach seed inside the container, it is already passed via compose env (Task 5). No edit; this step is a verification checkpoint.

- [ ] **Step 3: Run the authenticated smoke against the live stack**

Run:
```bash
docker compose up --build -d
# wait for app to be serving:
until curl -sf -o /dev/null http://localhost:3000/api/auth/providers; do sleep 2; done
AUTH_SECRET=dev-only-secret-change-me-0123456789abcdef \
  DATABASE_URL=postgres://franca:franca@localhost:5432/franca \
  node scripts/smoke.mjs
```
Expected output ends with `SMOKE PASSED`, showing `courses OK`, `path OK`, `lesson OK`, `answer OK`, `complete OK`, `profile OK`, `auth-gate OK`.

> The `AUTH_SECRET` passed to the smoke script **must equal** the app container's `AUTH_SECRET` (the compose default here) — otherwise the forged cookie fails to decrypt and every request 401s.

- [ ] **Step 4: Update the README**

Rewrite `README.md` to document: one-command startup now includes Dex + the one-time `/etc/hosts` line; login (dev users alice/bob/carol / `password`); the migration chain (`db/migrations/`); the multi-course seeding convention (`courses/<code>/…` + preserved legacy env vars); switching courses in the UI; PWA install; and the authenticated smoke command. Add these sections (keeping the existing "Quality gates" block):

```markdown
## Run it (one command)

```bash
# one-time dev setup so the browser and app container agree on the OIDC issuer host:
grep -q '127.0.0.1  dex' /etc/hosts || echo '127.0.0.1  dex' | sudo tee -a /etc/hosts

docker compose up
```

This stands up Postgres, **Dex** (dev identity provider), applies the migration chain, seeds
courses idempotently, and serves the app at http://localhost:3000. On first visit you are
redirected to Dex — log in as `alice@franca.test` / `password` (also `bob`, `carol`).

## Authentication

The whole app requires login via OIDC (Auth.js v5, JWT sessions). Dev uses the bundled Dex
provider; production points the same `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`
(+ `AUTH_SECRET`, `AUTH_URL`) at the owner's Authentik. See `.env.example`. First login
auto-provisions a learner keyed on the stable OIDC `sub`.

## Courses (multi-language)

Content is scoped by course. The built-in **Lebanese Arabic** (`ar-leb`) course seeds from the
repo-root CSVs (legacy `VOCAB_CSV`/`SENTENCES_CSV`/`CONJUGATIONS_CSV` env vars still work).
Add another language by dropping `courses/<code>/{vocab,sentences,conjugations}.csv` (+ an
optional `courses/<code>/course.json` with `code`/`name`/`nativeName`/`emoji`) and re-running
`docker compose up` (seeding is idempotent). Switch the active course from the flag menu in the
top bar. Streak and daily goal are global per learner; XP is tracked per course and summed
globally.

## Database migrations

Schema lives in `db/migrations/NNN_*.sql`, applied in order by `scripts/migrate.ts` and tracked
in a `schema_migrations` table. Fresh installs and existing databases both upgrade by running the
same chain (`npm run migrate`). Add new changes as the next numbered file.

## Install as an app (PWA)

Over `localhost` or an HTTPS LAN hostname, Franca is installable (manifest + service worker).
On desktop/Android use the browser's install action; on iOS use Share → Add to Home Screen.

## End-to-end smoke

```bash
docker compose up -d
AUTH_SECRET=<same as app> DATABASE_URL=postgres://franca:franca@localhost:5432/franca node scripts/smoke.mjs
```

Authenticates by forging an Auth.js session cookie for the seeded dev learner, then exercises
path → lesson → answer → complete → profile and asserts unauthenticated requests are rejected.
```

- [ ] **Step 5: Full quality gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all PASS. (`npm test` = 94 Phase 1 tests + `migrations`/`seed-plan` additions.)

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke.mjs README.md package.json package-lock.json
git commit -m "feat: authenticated e2e smoke (cookie injection) + Phase 2 README"
```

---

## Self-Review

**1. Spec coverage** (each Phase 2 requirement → task):
- Multi-user via OIDC (Auth.js v5, pin, JWT, generic OIDC, provisioning by sub, middleware, requireLearner) → Tasks 3, 4, 5; learner columns → Task 2; `LEARNER_ID` killed + threading → Tasks 6, 7, 9, 10.
- Dex in compose + env swap to Authentik, `docker compose up` works OOTB → Task 5 (+ `.env.example`, README Task 16).
- `course` table + content scoping + per-(learner,course) progress → Task 2; repo scoping → Task 7; API scoping → Tasks 9, 10, 11.
- Seeding generalization + legacy compat + courses dir → Task 8.
- Per-learner active course + picker UI → Tasks 2 (column), 7/11 (repo+API), 12 (UI).
- XP per course + global, streak/goal global → locked in Global Constraints; implemented in Task 6 (`completeLesson`) + surfaced Tasks 9, 13.
- `conceptId` stays `itemType:itemId:direction` → verified in Global Constraints (single serial PK per content table).
- Mobile-first + PWA (manifest, icons, SW, viewport, safe-area, dvh, bottom actions, touch, ≥16px inputs, iOS meta) → Tasks 14, 15.
- Numbered migrations + tracking table, one coherent strategy → Tasks 1, 2 (chain is single source of truth for fresh + existing).
- Preserve pure-lib contracts, no "Duolingo", Franca branding, one-command up, idempotent seeding, e2e smoke with auth → Global Constraints + Task 8 (idempotent) + Task 16 (smoke).

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code step carries complete code. UI tasks use concrete manual-verification steps in place of forced unit tests (per the task decomposition guidance), which is appropriate where a unit test adds nothing.

**3. Type consistency:**
- `learnerId: number` and `courseId: number` are used consistently across `repo.ts`, session helpers, and every API route. `session.user.learnerId` typed `number` (Task 3 augmentation) matches `getSessionLearnerId(): number | null`.
- `getUnitsWithProgress(learnerId, courseId)`, `getDueReviews(learnerId, courseId, today, limit)`, `getNewSentences(learnerId, courseId, limit)`, `getNewConjugations(learnerId, courseId, limit)`, `getDistractorPool(courseId, limit)`, `getWordBankDistractorTokens(courseId)`, `getWordsLearned(learnerId, courseId)` — the `/api/lesson` call sites (Task 10) pass exactly these argument orders.
- `upsertSrsState(learnerId, courseId, state)` — called with `(learnerId, courseId, next)` in `/api/answer` and `(learnerId, body.courseId, {...st})` in `/api/lesson/complete`. Consistent.
- `completeLesson(args)` with `learnerId`/`courseId` fields — the complete route builds exactly that object.
- `LessonPlan & { courseId: number }` is the client-side plan type in `useLessonSession` and `LessonClient`; the route returns `{ ...plan, courseId }`. The pure `LessonPlan` type in `src/lib/types.ts` is deliberately unchanged (preserves the pure-lib contract).
- `buildSeedPlan(course, vocabText, sentencesText, conjugationsText)` — the only changed pure signature; `scripts/seed.ts` and the seed-plan test call it with the leading `CourseSeedMeta`.
- Course row shape `{ id, code, name, native_name, emoji }` is consistent between `getCourseById`/`getCourses`/`getLearnerCourses`, `/api/path`'s `activeCourse`, `/api/profile`'s `activeCourse`, `CourseMenu`, and `page.tsx`/`profile/page.tsx` interfaces.

No inconsistencies found. Plan is complete and internally consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-14-franca-phase2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in this session using superpowers:executing-plans, batching with checkpoints for review.

**Which approach?**
