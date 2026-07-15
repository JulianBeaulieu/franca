import { describe, expect, it } from 'vitest';
import { zeroFillDays } from './stats';

describe('zeroFillDays', () => {
  it('fills every day in the window with 0 when there is no activity', () => {
    const result = zeroFillDays([], 7, '2026-07-14');
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ date: '2026-07-08', xp: 0 });
    expect(result[6]).toEqual({ date: '2026-07-14', xp: 0 });
    expect(result.every((d) => d.xp === 0)).toBe(true);
  });

  it('carries real xp values into the right day and zero-fills the gaps', () => {
    const activity = [
      { date: '2026-07-14', xp: 20 },
      { date: '2026-07-12', xp: 15 },
    ];
    const result = zeroFillDays(activity, 7, '2026-07-14');
    expect(result.map((d) => d.xp)).toEqual([0, 0, 0, 0, 15, 0, 20]);
    expect(result.map((d) => d.date)).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
    ]);
  });

  it('ignores activity rows outside the requested window', () => {
    const activity = [{ date: '2026-06-01', xp: 999 }];
    const result = zeroFillDays(activity, 7, '2026-07-14');
    expect(result.every((d) => d.xp === 0)).toBe(true);
  });

  it('is ordered oldest to newest and ends on `today`', () => {
    const result = zeroFillDays([], 30, '2026-01-01');
    expect(result).toHaveLength(30);
    expect(result[0]?.date).toBe('2025-12-03');
    expect(result[29]?.date).toBe('2026-01-01');
  });

  it('last-one-wins when the input has a duplicate date', () => {
    const activity = [
      { date: '2026-07-14', xp: 5 },
      { date: '2026-07-14', xp: 40 },
    ];
    const result = zeroFillDays(activity, 1, '2026-07-14');
    expect(result).toEqual([{ date: '2026-07-14', xp: 40 }]);
  });
});
