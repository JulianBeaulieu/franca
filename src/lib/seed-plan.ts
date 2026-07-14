import {
  parseConjugationsCsv,
  parseSentencesCsv,
  parseVocabCsv,
  type ConjugationRow,
} from './csv';
import { buildUnits, rankVocab, tokenizeSentence, type RankedVocab, type UnitPlan } from './units';

export interface CourseSeedMeta {
  code: string;
  name: string;
  nativeName: string;
  emoji: string;
}

export interface SeedVocab extends RankedVocab {
  unitOrdinal: number;
  unitOrder: number;
}

export interface SeedSentence {
  arabiziSentence: string;
  englishTranslation: string;
  wordCount: number;
  tier: 'normal' | 'advanced';
}

export type SeedConjugation = ConjugationRow;

export interface SeedPlan {
  course: CourseSeedMeta;
  units: UnitPlan[];
  vocab: SeedVocab[];
  sentences: SeedSentence[];
  conjugations: SeedConjugation[];
}

export function buildSeedPlan(
  course: CourseSeedMeta,
  vocabText: string,
  sentencesText: string,
  conjugationsText: string,
): SeedPlan {
  const vocabRows = parseVocabCsv(vocabText);
  const sentenceRows = parseSentencesCsv(sentencesText);
  const conjugationRows = parseConjugationsCsv(conjugationsText);

  const ranked = rankVocab(vocabRows, sentenceRows);
  const { units, vocabUnit } = buildUnits(ranked);

  const vocab: SeedVocab[] = ranked.map((r) => {
    const assignment = vocabUnit.get(r.arabiziWord);
    return {
      ...r,
      unitOrdinal: assignment?.ordinal ?? 1,
      unitOrder: assignment?.order ?? 0,
    };
  });

  const sentences: SeedSentence[] = sentenceRows.map((s) => {
    const wordCount = tokenizeSentence(s.arabiziSentence).length;
    return {
      arabiziSentence: s.arabiziSentence,
      englishTranslation: s.englishTranslation,
      wordCount,
      tier: wordCount >= 16 ? 'advanced' : 'normal',
    };
  });

  return { course, units, vocab, sentences, conjugations: conjugationRows };
}
