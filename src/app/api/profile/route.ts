import { NextResponse } from 'next/server';
import {
  getActiveCourseId,
  getActivityCalendar,
  getCourseById,
  getLearner,
  getLearnerCourses,
  getLessonsCompleted,
  getWordsLearned,
} from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const learner = await getLearner(learnerId, now);
  const courseId = learner.active_course_id ?? (await getActiveCourseId(learnerId));
  if (courseId === null) return NextResponse.json({ error: 'no active course' }, { status: 409 });

  const [course, wordsLearned, lessonsCompleted, calendar, learnerCourses] = await Promise.all([
    getCourseById(courseId),
    getWordsLearned(learnerId, courseId),
    getLessonsCompleted(learnerId, courseId),
    getActivityCalendar(learnerId),
    getLearnerCourses(learnerId),
  ]);
  const xpToday = calendar.find((d) => d.date === today)?.xp ?? 0;
  const courseXpTotal = learnerCourses.find((c) => c.id === courseId)?.xp_total ?? 0;

  return NextResponse.json({
    name: learner.display_name ?? learner.name,
    picture: learner.picture,
    xpTotal: learner.xp_total,
    courseXpTotal,
    gems: learner.gems,
    hearts: learner.hearts,
    streak: learner.streak_count,
    longestStreak: learner.longest_streak,
    dailyGoalXp: learner.daily_goal_xp,
    xpToday,
    wordsLearned,
    lessonsCompleted,
    activeCourse: course,
    calendar,
  });
}
