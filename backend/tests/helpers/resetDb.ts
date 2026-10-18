import pg from 'pg';
import { importAll } from '../../scripts/generate/importAll.js';

// Re-imports the seeded CSVs into the test DB. Call from `beforeAll` in any
// test file that mutates seed data, so it doesn't leak into other files
// (tests run with fileParallelism: false, but still share one DB).
export async function resetDb(): Promise<void> {
  const connString = process.env.DATABASE_URL_TEST;
  if (!connString) throw new Error('DATABASE_URL_TEST is not set');

  const client = new pg.Client({ connectionString: connString });
  await client.connect();
  try {
    await importAll(client);
  } finally {
    await client.end();
  }
}
