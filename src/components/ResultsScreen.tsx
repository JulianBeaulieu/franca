'use client';
import { Button } from './Button';
import { Mascot } from './Mascot';
import { computeLessonScore } from '@/lib/scoring';
import type { SessionSummary } from '@/hooks/useLessonSession';

export function ResultsScreen({
  summary,
  onContinue,
}: {
  summary: SessionSummary;
  onContinue: () => void;
}): React.JSX.Element {
  const score = computeLessonScore(summary);
  return (
    <main className="flex min-h-screen-safe flex-col items-center justify-center gap-6 bg-white p-8 text-center">
      <Mascot mood="happy" size={120} />
      <h1 className="text-3xl font-black text-green">Lesson Complete!</h1>
      <div className="flex flex-wrap justify-center gap-4">
        <StatBox label="Total XP" value={`+${String(score.totalXp)}`} tone="#FFC800" />
        <StatBox label="Accuracy" value={`${String(Math.round(score.accuracy * 100))}%`} tone="#1CB0F6" />
        {score.perfect ? <StatBox label="Perfect!" value="🏅" tone="#58CC02" /> : null}
      </div>
      <p className="font-bold text-hare">
        Base {score.baseXp} · Combo +{String(score.comboBonus)}
        {score.perfect ? ` · Perfect +${String(score.perfectBonus)}` : ''}
      </p>
      <Button variant="green" onClick={onContinue}>
        Continue
      </Button>
    </main>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: string }): React.JSX.Element {
  return (
    <div className="rounded-2xl border-2 px-6 py-4" style={{ borderColor: tone }}>
      <p className="text-2xl font-black" style={{ color: tone }}>{value}</p>
      <p className="text-xs font-extrabold uppercase text-hare">{label}</p>
    </div>
  );
}
