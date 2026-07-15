import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      colors: {
        // Brand accents — identical in light and dark.
        green: { DEFAULT: '#58CC02', dark: '#58A700', light: 'var(--color-green-light)' },
        blue: { DEFAULT: '#1CB0F6', dark: '#1899D6', light: '#DDF4FF' },
        red: { DEFAULT: '#FF4B4B', dark: '#EA2B2B', light: 'var(--color-red-light)' },
        yellow: { DEFAULT: '#FFC800', dark: '#E6B400' },
        orange: { DEFAULT: '#FF9600' },
        purple: { DEFAULT: '#CE82FF' },
        // Semantic tokens (theme-aware via CSS variables in globals.css).
        eel: 'var(--color-eel)', // primary/body text
        hare: 'var(--color-hare)', // muted/secondary text
        swan: 'var(--color-swan)', // borders + neutral fills
        subtle: 'var(--color-subtle)', // subtle page background
        surface: 'var(--color-surface)', // page/base surface
        card: 'var(--color-card)', // raised cards, menus, chips
        hover: 'var(--color-hover)', // hover fill on cards/menus
        // Aliases matching the brief's semantic names.
        body: 'var(--color-eel)',
        muted: 'var(--color-hare)',
        line: 'var(--color-swan)',
      },
    },
  },
  plugins: [],
};
export default config;
