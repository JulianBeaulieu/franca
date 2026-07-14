import { describe, expect, it } from 'vitest';
import {
  parseConjugationsCsv,
  parseCsv,
  parseSentencesCsv,
  parseVocabCsv,
} from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('respects quoted fields with embedded commas', () => {
    expect(parseCsv('w,t\n3id,"celebration, holiday"')).toEqual([
      ['w', 't'],
      ['3id', 'celebration, holiday'],
    ]);
  });

  it('handles escaped double quotes and CRLF', () => {
    expect(parseCsv('a\r\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('typed parsers', () => {
  it('parses vocab rows and skips the header', () => {
    const rows = parseVocabCsv('arabizi_word,english_translation\n2aal,to say\nbeit,house');
    expect(rows).toEqual([
      { arabiziWord: '2aal', englishTranslation: 'to say' },
      { arabiziWord: 'beit', englishTranslation: 'house' },
    ]);
  });

  it('parses sentence rows', () => {
    const rows = parseSentencesCsv(
      'arabizi_sentence,english_translation\n"Ma ande chi, nushkur.","Nothing, thank God."',
    );
    expect(rows).toEqual([
      { arabiziSentence: 'Ma ande chi, nushkur.', englishTranslation: 'Nothing, thank God.' },
    ]);
  });

  it('parses a 10-column conjugation row', () => {
    const rows = parseConjugationsCsv(
      'base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne\n' +
        '2aal,to say,b2oul,mn2oul,bt2oul,bt2oule,bt2oulo,by2oul,bt2oul,by2oulo',
    );
    expect(rows[0]).toEqual({
      baseVerb: '2aal',
      englishMeaning: 'to say',
      ana: 'b2oul',
      ni7na: 'mn2oul',
      inta: 'bt2oul',
      inte: 'bt2oule',
      into: 'bt2oulo',
      huwe: 'by2oul',
      hiyye: 'bt2oul',
      hinne: 'by2oulo',
    });
  });

  it('throws on a wrong column count', () => {
    expect(() => parseVocabCsv('arabizi_word,english_translation\nonlyone')).toThrow();
  });
});
