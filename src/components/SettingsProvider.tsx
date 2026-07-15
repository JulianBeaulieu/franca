'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { LearnerSettings } from '@/lib/settings';

const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SettingsContextValue {
  settings: LearnerSettings;
  update: (partial: Partial<LearnerSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings: LearnerSettings;
  children: ReactNode;
}): React.JSX.Element {
  const [settings, setSettings] = useState(initialSettings);

  // Runs on mount (so the initial theme takes effect client-side) and on
  // every subsequent theme change. Dark **styles** land in Task 2 — this only
  // wires the `dark` class + persisted cookie so later tasks can rely on both.
  useEffect(() => {
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.cookie = `franca-theme=${settings.theme}; path=/; max-age=${String(THEME_COOKIE_MAX_AGE)}; SameSite=Lax`;
  }, [settings.theme]);

  // While on `system`, follow live OS light/dark changes without a reload.
  useEffect(() => {
    if (settings.theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      document.documentElement.classList.toggle('dark', mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [settings.theme]);

  const update = useCallback((partial: Partial<LearnerSettings>): Promise<void> => {
    let previous: LearnerSettings | undefined;
    setSettings((prev) => {
      previous = prev;
      return { ...prev, ...partial };
    });

    return fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(partial),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to update settings: ${String(res.status)}`);
        return res.json() as Promise<LearnerSettings>;
      })
      .then((merged) => {
        setSettings(merged);
      })
      .catch(() => {
        if (previous) setSettings(previous);
      });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
