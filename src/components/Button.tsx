'use client';
import type { ReactNode } from 'react';

type Variant = 'green' | 'blue' | 'red' | 'gray';

const STYLES: Record<Variant, { bg: string; shadow: string; text: string }> = {
  green: { bg: '#58CC02', shadow: '#58A700', text: '#FFFFFF' },
  blue: { bg: '#1CB0F6', shadow: '#1899D6', text: '#FFFFFF' },
  red: { bg: '#FF4B4B', shadow: '#EA2B2B', text: '#FFFFFF' },
  gray: { bg: '#E5E5E5', shadow: '#CCCCCC', text: '#777777' },
};

export function Button({
  variant = 'green',
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  variant?: Variant;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}): React.JSX.Element {
  const s = STYLES[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="btn-3d"
      style={
        {
          backgroundColor: s.bg,
          color: s.text,
          ['--btn-shadow']: s.shadow,
        } as React.CSSProperties
      }
    >
      {children}
    </button>
  );
}
