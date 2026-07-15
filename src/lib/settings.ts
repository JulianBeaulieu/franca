/** Per-learner settings, stored as a single JSONB column on `learner`. */
export type Theme = 'light' | 'dark' | 'system';

export interface LearnerSettings {
  theme: Theme;
  autoContinue: boolean;
  autoContinueSeconds: number;
  haptics: boolean;
  sounds: boolean;
  leaderboardOptIn: boolean;
}

export const DEFAULT_SETTINGS: LearnerSettings = {
  theme: 'system',
  autoContinue: true,
  autoContinueSeconds: 3,
  haptics: true,
  sounds: true,
  leaderboardOptIn: false,
};

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Integer, clamped 1..10 (the range the settings page's slider allows). */
function clampSeconds(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

/**
 * Merges a stored (possibly partial, possibly malformed — it's untrusted
 * JSONB) value over DEFAULT_SETTINGS. Each key is checked independently so one
 * bad field can't invalidate the rest of an otherwise-valid stored object.
 */
export function mergeSettings(stored: unknown): LearnerSettings {
  const rec: Record<string, unknown> =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  return {
    theme: isTheme(rec.theme) ? rec.theme : DEFAULT_SETTINGS.theme,
    autoContinue: typeof rec.autoContinue === 'boolean' ? rec.autoContinue : DEFAULT_SETTINGS.autoContinue,
    autoContinueSeconds:
      typeof rec.autoContinueSeconds === 'number' && Number.isFinite(rec.autoContinueSeconds)
        ? clampSeconds(rec.autoContinueSeconds)
        : DEFAULT_SETTINGS.autoContinueSeconds,
    haptics: typeof rec.haptics === 'boolean' ? rec.haptics : DEFAULT_SETTINGS.haptics,
    sounds: typeof rec.sounds === 'boolean' ? rec.sounds : DEFAULT_SETTINGS.sounds,
    leaderboardOptIn:
      typeof rec.leaderboardOptIn === 'boolean' ? rec.leaderboardOptIn : DEFAULT_SETTINGS.leaderboardOptIn,
  };
}

export type ValidatePatchResult =
  | { ok: true; patch: Partial<LearnerSettings> }
  | { ok: false; error: string };

/**
 * Validates a PATCH request body: rejects non-objects and unknown keys,
 * type-checks each provided key, and clamps `autoContinueSeconds`. Unlike
 * `mergeSettings`, a single bad key fails the whole request — this is a
 * client mistake, not tolerant merging of legacy stored data.
 */
export function validatePatch(body: unknown): ValidatePatchResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const rec = body as Record<string, unknown>;
  const patch: Partial<LearnerSettings> = {};

  for (const key of Object.keys(rec)) {
    const value = rec[key];
    if (key === 'theme') {
      if (!isTheme(value)) return { ok: false, error: 'theme must be one of light, dark, system' };
      patch.theme = value;
    } else if (key === 'autoContinue') {
      if (typeof value !== 'boolean') return { ok: false, error: 'autoContinue must be a boolean' };
      patch.autoContinue = value;
    } else if (key === 'autoContinueSeconds') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: 'autoContinueSeconds must be a number' };
      }
      patch.autoContinueSeconds = clampSeconds(value);
    } else if (key === 'haptics') {
      if (typeof value !== 'boolean') return { ok: false, error: 'haptics must be a boolean' };
      patch.haptics = value;
    } else if (key === 'sounds') {
      if (typeof value !== 'boolean') return { ok: false, error: 'sounds must be a boolean' };
      patch.sounds = value;
    } else if (key === 'leaderboardOptIn') {
      if (typeof value !== 'boolean') return { ok: false, error: 'leaderboardOptIn must be a boolean' };
      patch.leaderboardOptIn = value;
    } else {
      return { ok: false, error: `unknown key: ${key}` };
    }
  }

  return { ok: true, patch };
}
