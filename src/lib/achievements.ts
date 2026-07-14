export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  tiers: number[];
  metric: 'streak' | 'xpTotal' | 'wordsLearned' | 'lessonsCompleted';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'streak', name: 'Wildfire', icon: '🔥', tiers: [3, 7, 30, 100], metric: 'streak' },
  { id: 'words', name: 'Word Collector', icon: '📚', tiers: [50, 200, 500, 1000], metric: 'wordsLearned' },
  { id: 'xp', name: 'Scholar', icon: '⭐', tiers: [100, 500, 2000, 10000], metric: 'xpTotal' },
  { id: 'lessons', name: 'Dedicated', icon: '🎓', tiers: [1, 10, 50, 200], metric: 'lessonsCompleted' },
];

export function evaluateAchievements(stats: {
  streak: number;
  xpTotal: number;
  wordsLearned: number;
  lessonsCompleted: number;
}): { id: string; name: string; icon: string; achievedTier: number; nextTier: number | null }[] {
  return ACHIEVEMENTS.map((a) => {
    const value = stats[a.metric];
    let achievedTier = 0;
    let nextTier: number | null = null;
    for (const t of a.tiers) {
      if (value >= t) achievedTier = t;
      else nextTier ??= t;
    }
    return { id: a.id, name: a.name, icon: a.icon, achievedTier, nextTier };
  });
}
