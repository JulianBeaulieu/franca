import {
  BASE_XP,
  HEART_REGEN_MINUTES,
  MAX_COMBO_BONUS,
  MAX_HEARTS,
  PERFECT_BONUS,
} from './config';
import type { LessonScore, StreakInput, StreakResult } from './types';

export function computeComboBonus(comboMax: number): number {
  return Math.min(MAX_COMBO_BONUS, Math.floor(comboMax / 5));
}

export function computeLessonScore(input: {
  numCorrect: number;
  numWrong: number;
  comboMax: number;
}): LessonScore {
  const total = input.numCorrect + input.numWrong;
  const perfect = input.numWrong === 0;
  const comboBonus = computeComboBonus(input.comboMax);
  const perfectBonus = perfect ? PERFECT_BONUS : 0;
  return {
    baseXp: BASE_XP,
    comboBonus,
    perfectBonus,
    totalXp: BASE_XP + comboBonus + perfectBonus,
    accuracy: total === 0 ? 1 : input.numCorrect / total,
    perfect,
  };
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function updateStreak(input: StreakInput): StreakResult {
  const goalMet = input.xpTodayBefore + input.xpEarned >= input.dailyGoalXp;
  const alreadyBankedToday = input.lastCompletedDate === input.today;

  const noChange: StreakResult = {
    streak: input.currentStreak,
    longestStreak: input.longestStreak,
    streakFreezesRemaining: input.streakFreezes,
    streakFreezeConsumed: false,
    goalMet,
    extendedToday: false,
  };

  if (!goalMet || alreadyBankedToday) return noChange;

  let streak: number;
  let freezesRemaining = input.streakFreezes;
  let freezeConsumed = false;

  if (input.lastCompletedDate === null) {
    streak = 1;
  } else {
    const gap = daysBetween(input.lastCompletedDate, input.today);
    if (gap === 1) {
      streak = input.currentStreak + 1;
    } else if (gap === 2 && input.streakFreezes > 0) {
      streak = input.currentStreak + 1;
      freezesRemaining = input.streakFreezes - 1;
      freezeConsumed = true;
    } else {
      streak = 1;
    }
  }

  return {
    streak,
    longestStreak: Math.max(input.longestStreak, streak),
    streakFreezesRemaining: freezesRemaining,
    streakFreezeConsumed: freezeConsumed,
    goalMet: true,
    extendedToday: true,
  };
}

export function regenerateHearts(
  hearts: number,
  heartsUpdatedAt: string,
  now: string,
): { hearts: number; heartsUpdatedAt: string } {
  if (hearts >= MAX_HEARTS) return { hearts: MAX_HEARTS, heartsUpdatedAt: now };
  const elapsedMs = new Date(now).getTime() - new Date(heartsUpdatedAt).getTime();
  const regenerated = Math.floor(elapsedMs / (HEART_REGEN_MINUTES * 60_000));
  if (regenerated <= 0) return { hearts, heartsUpdatedAt };
  const next = Math.min(MAX_HEARTS, hearts + regenerated);
  // advance the anchor by the consumed whole intervals (keep remainder toward next heart)
  const consumedMs = regenerated * HEART_REGEN_MINUTES * 60_000;
  const newAnchor =
    next >= MAX_HEARTS
      ? now
      : new Date(new Date(heartsUpdatedAt).getTime() + consumedMs).toISOString();
  return { hearts: next, heartsUpdatedAt: newAnchor };
}
