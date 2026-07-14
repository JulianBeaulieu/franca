import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
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
        green: { DEFAULT: '#58CC02', dark: '#58A700', light: '#D7FFB8' },
        blue: { DEFAULT: '#1CB0F6', dark: '#1899D6', light: '#DDF4FF' },
        red: { DEFAULT: '#FF4B4B', dark: '#EA2B2B', light: '#FFDFE0' },
        yellow: { DEFAULT: '#FFC800', dark: '#E6B400' },
        orange: { DEFAULT: '#FF9600' },
        purple: { DEFAULT: '#CE82FF' },
        eel: '#4B4B4B',
        hare: '#777777',
        swan: '#E5E5E5',
        subtle: '#F7F7F7',
      },
    },
  },
  plugins: [],
};
export default config;
