'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { useSettings } from './SettingsProvider';
import { advanceElapsed, progressFromElapsed } from '@/lib/auto-continue';

/**
 * Drives a 0..1 fill via requestAnimationFrame (not a CSS animation) so the
 * timer can pause while the tab is hidden and cancel cleanly on unmount. Fires
 * `onComplete` once when the fill reaches 1. Inactive (`durationMs <= 0`, i.e.
 * auto-continue off) means no timer and a static 0 fill. The effect restarts
 * fresh whenever the banner is (re)mounted for a new exercise.
 */
function useAutoContinueFill(durationMs: number, onComplete: () => void): number {
  const [progress, setProgress] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (durationMs <= 0) {
      setProgress(0);
      return;
    }
    let rafId = 0;
    let elapsed = 0;
    let last: number | null = null;
    let done = false;

    // A tab that goes hidden throttles rAF; on return the first delta would
    // span the whole hidden gap. Dropping `last` makes the next frame's delta
    // ~0, so hidden time is never counted and the fill resumes where it paused.
    const onVisibility = (): void => {
      last = null;
    };

    const tick = (now: number): void => {
      last ??= now;
      const delta = now - last;
      last = now;
      const paused = typeof document !== 'undefined' && document.hidden;
      elapsed = advanceElapsed(elapsed, delta, paused);
      const next = progressFromElapsed(elapsed, durationMs);
      setProgress(next);
      if (next >= 1) {
        done = true;
        onCompleteRef.current();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafId = requestAnimationFrame(tick);
    return () => {
      if (!done) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [durationMs]);

  return progress;
}

export function FeedbackBanner({
  status,
  correctAnswer,
  onContinue,
}: {
  status: 'correct' | 'incorrect' | 'typo';
  correctAnswer?: string;
  onContinue: () => void;
}): React.JSX.Element {
  const { settings } = useSettings();
  const durationMs = settings.autoContinue ? settings.autoContinueSeconds * 1000 : 0;
  const fill = useAutoContinueFill(durationMs, onContinue);

  const config = {
    correct: {
      bg: 'var(--fb-correct-bg)',
      title: 'Nice!',
      color: 'var(--fb-correct-fg)',
      variant: 'green' as const,
    },
    typo: {
      bg: 'var(--fb-typo-bg)',
      title: 'Almost — watch the typo',
      color: 'var(--fb-typo-fg)',
      variant: 'green' as const,
    },
    incorrect: {
      bg: 'var(--fb-incorrect-bg)',
      title: 'Correct solution:',
      color: 'var(--fb-incorrect-fg)',
      variant: 'red' as const,
    },
  }[status];
  return (
    <div
      className="fixed inset-x-0 bottom-0 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      style={{ backgroundColor: config.bg }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <div>
          <p className="text-xl font-extrabold" style={{ color: config.color }}>
            {config.title}
          </p>
          {status !== 'correct' && correctAnswer ? (
            <p className="font-bold" style={{ color: config.color }}>
              {correctAnswer}
            </p>
          ) : null}
        </div>
        <span className="relative inline-block">
          <Button variant={config.variant} onClick={onContinue}>
            Continue
          </Button>
          {settings.autoContinue ? (
            // Translucent darker layer over the (always green/red) button;
            // reads in both themes. inset-0 matches the button box without
            // clipping its 3D shadow (drawn via box-shadow, outside layout).
            <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <span
                className="block h-full bg-black/25"
                style={{ width: `${String(fill * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
