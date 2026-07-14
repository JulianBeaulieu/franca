import { describe, expect, it } from 'vitest';
import { orderMigrations } from './migrations';

describe('orderMigrations', () => {
  it('sorts by numeric prefix ascending, not lexically', () => {
    expect(orderMigrations(['010_x.sql', '002_b.sql', '000_base.sql'])).toEqual([
      '000_base.sql',
      '002_b.sql',
      '010_x.sql',
    ]);
  });

  it('ignores files without a numeric prefix and non-sql files', () => {
    expect(
      orderMigrations(['000_base.sql', 'README.md', 'notes.txt', 'draft.sql']),
    ).toEqual(['000_base.sql']);
  });

  it('is stable and returns a new array', () => {
    const input = ['001_a.sql', '001_a.sql'];
    expect(orderMigrations(input)).toEqual(['001_a.sql', '001_a.sql']);
  });
});
