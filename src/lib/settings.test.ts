import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validatePatch } from './settings';

describe('DEFAULT_SETTINGS', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      autoContinue: true,
      autoContinueSeconds: 3,
      haptics: true,
      sounds: true,
      leaderboardOptIn: false,
    });
  });
});

describe('mergeSettings', () => {
  it('returns defaults for an empty object', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for null, undefined, and non-object values', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('not an object')).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a fully-populated valid object', () => {
    const stored = {
      theme: 'dark',
      autoContinue: false,
      autoContinueSeconds: 7,
      haptics: false,
      sounds: false,
      leaderboardOptIn: true,
    };
    expect(mergeSettings(stored)).toEqual(stored);
  });

  it('merges a partial object, defaulting missing keys', () => {
    expect(mergeSettings({ theme: 'light' })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
    });
    expect(mergeSettings({ leaderboardOptIn: true })).toEqual({
      ...DEFAULT_SETTINGS,
      leaderboardOptIn: true,
    });
  });

  it('falls back to default for wrong-typed values per key', () => {
    expect(mergeSettings({ theme: 'purple' })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ theme: 123 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ autoContinue: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ autoContinue: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ haptics: null })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ sounds: 'true' })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ leaderboardOptIn: 0 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ autoContinueSeconds: 'three' })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ autoContinueSeconds: Number.NaN })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ autoContinueSeconds: Infinity })).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores unknown keys on a stored value', () => {
    expect(mergeSettings({ theme: 'dark', bogus: 'whatever' })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
    });
  });

  it('coerces autoContinueSeconds to an integer and clamps to 1..10', () => {
    expect(mergeSettings({ autoContinueSeconds: 0 }).autoContinueSeconds).toBe(1);
    expect(mergeSettings({ autoContinueSeconds: -5 }).autoContinueSeconds).toBe(1);
    expect(mergeSettings({ autoContinueSeconds: 11 }).autoContinueSeconds).toBe(10);
    expect(mergeSettings({ autoContinueSeconds: 100 }).autoContinueSeconds).toBe(10);
    expect(mergeSettings({ autoContinueSeconds: 5.4 }).autoContinueSeconds).toBe(5);
    expect(mergeSettings({ autoContinueSeconds: 5.6 }).autoContinueSeconds).toBe(6);
    expect(mergeSettings({ autoContinueSeconds: 1 }).autoContinueSeconds).toBe(1);
    expect(mergeSettings({ autoContinueSeconds: 10 }).autoContinueSeconds).toBe(10);
  });
});

describe('validatePatch', () => {
  it('rejects non-object bodies', () => {
    expect(validatePatch(null).ok).toBe(false);
    expect(validatePatch(undefined).ok).toBe(false);
    expect(validatePatch('nope').ok).toBe(false);
    expect(validatePatch(42).ok).toBe(false);
    expect(validatePatch([1, 2]).ok).toBe(false);
  });

  it('accepts an empty object patch', () => {
    expect(validatePatch({})).toEqual({ ok: true, patch: {} });
  });

  it('rejects unknown keys', () => {
    const result = validatePatch({ theme: 'dark', notARealKey: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/notARealKey/);
  });

  it('accepts a valid partial patch', () => {
    expect(validatePatch({ theme: 'dark' })).toEqual({ ok: true, patch: { theme: 'dark' } });
    expect(validatePatch({ haptics: false, sounds: true })).toEqual({
      ok: true,
      patch: { haptics: false, sounds: true },
    });
  });

  it('rejects an invalid theme value', () => {
    expect(validatePatch({ theme: 'blue' }).ok).toBe(false);
    expect(validatePatch({ theme: 1 }).ok).toBe(false);
  });

  it('type-checks each boolean key', () => {
    expect(validatePatch({ autoContinue: 'true' }).ok).toBe(false);
    expect(validatePatch({ haptics: 1 }).ok).toBe(false);
    expect(validatePatch({ sounds: null }).ok).toBe(false);
    expect(validatePatch({ leaderboardOptIn: 'yes' }).ok).toBe(false);
  });

  it('rejects a non-numeric autoContinueSeconds', () => {
    expect(validatePatch({ autoContinueSeconds: 'five' }).ok).toBe(false);
    expect(validatePatch({ autoContinueSeconds: Number.NaN }).ok).toBe(false);
    expect(validatePatch({ autoContinueSeconds: null }).ok).toBe(false);
  });

  it('clamps autoContinueSeconds to 1..10 in a valid patch', () => {
    expect(validatePatch({ autoContinueSeconds: 0 })).toEqual({
      ok: true,
      patch: { autoContinueSeconds: 1 },
    });
    expect(validatePatch({ autoContinueSeconds: 25 })).toEqual({
      ok: true,
      patch: { autoContinueSeconds: 10 },
    });
    expect(validatePatch({ autoContinueSeconds: 4.6 })).toEqual({
      ok: true,
      patch: { autoContinueSeconds: 5 },
    });
  });

  it('accepts a fully-populated patch matching every key', () => {
    const body = {
      theme: 'light',
      autoContinue: false,
      autoContinueSeconds: 8,
      haptics: false,
      sounds: false,
      leaderboardOptIn: true,
    };
    expect(validatePatch(body)).toEqual({ ok: true, patch: body });
  });
});
