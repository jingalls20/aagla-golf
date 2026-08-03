import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default [
  ...next,
  prettier,
  {
    rules: {
      // A silently swallowed promise in a server action means a score that
      // looks saved and is not.
      'no-floating-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'lib/types/database.ts'] },
];
