import type { Config } from 'tailwindcss';

export default {
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './components/**/*.{ts,tsx}',
    './core/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
} satisfies Config;
