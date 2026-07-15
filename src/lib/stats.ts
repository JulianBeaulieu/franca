import { addDays } from './srs';

/**
 * A vocab item counts as "mastered" once its SRS interval reaches this many
 * days. 21 days means the learner has passed enough successive reviews
 * (~1 -> 6 -> 21+ under SM-2-Lite growth) without a lapse to be reviewed only
 * about once every three weeks — a proxy for durable long-term retention
 * rather than short-term recall. See src/lib/srs.ts scheduleReview.
 */
export const MASTERED_INTERVAL_DAYS = 21;

export interface DailyXp {
  date: string; // 'YYYY-MM-DD'
  xp: number;
}

/**
 * Zero-fills a sparse `daily_activity` series into a contiguous, chronological
 * `days`-length window ending at `today` (inclusive) so a chart never shows
 * gaps for days with no activity. Rows outside the window are dropped; if two
 * rows share a date, the last one wins.
 */
export function zeroFillDays(activity: DailyXp[], days: number, today: string): DailyXp[] {
  const xpByDate = new Map<string, number>();
  for (const d of activity) xpByDate.set(d.date, d.xp);

  const result: DailyXp[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    result.push({ date, xp: xpByDate.get(date) ?? 0 });
  }
  return result;
}
