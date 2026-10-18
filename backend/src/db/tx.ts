import type { PoolClient } from 'pg';
import { pool } from './pool.js';

// Runs `fn` inside a BEGIN/COMMIT. Any throw rolls back; the client is
// always released back to the pool either way. Used whenever a mutation
// must be atomic with its audit/history row (see CLAUDE.md "Transactions &
// audit").
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
