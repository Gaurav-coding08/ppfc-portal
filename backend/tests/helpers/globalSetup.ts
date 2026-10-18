import pg from 'pg';

// Placeholder for feature 01: just proves the test DB is reachable before
// the suite runs. Features 02/03 replace this with migrate + CSV import so
// every test run starts from a known, seeded state.
export async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
}
