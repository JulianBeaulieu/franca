'use client';

export function PathNode({
  state,
  themeColor,
  onClick,
}: {
  state: 'locked' | 'active' | 'completed';
  themeColor: string;
  onClick?: () => void;
}): React.JSX.Element {
  const bg = state === 'locked' ? '#E5E5E5' : state === 'completed' ? '#FFC800' : themeColor;
  const shadow = state === 'locked' ? '#CCCCCC' : state === 'completed' ? '#E6B400' : '#00000022';
  const glyph = state === 'completed' ? '★' : state === 'locked' ? '🔒' : '▶';
  return (
    <button
      type="button"
      onClick={state === 'locked' ? undefined : onClick}
      disabled={state === 'locked'}
      aria-label={`lesson node ${state}`}
      className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-black text-white${
        state === 'active' ? ' path-node-active' : ''
      }`}
      style={{ backgroundColor: bg, boxShadow: `0 6px 0 ${shadow}` }}
    >
      <span>{glyph}</span>
    </button>
  );
}
