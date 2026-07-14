import { answersMatch, isTypo, normalizeAnswer } from './normalize';
import type { ConceptProgress, Exercise, ExerciseKind, RunnerState } from './types';

export interface UserAnswer {
  kind: ExerciseKind;
  selectedIndex?: number;
  tokens?: string[];
  text?: string;
}

export function evaluateAnswer(
  ex: Exercise,
  ans: UserAnswer,
): { correct: boolean; correctText: string; typo: boolean } {
  switch (ex.kind) {
    case 'mc': {
      const correctText = ex.options[ex.correctIndex] ?? '';
      return { correct: ans.selectedIndex === ex.correctIndex, correctText, typo: false };
    }
    case 'word_bank': {
      const got = (ans.tokens ?? []).map(normalizeAnswer).join(' ');
      const want = ex.answer.map(normalizeAnswer).join(' ');
      return { correct: got === want, correctText: ex.answer.join(' '), typo: false };
    }
    case 'type_translation':
    case 'conjugation': {
      const text = ans.text ?? '';
      const correct = answersMatch(text, ex.acceptedAnswers);
      return {
        correct,
        correctText: ex.acceptedAnswers[0] ?? '',
        typo: !correct && isTypo(text, ex.acceptedAnswers),
      };
    }
    case 'match':
      return { correct: true, correctText: '', typo: false };
  }
}

export function parseConceptId(
  conceptId: string,
): { itemType: string; itemId: number; direction: string } | null {
  if (conceptId.startsWith('match:')) return null;
  const parts = conceptId.split(':');
  if (parts.length !== 3) return null;
  const itemId = Number(parts[1]);
  if (!Number.isFinite(itemId)) return null;
  return { itemType: parts[0] ?? '', itemId, direction: parts[2] ?? '' };
}

export function extractRequeuedConcepts(
  state: RunnerState,
): { itemId: number; itemType: 'vocab' | 'sentence' | 'conjugation'; direction: 'l2_to_l1' | 'l1_to_l2' }[] {
  const out: { itemId: number; itemType: 'vocab' | 'sentence' | 'conjugation'; direction: 'l2_to_l1' | 'l1_to_l2' }[] = [];
  for (const c of Object.values(state.concepts)) {
    if (c.inserted <= 0 && !c.forcedDueTomorrow) continue;
    const parsed = parseConceptId(c.conceptId);
    if (!parsed) continue;
    if (parsed.itemType === 'vocab' || parsed.itemType === 'sentence' || parsed.itemType === 'conjugation') {
      if (parsed.direction === 'l2_to_l1' || parsed.direction === 'l1_to_l2') {
        out.push({ itemId: parsed.itemId, itemType: parsed.itemType, direction: parsed.direction });
      }
    }
  }
  return out;
}

export function makeRequeueFactory(): (concept: ConceptProgress, last: Exercise) => Exercise {
  let counter = 1000;
  return (_concept, last) => {
    counter += 1;
    return { ...last, id: `${last.conceptId}#rq${String(counter)}` };
  };
}
