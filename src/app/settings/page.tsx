'use client';
import Link from 'next/link';
import { useSettings } from '@/components/SettingsProvider';
import { Toggle } from '@/components/Toggle';
import type { Theme } from '@/lib/settings';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsPage(): React.JSX.Element {
  const { settings, update } = useSettings();

  function chooseTheme(value: Theme): void {
    void update({ theme: value });
  }

  function setAutoContinue(checked: boolean): void {
    void update({ autoContinue: checked });
  }

  function setAutoContinueSeconds(seconds: number): void {
    void update({ autoContinueSeconds: seconds });
  }

  function setHaptics(checked: boolean): void {
    void update({ haptics: checked });
  }

  function setSounds(checked: boolean): void {
    void update({ sounds: checked });
  }

  function setLeaderboardOptIn(checked: boolean): void {
    void update({ leaderboardOptIn: checked });
  }

  return (
    <main className="min-h-screen-safe mx-auto max-w-2xl space-y-6 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-2xl font-black text-eel">Settings</h1>
        <Link href="/" className="font-extrabold text-blue">
          ← Back to path
        </Link>
      </div>

      <section className="space-y-3 rounded-2xl border-2 border-swan bg-card p-4">
        <h2 className="text-lg font-black text-eel">Appearance</h2>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                chooseTheme(opt.value);
              }}
              aria-pressed={settings.theme === opt.value}
              className={`flex-1 touch-manipulation rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition-colors ${
                settings.theme === opt.value
                  ? 'border-green bg-green-light text-eel'
                  : 'border-swan text-hare'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border-2 border-swan bg-card p-4">
        <h2 className="text-lg font-black text-eel">Lessons</h2>

        <div className="flex items-center justify-between gap-4">
          <span className="font-extrabold text-eel">Auto-continue</span>
          <Toggle label="Auto-continue" checked={settings.autoContinue} onChange={setAutoContinue} />
        </div>
        <p className="text-sm font-bold text-hare">
          Automatically advances to the next question after a correct answer. Wrong and
          almost-right answers always wait so you can read the correction.
        </p>

        <div className={settings.autoContinue ? 'space-y-2' : 'space-y-2 opacity-50'}>
          <div className="flex items-center justify-between">
            <label htmlFor="auto-continue-seconds" className="font-extrabold text-eel">
              Delay
            </label>
            <span className="font-extrabold text-hare">{settings.autoContinueSeconds}s</span>
          </div>
          <input
            id="auto-continue-seconds"
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.autoContinueSeconds}
            disabled={!settings.autoContinue}
            onChange={(e) => {
              setAutoContinueSeconds(Number(e.target.value));
            }}
            className="w-full accent-green disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-extrabold text-eel">Haptics</span>
          <Toggle label="Haptics" checked={settings.haptics} onChange={setHaptics} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-extrabold text-eel">Sounds</span>
          <Toggle label="Sounds" checked={settings.sounds} onChange={setSounds} />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-swan bg-card p-4">
        <h2 className="text-lg font-black text-eel">Privacy</h2>
        <div className="flex items-center justify-between gap-4">
          <span className="font-extrabold text-eel">Leaderboard</span>
          <Toggle
            label="Leaderboard opt-in"
            checked={settings.leaderboardOptIn}
            onChange={setLeaderboardOptIn}
          />
        </div>
        <p className="text-sm font-bold text-hare">
          Your name, picture, XP and streak become visible to other learners on this server.
        </p>
      </section>
    </main>
  );
}
