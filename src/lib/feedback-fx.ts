'use client';
/**
 * Single gating point for lesson feedback effects (haptics + sound). The lesson
 * client fires one call per event site; the settings checks live only here so
 * they aren't duplicated across the correct/incorrect/complete call sites.
 *
 * A `typo` is treated as a correct (gentle) answer by the caller, which passes
 * `'correct'` for it.
 */
import { playHaptic, warmHaptics, type HapticEvent } from './haptics';
import { playComplete, playCorrect, playIncorrect, unlockAudio } from './sfx';

export type FeedbackEvent = HapticEvent;

interface FeedbackFxSettings {
  haptics: boolean;
  sounds: boolean;
}

const SOUND: Record<FeedbackEvent, () => void> = {
  correct: playCorrect,
  incorrect: playIncorrect,
  complete: playComplete,
};

/** Fire the haptic and sound for a lesson event, each gated by its setting. */
export function fireFeedback(event: FeedbackEvent, settings: FeedbackFxSettings): void {
  if (settings.haptics) playHaptic(event);
  if (settings.sounds) SOUND[event]();
}

/**
 * Prime audio + haptics from inside the first user gesture of the lesson (call
 * at the very start of the answer-submit handler). iOS only unlocks the
 * AudioContext and honours the haptic switch click when they first run
 * synchronously in a gesture, so warming here makes the subsequent
 * fireFeedback() reliable. Gated by settings; each call is a safe no-op.
 */
export function warmFeedback(settings: FeedbackFxSettings): void {
  if (settings.haptics) warmHaptics();
  if (settings.sounds) unlockAudio();
}
