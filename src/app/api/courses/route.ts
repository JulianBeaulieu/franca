import { NextResponse } from 'next/server';
import { getActiveCourseId, getLearnerCourses } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [activeCourseId, courses] = await Promise.all([
    getActiveCourseId(learnerId),
    getLearnerCourses(learnerId),
  ]);
  return NextResponse.json({ activeCourseId, courses });
}
