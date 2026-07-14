'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLessonSession } from '@/hooks/useLessonSession';
import { ProgressBar } from '@/components/ProgressBar';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { Button } from '@/components/Button';
import { Mascot } from '@/components/Mascot';
import { ResultsScreen } from '@/components/ResultsScreen';
import { HeartIcon } from '@/components/icons';
import { McExerciseView } from '@/components/exercises/McExerciseView';
import { WordBankExerciseView } from '@/components/exercises/WordBankExerciseView';
import { TypeExerciseView } from '@/components/exercises/TypeExerciseView';
import { ConjugationExerciseView } from '@/components/exercises/ConjugationExerciseView';
import { MatchExerciseView } from '@/components/exercises/MatchExerciseView';
import type { LessonPlan } from '@/lib/types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; plan: LessonPlan & { courseId: number } };

export function LessonClient({ unitId }: { unitId: string }): React.JSX.Element {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  const loadLesson = useCallback(() => {
    setLoad({ status: 'loading' });
    void fetch(`/api/lesson?unitId=${unitId}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load lesson: ${String(r.status)}`);
        return (await r.json()) as (LessonPlan & { courseId: number }) | { empty: true };
      })
      .then((data) => {
        // Contract: GET /api/lesson may return {empty:true}. Do not init a
        // session — show a friendly "nothing to learn" state instead.
        if ('empty' in data) {
          setLoad({ status: 'empty' });
          return;
        }
        setLoad({ status: 'ready', plan: data });
      })
      .catch(() => {
        setLoad({ status: 'error' });
      });
  }, [unitId]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  if (load.status === 'loading') {
    return <main className="p-8 font-extrabold text-eel">Loading…</main>;
  }

  if (load.status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sad" />
        <p className="font-extrabold text-eel">Couldn&apos;t start this lesson.</p>
        <div className="flex gap-3">
          <Button
            variant="gray"
            onClick={() => {
              router.push('/');
            }}
          >
            Go home
          </Button>
          <Button variant="blue" onClick={loadLesson}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (load.status === 'empty') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="happy" />
        <p className="font-extrabold text-eel">Nothing to learn right now — you&apos;re all caught up!</p>
        <Button
          variant="green"
          onClick={() => {
            router.push('/');
          }}
        >
          Back home
        </Button>
      </main>
    );
  }

  return <LessonRunner plan={load.plan} />;
}

function LessonRunner({ plan }: { plan: LessonPlan & { courseId: number } }): React.JSX.Element {
  const router = useRouter();
  const session = useLessonSession(plan);
  const locked = session.phase === 'feedback';

  if (session.phase === 'complete') {
    return (
      <ResultsScreen
        summary={session.summary}
        onContinue={() => {
          router.push('/');
        }}
      />
    );
  }

  // During feedback the runner index has already advanced, so session.current
  // is the NEXT exercise. Render the just-answered snapshot instead (with the
  // learner's selection tones preserved via the stable key) to avoid revealing
  // the upcoming answer; after Continue, fall back to session.current.
  const ex = locked ? session.answeredExercise : session.current;
  return (
    <main className="flex min-h-screen-safe flex-col bg-white">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <button
          type="button"
          onClick={() => {
            router.push('/');
          }}
          className="touch-manipulation text-2xl font-black text-hare"
          aria-label="Exit lesson"
        >
          ✕
        </button>
        <ProgressBar done={session.progress.done} total={session.progress.total} />
        <span className="flex items-center gap-1 font-extrabold text-red">
          <HeartIcon /> {session.hearts}
        </span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-y-contain px-4 pt-6 pb-[calc(11rem+env(safe-area-inset-bottom))]">
        {/* During feedback, session.current has already advanced to the NEXT
            exercise (see useLessonSession), but the rendered exercise is the
            answered snapshot. isRequeue is derived from session.current, so it
            would describe the wrong exercise here — hide the chip until we're
            back on the rendered exercise. */}
        {(locked ? false : session.isRequeue) ? (
          <p className="mb-4 inline-block rounded-full bg-orange/10 px-3 py-1 text-sm font-extrabold text-orange">
            Previous mistake — try again
          </p>
        ) : null}
        {session.comboCurrent >= 5 ? (
          <p className="mb-4 text-center font-extrabold text-orange">🔥 {session.comboCurrent} in a row!</p>
        ) : null}
        {ex?.kind === 'mc' ? <McExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'word_bank' ? <WordBankExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'type_translation' ? <TypeExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'conjugation' ? <ConjugationExerciseView key={ex.id} ex={ex} locked={locked} onSubmit={session.submit} /> : null}
        {ex?.kind === 'match' ? <MatchExerciseView key={ex.id} ex={ex} onSubmit={session.submit} /> : null}
      </div>

      {session.feedback ? (
        <FeedbackBanner
          status={session.feedback.status}
          correctAnswer={session.feedback.correctText}
          onContinue={session.cont}
        />
      ) : null}
    </main>
  );
}
