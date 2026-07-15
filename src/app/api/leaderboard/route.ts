import { NextResponse } from 'next/server';
import { getLeaderboard, getLearnerSettings } from '@/db/repo';
import { resolveDisplayName, weekEnd, weekStart, type LeaderboardEntry } from '@/lib/leaderboard';
import { mergeSettings } from '@/lib/settings';
import { getSessionLearnerId } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const learnerId = await getSessionLearnerId();
  if (learnerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Gate #1: the viewer themself must be opted in. A learner who has not
  // opted in cannot see anyone else's data — not even by probing this route.
  const viewerSettings = mergeSettings(await getLearnerSettings(learnerId));
  if (!viewerSettings.leaderboardOptIn) {
    return NextResponse.json(
      { error: 'leaderboard requires opt-in', optedIn: false },
      { status: 403 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const start = weekStart(today);
  const end = weekEnd(today);

  // Gate #2 (belt and suspenders): getLeaderboard's SQL itself only ever
  // returns learners with leaderboardOptIn === true, so even if gate #1 above
  // had a bug, no non-opted-in learner's data could leak through this list.
  const rows = await getLeaderboard(start, end);

  const entries: LeaderboardEntry[] = rows.map((r) => ({
    id: r.id,
    displayName: resolveDisplayName(r.display_name, r.email),
    picture: r.picture,
    streak: r.streak_count,
    xpTotal: r.xp_total,
    weeklyXp: r.weekly_xp,
    isMe: r.id === learnerId,
  }));

  return NextResponse.json({ optedIn: true, entries });
}
