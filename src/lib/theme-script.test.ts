import { describe, expect, it } from 'vitest';
import { buildNoFoucScript } from './theme-script';

// The script is a server-rendered string executed in the browser before
// first paint. We can't easily execute it under vitest's default (node)
// environment, so these tests assert on the generated source: the injected
// `dbTheme` fallback literal is present, exactly one JS statement is emitted
// (no stray characters from unsanitized interpolation), and it stays a
// self-invoking function expression as documented.
describe('buildNoFoucScript', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'templates the DB theme (%s) in as the cookie-absent fallback',
    (dbTheme) => {
      const script = buildNoFoucScript(dbTheme);
      expect(script).toContain(`||'${dbTheme}'||'system'`);
    },
  );

  it('reads the franca-theme cookie before falling back to the DB theme', () => {
    const script = buildNoFoucScript('dark');
    const cookieReadIndex = script.indexOf('document.cookie.match');
    const fallbackIndex = script.indexOf(`||'dark'||'system'`);
    expect(cookieReadIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(cookieReadIndex);
  });

  it('is a single self-invoking, try/catch-wrapped statement', () => {
    const script = buildNoFoucScript('system');
    expect(script.startsWith('(function(){try{')).toBe(true);
    expect(script.endsWith('})();')).toBe(true);
  });
});
