import { describe, expect, it } from 'vitest';
import {
  buildUnits,
  computeSentenceFrequencies,
  rankVocab,
  tokenizeSentence,
} from './units';
import type { VocabRow, SentenceRow } from './csv';

const vocab: VocabRow[] = [
  { arabiziWord: 'bi', englishTranslation: 'in' },
  { arabiziWord: 'akel', englishTranslation: 'food' },
  { arabiziWord: '2akal', englishTranslation: 'to eat' },
  { arabiziWord: '7elo', englishTranslation: 'nice/beautiful' },
];
const sentences: SentenceRow[] = [
  { arabiziSentence: 'bi l-beit akel', englishTranslation: 'food in the house' },
  { arabiziSentence: 'bi akel ktir', englishTranslation: 'a lot of food' },
];

describe('tokenizeSentence', () => {
  it('lowercases and keeps digits/apostrophes, splits on hyphens', () => {
    expect(tokenizeSentence("Bi l-beit 3andi")).toEqual(['bi', 'l', 'beit', '3andi']);
  });

  it('keeps an apostrophe inside a token (l\'acqua stays one token)', () => {
    expect(tokenizeSentence("l'acqua")).toEqual(["l'acqua"]);
  });

  it('preserves arabizi digits 2/3/7 exactly as before', () => {
    expect(tokenizeSentence('2akal 3am 7elo')).toEqual(['2akal', '3am', '7elo']);
  });

  it('keeps a bare accented character instead of dropping it', () => {
    expect(tokenizeSentence('è')).toEqual(['è']);
  });

  it('does not truncate accented words (città)', () => {
    expect(tokenizeSentence('città')).toEqual(['città']);
  });

  it('preserves German ß and umlauts (lowercased, mirroring existing behavior)', () => {
    expect(tokenizeSentence('Ich heiße Müller')).toEqual(['ich', 'heiße', 'müller']);
  });

  it('keeps Arabic-Latin transliteration marks (é/ī/ḥ) as part of the token', () => {
    expect(tokenizeSentence('né3im sabaḥ zghīr')).toEqual(['né3im', 'sabaḥ', 'zghīr']);
  });
});

describe('computeSentenceFrequencies', () => {
  it('counts sentences containing each word', () => {
    const freq = computeSentenceFrequencies(vocab, sentences);
    expect(freq.get('bi')).toBe(2);
    expect(freq.get('akel')).toBe(2);
    expect(freq.get('2akal')).toBe(0);
  });
});

describe('rankVocab', () => {
  it('ranks most-frequent first and detects verbs/phrases/gloss', () => {
    const ranked = rankVocab(vocab, sentences);
    const bi = ranked.find((r) => r.arabiziWord === 'bi');
    const eat = ranked.find((r) => r.arabiziWord === '2akal');
    // tie-break rule: arabiziWord ascending among equal frequencies ->
    // 'akel' (freq 2) sorts before 'bi' (freq 2).
    expect(ranked.find((r) => r.arabiziWord === 'akel')?.freqRank).toBe(1);
    expect(bi?.freqRank).toBe(2);
    expect(eat?.isVerb).toBe(true);
    expect(eat?.freqRank).toBeGreaterThan(2); // zero-frequency ranked after non-zero
    const nice = ranked.find((r) => r.arabiziWord === '7elo');
    expect(nice?.primaryGloss).toBe('nice');
    expect(nice?.acceptedAnswers).toContain('beautiful');
  });
});

describe('buildUnits', () => {
  it('always puts function words in Unit 1 and assigns every word to a unit', () => {
    const ranked = rankVocab(vocab, sentences);
    const { units, vocabUnit } = buildUnits(ranked);
    expect(units[0]?.ordinal).toBe(1);
    expect(units[0]?.words).toContain('bi');
    expect(vocabUnit.get('akel')).toBeDefined();
    for (const r of ranked) {
      expect(vocabUnit.get(r.arabiziWord)).toBeDefined();
    }
  });
});

describe('theme assignment (broadened multi-language keywords)', () => {
  const theme = (word: string, gloss: string): string => {
    const ranked = rankVocab([{ arabiziWord: word, englishTranslation: gloss }], []);
    return ranked[0]?.theme ?? '';
  };

  it('assigns new-theme vocabulary from the German/Italian/Spanish/French courses', () => {
    expect(theme('sagen', 'to say')).toBe('Communication & tech');
    expect(theme('denken', 'to think')).toBe('Emotions & feelings');
    expect(theme('dormire', 'to sleep')).toBe('Daily routine');
    expect(theme('nehmen', 'to take')).toBe('Common verbs & actions');
    expect(theme('flughafen', 'airport')).toBe('Travel');
    expect(theme('warum', 'why')).toBe('Question words');
    expect(theme('grazie', 'thank you')).toBe('Greetings & courtesy');
    expect(theme('zwischen', 'between')).toBe('Prepositions & location');
    expect(theme('jacke', 'jacket')).toBe('Clothing');
    expect(theme('marrone', 'brown')).toBe('Colors');
    expect(theme('elefante', 'elephant')).toBe('Animals');
    expect(theme('ciudad', 'city')).toBe('Nature & places');
    expect(theme('teuer', 'expensive')).toBe('Money & shopping');
    expect(theme('schwierig', 'difficult')).toBe('Adjectives');
  });

  it('routes substring-collision words to the semantically correct theme', () => {
    // Each of these glosses contains a keyword of a *different* theme as a substring;
    // ordering (and phrase keywords like 'to eat'/'to read') must win.
    expect(theme('lehrer', 'teacher')).toBe('Work & school'); // not Food ('tea')
    expect(theme('wetter', 'weather')).toBe('Nature & places'); // not Food ('eat')
    expect(theme('brot', 'bread')).toBe('Food & drink'); // not Communication ('read')
    expect(theme('zug', 'train')).toBe('Travel'); // not Nature ('rain')
    expect(theme('telefon', 'phone')).toBe('Communication & tech'); // not Numbers ('one')
    expect(theme('handschuh', 'glove')).toBe('Clothing'); // not Emotions ('love')
    expect(theme('offen', 'open')).toBe('Adjectives'); // not Work & school ('pen')
    expect(theme('hundert', 'hundred')).toBe('Numbers & quantities'); // not Colors ('red')
    expect(theme('dorf', 'village')).toBe('Nature & places'); // not Health ('ill')
    expect(theme('stuhl', 'chair')).toBe('House & furniture'); // not Body parts ('hair')
  });

  it('keeps unmatched advanced vocabulary in the catch-all theme', () => {
    expect(theme('dawle', 'state')).toBe('More vocabulary');
    expect(theme('nostalgie', 'nostalgia')).toBe('More vocabulary');
  });
});
