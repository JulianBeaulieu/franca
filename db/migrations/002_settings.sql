-- db/migrations/002_settings.sql
-- Phase 3: per-learner settings (theme, lesson auto-continue, haptics,
-- sounds, leaderboard opt-in). Stored as a single JSONB blob and merged over
-- defaults in application code (src/lib/settings.ts) rather than validated by
-- the schema, so new toggles in later Phase 3 tasks never need a migration.

ALTER TABLE learner ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
