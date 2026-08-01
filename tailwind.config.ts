import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Carried over from the Apps Script app so the new one still looks
        // like the league's app rather than a generic dashboard.
        fairway: {
          50: '#f0f7f2',
          500: '#2f7a4d',
          600: '#256240',
          900: '#12301f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
