import { describe, expect, it } from 'vitest';
import {
  answersMatch,
  isTypo,
  levenshtein,
  normalizeAnswer,
  parseGloss,
} from './normalize';

describe('normalizeAnswer', () => {
  it('lowercases and trims and collapses whitespace', () => {
    expect(normalizeAnswer('  Hello   World  ')).toBe('hello world');
  });

  it('strips trailing punctuation only', () => {
    expect(normalizeAnswer('yalla!')).toBe('yalla');
    expect(normalizeAnswer('Wayna?')).toBe('wayna');
  });

  it('strips hyphens and apostrophes so l-, l’, el- compare equal', () => {
    expect(normalizeAnswer('l-yom')).toBe(normalizeAnswer("l'yom"));
    expect(normalizeAnswer('el-yom')).toBe('elyom');
  });

  it('keeps the phonemic digits 2, 3, 7', () => {
    expect(normalizeAnswer('3andak')).toBe('3andak');
    expect(normalizeAnswer('7abibi')).toBe('7abibi');
    expect(normalizeAnswer('2a')).not.toBe(normalizeAnswer('3a'));
  });
});

describe('parseGloss', () => {
  it('splits slash alternates', () => {
    expect(parseGloss('to turn/flip')).toEqual({
      primary: 'to turn',
      accepted: ['to turn', 'flip'],
    });
  });

  it('drops parenthetical notes from primary but keeps a bare accepted form', () => {
    expect(parseGloss('red (f)')).toEqual({ primary: 'red', accepted: ['red'] });
  });

  it('handles a double-gloss with a comma', () => {
    expect(parseGloss('celebration, holiday')).toEqual({
      primary: 'celebration, holiday',
      accepted: ['celebration, holiday'],
    });
  });
});

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('answersMatch / isTypo', () => {
  it('matches after normalization', () => {
    expect(answersMatch('  Yalla! ', ['yalla'])).toBe(true);
    expect(answersMatch('bye', ['yalla'])).toBe(false);
  });

  it('flags a single-char typo as a typo, not a match', () => {
    expect(answersMatch('yala', ['yalla'])).toBe(false);
    expect(isTypo('yala', ['yalla'])).toBe(true); // distance 1 (missing l) — within max(1, floor(5/6)) = 1
    expect(isTypo('completely wrong', ['yalla'])).toBe(false);
  });
});
