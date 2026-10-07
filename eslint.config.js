import js from '@eslint/js';
import typescriptEslint from 'typescript-eslint';

/**
 * The rules here are the mechanically checkable half of `CLAUDE.md`: the layer
 * rule, the module boundaries, and the handful of language choices that are not
 * negotiable. The rest is a review concern.
 */
const DOMAIN_FORBIDDEN_IMPORTS = [
  { group: ['express', 'cors', 'helmet', 'cookie-parser'], message: 'The domain layer knows nothing about HTTP.' },
  { group: ['@prisma/client', '**/infrastructure/**'], message: 'The domain layer knows nothing about a database.' },
  { group: ['zod'], message: 'Validation happens at the boundary, not in the domain.' },
  { group: ['pino', 'pino-http'], message: 'The domain layer does not log.' },
  { group: ['node:*'], message: 'If it cannot run in a bare Node REPL with no imports, it is not domain code.' },
  { group: ['**/application/**'], message: 'Dependencies point inward: application depends on domain, never the reverse.' },
];

const APPLICATION_FORBIDDEN_IMPORTS = [
  { group: ['express', 'cors', 'helmet', 'cookie-parser'], message: 'A use case never sees a Request, a Response, a header or a status code.' },
  { group: ['@prisma/client', '**/infrastructure/**'], message: 'A use case depends on a port, never on an adapter.' },
];

const CROSS_MODULE_DEEP_IMPORT = [
  {
    group: ['@modules/*/*', '!@modules/*/index.js'],
    message: 'Import another bounded context only through its index.ts.',
  },
];

export default typescriptEslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  ...typescriptEslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'max-depth': ['error', 2],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message: 'Inject the Clock port instead of reading the wall clock.',
        },
      ],
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: DOMAIN_FORBIDDEN_IMPORTS }],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: APPLICATION_FORBIDDEN_IMPORTS }],
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CROSS_MODULE_DEEP_IMPORT }],
    },
  },
  {
    // The composition root is the one file allowed to reach into a module to
    // wire a port to an adapter, and the only one that knows every context.
    files: ['src/container.ts', 'src/app.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests arrange with the fakes each module ships, and the clock they fix is
    // the whole point of the fixture.
    files: ['**/*.spec.ts', 'src/**/testing/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['prisma/seed.ts', 'src/server.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The adapter whose whole job is to read the wall clock.
    files: ['src/shared/infrastructure/system-clock.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // A fake that implements an async port without awaiting anything is not a
    // mistake: the port is async because the real adapter talks to a database.
    files: ['src/**/in-memory/**/*.ts', 'src/**/testing/**/*.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
);
