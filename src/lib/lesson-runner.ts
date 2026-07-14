import { CLEAR_AFTER_MISS, MAX_REQUEUES, REQUEUE_GAP } from './config';
import type { ConceptProgress, Exercise, RunnerConfig, RunnerState } from './types';

const DEFAULT_CONFIG: RunnerConfig = {
  requeueGap: REQUEUE_GAP,
  clearAfterMiss: CLEAR_AFTER_MISS,
  maxRequeues: MAX_REQUEUES,
};

export function initRunner(exercises: Exercise[], config?: Partial<RunnerConfig>): RunnerState {
  const concepts: Record<string, ConceptProgress> = {};
  for (const ex of exercises) {
    concepts[ex.conceptId] ??= {
      conceptId: ex.conceptId,
      needed: 1,
      seen: 0,
      inserted: 0,
      forcedDueTomorrow: false,
      clearedAtIndex: null,
    };
  }
  return {
    queue: [...exercises],
    index: 0,
    concepts,
    config: { ...DEFAULT_CONFIG, ...config },
    comboCurrent: 0,
    comboMax: 0,
    numCorrect: 0,
    numWrong: 0,
  };
}

export function currentExercise(state: RunnerState): Exercise | null {
  return state.queue[state.index] ?? null;
}

function hasFutureInstance(state: RunnerState, conceptId: string): boolean {
  for (let i = state.index + 1; i < state.queue.length; i++) {
    if (state.queue[i]?.conceptId === conceptId) return true;
  }
  return false;
}

export function applyAnswer(
  state: RunnerState,
  correct: boolean,
  makeRequeueExercise: (concept: ConceptProgress, lastExercise: Exercise) => Exercise,
): RunnerState {
  const ex = state.queue[state.index];
  if (!ex) return state;

  const queue = [...state.queue];
  const concepts: Record<string, ConceptProgress> = { ...state.concepts };
  const prev = concepts[ex.conceptId] ?? {
    conceptId: ex.conceptId,
    needed: 1,
    seen: 0,
    inserted: 0,
    forcedDueTomorrow: false,
    clearedAtIndex: null,
  };
  const concept: ConceptProgress = { ...prev, seen: prev.seen + 1 };

  let comboCurrent = state.comboCurrent;
  let comboMax = state.comboMax;
  let numCorrect = state.numCorrect;
  let numWrong = state.numWrong;

  if (correct) {
    // Match warmups always evaluate as "correct" (see evaluateAnswer) but are
    // not a graded recall attempt — they must not inflate numCorrect/combo
    // (and therefore XP/perfect-lesson scoring). The concept still clears
    // normally so the runner advances past it.
    if (ex.kind !== 'match') {
      numCorrect += 1;
      comboCurrent += 1;
      comboMax = Math.max(comboMax, comboCurrent);
    }
    concept.needed = Math.max(0, concept.needed - 1);
  } else {
    numWrong += 1;
    comboCurrent = 0;
    concept.needed = state.config.clearAfterMiss;
  }

  const working: RunnerState = {
    ...state,
    queue,
    concepts: { ...concepts, [ex.conceptId]: concept },
    comboCurrent,
    comboMax,
    numCorrect,
    numWrong,
  };

  if (concept.needed > 0) {
    if (!hasFutureInstance(working, ex.conceptId)) {
      if (concept.inserted < state.config.maxRequeues) {
        const pos = Math.min(state.index + 1 + state.config.requeueGap, queue.length);
        queue.splice(pos, 0, makeRequeueExercise(concept, ex));
        concept.inserted += 1;
      } else {
        // termination safety: force-clear and flag for a next-day retest
        concept.needed = 0;
        concept.forcedDueTomorrow = true;
        concept.clearedAtIndex = state.index;
      }
    }
  } else {
    concept.clearedAtIndex ??= state.index;
  }

  return {
    ...working,
    queue,
    index: state.index + 1,
    concepts: { ...working.concepts, [ex.conceptId]: concept },
  };
}

export function isComplete(state: RunnerState): boolean {
  return Object.values(state.concepts).every((c) => c.needed <= 0);
}

export function progress(state: RunnerState): { done: number; total: number } {
  const values = Object.values(state.concepts);
  return {
    total: values.length,
    done: values.filter((c) => c.needed <= 0).length,
  };
}
