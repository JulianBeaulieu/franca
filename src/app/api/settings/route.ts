import { NextResponse, type NextRequest } from 'next/server';
import { getLearnerSettings, updateLearnerSettings } from '@/db/repo';
import { mergeSettings, validatePatch } from '@/lib/settings';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const stored = await getLearnerSettings(learnerId);
  return NextResponse.json(mergeSettings(stored));
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body: unknown = await req.json();
  const result = validatePatch(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const stored = await updateLearnerSettings(learnerId, result.patch);
  return NextResponse.json(mergeSettings(stored));
}
