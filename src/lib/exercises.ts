import { PERSON_LABELS } from './config';
import { normalizeAnswer } from './normalize';
import { tokenizeSentence } from './units';
import type {
  ConjugationExercise,
  ConjugationPerson,
  Direction,
  ExerciseTier,
  ItemType,
  MatchExercise,
  McExercise,
  Rng,
  TypeTranslationExercise,
  WordBankExercise,
} from './types';

export interface VocabItem {
  id: number;
  arabiziWord: string;
  primaryGloss: string;
  acceptedAnswers: string[];
  isVerb: boolean;
  isPhrase: boolean;
  lengthBucket: string;
}

export interface SentenceItem {
  id: number;
  arabiziSentence: string;
  englishTranslation: string;
}

export interface ConjugationItem {
  id: number;
  baseVerb: string;
  englishMeaning: string;
  forms: Record<ConjugationPerson, string>;
}

export function conceptId(itemType: ItemType, itemId: number, direction: Direction): string {
  return `${itemType}:${String(itemId)}:${direction}`;
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

const BUCKET_ORDER = ['1-3', '4-5', '6-7', '8-9', '10+'];

function bucketDistance(a: string, b: string): number {
  return Math.abs(BUCKET_ORDER.indexOf(a) - BUCKET_ORDER.indexOf(b));
}

/** data-profile §5: same POS, near length, shared onset preferred, no synonyms. */
export function pickDistractors(
  correct: VocabItem,
  pool: readonly VocabItem[],
  rng: Rng,
  n: number,
): VocabItem[] {
  const correctGlosses = new Set(correct.acceptedAnswers.map(normalizeAnswer));
  const correctArabizi = normalizeAnswer(correct.arabiziWord);
  const eligible = pool.filter(
    (c) =>
      c.id !== correct.id &&
      c.isVerb === correct.isVerb && // never mix verb/noun
      !c.acceptedAnswers.some((a) => correctGlosses.has(normalizeAnswer(a))) && // no synonyms/accepted-answer overlap
      normalizeAnswer(c.arabiziWord) !== correctArabizi && // no homographs
      !c.isPhrase,
  );

  const correctOnset = correct.arabiziWord.charAt(0);
  const scored = eligible
    .map((c) => {
      const cOnset = c.arabiziWord.charAt(0);
      const sharedPrefix = cOnset === correctOnset ? 1 : 0;
      const lenScore = 2 - Math.min(2, bucketDistance(c.lengthBucket, correct.lengthBucket));
      return { c, score: sharedPrefix * 2 + lenScore + rng() };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, n).map((s) => s.c);
}

function tierPrompt(direction: Direction, kind: string): string {
  if (kind === 'mc') return 'Select the correct translation';
  if (kind === 'type') return direction === 'l2_to_l1' ? 'Type the English translation' : 'Type in Arabizi';
  if (kind === 'wordbank') return 'Translate this sentence';
  if (kind === 'match') return 'Tap the matching pairs';
  return 'Conjugate the verb';
}

export function makeMcExercise(
  item: VocabItem,
  direction: Direction,
  tier: ExerciseTier,
  pool: readonly VocabItem[],
  rng: Rng,
  seq: number,
): McExercise {
  const distractors = pickDistractors(item, pool, rng, 3);
  const correctText = direction === 'l2_to_l1' ? item.primaryGloss : item.arabiziWord;
  const distractorTexts = distractors.map((d) =>
    direction === 'l2_to_l1' ? d.primaryGloss : d.arabiziWord,
  );
  const options = shuffle([correctText, ...distractorTexts], rng);
  const cid = conceptId('vocab', item.id, direction);
  return {
    id: `${cid}#${String(seq)}`,
    conceptId: cid,
    itemType: 'vocab',
    itemId: item.id,
    direction,
    tier,
    kind: 'mc',
    prompt: tierPrompt(direction, 'mc'),
    question: direction === 'l2_to_l1' ? item.arabiziWord : item.primaryGloss,
    options,
    correctIndex: options.indexOf(correctText),
  };
}

export function makeTypeTranslationExercise(
  item: VocabItem,
  direction: Direction,
  tier: ExerciseTier,
  seq: number,
): TypeTranslationExercise {
  const cid = conceptId('vocab', item.id, direction);
  const source = direction === 'l2_to_l1' ? item.arabiziWord : item.primaryGloss;
  const acceptedAnswers = direction === 'l2_to_l1' ? item.acceptedAnswers : [item.arabiziWord];
  return {
    id: `${cid}#${String(seq)}`,
    conceptId: cid,
    itemType: 'vocab',
    itemId: item.id,
    direction,
    tier,
    kind: 'type_translation',
    prompt: tierPrompt(direction, 'type'),
    source,
    acceptedAnswers,
  };
}

export function makeWordBankExercise(
  sentence: SentenceItem,
  direction: Direction,
  distractorTokens: readonly string[],
  rng: Rng,
  seq: number,
): WordBankExercise {
  const answer = tokenizeSentence(sentence.arabiziSentence);
  const answerNormalized = new Set(answer.map(normalizeAnswer));
  const decoys = distractorTokens
    .filter((t) => !answerNormalized.has(normalizeAnswer(t)))
    .slice(0, 2);
  const tiles = shuffle([...answer, ...decoys], rng);
  const cid = conceptId('sentence', sentence.id, direction);
  return {
    id: `${cid}#${String(seq)}`,
    conceptId: cid,
    itemType: 'sentence',
    itemId: sentence.id,
    direction,
    tier: 'cued_recall',
    kind: 'word_bank',
    prompt: tierPrompt(direction, 'wordbank'),
    source: direction === 'l1_to_l2' ? sentence.englishTranslation : sentence.arabiziSentence,
    tiles,
    answer,
  };
}

export function makeMatchExercise(
  items: readonly VocabItem[],
  rng: Rng,
  seq: number,
): MatchExercise {
  const chosen = shuffle(items, rng).slice(0, 5);
  const pairs = chosen.map((it) => ({ left: it.arabiziWord, right: it.primaryGloss }));
  const first = chosen[0];
  // A match block is its own concept so it never collides with the per-item concepts
  // that also drill these words elsewhere in the lesson.
  const cid = `match:${String(seq)}`;
  return {
    id: `${cid}#0`,
    conceptId: cid,
    itemType: 'vocab',
    itemId: first?.id ?? 0,
    direction: 'l2_to_l1',
    tier: 'recognition',
    kind: 'match',
    prompt: tierPrompt('l2_to_l1', 'match'),
    pairs,
  };
}

export function makeConjugationExercise(
  conj: ConjugationItem,
  person: ConjugationPerson,
  seq: number,
): ConjugationExercise {
  const cid = conceptId('conjugation', conj.id, 'l1_to_l2');
  const answer = conj.forms[person];
  return {
    id: `${cid}#${person}#${String(seq)}`,
    conceptId: cid,
    itemType: 'conjugation',
    itemId: conj.id,
    direction: 'l1_to_l2',
    tier: 'production',
    kind: 'conjugation',
    prompt: tierPrompt('l1_to_l2', 'conjugation'),
    baseVerb: conj.baseVerb,
    englishMeaning: conj.englishMeaning,
    person,
    personLabel: PERSON_LABELS[person],
    acceptedAnswers: [answer],
  };
}
