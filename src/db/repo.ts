import { pool, query } from './pool';
import { regenerateHearts } from '@/lib/scoring';
import type { Direction, ItemType, SrsState } from '@/lib/types';
import type { ConjugationItem, SentenceItem, VocabItem } from '@/lib/exercises';
import { CONJUGATION_PERSONS } from '@/lib/config';
import { hashString } from '@/lib/hash';

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

// node-postgres parses `date` and `timestamptz` columns into JS Date objects.
// Downstream pure libs (scoring.updateStreak, srs comparisons) require plain
// 'YYYY-MM-DD' / ISO strings, and LearnerRow declares these fields as string,
// so we cast the temporal columns to text at the SQL boundary.
const LEARNER_COLUMNS = `id, name, oidc_sub, email, display_name, picture,
  active_course_id, xp_total, gems, hearts,
  hearts_updated_at::text AS hearts_updated_at, daily_goal_xp,
  streak_count, longest_streak, streak_freezes,
  last_completed_date::text AS last_completed_date`;

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

export interface UnitProgressRow {
  id: number;
  ordinal: number;
  title: string;
  description: string;
  theme_color: string;
  lessons_completed: number;
  total_words: number;
}

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

interface VocabDbRow {
  id: number;
  arabizi_word: string;
  primary_gloss: string;
  accepted_answers: string[];
  is_verb: boolean;
  is_phrase: boolean;
  length_bucket: string;
}

function toVocabItem(r: VocabDbRow): VocabItem {
  return {
    id: r.id,
    arabiziWord: r.arabizi_word,
    primaryGloss: r.primary_gloss,
    acceptedAnswers: r.accepted_answers,
    isVerb: r.is_verb,
    isPhrase: r.is_phrase,
    lengthBucket: r.length_bucket,
  };
}

interface SentenceDbRow {
  id: number;
  arabizi_sentence: string;
  english_translation: string;
}

function toSentenceItem(r: SentenceDbRow): SentenceItem {
  return {
    id: r.id,
    arabiziSentence: r.arabizi_sentence,
    englishTranslation: r.english_translation,
  };
}

interface ConjugationDbRow {
  id: number;
  base_verb: string;
  english_meaning: string;
  ana: string;
  ni7na: string;
  inta: string;
  inte: string;
  into: string;
  huwe: string;
  hiyye: string;
  hinne: string;
}

function toConjugationItem(r: ConjugationDbRow): ConjugationItem {
  return {
    id: r.id,
    baseVerb: r.base_verb,
    englishMeaning: r.english_meaning,
    forms: {
      ana: r.ana, ni7na: r.ni7na, inta: r.inta, inte: r.inte,
      into: r.into, huwe: r.huwe, hiyye: r.hiyye, hinne: r.hinne,
    },
  };
}

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

// Sentences the learner has never had scheduled (no srs_state row). Prefer the
// 'normal' tier over 'advanced' so shorter/easier sentences unlock first, then
// stable id ordering for determinism.
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

// Conjugations the learner has never had scheduled, restricted to verbs whose
// base vocab the learner has already started learning (state <> 'new'), so a
// conjugation drill never precedes exposure to its base verb.
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

export interface DueReview {
  state: SrsState;
  vocab?: VocabItem;
  sentence?: SentenceItem;
  conjugation?: ConjugationItem;
  person?: (typeof CONJUGATION_PERSONS)[number];
}

interface SrsDbRow {
  item_id: number;
  item_type: ItemType;
  direction: Direction;
  reps: number;
  ease: number;
  interval: number;
  due_at: string | null;
  lapses: number;
  last_grade: number | null;
  last_reviewed_at: string | null;
  state: string;
}

// Cast temporal columns to text so due_at is 'YYYY-MM-DD' and last_reviewed_at
// is an ISO string, matching SrsState's string typing (see LEARNER_COLUMNS note).
const SRS_COLUMNS = `item_id, item_type, direction, reps, ease, interval,
  due_at::text AS due_at, lapses, last_grade,
  last_reviewed_at::text AS last_reviewed_at, state`;

function toSrsState(r: SrsDbRow): SrsState {
  return {
    itemId: r.item_id,
    itemType: r.item_type,
    direction: r.direction,
    reps: r.reps,
    ease: r.ease,
    interval: r.interval,
    dueAt: r.due_at,
    lapses: r.lapses,
    lastGrade: (r.last_grade as SrsState['lastGrade']) ?? null,
    lastReviewedAt: r.last_reviewed_at,
    state: r.state as SrsState['state'],
  };
}

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
    // Deterministic per-(item, day) person pick so a re-fetch within the same
    // lesson/day is stable, but reviews aren't permanently pinned to 'ana'.
    const person =
      CONJUGATION_PERSONS[hashString(`${String(r.item_id)}:${today}`) % CONJUGATION_PERSONS.length];
    return { state, conjugation: conjById.get(r.item_id), person };
  });
}

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

// Resolve an SRS-persistable item's TRUE owning course from its content row, so
// an answer write is course-stamped by the item's identity — never by whatever
// course happens to be active (which a mid-lesson switch in another tab could
// change). Returns null if the item type is not course-scoped content or the
// row does not exist (caller treats null as 404). Each lookup hits the table's
// primary-key index on id.
// itemType is widened to string on purpose: the answer route's body is untrusted
// JSON, so a non-content type (e.g. a 'match' warmup) can reach here — those map
// to no table and resolve to null.
export async function getItemCourseId(itemType: string, itemId: number): Promise<number | null> {
  const table =
    itemType === 'vocab' ? 'vocab' : itemType === 'sentence' ? 'sentence'
    : itemType === 'conjugation' ? 'conjugation' : null;
  if (table === null) return null;
  const rows = await query<{ course_id: number | null }>(
    `SELECT course_id FROM ${table} WHERE id = $1`,
    [itemId],
  );
  return rows[0]?.course_id ?? null;
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

export interface CompleteLessonArgs {
  learnerId: number;
  sessionId: string;
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
  | { ok: true; courseId: number; unitId: number | null }
  | { ok: false; reason: 'not_found' | 'already_completed' };

export async function completeLesson(args: CompleteLessonArgs): Promise<CompleteLessonResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The session row is the trust anchor: course_id/unit_id were bound to the
    // session at creation (createLessonSession). All award writes below use
    // THESE, never client-supplied body values, so a forged/mismatched body
    // courseId/unitId cannot redirect XP or unit progress to another course.
    const sessionRows = await client.query<{
      completed_at: string | null;
      course_id: number;
      unit_id: number | null;
    }>(
      `SELECT completed_at, course_id, unit_id
         FROM lesson_session WHERE id = $1 AND learner_id = $2 FOR UPDATE`,
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
    const courseId = session.course_id;
    const unitId = session.unit_id;

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
      [args.learnerId, courseId, args.xpEarned],
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
      [args.learnerId, courseId, unitId],
    );
    await client.query('COMMIT');
    return { ok: true, courseId, unitId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getXpToday(learnerId: number, today: string): Promise<number> {
  const rows = await query<{ xp_earned: number }>(
    `SELECT xp_earned FROM daily_activity WHERE learner_id = $1 AND activity_date = $2`,
    [learnerId, today],
  );
  return rows[0]?.xp_earned ?? 0;
}

export async function getWordsLearned(learnerId: number, courseId: number): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(DISTINCT item_id)::int AS n FROM srs_state
     WHERE learner_id = $1 AND course_id = $2 AND item_type = 'vocab' AND state <> 'new'`,
    [learnerId, courseId],
  );
  return rows[0]?.n ?? 0;
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
