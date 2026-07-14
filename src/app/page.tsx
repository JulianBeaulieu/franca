'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { UnitBanner } from '@/components/UnitBanner';
import { PathNode } from '@/components/PathNode';
import { Mascot } from '@/components/Mascot';
import { Button } from '@/components/Button';

interface UnitRow {
  id: number;
  ordinal: number;
  title: string;
  description: string;
  theme_color: string;
  lessons_completed: number;
  total_words: number;
}
interface PathData {
  learner: {
    xpTotal: number;
    gems: number;
    hearts: number;
    streak: number;
    dailyGoalXp: number;
    displayName: string;
    picture: string | null;
  };
  activeCourse: { id: number; code: string; name: string; native_name: string; emoji: string } | null;
  units: UnitRow[];
  activeUnitId: number | null;
}

export default function Home(): React.JSX.Element {
  const router = useRouter();
  const [data, setData] = useState<PathData | null>(null);
  const [error, setError] = useState(false);

  const loadPath = useCallback(() => {
    setError(false);
    void fetch('/api/path')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load path: ${String(r.status)}`);
        return r.json() as Promise<PathData>;
      })
      .then(setData)
      .catch(() => {
        setError(true);
      });
  }, []);

  useEffect(() => {
    loadPath();
  }, [loadPath]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sad" />
        <p className="font-extrabold text-eel">Couldn&apos;t load your path.</p>
        <Button variant="blue" onClick={loadPath}>
          Try again
        </Button>
      </main>
    );
  }

  if (!data) return <main className="p-8 font-extrabold text-eel">Loading…</main>;

  return (
    <main className="min-h-screen-safe bg-subtle pb-[max(6rem,env(safe-area-inset-bottom))]">
      <TopBar
        streak={data.learner.streak}
        gems={data.learner.gems}
        hearts={data.learner.hearts}
        displayName={data.learner.displayName}
        picture={data.learner.picture}
        courseEmoji={data.activeCourse?.emoji}
      />
      <div className="mx-auto max-w-xl space-y-8 px-4 py-6">
        {(() => {
          const units = data.units;
          // A unit is unlocked iff it is the first unit or the immediately
          // preceding unit has all 3 lessons completed (unlock rule computed
          // purely client-side; the API's activeUnitId is intentionally ignored).
          const isUnlocked = (i: number): boolean => {
            if (i === 0) return true;
            const prev = units[i - 1];
            return prev !== undefined && prev.lessons_completed >= 3;
          };
          // The single "next" lesson to spotlight: the active node of the first
          // unlocked unit that still has an active node. Only this node shows the
          // START pill, to avoid a noisy path with many call-to-action labels.
          let startUnitId: number | null = null;
          for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            if (unit !== undefined && isUnlocked(i) && unit.lessons_completed < 3) {
              startUnitId = unit.id;
              break;
            }
          }
          return units.map((u, i) => {
            const unlocked = isUnlocked(i);
            // Rows completed within this unit, capped at the 3 visible nodes.
            const done = Math.min(u.lessons_completed, 3);
            return (
              <section key={u.id} className="space-y-4">
                <UnitBanner
                  ordinal={u.ordinal}
                  title={u.title}
                  description={u.description}
                  themeColor={u.theme_color}
                  lessonsCompleted={u.lessons_completed}
                />
                <div className="flex flex-col items-center gap-6">
                  {[0, 1, 2].map((row) => {
                    const nodeState: 'locked' | 'active' | 'completed' = !unlocked
                      ? 'locked'
                      : row < done
                        ? 'completed'
                        : row === done
                          ? 'active'
                          : 'locked';
                    const showStart = nodeState === 'active' && u.id === startUnitId;
                    return (
                      <div
                        key={row}
                        className="flex flex-col items-center gap-1"
                        style={{
                          transform: `translateX(${String((row % 2 === 0 ? -1 : 1) * 48)}px)`,
                        }}
                      >
                        <PathNode
                          state={nodeState}
                          themeColor={u.theme_color}
                          onClick={() => {
                            router.push(`/lesson/${String(u.id)}`);
                          }}
                        />
                        {showStart && (
                          <span className="rounded-full bg-green px-3 py-0.5 text-xs font-black uppercase tracking-wide text-white shadow">
                            Start
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          });
        })()}
        <a href="/profile" className="block text-center font-extrabold text-blue">
          View profile →
        </a>
      </div>
    </main>
  );
}
