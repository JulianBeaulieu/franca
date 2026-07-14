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
