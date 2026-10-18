import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { withTx } from '../../src/db/tx.js';

describe('withTx', () => {
  it('rolls back everything, including DDL, when the callback throws', async () => {
    const tableName = `withtx_rollback_test_${Date.now()}`;

    await expect(
      withTx(async (client) => {
        await client.query(`CREATE TABLE ${tableName} (id int)`);
        await client.query(`INSERT INTO ${tableName} (id) VALUES (1)`);
        throw new Error('fail on purpose');
      }),
    ).rejects.toThrow('fail on purpose');

    // CREATE TABLE is transactional in Postgres, so the rollback undid the
    // table creation along with the insert — if withTx worked, the table
    // never existed outside the failed transaction.
    const { rows } = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = $1) AS exists',
      [tableName],
    );
    expect(rows[0]?.exists).toBe(false);
  });
});
