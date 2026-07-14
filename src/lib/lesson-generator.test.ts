import { describe, expect, it } from 'vitest';
import { generateLesson, interleave, tierForState, type LessonSourceItem } from './lesson-generator';
import { mulberry32 } from './rng';
import type { McExercise, SrsState } from './types';
import type { VocabItem } from './exercises';

const srs = (over: Partial<SrsState>): SrsState => ({
  itemId: 1, itemType: 'vocab', direction: 'l2_to_l1', reps: 5, ease: 2.5,
  interval: 20, dueAt: '2026-07-13', lapses: 0, lastGrade: 4,
  lastReviewedAt: null, state: 'review', ...over,
});

const vi = (id: number, w: string, g: string): VocabItem => ({
  id, arabiziWord: w, primaryGloss: g, acceptedAnswers: [g],
  isVerb: g.startsWith('to '), isPhrase: false, lengthBucket: '4-5',
});

describe('tierForState', () => {
  it('maps SRS state to a tier', () => {
    expect(tierForState(srs({ state: 'relearning' }))).toBe('recognition');
    expect(tierForState(srs({ reps: 1 }))).toBe('cued_recall');
    expect(tierForState(srs({ ease: 1.8 }))).toBe('cued_recall');
    expect(tierForState(srs({ reps: 5, ease: 2.5 }))).toBe('production');
  });
});

describe('interleave', () => {
  it('avoids adjacent same-type items when possible', () => {
    const mk = (type: 'vocab' | 'sentence', i: number): McExercise => ({
      id: `${type}:${String(i)}:l2_to_l1#0`, conceptId: `${type}:${String(i)}:l2_to_l1`,
      itemType: type, itemId: i, direction: 'l2_to_l1', tier: 'recognition',
      kind: 'mc', prompt: 'p', question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0,
    });
    const input = [mk('vocab', 1), mk('vocab', 2), mk('vocab', 3), mk('sentence', 1), mk('sentence', 2)];
    const out = interleave(input, mulberry32(1));
    let adjacent = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i]?.itemType === out[i - 1]?.itemType) adjacent++;
    }
    expect(out).toHaveLength(5);
    expect(adjacent).toBeLessThan(4);
  });
});

describe('generateLesson', () => {
  it('assembles a lesson plan with concept accounting', () => {
    const pool = [vi(10, 'kelb', 'dog'), vi(11, '2ard', 'land'), vi(12, 'ba7er', 'sea'), vi(13, 'sama', 'sky')];
    const newSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(1, 'beit', 'house'), isNew: true },
    ];
    const reviewSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'production', item: vi(2, 'kteb', 'book'), isNew: false },
      { kind: 'sentence', direction: 'l1_to_l2', tier: 'cued_recall', item: { id: 3, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' }, isNew: false },
    ];
    const plan = generateLesson(
      {
        sessionId: 'sess-1', unitId: 1, unitTitle: 'Unit 1',
        newSources, reviewSources, distractorPool: pool,
        wordBankDistractors: ['la', 'shi'], today: '2026-07-13',
      },
      mulberry32(5),
    );
    expect(plan.exercises.length).toBeGreaterThanOrEqual(3);
    expect(plan.exercises.length).toBeLessThanOrEqual(22);
    expect(plan.newConceptIds).toContain('vocab:1:l2_to_l1');
    expect(plan.reviewConceptIds).toContain('vocab:2:l2_to_l1');
    const distinct = new Set(plan.exercises.map((e) => e.conceptId));
    expect(plan.conceptCount).toBe(distinct.size);
  });

  // NAMED RISK: the lesson-runner collapses exercises by conceptId
  // (`itemType:itemId:direction`, tier-agnostic). If a lesson emitted the same
  // item+direction at two tiers, the runner's progress bar could regress on a
  // late miss. For well-formed input (one source per item+direction, as
  // tierForState yields one tier per SRS state) generateLesson emits exactly one
  // exercise per source, so all conceptIds are distinct.
  it('emits distinct conceptIds for well-formed input (progress-monotonicity guard)', () => {
    const pool = [vi(10, 'kelb', 'dog'), vi(11, '2ard', 'land'), vi(12, 'ba7er', 'sea'), vi(13, 'sama', 'sky'), vi(14, 'nar', 'fire'), vi(15, 'ma', 'water')];
    const newSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(1, 'beit', 'house'), isNew: true },
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(2, 'shta', 'winter'), isNew: true },
    ];
    const reviewSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'production', item: vi(3, 'kteb', 'book'), isNew: false },
      { kind: 'vocab', direction: 'l1_to_l2', tier: 'recognition', item: vi(4, '2alam', 'pen'), isNew: false },
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(5, 'tawle', 'table'), isNew: false },
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(6, 'kersé', 'chair'), isNew: false },
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(7, 'shibbek', 'window'), isNew: false },
      { kind: 'sentence', direction: 'l1_to_l2', tier: 'cued_recall', item: { id: 8, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' }, isNew: false },
    ];
    const plan = generateLesson(
      {
        sessionId: 'sess-2', unitId: 1, unitTitle: 'Unit 1',
        newSources, reviewSources, distractorPool: pool,
        wordBankDistractors: ['la', 'shi'], today: '2026-07-13',
      },
      mulberry32(9),
    );
    const ids = plan.exercises.map((e) => e.conceptId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.conceptCount).toBe(ids.length);
  });

  it('pins conceptId to the SRS source direction even when cued_recall presents l1_to_l2', () => {
    const pool = [vi(10, 'kelb', 'dog'), vi(11, '2ard', 'land'), vi(12, 'ba7er', 'sea'), vi(13, 'sama', 'sky')];
    const reviewSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'cued_recall', item: vi(2, 'kteb', 'book'), isNew: false },
    ];
    const plan = generateLesson(
      {
        sessionId: 'sess-cr', unitId: 1, unitTitle: 'Unit 1',
        newSources: [], reviewSources, distractorPool: pool,
        wordBankDistractors: ['la', 'shi'], today: '2026-07-13',
      },
      mulberry32(7),
    );
    const ex = plan.exercises.find((e) => e.itemId === 2 && e.itemType === 'vocab');
    expect(ex).toBeDefined();
    // Presentation direction is l1_to_l2 (cued_recall drills production of the L2 form)...
    expect(ex?.direction).toBe('l1_to_l2');
    // ...but conceptId (and its id prefix) stay pinned to the l2_to_l1 SRS source identity.
    expect(ex?.conceptId).toBe('vocab:2:l2_to_l1');
    expect(ex?.id.startsWith('vocab:2:l2_to_l1#')).toBe(true);
    expect(plan.reviewConceptIds).toContain('vocab:2:l2_to_l1');
  });

  it('non-match exercise conceptIds equal the union of review and new concept ids', () => {
    const pool = [vi(10, 'kelb', 'dog'), vi(11, '2ard', 'land'), vi(12, 'ba7er', 'sea'), vi(13, 'sama', 'sky'), vi(14, 'nar', 'fire')];
    const newSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'recognition', item: vi(1, 'beit', 'house'), isNew: true },
    ];
    const reviewSources: LessonSourceItem[] = [
      { kind: 'vocab', direction: 'l2_to_l1', tier: 'cued_recall', item: vi(2, 'kteb', 'book'), isNew: false },
      { kind: 'vocab', direction: 'l1_to_l2', tier: 'production', item: vi(3, '2alam', 'pen'), isNew: false },
      { kind: 'sentence', direction: 'l1_to_l2', tier: 'cued_recall', item: { id: 4, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' }, isNew: false },
    ];
    const plan = generateLesson(
      {
        sessionId: 'sess-mix', unitId: 1, unitTitle: 'Unit 1',
        newSources, reviewSources, distractorPool: pool,
        wordBankDistractors: ['la', 'shi'], today: '2026-07-13',
      },
      mulberry32(11),
    );
    const exerciseConceptIds = new Set(
      plan.exercises.filter((e) => e.kind !== 'match').map((e) => e.conceptId),
    );
    const expected = new Set([...plan.reviewConceptIds, ...plan.newConceptIds]);
    expect(exerciseConceptIds).toEqual(expected);
  });

  it('returns an empty exercise list when there is nothing due and nothing to unlock', () => {
    const plan = generateLesson(
      {
        sessionId: 'sess-3', unitId: 1, unitTitle: 'Unit 1',
        newSources: [], reviewSources: [], distractorPool: [],
        wordBankDistractors: [], today: '2026-07-13',
      },
      mulberry32(1),
    );
    expect(plan.exercises).toHaveLength(0);
    expect(plan.conceptCount).toBe(0);
    expect(plan.newConceptIds).toHaveLength(0);
    expect(plan.reviewConceptIds).toHaveLength(0);
  });
});
