'use client';
/**
 * Lesson sound effects, synthesized with the Web Audio API — no audio files.
 *
 * Every frequency / duration / envelope value is a named constant below so the
 * sounds can be auditioned and tweaked in one place (see the standalone
 * preview page that mirrors these numbers). A single AudioContext is created
 * lazily on the first gesture-driven call and reused; all entry points are
 * silent no-ops on the server or where Web Audio is unavailable, and never
 * throw.
 *
 * iOS platform notes (researched 2026-07):
 *  - The hardware ring/silent switch MUTES Web Audio on iOS Safari (HTML <audio>
 *    is exempt, Web Audio is not — see WebKit bug 237322). We opt into the
 *    AudioSession "playback" category (`navigator.audioSession.type`, iOS 16.4+)
 *    so lesson sounds play even with the silent switch on. If a user still hears
 *    nothing on iOS < 16.4, that is a platform limitation — the silent switch
 *    wins and there is no web API to override it on those versions.
 *  - A freshly created AudioContext is 'suspended' until resume() is called from
 *    inside a user gesture. We create + resume on the first answer tap (see
 *    unlockAudio, called from the lesson submit handler) and await resume()
 *    before scheduling so the very first sound is not dropped.
 */

// ── Master ──────────────────────────────────────────────────────────────────
const MASTER_GAIN = 0.22; // keep well below clipping; sounds layer with UI

// Per-note envelope (seconds).
const ATTACK = 0.008;
const RELEASE = 0.12;

// ── playCorrect: bright rising two-note major chime (C5 → E5) ────────────────
const CORRECT_TYPE: OscillatorType = 'triangle';
const CORRECT_NOTE_HZ = [523.25, 659.25]; // C5, E5 (major third)
const CORRECT_NOTE_DUR = 0.16;
const CORRECT_STEP = 0.09; // stagger between the two notes
const CORRECT_PEAK = 1.0;

// ── playIncorrect: soft low descending two-tone (G3 → D3), gentle ────────────
const INCORRECT_TYPE: OscillatorType = 'sine';
const INCORRECT_NOTE_HZ = [196.0, 146.83]; // G3, D3 (descending fifth)
const INCORRECT_NOTE_DUR = 0.22;
const INCORRECT_STEP = 0.13;
const INCORRECT_PEAK = 0.7; // softer than correct

// ── playComplete: short ascending major arpeggio fanfare (C5-E5-G5-C6) ───────
const COMPLETE_TYPE: OscillatorType = 'triangle';
const COMPLETE_NOTE_HZ = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
const COMPLETE_NOTE_DUR = 0.18;
const COMPLETE_STEP = 0.1;
const COMPLETE_PEAK = 1.0;

let ctx: AudioContext | null = null;

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * iOS 16.4+ AudioSession API: setting the type to 'playback' routes Web Audio to
 * the media channel so the hardware silent switch does not mute it. Absent /
 * throwing on other platforms — best-effort, never surfaces.
 */
function enablePlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (!nav.audioSession) return;
  try {
    nav.audioSession.type = 'playback';
  } catch {
    // Read-only / unsupported value — ignore.
  }
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  enablePlaybackSession();
  return ctx;
}

/**
 * Create + resume the AudioContext from inside a user gesture (call on the first
 * answer tap) so later plays are reliable. iOS only unlocks audio when resume()
 * runs synchronously in a gesture; doing it eagerly here avoids the first real
 * sound racing an un-resumed context. No-op / silent on failure.
 */
export function unlockAudio(): void {
  const context = getCtx();
  if (!context) return;
  try {
    if (context.state === 'suspended') {
      context.resume().catch(() => {
        // Best-effort unlock; an eventual rejection must not surface either.
      });
    }
  } catch {
    // Best-effort unlock; a failure must never surface.
  }
}

interface Note {
  freq: number;
  start: number; // seconds after `now`
  duration: number;
  type: OscillatorType;
  peak: number;
}

function scheduleNote(context: AudioContext, now: number, note: Note): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = note.type;
  osc.frequency.setValueAtTime(note.freq, now + note.start);

  const t0 = now + note.start;
  const peak = MASTER_GAIN * note.peak;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration + RELEASE);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(t0);
  osc.stop(t0 + note.duration + RELEASE);
}

function playSequence(freqs: number[], type: OscillatorType, dur: number, step: number, peak: number): void {
  const context = getCtx();
  if (!context) return;
  const schedule = (): void => {
    try {
      const now = context.currentTime;
      freqs.forEach((freq, i) => {
        scheduleNote(context, now, { freq, start: i * step, duration: dur, type, peak });
      });
    } catch {
      // Web Audio scheduling is best-effort; a failure must never surface.
    }
  };
  try {
    // Await resume before scheduling: a context still 'suspended' reports a
    // frozen currentTime, so notes scheduled against it can be dropped on iOS.
    if (context.state === 'suspended') {
      void context.resume().then(schedule, () => {
        // Resume rejected (e.g. no gesture yet) — nothing to play.
      });
    } else {
      schedule();
    }
  } catch {
    // Best-effort; a failure must never surface.
  }
}

/** Bright rising two-note chime for a correct (or typo) answer. */
export function playCorrect(): void {
  playSequence(CORRECT_NOTE_HZ, CORRECT_TYPE, CORRECT_NOTE_DUR, CORRECT_STEP, CORRECT_PEAK);
}

/** Soft low descending two-tone for an incorrect answer. */
export function playIncorrect(): void {
  playSequence(INCORRECT_NOTE_HZ, INCORRECT_TYPE, INCORRECT_NOTE_DUR, INCORRECT_STEP, INCORRECT_PEAK);
}

/** Short ascending arpeggio fanfare for lesson completion. */
export function playComplete(): void {
  playSequence(COMPLETE_NOTE_HZ, COMPLETE_TYPE, COMPLETE_NOTE_DUR, COMPLETE_STEP, COMPLETE_PEAK);
}
