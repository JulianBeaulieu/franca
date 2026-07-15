'use client';
import { useState } from 'react';
import { Button } from '@/components/Button';
import type { WordBankExercise } from '@/lib/types';
import type { UserAnswer } from '@/lib/session-core';

export function WordBankExerciseView({
  ex,
  locked,
  onSubmit,
}: {
  ex: WordBankExercise;
  locked: boolean;
  onSubmit: (a: UserAnswer) => void;
}): React.JSX.Element {
  const [line, setLine] = useState<number[]>([]); // indices into ex.tiles
  const used = new Set(line);
  const chip = 'rounded-xl border-2 border-swan bg-card px-3 py-2 font-bold text-eel';

  return (
    <div className="space-y-6">
      <p className="text-sm font-extrabold uppercase text-hare">{ex.prompt}</p>
      <p className="text-2xl font-black text-eel">{ex.source}</p>
      <div className="flex min-h-14 flex-wrap gap-2 border-b-2 border-swan pb-2">
        {line.map((idx) => (
          <button
            key={`line-${String(idx)}`}
            type="button"
            className={chip}
            onClick={() => {
              if (!locked) setLine(line.filter((x) => x !== idx));
            }}
          >
            {ex.tiles[idx]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ex.tiles.map((tile, idx) =>
          used.has(idx) ? (
            <span key={`bank-${String(idx)}`} className={`${chip} opacity-30`}>
              {tile}
            </span>
          ) : (
            <button
              key={`bank-${String(idx)}`}
              type="button"
              className={chip}
              onClick={() => {
                if (!locked) setLine([...line, idx]);
              }}
            >
              {tile}
            </button>
          ),
        )}
      </div>
      <div className="flex justify-end">
        <Button
          variant="green"
          disabled={line.length === 0 || locked}
          onClick={() => {
            onSubmit({ kind: 'word_bank', tokens: line.map((i) => ex.tiles[i] ?? '') });
          }}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
