import { NextResponse } from 'next/server';
import {
  getActiveCourseId,
  getActivityCalendar,
  getCourseStats,
  getDaysActive,
  getLearner,
  getLessonsCompleted,
  getTotalLessonsCompleted,
  getWordsLearned,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';
import { MASTERED_INTERVAL_DAYS, zeroFillDays } from '@/lib/stats';

const CHART_WINDOW_DAYS = 30;

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const learner = await getLearner(learnerId, now);
  // Achievement inputs mirror the profile route exactly (same active-course
  // resolution, same getWordsLearned/getLessonsCompleted calls) so both pages
  // always show identical achievement tiers. A learner with no active course
  // contributes zeros here instead of erroring — the overview chips below
  // stay global either way.
  const activeCourseId = learner.active_course_id ?? (await getActiveCourseId(learnerId));

  const [daysActive, lessonsCompleted, calendar, courses, achievementWords, achievementLessons] =
    await Promise.all([
      getDaysActive(learnerId),
      getTotalLessonsCompleted(learnerId),
      getActivityCalendar(learnerId),
      getCourseStats(learnerId, MASTERED_INTERVAL_DAYS),
      activeCourseId === null ? Promise.resolve(0) : getWordsLearned(learnerId, activeCourseId),
      activeCourseId === null ? Promise.resolve(0) : getLessonsCompleted(learnerId, activeCourseId),
    ]);

  return NextResponse.json({
    streak: learner.streak_count,
    longestStreak: learner.longest_streak,
    xpTotal: learner.xp_total,
    daysActive,
    lessonsCompleted,
    achievementWords,
    achievementLessons,
    last30Days: zeroFillDays(calendar, CHART_WINDOW_DAYS, today),
    courses,
  });
}
