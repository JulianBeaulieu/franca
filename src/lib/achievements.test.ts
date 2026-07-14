import { describe, expect, it } from 'vitest';
import { evaluateAchievements } from './achievements';

describe('evaluateAchievements', () => {
  it('reports achieved and next tiers', () => {
    const result = evaluateAchievements({ streak: 8, xpTotal: 120, wordsLearned: 60, lessonsCompleted: 3 });
    const streak = result.find((r) => r.id === 'streak');
    expect(streak?.achievedTier).toBe(7); // highest tier <= 8 among [3,7,30,100]
    expect(streak?.nextTier).toBe(30);
    const words = result.find((r) => r.id === 'words');
    expect(words?.achievedTier).toBe(50);
  });

  it('handles zero progress', () => {
    const result = evaluateAchievements({ streak: 0, xpTotal: 0, wordsLearned: 0, lessonsCompleted: 0 });
    expect(result.every((r) => r.achievedTier === 0)).toBe(true);
    expect(result.find((r) => r.id === 'streak')?.nextTier).toBe(3);
  });
});
