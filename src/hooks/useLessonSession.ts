'use client';
import { useCallback, useMemo, useState } from 'react';
import {
  applyAnswer,
  currentExercise,
  initRunner,
  isComplete,
  progress as runnerProgress,
} from '@/lib/lesson-runner';
import {
  extractRequeuedConcepts,
  makeRequeueFactory,
  parseConceptId,
  type UserAnswer,
  evaluateAnswer,
} from '@/lib/session-core';
import { MAX_HEARTS } from '@/lib/config';
import type { AnswerResult, Exercise, LessonPlan, RunnerState } from '@/lib/types';

type Phase = 'answering' | 'feedback' | 'complete';

export interface SessionSummary {
  numCorrect: number;
  numWrong: number;
  comboMax: number;
}

export function useLessonSession(plan: LessonPlan & { courseId: number }): {
  current: Exercise | null;
  answeredExercise: Exercise | null;
  phase: Phase;
  progress: { done: number; total: number };
  hearts: number;
  comboCurrent: number;
  isRequeue: boolean;
  feedback: { status: 'correct' | 'incorrect' | 'typo'; correctText: string } | null;
  submit: (ans: UserAnswer) => void;
  cont: () => void;
  summary: SessionSummary;
} {
  const factory = useMemo(() => makeRequeueFactory(), []);
  const [state, setState] = useState<RunnerState>(() => initRunner(plan.exercises));
  const [phase, setPhase] = useState<Phase>('answering');
  const [hearts, setHearts] = useState<number>(MAX_HEARTS);
  const [graded] = useState<Set<string>>(() => new Set<string>());
  const [feedback, setFeedback] = useState<{ status: 'correct' | 'incorrect' | 'typo'; correctText: string } | null>(null);
  // Feedback-phase snapshot: submit() advances the runner index immediately for
  // engine bookkeeping, so state.current is already the NEXT exercise while the
  // banner is up. Rendering that next exercise locked would leak its answer
  // (McExerciseView highlights correctIndex green). We snapshot the
  // just-answered exercise (and the pre-advance progress) so the feedback render
  // shows what the learner actually answered, then clear it on Continue.
  const [answerSnapshot, setAnswerSnapshot] = useState<{
    answeredExercise: Exercise;
    progressAtAnswer: { done: number; total: number };
  } | null>(null);

  const current = currentExercise(state);
  // A concept is a re-queue if we have already graded it once this session.
  const isRequeue = current !== null && (state.concepts[current.conceptId]?.seen ?? 0) > 0;

  const submit = useCallback(
    (ans: UserAnswer) => {
      if (!current || phase !== 'answering') return;
      const evaln = evaluateAnswer(current, ans);
      const firstGraded = !graded.has(current.conceptId);
      graded.add(current.conceptId);

      if (!evaln.correct) setHearts((h) => Math.max(0, h - 1));

      const result: AnswerResult = {
        correct: evaln.correct,
        firstTry: firstGraded,
        fast: false,
        usedHint: false,
      };
      // Contract: derive itemId/itemType/direction by PARSING conceptId, never
      // from the presentation-only exercise.direction. parseConceptId returns
      // null for match:* warmups, which must not be POSTed (no SRS row).
      const parsed = parseConceptId(current.conceptId);
      if (parsed) {
        void fetch('/api/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            itemId: parsed.itemId,
            itemType: parsed.itemType,
            direction: parsed.direction,
            firstGradedForConcept: firstGraded,
            result,
          }),
        }).catch(() => {
          // Grading is fire-and-forget; a failed SRS write must not break the
          // in-session experience. Local state remains the source of truth.
        });
      }

      // Snapshot BEFORE advancing: `current` is the exercise being graded and
      // `runnerProgress(state)` is the pre-advance fraction. The bar should fill
      // on Continue, not on submit, so we freeze this for the feedback render.
      setAnswerSnapshot({ answeredExercise: current, progressAtAnswer: runnerProgress(state) });
      setState((s) => applyAnswer(s, evaln.correct, factory));
      setFeedback({
        status: evaln.correct ? 'correct' : evaln.typo ? 'typo' : 'incorrect',
        correctText: evaln.correctText,
      });
      setPhase('feedback');
    },
    [current, phase, graded, factory, state],
  );

  const cont = useCallback(() => {
    setFeedback(null);
    setAnswerSnapshot(null);
    if (isComplete(state)) {
      setPhase('complete');
      void fetch('/api/lesson/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // unitId/courseId are intentionally omitted: the server derives the
        // award course/unit from the validated lesson_session row, not the body.
        body: JSON.stringify({
          sessionId: plan.sessionId,
          numCorrect: state.numCorrect,
          numWrong: state.numWrong,
          comboMax: state.comboMax,
          requeuedConcepts: extractRequeuedConcepts(state),
        }),
      }).catch(() => {
        // Contract: complete may 404 (unknown session) or 409 (already done).
        // Both are terminal — the user still lands on the results screen and
        // navigates home, so a rejected write requires no extra handling here.
      });
      return;
    }
    setPhase('answering');
  }, [state, plan]);

  return {
    current,
    answeredExercise: answerSnapshot?.answeredExercise ?? null,
    phase,
    // During feedback, show the pre-advance progress snapshot so the bar fills
    // on Continue (not on submit); otherwise derive live from runner state.
    progress: answerSnapshot ? answerSnapshot.progressAtAnswer : runnerProgress(state),
    hearts,
    comboCurrent: state.comboCurrent,
    isRequeue,
    feedback,
    submit,
    cont,
    summary: { numCorrect: state.numCorrect, numWrong: state.numWrong, comboMax: state.comboMax },
  };
}
