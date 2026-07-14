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

// unitId/courseId are deliberately NOT part of this contract: the award course
// and unit are read from the validated lesson_session row inside completeLesson,
// so the client cannot redirect XP/progress to another course by supplying them.
interface CompleteBody {
  sessionId: string;
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

  // Contract: an empty lesson (no graded answers) scores as "perfect" and would
  // award XP for nothing. Such a lesson is never created (see /api/lesson), so a
  // completion with zero answers is invalid — reject before any writeback.
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

  const result = await completeLesson({
    learnerId,
    sessionId: body.sessionId,
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

  // Pull requeued concepts' due date in to tomorrow (learning-science §6.5).
  // Runs ONLY after the session row is validated (success path), so a 404/409
  // replay never mutates SRS. Scoped to the session's OWN course (result.courseId
  // from the validated row), never a client-supplied course id.
  const tomorrow = addDays(today, 1);
  for (const c of body.requeuedConcepts) {
    const st = await getSrsState(learnerId, c.itemId, c.itemType, c.direction);
    if (st?.dueAt && st.dueAt > tomorrow) {
      await upsertSrsState(learnerId, result.courseId, { ...st, dueAt: tomorrow });
    }
  }

  return NextResponse.json({ score, streak, gemsEarned });
}
