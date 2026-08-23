import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * The fourth gate step. scripts/checks.sh has named `lint` since slice 1 and
 * package.json never defined it, so the step stood down silently on every run
 * and four verifications reported a three-check pass as four.
 *
 * Scope is wider than tsconfig's on purpose. tsconfig excludes scripts/, so the
 * .mjs files the harness runs by hand had no static reader at all. They have
 * one now.
 */
const config = [
  {
    ignores: [
      '.next/**',
      '.forge/**',
      'node_modules/**',
      'test-results/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The one thing typecheck cannot see: a value bound and never read is
      // either a rename left half-done or a computed field the screen forgot
      // to draw. readAdherenceScreen's unread week[] was exactly that, and it
      // reached the verifier as C7.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Every import in this tree is single-quoted, 224 of 224, with nothing
      // enforcing it. Now something does. Backticks stay allowed: this tree
      // uses them deliberately for the long HTML the offline document and the
      // service worker are built from, and rewriting those buys churn on
      // proven code and no defect.
      quotes: [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // The harness scripts are plain Node modules. They are not React, they are
    // not typed, and they print to the console because printing is their job.
    files: ['scripts/**/*.mjs', 'tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Playwright's fixture callback is named `use`, and the hooks plugin reads
    // any bare `use(...)` as React's. There is no React in the suite.
    files: ['tests/e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];

export default config;
