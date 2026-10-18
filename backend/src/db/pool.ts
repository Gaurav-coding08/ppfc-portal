import { Pool } from 'pg';
import { env } from '../config/env.js';

// NUMERIC columns (money) come back from `pg` as strings by default, because
// converting straight to JS `number` can silently lose precision. We rely on
// that default rather than registering a custom type parser, so money is
// never touched by floating point until it's deliberately rounded for the
// API response — see lib/money.ts in later features.

export const pool = new Pool({ connectionString: env.databaseUrl });

export async function closePool(): Promise<void> {
  await pool.end();
}
