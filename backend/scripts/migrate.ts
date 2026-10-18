// Migration runner: applies backend/db/migrations/*.sql files in name order.
// Each unapplied file runs inside its own transaction. Pass --test to target
// DATABASE_URL_TEST instead of DATABASE_URL.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const isTest = process.argv.includes('--test');
const connVar = isTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
const connString = process.env[connVar];

if (!connString) {
  console.error(`${connVar} is not set`);
  process.exit(1);
}

const migrationsDir = path.resolve(import.meta.dirname, '../db/migrations');

async function migrate(): Promise<void> {
  const client = new pg.Client({ connectionString: connString });
  await client.connect();

  // Ensure the tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows: applied } = await client.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name'
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files sorted by name (001_core.sql, 002_delivery.sql, …)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}…`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed on ${file}:`, err);
      await client.end();
      process.exit(1);
    }
  }

  console.log(count > 0 ? `Applied ${count} migration(s).` : 'Already up to date.');
  await client.end();
}

migrate();
