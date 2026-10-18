import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Runs before the entire test suite. Applies all migrations to the test DB
// so every run starts with the full schema. Feature 03 will add CSV import
// here so tests also have seeded data.
export async function setup(): Promise<void> {
  const connString = process.env.DATABASE_URL_TEST;
  if (!connString) throw new Error('DATABASE_URL_TEST is not set');

  const client = new pg.Client({ connectionString: connString });
  await client.connect();

  // Ensure migration tracking table
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

  const migrationsDir = path.resolve(import.meta.dirname, '../../db/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      await client.end();
      throw new Error(`Migration ${file} failed: ${err}`);
    }
  }

  await client.end();
}
