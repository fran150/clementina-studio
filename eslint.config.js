import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const unusedVars = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'none',
  ignoreRestSiblings: true,
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/'] },
  js.configs.recommended,
  {
    // The editors are classic scripts loaded in order by editor.html. They
    // share its top-level state and each other's window exports, so undefined
    // names can't be checked until they become modules.
    files: ['apps/desktop/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: { 'no-undef': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.cts'],
  })),
  {
    rules: {
      // Best-effort cleanup (stopping a finished audio source, compiling a
      // half-written song) deliberately ignores errors.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Warnings, not errors, until the unused names already in the code are
      // cleaned up; that is a behavior review, not formatting.
      'no-unused-vars': ['warn', unusedVars],
      'prefer-const': 'warn',
    },
  },
  {
    files: ['**/*.ts', '**/*.cts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', unusedVars],
    },
  },
);
