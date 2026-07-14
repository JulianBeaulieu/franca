import { HARD_EXERCISE_CEILING } from './config';
import {
  makeConjugationExercise,
  makeMatchExercise,
  makeMcExercise,
  makeTypeTranslationExercise,
  makeWordBankExercise,
  type ConjugationItem,
  type SentenceItem,
  type VocabItem,
} from './exercises';
import type {
  ConjugationPerson,
  Direction,
  Exercise,
  ExerciseTier,
  LessonPlan,
  Rng,
  SrsState,
} from './types';

export type LessonSourceItem =
  | { kind: 'vocab'; direction: Direction; tier: ExerciseTier; item: VocabItem; isNew: boolean }
  | { kind: 'sentence'; direction: Direction; tier: ExerciseTier; item: SentenceItem; isNew: boolean }
  | {
      kind: 'conjugation';
      person: ConjugationPerson;
      item: ConjugationItem;
      isNew: boolean;
    };

export interface GenerateLessonInput {
  sessionId: string;
  unitId: number;
  unitTitle: string;
  newSources: LessonSourceItem[];
  reviewSources: LessonSourceItem[];
  distractorPool: VocabItem[];
  wordBankDistractors: string[];
  today: string;
}

export function tierForState(state: SrsState): ExerciseTier {
  if (state.state === 'relearning' || state.state === 'learning') return 'recognition';
  if (state.ease < 2.0 || state.reps < 2) return 'cued_recall';
  return 'production';
}

// conceptId identifies the SRS concept (the source's identity), independent of
// how any one exercise chooses to *present* it. e.g. a cued_recall vocab review
// is presented l1_to_l2 but must still track the source's l2_to_l1 SRS row.
function conceptIdForSource(s: LessonSourceItem): string {
  return s.kind === 'conjugation'
    ? `conjugation:${String(s.item.id)}:l1_to_l2`
    : s.kind === 'sentence'
      ? `sentence:${String(s.item.id)}:${s.direction}`
      : `vocab:${String(s.item.id)}:${s.direction}`;
}

function buildExercise(
  source: LessonSourceItem,
  pool: VocabItem[],
  wordBankDistractors: string[],
  rng: Rng,
  seq: number,
): Exercise {
  const built = buildExerciseRaw(source, pool, wordBankDistractors, rng, seq);
  // Presentation direction may diverge from the SRS source direction (e.g. a
  // cued_recall vocab review is drilled l1_to_l2 but tracks the l2_to_l1 row).
  // conceptId must stay pinned to the source identity so the runner updates the
  // scheduled SRS row; exercise.direction remains presentation-only.
  const sourceConceptId = conceptIdForSource(source);
  if (built.conceptId === sourceConceptId) return built;
  return {
    ...built,
    conceptId: sourceConceptId,
    id: built.id.replace(built.conceptId, sourceConceptId),
  };
}

function buildExerciseRaw(
  source: LessonSourceItem,
  pool: VocabItem[],
  wordBankDistractors: string[],
  rng: Rng,
  seq: number,
): Exercise {
  if (source.kind === 'vocab') {
    if (source.tier === 'recognition') {
      return makeMcExercise(source.item, source.direction, 'recognition', pool, rng, seq);
    }
    if (source.tier === 'cued_recall') {
      return makeMcExercise(source.item, 'l1_to_l2', 'cued_recall', pool, rng, seq);
    }
    return makeTypeTranslationExercise(source.item, source.direction, 'production', seq);
  }
  if (source.kind === 'sentence') {
    return makeWordBankExercise(source.item, source.direction, wordBankDistractors, rng, seq);
  }
  return makeConjugationExercise(source.item, source.person, seq);
}

export function interleave(exercises: Exercise[], rng: Rng): Exercise[] {
  const buckets = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const list = buckets.get(ex.itemType) ?? [];
    list.push(ex);
    buckets.set(ex.itemType, list);
  }
  const queues = [...buckets.values()];
  const out: Exercise[] = [];
  let lastType: string | null = null;
  while (out.length < exercises.length) {
    // prefer a non-empty bucket whose type differs from the last emitted type
    const candidates = queues.filter((q) => q.length > 0);
    if (candidates.length === 0) break;
    const nonRepeating = candidates.filter((q) => q[0]?.itemType !== lastType);
    const chosenPool = nonRepeating.length > 0 ? nonRepeating : candidates;
    const pick = chosenPool[Math.floor(rng() * chosenPool.length)] ?? chosenPool[0];
    if (!pick) break;
    const ex = pick.shift();
    if (ex) {
      out.push(ex);
      lastType = ex.itemType;
    }
  }
  return out;
}

export function generateLesson(input: GenerateLessonInput, rng: Rng): LessonPlan {
  let seq = 0;
  const exercises: Exercise[] = [];

  // New words always enter at the easiest tier (recognition), per learning-science §6.3.
  for (const source of input.newSources) {
    const forced: LessonSourceItem =
      source.kind === 'vocab' ? { ...source, tier: 'recognition' } : source;
    exercises.push(buildExercise(forced, input.distractorPool, input.wordBankDistractors, rng, seq++));
  }
  for (const source of input.reviewSources) {
    exercises.push(buildExercise(source, input.distractorPool, input.wordBankDistractors, rng, seq++));
  }

  // Optional matching warmup from review vocab (>= 5 available).
  const reviewVocab = input.reviewSources
    .filter((s): s is Extract<LessonSourceItem, { kind: 'vocab' }> => s.kind === 'vocab')
    .map((s) => s.item);
  const warmup =
    reviewVocab.length >= 5 ? [makeMatchExercise(reviewVocab, rng, seq++)] : [];

  const interleaved = interleave(exercises, rng);
  const queue = [...warmup, ...interleaved].slice(0, HARD_EXERCISE_CEILING);

  const distinct = new Set(queue.map((e) => e.conceptId));
  const newConceptIds = input.newSources.map(conceptIdForSource);
  const reviewConceptIds = input.reviewSources.map(conceptIdForSource);

  return {
    sessionId: input.sessionId,
    unitId: input.unitId,
    unitTitle: input.unitTitle,
    exercises: queue,
    conceptCount: distinct.size,
    newConceptIds,
    reviewConceptIds,
  };
}
