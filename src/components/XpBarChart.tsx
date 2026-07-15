'use client';
import { useState } from 'react';

type Range = 7 | 30;

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 120;
const LABEL_HEIGHT = 16;
const BAR_GAP = 3;

function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** Inline-SVG XP bar chart with a 7/30-day toggle. No chart library (per project constraint). */
export function XpBarChart({ days }: { days: { date: string; xp: number }[] }): React.JSX.Element {
  const [range, setRange] = useState<Range>(7);
  const shown = days.slice(-range);
  const maxXp = Math.max(1, ...shown.map((d) => d.xp));
  const plotHeight = VIEW_HEIGHT - LABEL_HEIGHT;
  const barWidth =
    shown.length > 0 ? (VIEW_WIDTH - BAR_GAP * (shown.length - 1)) / shown.length : 0;
  // Every bar gets a label at 7 days; every 5th at 30, to avoid overlap.
  const labelStride = range === 7 ? 1 : 5;

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {([7, 30] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRange(r);
            }}
            className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
              range === r ? 'bg-green text-white' : 'bg-swan text-hare'
            }`}
          >
            {r} days
          </button>
        ))}
      </div>

      <svg
        role="img"
        aria-label={`XP earned per day over the last ${String(range)} days`}
        viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
        className="w-full"
      >
        {shown.map((d, i) => {
          // Clamp nonzero days to a visible 1px bar, then derive y from the
          // clamped height so the bar always sits inside the plot area.
          const barHeight = d.xp > 0 ? Math.max((d.xp / maxXp) * plotHeight, 1) : 0;
          const x = i * (barWidth + BAR_GAP);
          const y = plotHeight - barHeight;
          const showLabel = i % labelStride === 0;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barWidth} height={barHeight} className="fill-green" />
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={VIEW_HEIGHT - 2}
                  textAnchor="middle"
                  fontSize={8}
                  className="fill-hare"
                >
                  {weekdayLabel(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>XP earned per day, last {range} days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.xp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
