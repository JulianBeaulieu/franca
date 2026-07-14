import { describe, expect, it } from 'vitest';
import { evaluateAnswer, extractRequeuedConcepts, parseConceptId } from './session-core';
import { initRunner } from './lesson-runner';
import type { McExercise, TypeTranslationExercise, WordBankExercise } from './types';

const mc: McExercise = {
  id: 'vocab:1:l2_to_l1#0', conceptId: 'vocab:1:l2_to_l1', itemType: 'vocab', itemId: 1,
  direction: 'l2_to_l1', tier: 'recognition', kind: 'mc', prompt: 'p',
  question: 'beit', options: ['dog', 'house', 'sea', 'land'], correctIndex: 1,
};
const wb: WordBankExercise = {
  id: 'sentence:3:l1_to_l2#0', conceptId: 'sentence:3:l1_to_l2', itemType: 'sentence', itemId: 3,
  direction: 'l1_to_l2', tier: 'cued_recall', kind: 'word_bank', prompt: 'p',
  source: 'a lot of food', tiles: ['ktir', 'bi', 'akel', 'la'], answer: ['bi', 'akel', 'ktir'],
};
const tt: TypeTranslationExercise = {
  id: 'vocab:2:l2_to_l1#0', conceptId: 'vocab:2:l2_to_l1', itemType: 'vocab', itemId: 2,
  direction: 'l2_to_l1', tier: 'production', kind: 'type_translation', prompt: 'p',
  source: 'yalla', acceptedAnswers: ['let’s go', 'come on'],
};

describe('evaluateAnswer', () => {
  it('grades multiple choice', () => {
    expect(evaluateAnswer(mc, { kind: 'mc', selectedIndex: 1 }).correct).toBe(true);
    const wrong = evaluateAnswer(mc, { kind: 'mc', selectedIndex: 0 });
    expect(wrong.correct).toBe(false);
    expect(wrong.correctText).toBe('house');
  });

  it('grades word bank by normalized token order', () => {
    expect(evaluateAnswer(wb, { kind: 'word_bank', tokens: ['bi', 'akel', 'ktir'] }).correct).toBe(true);
    expect(evaluateAnswer(wb, { kind: 'word_bank', tokens: ['akel', 'bi', 'ktir'] }).correct).toBe(false);
  });

  it('grades typed answers with typo tolerance', () => {
    expect(evaluateAnswer(tt, { kind: 'type_translation', text: 'come on' }).correct).toBe(true);
    const typo = evaluateAnswer(tt, { kind: 'type_translation', text: 'come onn' });
    expect(typo.correct).toBe(false);
    expect(typo.typo).toBe(true);
    expect(typo.correctText).toBe('let’s go');
  });
});

describe('parseConceptId / extractRequeuedConcepts', () => {
  it('parses real concept ids and rejects match blocks', () => {
    expect(parseConceptId('vocab:1:l2_to_l1')).toEqual({ itemType: 'vocab', itemId: 1, direction: 'l2_to_l1' });
    expect(parseConceptId('match:5')).toBeNull();
  });

  it('extracts concepts that were requeued', () => {
    const state = initRunner([mc]);
    const base = state.concepts['vocab:1:l2_to_l1'];
    if (!base) throw new Error('expected concept to exist');
    const requeued = { ...state, concepts: { ...state.concepts, 'vocab:1:l2_to_l1': { ...base, inserted: 1 } } };
    expect(extractRequeuedConcepts(requeued)).toEqual([{ itemId: 1, itemType: 'vocab', direction: 'l2_to_l1' }]);
  });
});
