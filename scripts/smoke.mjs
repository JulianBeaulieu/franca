// Authenticated end-to-end smoke for the live Docker stack.
//
// Auth strategy: forge an Auth.js (next-auth v5) JWT session cookie signed with
// the app's AUTH_SECRET, carrying the smoke learner's identity. The learner is
// seeded directly in Postgres with a known synthetic oidc_sub (SEED_SMOKE_LEARNER=1)
// — NOT a real Dex login (Dex's real `sub` is a protobuf/base64 blob, e.g.
// `Cgx1LWFsaWNlLTAwMDESBWxvY2Fs`, so it can't be predicted here).
//
// Asserts, as that learner: courses -> path -> lesson -> answer -> complete -> profile
// all return 200 with the expected shapes; the SRS row is course-scoped; XP is
// awarded once (repeat completion -> 409); PWA files (manifest/sw/icons) are public;
// and an unauthenticated /api/* request is rejected (401). Exits non-zero on any failure.
import pg from 'pg';
import { encode } from '@auth/core/jwt';

const base = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const secret = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me-0123456789abcdef';
const dbUrl = process.env.DATABASE_URL ?? 'postgres://franca:franca@localhost:5432/franca';
const SMOKE_SUB = 'u-alice-0001';
// Non-HTTPS dev origin uses the unprefixed cookie name; HTTPS uses `__Secure-`.
const COOKIE_NAME = base.startsWith('https:') ? '__Secure-authjs.session-token' : 'authjs.session-token';

const PERSISTABLE = new Set(['vocab', 'sentence', 'conjugation']);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

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

// Confirm the SRS row written for this answer is scoped to the active course.
async function assertSrsCourseScoped(learnerId, courseId, ex) {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT course_id FROM srs_state WHERE learner_id = $1 AND item_id = $2 AND item_type = $3 AND direction = $4',
      [learnerId, ex.itemId, ex.itemType, ex.direction],
    );
    assert(rows.length > 0, 'SRS row not persisted for answered item');
    assert(
      rows[0].course_id === courseId,
      `SRS row course_id ${rows[0].course_id} != active course ${courseId}`,
    );
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
  assert(Array.isArray(courses.courses) && courses.courses.length > 0, 'no courses');
  assert(typeof courses.activeCourseId === 'number', 'no active course id');
  console.log(`courses OK: ${courses.courses.length} course(s), active ${courses.activeCourseId}`);

  // 1. path
  const path = await json(await get('/api/path'));
  assert(Array.isArray(path.units) && path.units.length > 0, 'no units seeded');
  const unitId = path.activeUnitId ?? path.units[0].id;
  const courseId = path.activeCourse?.id ?? courses.activeCourseId;
  assert(typeof courseId === 'number', 'no course id on path');
  console.log(`path OK: ${path.units.length} units, active ${unitId}, course ${courseId}`);

  // 2. lesson
  const plan = await json(await get(`/api/lesson?unitId=${unitId}`));
  assert(Array.isArray(plan.exercises) && plan.exercises.length > 0, 'empty lesson');
  assert(plan.courseId === courseId, 'lesson courseId mismatch');
  console.log(`lesson OK: ${plan.exercises.length} exercises, ${plan.conceptCount} concepts`);

  // 3. answer — pick a persistable exercise so an SRS row is actually written.
  const graded = plan.exercises.find((e) => PERSISTABLE.has(e.itemType)) ?? plan.exercises[0];
  await json(
    await post('/api/answer', {
      itemId: graded.itemId,
      itemType: graded.itemType,
      direction: graded.direction,
      firstGradedForConcept: true,
      result: { correct: true, firstTry: true, fast: true, usedHint: false },
    }),
  );
  console.log('answer OK');

  // 3b. SRS row is scoped to the active course (multi-course isolation).
  if (PERSISTABLE.has(graded.itemType)) {
    await assertSrsCourseScoped(learnerId, courseId, graded);
    console.log(`srs-scope OK: srs_state.course_id == ${courseId}`);
  } else {
    console.log('srs-scope SKIPPED: first exercise is not a persistable item type');
  }

  // 4. complete
  const completeBody = {
    sessionId: plan.sessionId,
    unitId,
    courseId: plan.courseId,
    numCorrect: plan.conceptCount,
    numWrong: 0,
    comboMax: plan.conceptCount,
    requeuedConcepts: [],
  };
  const done = await json(await post('/api/lesson/complete', completeBody));
  assert(typeof done.score.totalXp === 'number', 'no score');
  console.log(`complete OK: +${done.score.totalXp} XP, streak ${done.streak.streak}`);

  // 5. profile reflects progress
  const profile = await json(await get('/api/profile'));
  assert(profile.lessonsCompleted >= 1, 'lesson not recorded');
  assert(typeof profile.courseXpTotal === 'number', 'no course XP total');
  const xpAfterFirst = profile.courseXpTotal;
  const lessonsAfterFirst = profile.lessonsCompleted;
  console.log(`profile OK: ${profile.lessonsCompleted} lessons, course XP ${profile.courseXpTotal}`);

  // 6. XP is awarded exactly once — replaying the same completed session is a 409.
  const repeat = await post('/api/lesson/complete', completeBody);
  assert(repeat.status === 409, `expected 409 on repeat complete, got ${repeat.status}`);
  const profile2 = await json(await get('/api/profile'));
  assert(
    profile2.courseXpTotal === xpAfterFirst && profile2.lessonsCompleted === lessonsAfterFirst,
    `repeat complete changed totals (xp ${xpAfterFirst}->${profile2.courseXpTotal}, ` +
      `lessons ${lessonsAfterFirst}->${profile2.lessonsCompleted})`,
  );
  console.log('xp-once OK: repeat complete -> 409, totals unchanged');

  // 7. PWA files are public (served without a session cookie).
  for (const p of ['/manifest.webmanifest', '/sw.js', '/icons/icon-192.png']) {
    const res = await fetch(`${base}${p}`);
    assert(res.status === 200, `expected ${p} public 200, got ${res.status}`);
  }
  console.log('pwa OK: manifest, sw, icon all public (200)');

  // 8. unauthenticated API request is rejected by the auth layer.
  const noAuth = await fetch(`${base}/api/path`);
  assert(noAuth.status === 401, `expected unauthenticated /api/path -> 401, got ${noAuth.status}`);
  console.log(`auth-gate OK: unauthenticated /api/path -> ${noAuth.status}`);

  console.log('\nSMOKE PASSED');
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err.message);
  process.exit(1);
});
