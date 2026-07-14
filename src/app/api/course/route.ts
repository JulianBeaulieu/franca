import { NextResponse, type NextRequest } from 'next/server';
import { getCourseById, setActiveCourse } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';

interface SetCourseBody {
  courseId: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as Partial<SetCourseBody>;
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }

  const course = await getCourseById(courseId);
  if (!course) return NextResponse.json({ error: 'unknown course' }, { status: 404 });

  await setActiveCourse(learnerId, courseId);
  return NextResponse.json({ ok: true, activeCourseId: courseId });
}
