CREATE TABLE IF NOT EXISTS learner (
  id                serial PRIMARY KEY,
  name              text        NOT NULL DEFAULT 'learner',
  created_at        timestamptz NOT NULL DEFAULT now(),
  xp_total          integer     NOT NULL DEFAULT 0,
  gems              integer     NOT NULL DEFAULT 0,
  hearts            integer     NOT NULL DEFAULT 5,
  hearts_updated_at timestamptz NOT NULL DEFAULT now(),
  daily_goal_xp     integer     NOT NULL DEFAULT 20,
  streak_count      integer     NOT NULL DEFAULT 0,
  longest_streak    integer     NOT NULL DEFAULT 0,
  streak_freezes    integer     NOT NULL DEFAULT 0,
  last_completed_date date
);

CREATE TABLE IF NOT EXISTS unit (
  id          serial PRIMARY KEY,
  ordinal     integer NOT NULL UNIQUE,
  title       text    NOT NULL,
  description text    NOT NULL,
  theme_color text    NOT NULL
);

CREATE TABLE IF NOT EXISTS vocab (
  id                  serial PRIMARY KEY,
  arabizi_word        text    NOT NULL UNIQUE,
  english_translation text    NOT NULL,
  primary_gloss       text    NOT NULL,
  accepted_answers    text[]  NOT NULL,
  is_verb             boolean NOT NULL,
  is_phrase           boolean NOT NULL,
  length_bucket       text    NOT NULL,
  sentence_freq       integer NOT NULL,
  freq_rank           integer NOT NULL,
  unit_id             integer REFERENCES unit(id),
  unit_order          integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS vocab_unit_idx ON vocab (unit_id, unit_order);
CREATE INDEX IF NOT EXISTS vocab_freq_idx ON vocab (freq_rank);

CREATE TABLE IF NOT EXISTS sentence (
  id                  serial PRIMARY KEY,
  arabizi_sentence    text    NOT NULL UNIQUE,
  english_translation text    NOT NULL,
  word_count          integer NOT NULL,
  tier                text    NOT NULL
);

CREATE TABLE IF NOT EXISTS conjugation (
  id              serial PRIMARY KEY,
  base_verb       text NOT NULL UNIQUE,
  english_meaning text NOT NULL,
  ana   text NOT NULL,
  ni7na text NOT NULL,
  inta  text NOT NULL,
  inte  text NOT NULL,
  "into" text NOT NULL,
  huwe  text NOT NULL,
  hiyye text NOT NULL,
  hinne text NOT NULL,
  vocab_id integer REFERENCES vocab(id)
);

CREATE TABLE IF NOT EXISTS srs_state (
  id               bigserial PRIMARY KEY,
  learner_id       integer NOT NULL REFERENCES learner(id),
  item_id          integer NOT NULL,
  item_type        text    NOT NULL,
  direction        text    NOT NULL,
  reps             integer NOT NULL DEFAULT 0,
  ease             real    NOT NULL DEFAULT 2.5,
  interval         real    NOT NULL DEFAULT 0,
  due_at           date,
  lapses           integer NOT NULL DEFAULT 0,
  last_grade       integer,
  last_reviewed_at timestamptz,
  state            text    NOT NULL DEFAULT 'new',
  UNIQUE (learner_id, item_id, item_type, direction)
);
CREATE INDEX IF NOT EXISTS srs_due_idx ON srs_state (due_at) WHERE state <> 'new';

CREATE TABLE IF NOT EXISTS lesson_session (
  id           uuid PRIMARY KEY,
  learner_id   integer NOT NULL REFERENCES learner(id),
  unit_id      integer REFERENCES unit(id),
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  xp_earned    integer NOT NULL DEFAULT 0,
  accuracy     real    NOT NULL DEFAULT 0,
  combo_max    integer NOT NULL DEFAULT 0,
  perfect      boolean NOT NULL DEFAULT false,
  num_correct  integer NOT NULL DEFAULT 0,
  num_wrong    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_activity (
  learner_id        integer NOT NULL REFERENCES learner(id),
  activity_date     date    NOT NULL,
  xp_earned         integer NOT NULL DEFAULT 0,
  lessons_completed integer NOT NULL DEFAULT 0,
  PRIMARY KEY (learner_id, activity_date)
);

CREATE TABLE IF NOT EXISTS unit_progress (
  learner_id        integer NOT NULL REFERENCES learner(id),
  unit_id           integer NOT NULL REFERENCES unit(id),
  lessons_completed integer NOT NULL DEFAULT 0,
  completed_at      timestamptz,
  PRIMARY KEY (learner_id, unit_id)
);

CREATE TABLE IF NOT EXISTS seed_meta (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
