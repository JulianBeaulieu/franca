'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatChip } from '@/components/StatChip';
import { DailyGoalRing } from '@/components/DailyGoalRing';
import { StreakCalendar } from '@/components/StreakCalendar';
import { Mascot } from '@/components/Mascot';
import { Button } from '@/components/Button';
import { evaluateAchievements } from '@/lib/achievements';

interface Profile {
  name: string;
  picture: string | null;
  xpTotal: number;
  courseXpTotal: number;
  streak: number;
  longestStreak: number;
  dailyGoalXp: number;
  xpToday: number;
  wordsLearned: number;
  lessonsCompleted: number;
  activeCourse: { id: number; code: string; name: string; native_name: string; emoji: string } | null;
  calendar: { date: string; xp: number }[];
}

export default function ProfilePage(): React.JSX.Element {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState(false);

  const loadProfile = useCallback(() => {
    setError(false);
    void fetch('/api/profile')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load profile: ${String(r.status)}`);
        return r.json() as Promise<Profile>;
      })
      .then(setP)
      .catch(() => {
        setError(true);
      });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sad" />
        <p className="font-extrabold text-eel">Couldn&apos;t load your profile.</p>
        <Button variant="blue" onClick={loadProfile}>
          Try again
        </Button>
      </main>
    );
  }

  if (!p) return <main className="p-8 font-extrabold text-eel">Loading…</main>;

  const achievements = evaluateAchievements({
    streak: p.streak,
    xpTotal: p.xpTotal,
    wordsLearned: p.wordsLearned,
    lessonsCompleted: p.lessonsCompleted,
  });

  return (
    <main className="min-h-screen-safe mx-auto max-w-2xl space-y-8 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-4">
        {p.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="text-5xl" aria-hidden>🌲</span>
        )}
        <div>
          <h1 className="text-2xl font-black text-eel">{p.name}</h1>
          {p.activeCourse ? (
            <p className="font-extrabold text-hare">
              {p.activeCourse.emoji} {p.activeCourse.name}
              <span className="ml-1 font-bold">({p.activeCourse.native_name})</span>
            </p>
          ) : null}
          <Link href="/" className="font-extrabold text-blue">← Back to path</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <DailyGoalRing xpToday={p.xpToday} goal={p.dailyGoalXp} />
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip icon="🔥" value={String(p.streak)} label="Day streak" />
          <StatChip icon="⭐" value={String(p.courseXpTotal)} label="Course XP" />
          <StatChip icon="🏆" value={String(p.xpTotal)} label="Total XP" />
          <StatChip icon="📚" value={String(p.wordsLearned)} label="Words" />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-eel">Activity</h2>
        <StreakCalendar calendar={p.calendar} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-eel">Achievements</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`flex flex-col items-center rounded-2xl border-2 px-3 py-3 ${a.achievedTier > 0 ? 'border-yellow' : 'border-swan opacity-50'}`}
            >
              <span className="text-3xl" aria-hidden>{a.icon}</span>
              <span className="text-sm font-extrabold text-eel">{a.name}</span>
              <span className="text-xs font-bold text-hare">
                {a.achievedTier > 0 ? `Tier ${String(a.achievedTier)}` : a.nextTier ? `Next: ${String(a.nextTier)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
