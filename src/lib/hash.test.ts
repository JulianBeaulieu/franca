import { describe, expect, it } from 'vitest';
import { hashString } from './hash';

describe('hashString', () => {
  it('is deterministic and non-negative', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).toBeGreaterThanOrEqual(0);
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
