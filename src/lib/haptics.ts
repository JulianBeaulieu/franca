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

/** Fire the haptic for a lesson event. Never throws; no-ops when unsupported. */
export function playHaptic(event: HapticEvent): void {
  const haptics = getInstance();
  if (!haptics) return;
  void haptics.trigger(PRESET[event]).catch(() => {
    // Haptics are best-effort feedback — a failure must never surface.
  });
}
