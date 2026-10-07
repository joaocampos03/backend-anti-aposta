import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { INTEGRATION_ENVIRONMENT } from './tests/integration/environment.js';

const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
  '@src': fileURLToPath(new URL('./src', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.spec.ts'],
          env: INTEGRATION_ENVIRONMENT,
          globalSetup: ['tests/integration/prepare-database.ts'],
          setupFiles: ['tests/integration/truncate-tables.ts'],
          // One database for the whole suite, so the files do not race each other.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
