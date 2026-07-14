export function StreakCalendar({ calendar }: { calendar: { date: string; xp: number }[] }): React.JSX.Element {
  const days = calendar.slice(-56);
  return (
    <div className="flex flex-wrap gap-1">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${d.date}: ${String(d.xp)} XP`}
          className="h-4 w-4 rounded-sm"
          style={{ backgroundColor: d.xp > 0 ? '#58CC02' : '#E5E5E5' }}
        />
      ))}
    </div>
  );
}
