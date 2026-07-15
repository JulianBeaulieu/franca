import type { Theme } from './settings';

/**
 * Builds the inline, render-blocking no-FOUC script injected into
 * `src/app/layout.tsx`'s `<head>`. It runs before first paint and decides
 * whether to add the `dark` class using this precedence: the live
 * `franca-theme` cookie (read from `document.cookie` at run time) if present,
 * else `dbTheme` (the DB-resolved settings theme, templated in below), else
 * `'system'` resolved via `prefers-color-scheme`.
 *
 * `dbTheme` is interpolated directly into this server-rendered string — that
 * is safe ONLY because it is always one of the three `Theme` literals
 * ('light' | 'dark' | 'system'), as guaranteed by
 * `mergeSettings`/`DEFAULT_SETTINGS` in `./settings`. It is never raw or
 * otherwise untrusted user input, so this does not open an injection hole.
 */
export function buildNoFoucScript(dbTheme: Theme): string {
  return `(function(){try{var m=document.cookie.match(/(?:^|; )franca-theme=([^;]*)/);var t=(m?decodeURIComponent(m[1]):null)||'${dbTheme}'||'system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
}
