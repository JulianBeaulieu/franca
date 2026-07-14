export type Rng = () => number;

export type ItemType = 'vocab' | 'sentence' | 'conjugation';

/** l2 = Lebanese Arabic (arabizi), l1 = English. */
export type Direction = 'l2_to_l1' | 'l1_to_l2';

export type ExerciseTier = 'recognition' | 'cued_recall' | 'production';

export type ExerciseKind =
  | 'mc'
  | 'word_bank'
  | 'type_translation'
  | 'match'
  | 'conjugation';

export type SrsLifecycle = 'new' | 'learning' | 'review' | 'relearning';

export type ConjugationPerson =
  | 'ana'
  | 'ni7na'
  | 'inta'
  | 'inte'
  | 'into'
  | 'huwe'
  | 'hiyye'
  | 'hinne';

export type GradeQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SrsState {
  itemId: number;
  itemType: ItemType;
  direction: Direction;
  reps: number;
  ease: number;
  interval: number; // days
  dueAt: string | null; // 'YYYY-MM-DD', null = never introduced (new)
  lapses: number;
  lastGrade: GradeQuality | null;
  lastReviewedAt: string | null; // ISO timestamp
  state: SrsLifecycle;
}

export interface AnswerResult {
  correct: boolean;
  firstTry: boolean;
  fast: boolean;
  usedHint: boolean;
}

export interface ExerciseBase {
  /** unique within a lesson queue, e.g. `${conceptId}#${seq}` */
  id: string;
  /** stable id of the underlying concept: `${itemType}:${itemId}:${direction}` */
  conceptId: string;
  itemType: ItemType;
  itemId: number;
  direction: Direction;
  tier: ExerciseTier;
  kind: ExerciseKind;
  /** instruction line, e.g. "Select the correct translation" */
  prompt: string;
}

export interface McExercise extends ExerciseBase {
  kind: 'mc';
  question: string;
  options: string[];
  correctIndex: number;
}

export interface WordBankExercise extends ExerciseBase {
  kind: 'word_bank';
  source: string;
  tiles: string[]; // shuffled, includes distractor tiles
  answer: string[]; // correct ordered tokens
}

export interface TypeTranslationExercise extends ExerciseBase {
  kind: 'type_translation';
  source: string;
  acceptedAnswers: string[];
}

export interface MatchExercise extends ExerciseBase {
  kind: 'match';
  pairs: { left: string; right: string }[];
}

export interface ConjugationExercise extends ExerciseBase {
  kind: 'conjugation';
  baseVerb: string;
  englishMeaning: string;
  person: ConjugationPerson;
  personLabel: string;
  acceptedAnswers: string[];
}

export type Exercise =
  | McExercise
  | WordBankExercise
  | TypeTranslationExercise
  | MatchExercise
  | ConjugationExercise;

export interface LessonPlan {
  sessionId: string;
  unitId: number;
  unitTitle: string;
  exercises: Exercise[];
  conceptCount: number;
  newConceptIds: string[];
  reviewConceptIds: string[];
}

export interface RunnerConfig {
  requeueGap: number;
  clearAfterMiss: number;
  maxRequeues: number;
}

export interface ConceptProgress {
  conceptId: string;
  needed: number;
  seen: number;
  inserted: number;
  forcedDueTomorrow: boolean;
  clearedAtIndex: number | null;
}

export interface RunnerState {
  queue: Exercise[];
  index: number;
  concepts: Record<string, ConceptProgress>;
  config: RunnerConfig;
  comboCurrent: number;
  comboMax: number;
  numCorrect: number;
  numWrong: number;
}

export interface LessonScore {
  baseXp: number;
  comboBonus: number;
  perfectBonus: number;
  totalXp: number;
  accuracy: number; // 0..1
  perfect: boolean;
}

export interface StreakInput {
  lastCompletedDate: string | null; // 'YYYY-MM-DD'
  today: string; // 'YYYY-MM-DD'
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  dailyGoalXp: number;
  xpTodayBefore: number;
  xpEarned: number;
}

export interface StreakResult {
  streak: number;
  longestStreak: number;
  streakFreezesRemaining: number;
  streakFreezeConsumed: boolean;
  goalMet: boolean;
  extendedToday: boolean;
}
