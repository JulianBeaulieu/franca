import { describe, expect, it } from 'vitest';
import {
  computeComboBonus,
  computeLessonScore,
  daysBetween,
  regenerateHearts,
  updateStreak,
} from './scoring';
import type { StreakInput } from './types';

describe('computeComboBonus', () => {
  it('gives +1 per 5, capped at 5', () => {
    expect(computeComboBonus(0)).toBe(0);
    expect(computeComboBonus(4)).toBe(0);
    expect(computeComboBonus(5)).toBe(1);
    expect(computeComboBonus(12)).toBe(2);
    expect(computeComboBonus(100)).toBe(5);
  });
});

describe('computeLessonScore', () => {
  it('awards perfect bonus at zero wrong', () => {
    const s = computeLessonScore({ numCorrect: 14, numWrong: 0, comboMax: 14 });
    expect(s.baseXp).toBe(10);
    expect(s.comboBonus).toBe(2);
    expect(s.perfectBonus).toBe(5);
    expect(s.totalXp).toBe(17);
    expect(s.perfect).toBe(true);
    expect(s.accuracy).toBe(1);
  });

  it('no perfect bonus with a mistake', () => {
    const s = computeLessonScore({ numCorrect: 10, numWrong: 2, comboMax: 6 });
    expect(s.perfect).toBe(false);
    expect(s.perfectBonus).toBe(0);
    expect(s.accuracy).toBeCloseTo(10 / 12, 5);
    expect(s.totalXp).toBe(11); // 10 + 1 combo
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-07-13', '2026-07-14')).toBe(1);
    expect(daysBetween('2026-07-13', '2026-07-13')).toBe(0);
    expect(daysBetween('2026-07-13', '2026-07-15')).toBe(2);
  });
});

const streakBase: StreakInput = {
  lastCompletedDate: '2026-07-12',
  today: '2026-07-13',
  currentStreak: 4,
  longestStreak: 10,
  streakFreezes: 0,
  dailyGoalXp: 20,
  xpTodayBefore: 0,
  xpEarned: 25,
};

describe('updateStreak', () => {
  it('increments on a consecutive day when goal met', () => {
    const r = updateStreak(streakBase);
    expect(r.goalMet).toBe(true);
    expect(r.extendedToday).toBe(true);
    expect(r.streak).toBe(5);
  });

  it('does nothing if goal not met', () => {
    const r = updateStreak({ ...streakBase, xpEarned: 5 });
    expect(r.goalMet).toBe(false);
    expect(r.streak).toBe(4);
    expect(r.extendedToday).toBe(false);
  });

  it('is a no-op if today already banked', () => {
    const r = updateStreak({ ...streakBase, lastCompletedDate: '2026-07-13' });
    expect(r.streak).toBe(4);
    expect(r.extendedToday).toBe(false);
  });

  it('consumes a freeze to bridge one missed day', () => {
    const r = updateStreak({
      ...streakBase,
      lastCompletedDate: '2026-07-11',
      streakFreezes: 1,
    });
    expect(r.streakFreezeConsumed).toBe(true);
    expect(r.streakFreezesRemaining).toBe(0);
    expect(r.streak).toBe(5);
  });

  it('resets to 1 after a gap with no freeze', () => {
    const r = updateStreak({ ...streakBase, lastCompletedDate: '2026-07-01' });
    expect(r.streak).toBe(1);
    expect(r.streakFreezeConsumed).toBe(false);
  });

  it('grows the longest streak', () => {
    const r = updateStreak({ ...streakBase, currentStreak: 10, longestStreak: 10 });
    expect(r.streak).toBe(11);
    expect(r.longestStreak).toBe(11);
  });
});

describe('regenerateHearts', () => {
  it('regenerates one heart per interval up to the cap', () => {
    const r = regenerateHearts(2, '2026-07-13T00:00:00Z', '2026-07-13T02:30:00Z');
    expect(r.hearts).toBe(4); // 2 hours -> +2
  });

  it('does not exceed max and keeps the timestamp when full', () => {
    const r = regenerateHearts(5, '2026-07-13T00:00:00Z', '2026-07-13T09:00:00Z');
    expect(r.hearts).toBe(5);
  });
});
