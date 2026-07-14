'use client';
import { useMemo, useState } from 'react';
import type { MatchExercise } from '@/lib/types';
import type { UserAnswer } from '@/lib/session-core';

interface Tile {
  key: string;
  label: string;
  side: 'left' | 'right';
  pairIndex: number;
}

export function MatchExerciseView({
  ex,
  onSubmit,
}: {
  ex: MatchExercise;
  onSubmit: (a: UserAnswer) => void;
}): React.JSX.Element {
  const tiles = useMemo<Tile[]>(() => {
    const left = ex.pairs.map((p, i) => ({ key: `l${String(i)}`, label: p.left, side: 'left' as const, pairIndex: i }));
    const right = ex.pairs.map((p, i) => ({ key: `r${String(i)}`, label: p.right, side: 'right' as const, pairIndex: i }));
    return [...left, ...right];
  }, [ex]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<Tile | null>(null);

  const tap = (t: Tile): void => {
    if (matched.has(t.pairIndex)) return;
    if (!sel) {
      setSel(t);
      return;
    }
    if (sel.side !== t.side && sel.pairIndex === t.pairIndex) {
      const next = new Set(matched).add(t.pairIndex);
      setMatched(next);
      setSel(null);
      if (next.size === ex.pairs.length) onSubmit({ kind: 'match' });
    } else {
      setSel(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm font-extrabold uppercase text-hare">{ex.prompt}</p>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              tap(t);
            }}
            disabled={matched.has(t.pairIndex)}
            className={`rounded-2xl border-2 px-4 py-4 font-bold ${
              matched.has(t.pairIndex)
                ? 'border-green bg-green/10 opacity-40'
                : sel?.key === t.key
                  ? 'border-blue bg-blue/10'
                  : 'border-swan bg-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
