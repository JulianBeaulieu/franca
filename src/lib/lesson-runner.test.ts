import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  currentExercise,
  initRunner,
  isComplete,
  progress,
} from './lesson-runner';
import type { ConceptProgress, Exercise, McExercise } from './types';

function mc(id: number): McExercise {
  const cid = `vocab:${String(id)}:l2_to_l1`;
  return {
    id: `${cid}#0`,
    conceptId: cid,
    itemType: 'vocab',
    itemId: id,
    direction: 'l2_to_l1',
    tier: 'recognition',
    kind: 'mc',
    prompt: 'Select the correct translation',
    question: `word${String(id)}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
  };
}

let seq = 100;
const remake = (concept: ConceptProgress, last: Exercise): Exercise => ({
  ...(last as McExercise),
  id: `${concept.conceptId}#${String(seq++)}`,
});

describe('initRunner / progress', () => {
  it('tracks one concept per distinct conceptId', () => {
    const state = initRunner([mc(1), mc(2)]);
    expect(progress(state)).toEqual({ done: 0, total: 2 });
    expect(currentExercise(state)?.itemId).toBe(1);
  });
});

describe('first-try correct', () => {
  it('clears the concept with no requeue', () => {
    let state = initRunner([mc(1), mc(2)]);
    state = applyAnswer(state, true, remake);
    expect(progress(state).done).toBe(1);
    expect(state.queue).toHaveLength(2); // nothing inserted
    expect(state.numCorrect).toBe(1);
    expect(state.comboCurrent).toBe(1);
  });
});

describe('miss requires two corrects and requeues +gap', () => {
  it('inserts a fresh exercise ahead and needs two corrects to clear', () => {
    let state = initRunner([mc(1), mc(2)]);
    state = applyAnswer(state, false, remake); // miss on concept 1
    expect(state.numWrong).toBe(1);
    expect(state.comboCurrent).toBe(0);
    expect(state.queue.length).toBe(3); // one requeue inserted
    const concept1 = state.concepts['vocab:1:l2_to_l1'];
    expect(concept1?.needed).toBe(2);

    // advance through concept 2 (correct), then reach the requeued concept-1 instance
    state = applyAnswer(state, true, remake); // concept 2 correct
    // now at the requeued concept-1 exercise
    expect(currentExercise(state)?.conceptId).toBe('vocab:1:l2_to_l1');
    state = applyAnswer(state, true, remake); // 1st correct after miss -> needed 1, requeue again
    expect(state.concepts['vocab:1:l2_to_l1']?.needed).toBe(1);
    state = applyAnswer(state, true, remake); // 2nd correct -> cleared
    expect(state.concepts['vocab:1:l2_to_l1']?.needed).toBe(0);
    expect(isComplete(state)).toBe(true);
  });
});

describe('combo tracking', () => {
  it('records the max combo and resets on a miss', () => {
    let state = initRunner([mc(1), mc(2), mc(3)]);
    state = applyAnswer(state, true, remake);
    state = applyAnswer(state, true, remake);
    expect(state.comboMax).toBe(2);
    state = applyAnswer(state, false, remake);
    expect(state.comboCurrent).toBe(0);
    expect(state.comboMax).toBe(2);
  });
});

describe('termination', () => {
  it('always terminates even if every answer is wrong (insertion cap)', () => {
    let state = initRunner([mc(1)]);
    for (let i = 0; i < 50 && !isComplete(state); i++) {
      const ex = currentExercise(state);
      if (!ex) break;
      state = applyAnswer(state, false, remake);
    }
    expect(isComplete(state)).toBe(true);
    expect(state.concepts['vocab:1:l2_to_l1']?.forcedDueTomorrow).toBe(true);
  });
});
