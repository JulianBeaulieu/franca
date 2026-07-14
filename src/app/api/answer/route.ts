import { NextResponse, type NextRequest } from 'next/server';
import { deductHeart, getItemCourseId, getSrsState, upsertSrsState } from '@/db/repo';
import { getSessionLearnerId } from '@/lib/session';
import { applyAnswerToSrs } from '@/lib/srs';
import { mulberry32 } from '@/lib/rng';
import { hashString } from '@/lib/hash';
import type { AnswerResult, Direction, ItemType, SrsState } from '@/lib/types';

interface AnswerBody {
  itemId: number;
  itemType: ItemType;
  direction: Direction;
  firstGradedForConcept: boolean;
  result: AnswerResult;
}

// Item types that own a real SRS row. Match warmups may post with a non-SRS
// item type at runtime (the request body is untrusted JSON), so we gate
// persistence on a runtime membership check rather than the compile-time union.
const PERSISTABLE_ITEM_TYPES: ReadonlySet<string> = new Set(['vocab', 'sentence', 'conjugation']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as AnswerBody;
  const today = new Date().toISOString().slice(0, 10);

  let hearts: number | undefined;
  if (!body.result.correct) hearts = await deductHeart(learnerId);

  // conjugation/match items may not carry a real SRS row; skip persistence for match blocks.
  if (!PERSISTABLE_ITEM_TYPES.has(body.itemType)) {
    return NextResponse.json({ ok: true, hearts });
  }

  // Stamp the SRS row with the item's TRUE course (from its content row), not
  // the learner's active course: a course switch in another tab mid-lesson must
  // neither corrupt nor fail this in-flight answer. Unknown item -> 404.
  const courseId = await getItemCourseId(body.itemType, body.itemId);
  if (courseId === null) return NextResponse.json({ error: 'item not found' }, { status: 404 });

  const priorState = await getSrsState(learnerId, body.itemId, body.itemType, body.direction);
  const existing: SrsState =
    priorState ?? {
      itemId: body.itemId,
      itemType: body.itemType,
      direction: body.direction,
      reps: 0,
      ease: 2.5,
      interval: 0,
      dueAt: null,
      lapses: 0,
      lastGrade: null,
      lastReviewedAt: null,
      state: 'new',
    };

  // If no SRS row existed yet, treat this as first-graded regardless of what the
  // client claims: a lost first-graded POST would otherwise let a later
  // firstGraded:false POST upsert a permanent state:'new'/dueAt:null row, which
  // hides the item from new-word selection forever.
  const firstGradedForConcept = priorState === null ? true : body.firstGradedForConcept;

  const rng = mulberry32(hashString(`${body.itemType}:${String(body.itemId)}:${today}`));
  const next = applyAnswerToSrs(existing, body.result, firstGradedForConcept, today, rng);
  await upsertSrsState(learnerId, courseId, next);
  return NextResponse.json({ ok: true, hearts });
}
