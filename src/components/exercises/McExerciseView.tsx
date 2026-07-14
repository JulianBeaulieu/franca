'use client';
import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import type { McExercise } from '@/lib/types';
import type { UserAnswer } from '@/lib/session-core';

export function McExerciseView({
  ex,
  locked,
  onSubmit,
}: {
  ex: McExercise;
  locked: boolean;
  onSubmit: (a: UserAnswer) => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      <p className="text-sm font-extrabold uppercase text-hare">{ex.prompt}</p>
      <p className="text-3xl font-black text-eel">{ex.question}</p>
      <div className="space-y-3">
        {ex.options.map((opt, i) => {
          const tone: 'default' | 'correct' | 'incorrect' = locked
            ? i === ex.correctIndex
              ? 'correct'
              : selected === i
                ? 'incorrect'
                : 'default'
            : 'default';
          return (
            <Card
              key={opt + String(i)}
              selected={!locked && selected === i}
              tone={tone}
              onClick={() => {
                if (!locked) setSelected(i);
              }}
            >
              {opt}
            </Card>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button
          variant="green"
          disabled={selected === null || locked}
          onClick={() => {
            if (selected !== null) onSubmit({ kind: 'mc', selectedIndex: selected });
          }}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
