export function ProgressBar({ done, total }: { done: number; total: number }): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div
      className="h-4 w-full rounded-full bg-swan"
      aria-label="progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-4 rounded-full bg-green transition-[width] duration-300 ease-out"
        style={{ width: `${String(pct)}%` }}
      />
    </div>
  );
}
