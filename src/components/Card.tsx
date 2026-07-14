'use client';
import type { ReactNode } from 'react';

export function Card({
  children,
  selected = false,
  tone = 'default',
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  tone?: 'default' | 'correct' | 'incorrect';
  onClick?: () => void;
}): React.JSX.Element {
  const toneClass =
    tone === 'correct'
      ? 'border-green bg-green/10'
      : tone === 'incorrect'
        ? 'border-red bg-red/10'
        : selected
          ? 'border-blue bg-blue/10'
          : 'border-swan bg-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border-2 px-4 py-4 text-left font-bold text-eel transition-colors ${toneClass}`}
    >
      {children}
    </button>
  );
}
