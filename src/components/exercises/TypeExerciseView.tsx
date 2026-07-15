'use client';
import { useState } from 'react';
import { Button } from '@/components/Button';
import type { TypeTranslationExercise } from '@/lib/types';
import type { UserAnswer } from '@/lib/session-core';

export function TypeExerciseView({
  ex,
  locked,
  onSubmit,
}: {
  ex: TypeTranslationExercise;
  locked: boolean;
  onSubmit: (a: UserAnswer) => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  return (
    <div className="space-y-6">
      <p className="text-sm font-extrabold uppercase text-hare">{ex.prompt}</p>
      <p className="text-3xl font-black text-eel">{ex.source}</p>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        disabled={locked}
        placeholder="Type your answer"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full touch-manipulation rounded-2xl border-2 border-swan bg-card px-4 py-3 text-base font-bold text-eel placeholder:text-hare outline-none focus:border-blue"
      />
      <div className="flex justify-end">
        <Button
          variant="green"
          disabled={text.trim() === '' || locked}
          onClick={() => {
            onSubmit({ kind: 'type_translation', text });
          }}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
