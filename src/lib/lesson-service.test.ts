import { describe, expect, it } from 'vitest';
import { buildLessonPlan, type DueReviewInput, type LessonDeps } from './lesson-service';
import { mulberry32 } from './rng';
import type { ConjugationItem, SentenceItem, VocabItem } from './exercises';
import type { SrsState } from './types';

const vi = (id: number, w: string, g: string): VocabItem => ({
  id, arabiziWord: w, primaryGloss: g, acceptedAnswers: [g],
  isVerb: g.startsWith('to '), isPhrase: false, lengthBucket: '4-5',
});

const sentence = (id: number): SentenceItem => ({
  id, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food',
});

const conjugation = (id: number): ConjugationItem => ({
  id, baseVerb: 'akal', englishMeaning: 'to eat',
  forms: {
    ana: 'bekol', ni7na: 'mnekol', inta: 'btekol', inte: 'btekle',
    into: 'bteklo', huwe: 'byekol', hiyye: 'btekol', hinne: 'byeklo',
  },
});

const dueVocab = (id: number, w: string, g: string): DueReviewInput => {
  const state: SrsState = {
    itemId: id, itemType: 'vocab', direction: 'l2_to_l1', reps: 5, ease: 2.5,
    interval: 20, dueAt: '2026-07-13', lapses: 0, lastGrade: 4,
    lastReviewedAt: null, state: 'review',
  };
  return { state, vocab: vi(id, w, g) };
};

const POOL = [
  vi(90, 'kelb', 'dog'), vi(91, '2ard', 'land'), vi(92, 'ba7er', 'sea'),
  vi(93, 'sama', 'sky'), vi(94, 'nar', 'fire'), vi(95, 'ma', 'water'),
];

function deps(over: Partial<LessonDeps>): LessonDeps {
  return {
    sessionId: 'sess', unitId: 1, unitTitle: 'Unit 1',
    dueReviews: [], newVocab: [], newSentences: [], newConjugations: [],
    learnedVocabCount: 0, distractorPool: POOL, wordBankDistractors: ['la', 'shi'],
    ...over,
  };
}

describe('buildLessonPlan sentence/conjugation introduction', () => {
  it('introduces a new sentence when learnedVocabCount >= threshold and not backlog', () => {
    const plan = buildLessonPlan(
      deps({ newSentences: [sentence(3)], learnedVocabCount: 10 }),
      '2026-07-13',
      mulberry32(5),
    );
    expect(plan.newConceptIds).toContain('sentence:3:l1_to_l2');
    expect(plan.exercises.some((e) => e.itemType === 'sentence' && e.itemId === 3)).toBe(true);
  });

  it('does NOT introduce a sentence below the learned-vocab threshold', () => {
    const plan = buildLessonPlan(
      deps({ newSentences: [sentence(3)], learnedVocabCount: 9 }),
      '2026-07-13',
      mulberry32(5),
    );
    expect(plan.newConceptIds).not.toContain('sentence:3:l1_to_l2');
    expect(plan.exercises.some((e) => e.itemType === 'sentence')).toBe(false);
  });

  it('does NOT introduce a sentence or conjugation on a backlog lesson', () => {
    // > REVIEW_BUDGET (11) due reviews => backlog mode
    const dueReviews = Array.from({ length: 12 }, (_, i) =>
      dueVocab(100 + i, `w${String(i)}`, `gloss${String(i)}`),
    );
    const plan = buildLessonPlan(
      deps({
        dueReviews,
        newSentences: [sentence(3)],
        newConjugations: [conjugation(7)],
        learnedVocabCount: 50,
      }),
      '2026-07-13',
      mulberry32(5),
    );
    expect(plan.newConceptIds).not.toContain('sentence:3:l1_to_l2');
    expect(plan.newConceptIds).not.toContain('conjugation:7:l1_to_l2');
  });

  it('introduces a conjugation whose conceptId lands in newConceptIds', () => {
    const plan = buildLessonPlan(
      deps({ newConjugations: [conjugation(7)], learnedVocabCount: 0 }),
      '2026-07-13',
      mulberry32(5),
    );
    expect(plan.newConceptIds).toContain('conjugation:7:l1_to_l2');
    expect(plan.exercises.some((e) => e.itemType === 'conjugation' && e.itemId === 7)).toBe(true);
  });

  it('keeps all conceptIds distinct when vocab, sentence, and conjugation coexist', () => {
    const plan = buildLessonPlan(
      deps({
        newVocab: [vi(1, 'beit', 'house'), vi(2, 'shta', 'winter')],
        newSentences: [sentence(3)],
        newConjugations: [conjugation(7)],
        dueReviews: [dueVocab(50, 'kteb', 'book')],
        learnedVocabCount: 20,
      }),
      '2026-07-13',
      mulberry32(9),
    );
    const ids = plan.exercises.map((e) => e.conceptId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.conceptCount).toBe(ids.length);
    expect(plan.newConceptIds).toContain('sentence:3:l1_to_l2');
    expect(plan.newConceptIds).toContain('conjugation:7:l1_to_l2');
  });
});
