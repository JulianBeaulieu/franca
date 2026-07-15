import { describe, expect, it } from 'vitest';
import { advanceElapsed, autoContinueDurationMs, progressFromElapsed } from './auto-continue';

describe('advanceElapsed', () => {
  it('accumulates positive deltas while running', () => {
    expect(advanceElapsed(0, 16, false)).toBe(16);
    expect(advanceElapsed(100, 16, false)).toBe(116);
  });

  it('does not accrue time while paused', () => {
    expect(advanceElapsed(100, 500, true)).toBe(100);
  });

  it('ignores non-positive or non-finite deltas', () => {
    expect(advanceElapsed(100, 0, false)).toBe(100);
    expect(advanceElapsed(100, -20, false)).toBe(100);
    expect(advanceElapsed(100, Number.NaN, false)).toBe(100);
    expect(advanceElapsed(100, Number.POSITIVE_INFINITY, false)).toBe(100);
  });
});

describe('progressFromElapsed', () => {
  it('maps elapsed/duration to a 0..1 fraction', () => {
    expect(progressFromElapsed(0, 3000)).toBe(0);
    expect(progressFromElapsed(1500, 3000)).toBe(0.5);
    expect(progressFromElapsed(3000, 3000)).toBe(1);
  });

  it('clamps overshoot to 1', () => {
    expect(progressFromElapsed(9000, 3000)).toBe(1);
  });

  it('clamps negative elapsed to 0', () => {
    expect(progressFromElapsed(-50, 3000)).toBe(0);
  });

  it('completes immediately for a non-positive duration', () => {
    expect(progressFromElapsed(0, 0)).toBe(1);
    expect(progressFromElapsed(0, -1000)).toBe(1);
  });
});

describe('autoContinueDurationMs', () => {
  const on = { autoContinue: true, autoContinueSeconds: 3 };

  it('runs the timer only for a correct answer', () => {
    expect(autoContinueDurationMs(on, 'correct')).toBe(3000);
  });

  it('never runs the timer for typo or incorrect answers', () => {
    expect(autoContinueDurationMs(on, 'typo')).toBe(0);
    expect(autoContinueDurationMs(on, 'incorrect')).toBe(0);
  });

  it('is off (0) for every status when auto-continue is disabled', () => {
    const off = { autoContinue: false, autoContinueSeconds: 3 };
    expect(autoContinueDurationMs(off, 'correct')).toBe(0);
    expect(autoContinueDurationMs(off, 'typo')).toBe(0);
    expect(autoContinueDurationMs(off, 'incorrect')).toBe(0);
  });

  it('scales the delay by the configured seconds', () => {
    expect(autoContinueDurationMs({ autoContinue: true, autoContinueSeconds: 7 }, 'correct')).toBe(7000);
  });
});
