import { describe, expect, it } from 'vitest';
import {
  conceptId,
  makeConjugationExercise,
  makeMatchExercise,
  makeMcExercise,
  makeTypeTranslationExercise,
  makeWordBankExercise,
  pickDistractors,
  shuffle,
  type ConjugationItem,
  type SentenceItem,
  type VocabItem,
} from './exercises';
import { mulberry32 } from './rng';

function v(
  id: number,
  word: string,
  gloss: string,
  opts: Partial<VocabItem> = {},
): VocabItem {
  return {
    id,
    arabiziWord: word,
    primaryGloss: gloss,
    acceptedAnswers: [gloss],
    isVerb: gloss.startsWith('to '),
    isPhrase: word.includes(' '),
    lengthBucket: '4-5',
    ...opts,
  };
}

const beit = v(1, 'beit', 'house');
const pool: VocabItem[] = [
  v(2, 'kelb', 'dog'),
  v(3, '2ard', 'land'),
  v(4, 'ba7er', 'sea'),
  v(5, 'sama', 'sky', { lengthBucket: '4-5' }),
  v(6, '2akal', 'to eat'), // verb -> excluded for a noun prompt
  v(7, 'menzel', 'house'), // synonym -> excluded
];

// beit's gloss is "home/house" with both accepted; a candidate whose primaryGloss
// is "house" (but stored under a different display gloss) must still be excluded,
// as must a candidate that merely shares an arabizi spelling (homograph).
const beitHomeHouse = v(1, 'beit', 'home/house', { acceptedAnswers: ['home', 'house'] });
const houseCandidate = v(8, 'dar', 'house', { acceptedAnswers: ['house'] });
const homographCandidate = v(9, 'beit', 'poem', { acceptedAnswers: ['poem'] });
const poolWithOverlaps: VocabItem[] = [
  ...pool,
  houseCandidate,
  homographCandidate,
];

describe('conceptId', () => {
  it('builds a stable id', () => {
    expect(conceptId('vocab', 1, 'l2_to_l1')).toBe('vocab:1:l2_to_l1');
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation for a seed and preserves elements', () => {
    const a = shuffle([1, 2, 3, 4, 5], mulberry32(7));
    const b = shuffle([1, 2, 3, 4, 5], mulberry32(7));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('pickDistractors', () => {
  it('excludes verbs and synonyms for a noun prompt', () => {
    const picks = pickDistractors(beit, pool, mulberry32(1), 3);
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => !p.isVerb)).toBe(true);
    expect(picks.every((p) => p.primaryGloss !== 'house')).toBe(true);
  });

  it('excludes candidates whose acceptedAnswers overlap the correct gloss (synonym overlap)', () => {
    // beitHomeHouse accepts both "home" and "house"; houseCandidate's only accepted
    // answer is "house" and would otherwise slip through a primaryGloss-only check.
    const picks = pickDistractors(beitHomeHouse, poolWithOverlaps, mulberry32(1), poolWithOverlaps.length);
    expect(picks.some((p) => p.id === houseCandidate.id)).toBe(false);
  });

  it('excludes a candidate with the same arabizi word as the correct item (homograph)', () => {
    const picks = pickDistractors(beitHomeHouse, poolWithOverlaps, mulberry32(1), poolWithOverlaps.length);
    expect(picks.some((p) => p.id === homographCandidate.id)).toBe(false);
  });
});

describe('makeMcExercise', () => {
  it('l2_to_l1 asks the arabizi and lists English options including the answer', () => {
    const ex = makeMcExercise(beit, 'l2_to_l1', 'recognition', pool, mulberry32(3), 0);
    expect(ex.kind).toBe('mc');
    expect(ex.question).toBe('beit');
    expect(ex.options).toContain('house');
    expect(ex.options[ex.correctIndex]).toBe('house');
    expect(ex.options).toHaveLength(4);
    expect(ex.conceptId).toBe('vocab:1:l2_to_l1');
  });

  it('l1_to_l2 asks the English and lists arabizi options', () => {
    const ex = makeMcExercise(beit, 'l1_to_l2', 'recognition', pool, mulberry32(3), 1);
    expect(ex.question).toBe('house');
    expect(ex.options[ex.correctIndex]).toBe('beit');
  });
});

describe('makeTypeTranslationExercise', () => {
  it('accepts the gloss for l2_to_l1', () => {
    const ex = makeTypeTranslationExercise(beit, 'l2_to_l1', 'production', 0);
    expect(ex.source).toBe('beit');
    expect(ex.acceptedAnswers).toContain('house');
  });
});

describe('makeWordBankExercise', () => {
  it('builds tiles from the answer plus distractors', () => {
    const s: SentenceItem = { id: 9, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' };
    const ex = makeWordBankExercise(s, 'l1_to_l2', ['shi', 'la'], mulberry32(2), 0);
    expect(ex.answer).toEqual(['bi', 'akel', 'ktir']);
    for (const tok of ex.answer) expect(ex.tiles).toContain(tok);
    expect(ex.tiles.length).toBeGreaterThanOrEqual(ex.answer.length);
    expect(ex.source).toBe('a lot of food');
  });

  it('does not add a decoy tile duplicating an answer token', () => {
    const s: SentenceItem = { id: 9, arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' };
    // "akel" duplicates an answer token and must be filtered out before the
    // 2-decoy slice, leaving only the two genuinely-distinct decoys.
    const ex = makeWordBankExercise(s, 'l1_to_l2', ['akel', 'shi', 'la'], mulberry32(2), 0);
    const counts = new Map<string, number>();
    for (const tile of ex.tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
    expect(counts.get('akel')).toBe(1);
    expect(ex.tiles).toHaveLength(ex.answer.length + 2);
    expect(ex.tiles).toEqual(expect.arrayContaining(['shi', 'la']));
  });
});

describe('makeMatchExercise', () => {
  it('creates five pairs', () => {
    const ex = makeMatchExercise([beit, ...pool.slice(0, 4)], mulberry32(1), 0);
    expect(ex.pairs).toHaveLength(5);
  });
});

describe('makeConjugationExercise', () => {
  it('asks for a specific person form', () => {
    const conj: ConjugationItem = {
      id: 4,
      baseVerb: '2aal',
      englishMeaning: 'to say',
      forms: {
        ana: 'b2oul', ni7na: 'mn2oul', inta: 'bt2oul', inte: 'bt2oule',
        into: 'bt2oulo', huwe: 'by2oul', hiyye: 'bt2oul', hinne: 'by2oulo',
      },
    };
    const ex = makeConjugationExercise(conj, 'ana', 0);
    expect(ex.person).toBe('ana');
    expect(ex.personLabel).toBe('I');
    expect(ex.acceptedAnswers).toContain('b2oul');
    expect(ex.conceptId).toBe('conjugation:4:l1_to_l2');
  });
});
