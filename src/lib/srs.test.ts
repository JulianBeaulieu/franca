import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyAnswerToSrs,
  applyLapse,
  gradeFromResult,
  isLeech,
  scheduleReview,
} from './srs';
import type { AnswerResult } from './types';
import type { SrsState } from './types';

const base: SrsState = {
  itemId: 1,
  itemType: 'vocab',
  direction: 'l2_to_l1',
  reps: 0,
  ease: 2.5,
  interval: 0,
  dueAt: null,
  lapses: 0,
  lastGrade: null,
  lastReviewedAt: null,
  state: 'new',
};

// rng fixed at 0.5 -> fuzz factor uniform(0.85,1.15) = 1.0 (no change)
const noFuzz = (): number => 0.5;

describe('gradeFromResult', () => {
  it('maps behaviors to q', () => {
    expect(gradeFromResult({ correct: true, firstTry: true, fast: true, usedHint: false })).toBe(5);
    expect(gradeFromResult({ correct: true, firstTry: true, fast: false, usedHint: false })).toBe(4);
    expect(gradeFromResult({ correct: true, firstTry: true, fast: false, usedHint: true })).toBe(3);
    expect(gradeFromResult({ correct: true, firstTry: false, fast: false, usedHint: false })).toBe(2);
    expect(gradeFromResult({ correct: false, firstTry: false, fast: false, usedHint: false })).toBe(1);
  });
});

describe('scheduleReview PASS', () => {
  it('first pass -> interval 1, due tomorrow, state review', () => {
    const next = scheduleReview(base, 5, '2026-07-13', noFuzz);
    expect(next.reps).toBe(1);
    expect(next.interval).toBe(1);
    expect(next.dueAt).toBe('2026-07-14');
    expect(next.state).toBe('review');
    expect(next.ease).toBeCloseTo(2.6, 5);
  });

  it('second pass -> interval 6', () => {
    const first = scheduleReview(base, 5, '2026-07-13', noFuzz);
    const second = scheduleReview(first, 5, '2026-07-14', noFuzz);
    expect(second.reps).toBe(2);
    expect(second.interval).toBe(6);
    expect(second.dueAt).toBe('2026-07-20');
  });

  it('third pass -> round(interval * ease)', () => {
    const s: SrsState = { ...base, reps: 2, ease: 2.5, interval: 6, state: 'review' };
    const next = scheduleReview(s, 4, '2026-07-13', noFuzz);
    expect(next.interval).toBe(15); // round(6 * 2.5)
  });
});

describe('scheduleReview FAIL (soft lapse)', () => {
  it('shrinks interval to 30% and does not zero it, enters relearning', () => {
    const s: SrsState = { ...base, reps: 3, ease: 2.5, interval: 20, state: 'review' };
    const next = scheduleReview(s, 1, '2026-07-13', noFuzz);
    expect(next.lapses).toBe(1);
    expect(next.reps).toBe(0);
    expect(next.ease).toBeCloseTo(2.3, 5);
    expect(next.interval).toBe(6); // round(20 * 0.30)
    expect(next.state).toBe('relearning');
    expect(next.dueAt).toBe('2026-07-19');
  });

  it('ease never drops below the floor', () => {
    const s: SrsState = { ...base, ease: 1.3, interval: 3 };
    const next = scheduleReview(s, 0, '2026-07-13', noFuzz);
    expect(next.ease).toBe(1.3);
  });
});

describe('applyLapse', () => {
  it('soft-lapses without rescheduling logic beyond the 30% shrink', () => {
    const s: SrsState = { ...base, reps: 3, ease: 2.5, interval: 20, lapses: 2, state: 'review' };
    const next = applyLapse(s, '2026-07-13');
    expect(next.lapses).toBe(3);
    expect(next.reps).toBe(0);
    expect(next.ease).toBeCloseTo(2.3, 5);
    expect(next.interval).toBe(6); // round(20 * 0.30)
    expect(next.state).toBe('relearning');
    expect(next.dueAt).toBe('2026-07-19');
    expect(next.lastGrade).toBe(1);
  });

  it('floors the interval at 1 day and the ease at the floor', () => {
    const s: SrsState = { ...base, ease: 1.3, interval: 0 };
    const next = applyLapse(s, '2026-07-13');
    expect(next.interval).toBe(1);
    expect(next.ease).toBe(1.3);
    expect(next.dueAt).toBe('2026-07-14');
  });
});

describe('isLeech', () => {
  it('flags at 8 lapses', () => {
    expect(isLeech({ ...base, lapses: 8 })).toBe(true);
    expect(isLeech({ ...base, lapses: 7 })).toBe(false);
  });
});

describe('applyAnswerToSrs', () => {
  const correctFirstTry: AnswerResult = {
    correct: true,
    firstTry: true,
    fast: true,
    usedHint: false,
  };
  const correctRequeue: AnswerResult = {
    correct: true,
    firstTry: false,
    fast: false,
    usedHint: false,
  };
  const incorrect: AnswerResult = {
    correct: false,
    firstTry: false,
    fast: false,
    usedHint: false,
  };

  it('first graded answer -> full reschedule via scheduleReview', () => {
    const next = applyAnswerToSrs(base, correctFirstTry, true, '2026-07-13', noFuzz);
    expect(next).toEqual(scheduleReview(base, 5, '2026-07-13', noFuzz));
    expect(next.state).toBe('review');
    expect(next.reps).toBe(1);
  });

  it('first graded answer, incorrect -> reschedule applies the fail branch (a lapse)', () => {
    const s: SrsState = { ...base, reps: 3, ease: 2.5, interval: 20, state: 'review' };
    const next = applyAnswerToSrs(s, incorrect, true, '2026-07-13', noFuzz);
    expect(next).toEqual(scheduleReview(s, 1, '2026-07-13', noFuzz));
    expect(next.lapses).toBe(1);
    expect(next.state).toBe('relearning');
  });

  it('subsequent incorrect answer -> soft lapse', () => {
    const s: SrsState = { ...base, reps: 3, ease: 2.5, interval: 20, lapses: 2, state: 'review' };
    const next = applyAnswerToSrs(s, incorrect, false, '2026-07-13', noFuzz);
    expect(next).toEqual(applyLapse(s, '2026-07-13'));
    expect(next.lapses).toBe(3);
    expect(next.state).toBe('relearning');
  });

  it('regression: subsequent correct re-queued answer (firstTry:false) -> state unchanged, NO lapse', () => {
    const s: SrsState = { ...base, reps: 3, ease: 2.5, interval: 20, lapses: 2, state: 'review' };
    const next = applyAnswerToSrs(s, correctRequeue, false, '2026-07-13', noFuzz);
    // Must return the existing state identically: no lapse increment, no ease change.
    expect(next).toBe(s);
    expect(next.lapses).toBe(2);
    expect(next.ease).toBe(2.5);
    expect(next.state).toBe('review');
  });
});

describe('addDays', () => {
  it('adds calendar days', () => {
    expect(addDays('2026-07-13', 1)).toBe('2026-07-14');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});
