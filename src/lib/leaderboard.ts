import { addDays } from './srs';

/**
 * Monday of the ISO week ('YYYY-MM-DD') containing `date`. Weeks run Monday
 * through Sunday. `Date#getUTCDay()` returns 0 for Sunday .. 6 for Saturday,
 * so Sunday is the one day that needs to look *backward* six days rather than
 * forward to reach Monday.
 */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(date, diffToMonday);
}

/** Last day (Sunday) of the ISO week containing `date`. */
export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6);
}

/**
 * Resolves the name shown on the leaderboard: the learner's display name,
 * falling back to the local-part of their email, falling back to "Learner".
 * Mirrors the brief's privacy-neutral fallback chain — never falls back to
 * the internal `learner.name` (OIDC subject-derived) column.
 */
export function resolveDisplayName(displayName: string | null, email: string | null): string {
  const trimmed = displayName?.trim() ?? '';
  if (trimmed.length > 0) return trimmed;
  const localPart = email?.split('@')[0]?.trim() ?? '';
  if (localPart.length > 0) return localPart;
  return 'Learner';
}

export interface LeaderboardEntry {
  id: number;
  displayName: string;
  picture: string | null;
  streak: number;
  xpTotal: number;
  weeklyXp: number;
  isMe: boolean;
}

export type LeaderboardMetric = 'weeklyXp' | 'xpTotal';

/**
 * Sorts a copy of `entries` by `metric` descending; ties break on display
 * name ascending so equal-XP learners still get a stable, deterministic
 * order instead of depending on incoming array order.
 */
export function sortLeaderboard(
  entries: LeaderboardEntry[],
  metric: LeaderboardMetric,
): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const diff = b[metric] - a[metric];
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName);
  });
}
