import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// eslint-config-next only ships a legacy .eslintrc-style config, which needs
// @rushstack/eslint-patch and breaks on current ESLint. The Next rules we care
// about live in @next/eslint-plugin-next, so we wire that up directly against
// flat config instead.
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'lib/types/database.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Type-aware linting, needed by no-floating-promises below.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

  prettier,

  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // A silently swallowed promise in a server action means a score that
      // looks saved and is not.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // Build-tooling configs live outside tsconfig's include, so type-aware rules
  // have no program to consult for them. This must stay last so it wins.
  {
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
