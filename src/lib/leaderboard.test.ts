import { describe, expect, it } from 'vitest';
import {
  resolveDisplayName,
  sortLeaderboard,
  weekStart,
  type LeaderboardEntry,
} from './leaderboard';

describe('weekStart', () => {
  it('returns the same date when given a Monday', () => {
    // 2026-07-13 is a Monday.
    expect(weekStart('2026-07-13')).toBe('2026-07-13');
  });

  it('returns the preceding Monday when given a Sunday', () => {
    // 2026-07-12 is a Sunday; its ISO week started 2026-07-06.
    expect(weekStart('2026-07-12')).toBe('2026-07-06');
  });

  it('returns the Monday of the current week for a mid-week date', () => {
    // 2026-07-14 is a Tuesday in the week that started 2026-07-13.
    expect(weekStart('2026-07-14')).toBe('2026-07-13');
  });

  it('returns the preceding Monday for a Saturday', () => {
    // 2026-07-18 is a Saturday in the week that started 2026-07-13.
    expect(weekStart('2026-07-18')).toBe('2026-07-13');
  });
});

describe('resolveDisplayName', () => {
  it('prefers a non-empty display name', () => {
    expect(resolveDisplayName('Jane', 'jane@example.com')).toBe('Jane');
  });

  it('falls back to the email local-part when display name is null', () => {
    expect(resolveDisplayName(null, 'foo@example.com')).toBe('foo');
  });

  it('falls back to the email local-part when display name is blank', () => {
    expect(resolveDisplayName('   ', 'foo@example.com')).toBe('foo');
  });

  it('falls back to "Learner" when neither display name nor email is available', () => {
    expect(resolveDisplayName(null, null)).toBe('Learner');
  });
});

describe('sortLeaderboard', () => {
  function entry(partial: Partial<LeaderboardEntry> & { id: number }): LeaderboardEntry {
    return {
      id: partial.id,
      displayName: partial.displayName ?? `L${String(partial.id)}`,
      picture: partial.picture ?? null,
      streak: partial.streak ?? 0,
      xpTotal: partial.xpTotal ?? 0,
      weeklyXp: partial.weeklyXp ?? 0,
      isMe: partial.isMe ?? false,
    };
  }

  it('sorts by the requested metric, descending', () => {
    const entries = [
      entry({ id: 1, weeklyXp: 10 }),
      entry({ id: 2, weeklyXp: 30 }),
      entry({ id: 3, weeklyXp: 20 }),
    ];
    expect(sortLeaderboard(entries, 'weeklyXp').map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it('breaks ties by display name ascending', () => {
    const entries = [
      entry({ id: 1, displayName: 'Zed', xpTotal: 100 }),
      entry({ id: 2, displayName: 'Amy', xpTotal: 100 }),
    ];
    expect(sortLeaderboard(entries, 'xpTotal').map((e) => e.id)).toEqual([2, 1]);
  });

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 1, weeklyXp: 1 }), entry({ id: 2, weeklyXp: 2 })];
    const copy = [...entries];
    sortLeaderboard(entries, 'weeklyXp');
    expect(entries).toEqual(copy);
  });
});
