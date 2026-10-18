import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The test DB is shared mutable state (reset once per run), so tests
    // cannot run as separate worker processes in parallel.
    fileParallelism: false,
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // Registers the int8 (bigint id) type parser in src/db/pool.ts before
    // any test file runs — including ones that only ever open their own
    // raw pg.Client and never import pool.ts themselves. globalSetup runs
    // in a separate process/context from the tests, so it can't do this;
    // setupFiles run in the same worker the tests actually execute in.
    setupFiles: ['src/db/pool.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
