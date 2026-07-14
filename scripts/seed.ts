import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { buildSeedPlan, type CourseSeedMeta, type SeedPlan } from '../src/lib/seed-plan';
import { parseCoursesDirs } from '../src/lib/courses-dir';
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

/** Scan one directory of <code>/{vocab,sentences,conjugations}.csv (+ course.json) subdirs. */
function scanCoursesDir(dir: string): CourseCsvPaths[] {
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

/**
 * Directory convention. COURSES_DIR_PATH may be a colon-separated list of
 * directories (e.g. `/app/courses:/data/courses`); each existing dir is scanned
 * in order. Returned in scan order so callers can apply last-wins de-dup — a
 * user-mounted courses dir listed after the baked one overrides it by code.
 */
function directoryCourses(): CourseCsvPaths[] {
  const dirs = parseCoursesDirs(process.env.COURSES_DIR_PATH ?? './courses');
  return dirs.flatMap(scanCoursesDir);
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
