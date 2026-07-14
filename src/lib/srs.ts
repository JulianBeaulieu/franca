import { EASE_CEIL, EASE_FLOOR, LEECH_LAPSES } from './config';
import type { AnswerResult, GradeQuality, Rng, SrsState } from './types';

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function gradeFromResult(result: AnswerResult): GradeQuality {
  if (!result.correct) return 1;
  if (!result.firstTry) return 2;
  if (result.usedHint) return 3;
  if (!result.fast) return 4;
  return 5;
}

/** SM-2-Lite. Pure; inject `today` ('YYYY-MM-DD') and `rng` for the fuzz. */
export function scheduleReview(
  state: SrsState,
  q: GradeQuality,
  today: string,
  rng: Rng,
): SrsState {
  const next: SrsState = { ...state, lastGrade: q, lastReviewedAt: `${today}T00:00:00Z` };

  if (q < 3) {
    // FAIL — soft lapse
    next.lapses = state.lapses + 1;
    next.ease = Math.max(EASE_FLOOR, state.ease - 0.2);
    next.reps = 0;
    next.interval = Math.max(1, Math.round(state.interval * 0.3));
    next.state = 'relearning';
    next.dueAt = addDays(today, next.interval);
    return next;
  }

  // PASS
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  next.ease = clamp(state.ease + easeDelta, EASE_FLOOR, EASE_CEIL);
  let interval: number;
  if (state.reps === 0) interval = 1;
  else if (state.reps === 1) interval = 6;
  else interval = Math.round(state.interval * next.ease);
  const fuzz = 0.85 + rng() * 0.3; // uniform(0.85, 1.15)
  interval = Math.max(1, Math.round(interval * fuzz));
  next.interval = interval;
  next.reps = state.reps + 1;
  next.state = 'review';
  next.dueAt = addDays(today, interval);
  return next;
}

/** Soft-lapse-only update, for subsequent in-lesson misses on an already-graded item. */
export function applyLapse(state: SrsState, today: string): SrsState {
  const interval = Math.max(1, Math.round(state.interval * 0.3));
  return {
    ...state,
    lapses: state.lapses + 1,
    ease: Math.max(EASE_FLOOR, state.ease - 0.2),
    reps: 0,
    interval,
    state: 'relearning',
    dueAt: addDays(today, interval),
    lastGrade: 1,
    lastReviewedAt: `${today}T00:00:00Z`,
  };
}

export function isLeech(state: SrsState): boolean {
  return state.lapses >= LEECH_LAPSES;
}

/**
 * Selects the SRS update for a single graded answer.
 *
 * - First graded answer for a concept in this lesson: full SM-2-Lite reschedule.
 * - Subsequent answers: a soft lapse applies ONLY on an actual incorrect answer.
 *   A correct answer on a re-queued exercise (e.g. clearing a miss on a later,
 *   non-first-try attempt) leaves the state untouched — it must NOT be mistaken
 *   for a lapse just because its grade quality is below the pass threshold.
 */
export function applyAnswerToSrs(
  existing: SrsState,
  result: AnswerResult,
  firstGradedForConcept: boolean,
  today: string,
  rng: Rng,
): SrsState {
  if (firstGradedForConcept) {
    return scheduleReview(existing, gradeFromResult(result), today, rng);
  }
  if (!result.correct) {
    return applyLapse(existing, today);
  }
  return existing;
}
