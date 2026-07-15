/**
 * Pure math for the auto-continue timer's fill overlay. The rAF loop and
 * visibility handling live in the FeedbackBanner hook; this module owns only
 * the two deterministic calculations so they can be unit-tested without a DOM.
 */

/**
 * Advance accumulated *active* elapsed time by one animation-frame delta.
 * While paused (tab hidden) time must not accrue, and negative or non-finite
 * deltas (clock skew, first frame) are treated as zero so the fill can only
 * ever move forward.
 */
export function advanceElapsed(prevElapsedMs: number, deltaMs: number, paused: boolean): number {
  if (paused) return prevElapsedMs;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return prevElapsedMs;
  return prevElapsedMs + deltaMs;
}

/**
 * Convert accumulated elapsed time to a 0..1 fill fraction, clamped. A
 * non-positive duration means "no delay" and completes immediately (1).
 */
export function progressFromElapsed(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  if (elapsedMs <= 0) return 0;
  const fraction = elapsedMs / durationMs;
  return fraction >= 1 ? 1 : fraction;
}

/**
 * The auto-continue timer must fire ONLY for a correct answer. Wrong/almost-right
 * answers ('incorrect' | 'typo') always wait indefinitely for a manual Continue
 * so the learner can read the correction. Returns the timer duration in ms, or 0
 * (= "no timer", behaves like auto-continue-off) when it must not run.
 */
export function autoContinueDurationMs(
  opts: { autoContinue: boolean; autoContinueSeconds: number },
  status: 'correct' | 'incorrect' | 'typo',
): number {
  if (!opts.autoContinue || status !== 'correct') return 0;
  return opts.autoContinueSeconds * 1000;
}
