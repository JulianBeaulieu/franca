'use client';
/**
 * Thin wrapper around `web-haptics` (https://haptics.lochie.me,
 * https://github.com/lochie/web-haptics, MIT © 2025 Lochie Axon). That library
 * is a tiny web-haptics shim: `navigator.vibrate` on Android plus an iOS
 * `<input switch>` click trick for devices without the Vibration API.
 *
 * We keep a single lazily-created instance and translate our three lesson
 * events to its built-in presets. Every entry point is a silent no-op on the
 * server and where haptics are unsupported.
 *
 * iOS platform notes (researched 2026-07):
 *  - iOS Safari has never shipped the Vibration API (`navigator.vibrate`), so
 *    web-haptics falls back to an `<input type="checkbox" switch>` trick:
 *    programmatically `click()`ing the switch's label fires the Taptic Engine.
 *  - The switch element exists since Safari 17.4, and the click() trick fired
 *    haptics on iOS 17.4–26.4. web-haptics creates that element and fires the
 *    FIRST tap SYNCHRONOUSLY inside trigger() (subsequent taps of multi-tap
 *    presets run via rAF and iOS ignores those — outside the gesture). Because
 *    our trigger runs inside the answer click handler, the first tap is in the
 *    gesture call stack, which is the only reliable moment on iOS.
 *  - PLATFORM LIMITATION: Apple patched this in iOS 26.5 — a *programmatic*
 *    label click no longer fires the Taptic Engine (only a real finger tap on a
 *    visible switch does). So on iOS 26.5+ web haptics cannot work from JS at
 *    all; there is currently no replacement web API. On Android (Vibration API)
 *    and iOS 17.4–26.4 our haptics work. This is why the user may feel nothing.
 */
import { WebHaptics } from 'web-haptics';

export type HapticEvent = 'correct' | 'incorrect' | 'complete';

// correct → single light confirmation tap; incorrect → three sharp error taps;
// complete → the celebratory two-tap success pattern.
const PRESET: Record<HapticEvent, string> = {
  correct: 'light',
  incorrect: 'error',
  complete: 'success',
};

let instance: WebHaptics | null = null;

function getInstance(): WebHaptics | null {
  if (typeof window === 'undefined') return null;
  // Constructing is side-effect-free (no DOM/audio until trigger); the DOM
  // fallback used for the iOS trick is created lazily on first trigger.
  instance ??= new WebHaptics();
  return instance;
}

/**
 * Construct the web-haptics instance eagerly from inside a user gesture (call on
 * the first answer tap). The instance's `<input switch>` DOM element is still
 * created lazily on the first trigger(), but that first trigger also runs in the
 * gesture, so the element is created + clicked synchronously in-gesture — the
 * only moment iOS honours. Never throws; no-ops when unsupported.
 */
export function warmHaptics(): void {
  getInstance();
}

/** Fire the haptic for a lesson event. Never throws; no-ops when unsupported. */
export function playHaptic(event: HapticEvent): void {
  const haptics = getInstance();
  if (!haptics) return;
  void haptics.trigger(PRESET[event]).catch(() => {
    // Haptics are best-effort feedback — a failure must never surface.
  });
}
