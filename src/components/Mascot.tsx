export function Mascot({
  mood,
  size = 96,
}: {
  mood: 'happy' | 'sad' | 'neutral';
  size?: number;
}): React.JSX.Element {
  const face = mood === 'happy' ? '🌲' : mood === 'sad' ? '🌲' : '🌲';
  const label = mood === 'happy' ? 'Cheering cedar' : mood === 'sad' ? 'Sad cedar' : 'Cedar';
  return (
    <span role="img" aria-label={label} style={{ fontSize: size, lineHeight: 1 }}>
      {face}
    </span>
  );
}
