// Loads data/csv/*.csv into Postgres. Same dataset drives the dev DB, the
// test DB and Power BI, so there's exactly one import path (importAll, in
// scripts/generate/importAll.ts — also used by the test harness).
import pg from 'pg';
import { importAll } from './generate/importAll.js';

const isTest = process.argv.includes('--test');
const connVar = isTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
const connString = process.env[connVar];

if (!connString) {
  console.error(`${connVar} is not set`);
  process.exit(1);
}

async function run(): Promise<void> {
  const client = new pg.Client({ connectionString: connString });
  await client.connect();
  try {
    const counts = await importAll(client);
    console.log(`Imported into ${isTest ? 'ppfc_test' : 'ppfc'}:`);
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table}: ${count}`);
    }
  } catch (err) {
    console.error('Import failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
