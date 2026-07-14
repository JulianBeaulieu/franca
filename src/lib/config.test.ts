import { describe, expect, it } from 'vitest';
import {
  CONJUGATION_PERSONS,
  PERSON_LABELS,
  REVIEW_BUDGET,
  UNIT_THEME_COLORS,
} from './config';

describe('config', () => {
  it('derives the review budget as 11', () => {
    expect(REVIEW_BUDGET).toBe(11);
  });

  it('has a label for every conjugation person', () => {
    for (const p of CONJUGATION_PERSONS) {
      expect(PERSON_LABELS[p]).toBeTruthy();
    }
    expect(CONJUGATION_PERSONS).toHaveLength(8);
  });

  it('exposes at least one theme color', () => {
    expect(UNIT_THEME_COLORS.length).toBeGreaterThan(0);
  });
});
