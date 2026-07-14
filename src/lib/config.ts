import type { ConjugationPerson } from './types';

export const LESSON_SLOTS = 14;
export const NEW_RATIO = 0.25;
export const MAX_NEW = 6;
export const DEFAULT_NEW = 5;

// How many brand-new sentences / conjugations to introduce per lesson, and the
// learned-vocab floor before sentences unlock (a fresh learner drills words
// first; sentences only appear once enough vocab is in rotation).
export const NEW_SENTENCES_PER_LESSON = 1;
export const NEW_CONJUGATIONS_PER_LESSON = 1;
export const INTRO_SENTENCE_MIN_LEARNED_VOCAB = 10;
export const REVIEW_BUDGET = Math.ceil(LESSON_SLOTS * (1 - NEW_RATIO)); // 11
export const HARD_EXERCISE_CEILING = 22;

export const REQUEUE_GAP = 3;
export const CLEAR_AFTER_MISS = 2;
export const MAX_REQUEUES = 3;

export const MAX_HEARTS = 5;
export const HEART_REGEN_MINUTES = 60;

export const BASE_XP = 10;
export const PERFECT_BONUS = 5;
export const MAX_COMBO_BONUS = 5;

export const LEECH_LAPSES = 8;
export const EASE_START = 2.5;
export const EASE_FLOOR = 1.3;
export const EASE_CEIL = 2.7;

export const CONJUGATION_PERSONS: readonly ConjugationPerson[] = [
  'ana',
  'ni7na',
  'inta',
  'inte',
  'into',
  'huwe',
  'hiyye',
  'hinne',
] as const;

export const PERSON_LABELS: Record<ConjugationPerson, string> = {
  ana: 'I',
  ni7na: 'we',
  inta: 'you (m)',
  inte: 'you (f)',
  into: 'you (pl)',
  huwe: 'he',
  hiyye: 'she',
  hinne: 'they',
};

/** Rotating per-unit theme colors (hex from the palette). */
export const UNIT_THEME_COLORS: readonly string[] = [
  '#58CC02',
  '#1CB0F6',
  '#CE82FF',
  '#FF9600',
  '#FF4B4B',
  '#FFC800',
  '#2B70C9',
] as const;
