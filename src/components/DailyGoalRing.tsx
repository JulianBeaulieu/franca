export function DailyGoalRing({ xpToday, goal }: { xpToday: number; goal: number }): React.JSX.Element {
  const pct = goal === 0 ? 0 : Math.min(100, Math.round((xpToday / goal) * 100));
  return (
    <div
      className="flex h-28 w-28 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#58CC02 ${String(pct)}%, var(--color-swan) ${String(pct)}%)` }}
    >
      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card">
        <span className="text-lg font-black text-eel">{xpToday}/{goal}</span>
        <span className="text-[10px] font-extrabold uppercase text-hare">XP today</span>
      </div>
    </div>
  );
}
