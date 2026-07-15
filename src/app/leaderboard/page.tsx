'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Mascot } from '@/components/Mascot';
import { FlameIcon } from '@/components/icons';
import { sortLeaderboard, type LeaderboardEntry, type LeaderboardMetric } from '@/lib/leaderboard';

type Tab = 'week' | 'allTime';

interface LeaderboardResponse {
  optedIn: boolean;
  entries?: LeaderboardEntry[];
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export default function LeaderboardPage(): React.JSX.Element {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('week');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [optedOut, setOptedOut] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setOptedOut(false);
    void fetch('/api/leaderboard')
      .then(async (r) => {
        if (r.status === 403) {
          setOptedOut(true);
          return null;
        }
        if (!r.ok) throw new Error(`Failed to load leaderboard: ${String(r.status)}`);
        return (await r.json()) as LeaderboardResponse;
      })
      .then((data) => {
        if (data?.entries) setEntries(data.entries);
      })
      .catch(() => {
        setError(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (optedOut) {
    return (
      <main className="flex min-h-screen-safe flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="neutral" />
        <h1 className="text-xl font-black text-eel">Join the leaderboard</h1>
        <p className="max-w-sm font-bold text-hare">
          Opt in to see how you stack up against other learners on this server. Your name, picture,
          XP and streak become visible to them too.
        </p>
        <Button
          variant="blue"
          onClick={() => {
            router.push('/settings');
          }}
        >
          Go to settings
        </Button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen-safe flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sad" />
        <p className="font-extrabold text-eel">Couldn&apos;t load the leaderboard.</p>
        <Button variant="blue" onClick={load}>
          Try again
        </Button>
      </main>
    );
  }

  if (!entries) return <main className="p-8 font-extrabold text-eel">Loading…</main>;

  const metric: LeaderboardMetric = tab === 'week' ? 'weeklyXp' : 'xpTotal';
  const sorted = sortLeaderboard(entries, metric);

  return (
    <main className="min-h-screen-safe mx-auto max-w-2xl space-y-6 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-eel">Leaderboard</h1>
        <Link href="/" className="font-extrabold text-blue">
          ← Path
        </Link>
      </div>

      <div className="flex gap-1 rounded-2xl border-2 border-swan bg-card p-1">
        <TabButton
          active={tab === 'week'}
          onClick={() => {
            setTab('week');
          }}
        >
          This week
        </TabButton>
        <TabButton
          active={tab === 'allTime'}
          onClick={() => {
            setTab('allTime');
          }}
        >
          All time
        </TabButton>
      </div>

      <div className="space-y-2">
        {sorted.map((entry, i) => (
          <LeaderboardRow key={entry.id} entry={entry} rank={i + 1} tab={tab} />
        ))}
      </div>

      {entries.length === 1 ? (
        <p className="text-center text-sm font-bold text-hare">
          You&apos;re the only one here so far — invite others to opt in from Settings to see how
          you compare!
        </p>
      ) : null}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 touch-manipulation rounded-xl px-3 py-2 text-sm font-extrabold transition-colors ${
        active ? 'bg-green-light text-eel' : 'text-hare'
      }`}
    >
      {children}
    </button>
  );
}

function LeaderboardRow({
  entry,
  rank,
  tab,
}: {
  entry: LeaderboardEntry;
  rank: number;
  tab: Tab;
}): React.JSX.Element {
  const medal = tab === 'week' && rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : undefined;
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || '?';
  const primary = tab === 'week' ? entry.weeklyXp : entry.xpTotal;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
        entry.isMe ? 'border-blue bg-blue/10' : 'border-swan bg-card'
      }`}
    >
      <span className="w-7 shrink-0 text-center text-lg font-black text-eel">{medal ?? rank}</span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green text-base font-black text-white">
        {entry.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.picture} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold text-eel">
          {entry.displayName}
          {entry.isMe ? <span className="text-hare"> (you)</span> : null}
        </p>
        <p className="flex items-center gap-2 text-xs font-bold text-hare">
          <span className="flex items-center gap-1">
            <FlameIcon /> {entry.streak}
          </span>
          {tab === 'allTime' ? <span>{entry.weeklyXp} XP this week</span> : null}
        </p>
      </div>
      <span className="shrink-0 font-black text-eel">{primary} XP</span>
    </div>
  );
}
