import {
  CONJUGATION_PERSONS,
  DEFAULT_NEW,
  INTRO_SENTENCE_MIN_LEARNED_VOCAB,
  MAX_NEW,
  NEW_CONJUGATIONS_PER_LESSON,
  NEW_SENTENCES_PER_LESSON,
  REVIEW_BUDGET,
} from './config';
import { generateLesson, tierForState, type GenerateLessonInput, type LessonSourceItem } from './lesson-generator';
import type { ConjugationItem, SentenceItem, VocabItem } from './exercises';
import type { LessonPlan, Rng, SrsState } from './types';

export interface DueReviewInput {
  state: SrsState;
  vocab?: VocabItem;
  sentence?: SentenceItem;
  conjugation?: ConjugationItem;
  person?: 'ana' | 'ni7na' | 'inta' | 'inte' | 'into' | 'huwe' | 'hiyye' | 'hinne';
}

export interface LessonDeps {
  sessionId: string;
  unitId: number;
  unitTitle: string;
  dueReviews: DueReviewInput[];
  newVocab: VocabItem[];
  newSentences: SentenceItem[];
  newConjugations: ConjugationItem[];
  learnedVocabCount: number;
  distractorPool: VocabItem[];
  wordBankDistractors: string[];
}

export function buildLessonPlan(deps: LessonDeps, today: string, rng: Rng): LessonPlan {
  const reviews = deps.dueReviews.slice(0, REVIEW_BUDGET);
  const backlog = deps.dueReviews.length > REVIEW_BUDGET;
  const newCount = backlog ? 0 : Math.min(DEFAULT_NEW, MAX_NEW, deps.newVocab.length);

  const newSources: LessonSourceItem[] = deps.newVocab.slice(0, newCount).map((item) => ({
    kind: 'vocab',
    direction: 'l2_to_l1',
    tier: 'recognition',
    item,
    isNew: true,
  }));

  // New sentences and conjugations only enter on non-backlog lessons (a large
  // review debt crowds out fresh material). Sentences additionally gate on the
  // learner having enough vocab already in rotation.
  if (!backlog) {
    if (deps.learnedVocabCount >= INTRO_SENTENCE_MIN_LEARNED_VOCAB) {
      for (const item of deps.newSentences.slice(0, NEW_SENTENCES_PER_LESSON)) {
        newSources.push({ kind: 'sentence', direction: 'l1_to_l2', tier: 'recognition', item, isNew: true });
      }
    }
    for (const item of deps.newConjugations.slice(0, NEW_CONJUGATIONS_PER_LESSON)) {
      const person = CONJUGATION_PERSONS[Math.floor(rng() * CONJUGATION_PERSONS.length)] ?? 'ana';
      newSources.push({ kind: 'conjugation', person, item, isNew: true });
    }
  }

  const reviewSources: LessonSourceItem[] = [];
  for (const r of reviews) {
    if (r.vocab) {
      reviewSources.push({
        kind: 'vocab',
        direction: r.state.direction,
        tier: tierForState(r.state),
        item: r.vocab,
        isNew: false,
      });
    } else if (r.sentence) {
      reviewSources.push({
        kind: 'sentence',
        direction: r.state.direction,
        tier: tierForState(r.state),
        item: r.sentence,
        isNew: false,
      });
    } else if (r.conjugation) {
      reviewSources.push({
        kind: 'conjugation',
        person: r.person ?? 'ana',
        item: r.conjugation,
        isNew: false,
      });
    }
  }

  const input: GenerateLessonInput = {
    sessionId: deps.sessionId,
    unitId: deps.unitId,
    unitTitle: deps.unitTitle,
    newSources,
    reviewSources,
    distractorPool: deps.distractorPool,
    wordBankDistractors: deps.wordBankDistractors,
    today,
  };
  return generateLesson(input, rng);
}
