import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The domain layer is pure, so it needs no DOM and no setup files. Keeping
    // the environment as 'node' makes the suite fast enough to run on save.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**/*.ts'],
      exclude: ['lib/domain/**/*.test.ts', 'lib/domain/types.ts'],
      // The league's rules are the part of this codebase that must not drift.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
