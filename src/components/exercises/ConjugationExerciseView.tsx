'use client';
import { useState } from 'react';
import { Button } from '@/components/Button';
import type { ConjugationExercise } from '@/lib/types';
import type { UserAnswer } from '@/lib/session-core';

export function ConjugationExerciseView({
  ex,
  locked,
  onSubmit,
}: {
  ex: ConjugationExercise;
  locked: boolean;
  onSubmit: (a: UserAnswer) => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  return (
    <div className="space-y-6">
      <p className="text-sm font-extrabold uppercase text-hare">{ex.prompt}</p>
      <p className="text-2xl font-black text-eel">
        {ex.baseVerb} — “{ex.englishMeaning}”
      </p>
      <p className="text-lg font-bold text-blue">Form for: {ex.personLabel}</p>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        disabled={locked}
        placeholder="Type the conjugated form"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full touch-manipulation rounded-2xl border-2 border-swan px-4 py-3 text-base font-bold text-eel outline-none focus:border-blue"
      />
      <div className="flex justify-end">
        <Button
          variant="green"
          disabled={text.trim() === '' || locked}
          onClick={() => {
            onSubmit({ kind: 'conjugation', text });
          }}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
