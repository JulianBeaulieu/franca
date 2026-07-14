export function UnitBanner({
  ordinal,
  title,
  description,
  themeColor,
  lessonsCompleted,
}: {
  ordinal: number;
  title: string;
  description: string;
  themeColor: string;
  lessonsCompleted: number;
}): React.JSX.Element {
  const done = Math.min(Math.max(lessonsCompleted, 0), 3);
  return (
    <div
      className="flex items-center justify-between rounded-2xl px-5 py-4 text-white"
      style={{ backgroundColor: themeColor }}
    >
      <div>
        <p className="text-sm font-extrabold uppercase opacity-90">Unit {ordinal}</p>
        <p className="text-xl font-black">{title}</p>
        <p className="text-sm font-bold opacity-90">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-white/25 px-3 py-1 text-sm font-extrabold">
        {done}/3 lessons
      </span>
    </div>
  );
}
