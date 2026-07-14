export function StatChip({ icon, value, label }: { icon: string; value: string; label: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-swan px-4 py-3">
      <span className="text-2xl" aria-hidden>{icon}</span>
      <span className="text-xl font-black text-eel">{value}</span>
      <span className="text-xs font-extrabold uppercase text-hare">{label}</span>
    </div>
  );
}
