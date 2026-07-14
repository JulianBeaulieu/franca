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
