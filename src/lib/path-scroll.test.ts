import { describe, expect, it } from 'vitest';
import { isNodeFullyVisible } from './path-scroll';

describe('isNodeFullyVisible', () => {
  it('is true when the node sits fully within the viewport below the header', () => {
    expect(isNodeFullyVisible({ top: 100, bottom: 200 }, 56, 800)).toBe(true);
  });

  it('is false when the node is below the fold', () => {
    expect(isNodeFullyVisible({ top: 700, bottom: 900 }, 56, 800)).toBe(false);
  });

  it('is false when the node is hidden behind the sticky top bar', () => {
    expect(isNodeFullyVisible({ top: 10, bottom: 50 }, 56, 800)).toBe(false);
  });

  it('treats exact header/viewport boundaries as visible', () => {
    expect(isNodeFullyVisible({ top: 56, bottom: 800 }, 56, 800)).toBe(true);
  });

  it('is false when the node spans the whole viewport (taller than the fold)', () => {
    expect(isNodeFullyVisible({ top: -20, bottom: 820 }, 56, 800)).toBe(false);
  });
});
