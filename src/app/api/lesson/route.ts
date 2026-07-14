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

  // Contract: empty lesson plans are legal generator output, but we must not
  // create a session for one (an empty lesson would otherwise score as a
  // "perfect" run on completion and award XP for nothing). Report nothing-to-do.
  if (plan.exercises.length === 0) {
    return NextResponse.json({ empty: true, message: 'nothing to learn right now' }, { status: 200 });
  }

  await createLessonSession(learnerId, courseId, sessionId, unitId);
  // Course id rides alongside the plan so the client can echo it back on complete.
  return NextResponse.json({ ...plan, courseId });
}
