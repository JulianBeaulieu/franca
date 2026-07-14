import { describe, expect, it } from 'vitest';
import { buildSeedPlan } from './seed-plan';

const vocab = 'arabizi_word,english_translation\nbi,in\nakel,food\n2akal,to eat\n';
const sentences =
  'arabizi_sentence,english_translation\nbi akel,in food\n' +
  'bi l-2aren tase3 3ashar ken kellogg ydir masa77a bi battle creek w ken mou2men bi nazariye gharibe 3ajibe ktir mnih,long historical sentence about kellogg and cereal and battle creek here we go\n';
const conj =
  'base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne\n' +
  '2akal,to eat,bekol,mnekol,btekol,btekle,bteklo,byekol,btekol,byeklo\n';

const COURSE = { code: 'ar-leb', name: 'Lebanese Arabic', nativeName: 'اللبناني', emoji: '🇱🇧' };

describe('buildSeedPlan', () => {
  it('assigns every vocab word a unit and preserves counts', () => {
    const plan = buildSeedPlan(COURSE, vocab, sentences, conj);
    expect(plan.vocab).toHaveLength(3);
    for (const v of plan.vocab) {
      expect(v.unitOrdinal).toBeGreaterThan(0);
    }
    expect(plan.units.length).toBeGreaterThan(0);
    expect(plan.conjugations).toHaveLength(1);
  });

  it('marks 16+ word sentences as advanced tier', () => {
    const plan = buildSeedPlan(COURSE, vocab, sentences, conj);
    const long = plan.sentences.find((s) => s.wordCount >= 16);
    expect(long?.tier).toBe('advanced');
    const short = plan.sentences.find((s) => s.arabiziSentence === 'bi akel');
    expect(short?.tier).toBe('normal');
  });
});

const VOCAB = 'arabizi_word,english_translation\nbi,in\nana,I\n';
const SENTENCES = 'arabizi_sentence,english_translation\nana bi,I am in\n';
const CONJ =
  'base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne\n' +
  'raye7,to go,raye7,rey7in,raye7,ray7a,ray7in,raye7,ray7a,ray7in\n';

describe('buildSeedPlan (course-aware)', () => {
  it('echoes the course metadata onto the plan', () => {
    const plan = buildSeedPlan(COURSE, VOCAB, SENTENCES, CONJ);
    expect(plan.course).toEqual(COURSE);
  });

  it('still ranks and builds units deterministically regardless of course', () => {
    const a = buildSeedPlan(COURSE, VOCAB, SENTENCES, CONJ);
    const b = buildSeedPlan({ ...COURSE, code: 'fr' }, VOCAB, SENTENCES, CONJ);
    expect(a.units).toEqual(b.units);
    expect(a.vocab).toEqual(b.vocab);
  });
});
