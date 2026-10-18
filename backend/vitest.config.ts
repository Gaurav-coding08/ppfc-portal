import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The test DB is shared mutable state (reset once per run), so tests
    // cannot run as separate worker processes in parallel.
    fileParallelism: false,
    globalSetup: ['tests/helpers/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
