'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatChip } from '@/components/StatChip';
import { Mascot } from '@/components/Mascot';
import { Button } from '@/components/Button';
import { XpBarChart } from '@/components/XpBarChart';
import { evaluateAchievements } from '@/lib/achievements';

interface CourseStats {
  id: number;
  code: string;
  name: string;
  native_name: string;
  emoji: string;
  xp_total: number;
  words_seen: number;
  words_mastered: number;
  lessons_completed: number;
  avg_accuracy: number;
  perfect_count: number;
  best_combo: number;
}

interface Stats {
  streak: number;
  longestStreak: number;
  xpTotal: number;
  daysActive: number;
  lessonsCompleted: number;
  achievementWords: number;
  achievementLessons: number;
  last30Days: { date: string; xp: number }[];
  courses: CourseStats[];
}

export default function StatsPage(): React.JSX.Element {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  const loadStats = useCallback(() => {
    setError(false);
    void fetch('/api/stats')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load stats: ${String(r.status)}`);
        return r.json() as Promise<Stats>;
      })
      .then(setS)
      .catch(() => {
        setError(true);
      });
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sad" />
        <p className="font-extrabold text-eel">Couldn&apos;t load your stats.</p>
        <Button variant="blue" onClick={loadStats}>
          Try again
        </Button>
      </main>
    );
  }

  if (!s) return <main className="p-8 font-extrabold text-eel">Loading…</main>;

  // Same inputs as the profile page (active-course-scoped words/lessons from
  // the API) so achievement tiers never disagree between /profile and /stats.
  const achievements = evaluateAchievements({
    streak: s.streak,
    xpTotal: s.xpTotal,
    wordsLearned: s.achievementWords,
    lessonsCompleted: s.achievementLessons,
  });

  return (
    <main className="min-h-screen-safe mx-auto max-w-2xl space-y-8 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-eel">Stats</h1>
        <Link href="/profile" className="font-extrabold text-blue">
          ← Profile
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip icon="🔥" value={String(s.streak)} label="Day streak" />
        <StatChip icon="⚡" value={String(s.xpTotal)} label="Total XP" />
        <StatChip icon="📅" value={String(s.daysActive)} label="Days active" />
        <StatChip icon="✅" value={String(s.lessonsCompleted)} label="Lessons" />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-eel">XP over time</h2>
        <XpBarChart days={s.last30Days} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-eel">Achievements</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`flex flex-col items-center rounded-2xl border-2 px-3 py-3 ${a.achievedTier > 0 ? 'border-yellow' : 'border-swan opacity-50'}`}
            >
              <span className="text-3xl" aria-hidden>
                {a.icon}
              </span>
              <span className="text-sm font-extrabold text-eel">{a.name}</span>
              <span className="text-xs font-bold text-hare">
                {a.achievedTier > 0
                  ? `Tier ${String(a.achievedTier)}`
                  : a.nextTier
                    ? `Next: ${String(a.nextTier)}`
                    : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-eel">Courses</h2>
        {s.courses.length === 0 ? (
          <p className="font-bold text-hare">
            No courses started yet — jump into a lesson to get going!
          </p>
        ) : (
          <div className="space-y-3">
            {s.courses.map((c) => (
              <div key={c.id} className="rounded-2xl border-2 border-swan bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>
                    {c.emoji}
                  </span>
                  <h3 className="font-black text-eel">{c.name}</h3>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
                  <StatBit label="XP" value={c.xp_total} />
                  <StatBit label="Seen" value={c.words_seen} />
                  <StatBit label="Mastered" value={c.words_mastered} />
                  <StatBit label="Lessons" value={c.lessons_completed} />
                  <StatBit
                    label="Accuracy"
                    value={`${String(Math.round(c.avg_accuracy * 100))}%`}
                  />
                  <StatBit label="Best combo" value={c.best_combo} />
                </div>
                {c.perfect_count > 0 ? (
                  <p className="mt-2 text-xs font-bold text-hare">
                    {c.perfect_count} perfect lesson{c.perfect_count === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatBit({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div>
      <p className="font-black text-eel">{value}</p>
      <p className="text-xs font-bold uppercase text-hare">{label}</p>
    </div>
  );
}
