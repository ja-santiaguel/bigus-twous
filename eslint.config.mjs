import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint for correctness, not style: Prettier owns formatting, and
 * `eslint-config-prettier` switches off every rule that would argue with it.
 */
export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // An argument or binding named with a leading underscore is unused on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // The client: a browser, and React.
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Everything else runs in Node, as do the tool configs.
  {
    files: ['packages/{engine,ai,session,protocol,server}/**/*.ts', '**/*.config.{ts,mjs,js}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
