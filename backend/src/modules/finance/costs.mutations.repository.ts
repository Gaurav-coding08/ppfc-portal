import type { Client, PoolClient } from 'pg';
import type { RawCostRow } from './costs.repository.js';

export async function insertCost(
  input: {
    projectId: number;
    categoryId: number;
    txnDate: string;
    amount: number;
    description: string;
    vendor: string | null;
    createdBy: number;
  },
  client: PoolClient | Client,
): Promise<RawCostRow> {
  const { rows } = await client.query<RawCostRow>(
    `INSERT INTO cost_transactions (project_id, category_id, txn_date, amount, description, vendor, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.projectId, input.categoryId, input.txnDate, input.amount, input.description, input.vendor, input.createdBy],
  );
  return rows[0]!;
}

// Post a draft cost: sets status to 'posted', posted_by, posted_at.
// Only updates if current status is 'draft' and version matches (optimistic lock).
export async function postCost(
  id: number,
  version: number,
  postedBy: number,
  client: PoolClient | Client,
): Promise<RawCostRow | null> {
  const { rows } = await client.query<RawCostRow>(
    `UPDATE cost_transactions
     SET status = 'posted', posted_by = $1, posted_at = now(), version = version + 1, updated_at = now()
     WHERE id = $2 AND version = $3 AND status = 'draft'
     RETURNING *`,
    [postedBy, id, version],
  );
  return rows[0] ?? null;
}

// Creates a posted reversal entry that offsets the original cost.
export async function insertReversal(
  input: {
    projectId: number;
    categoryId: number;
    txnDate: string;
    amount: number;
    description: string;
    reversesId: number;
    createdBy: number;
    postedBy: number;
  },
  client: PoolClient | Client,
): Promise<RawCostRow> {
  const { rows } = await client.query<RawCostRow>(
    `INSERT INTO cost_transactions
       (project_id, category_id, txn_date, amount, description, status, entry_type, reverses_id, created_by, posted_by, posted_at)
     VALUES ($1, $2, $3, $4, $5, 'posted', 'reversal', $6, $7, $8, now())
     RETURNING *`,
    [
      input.projectId,
      input.categoryId,
      input.txnDate,
      input.amount,
      input.description,
      input.reversesId,
      input.createdBy,
      input.postedBy,
    ],
  );
  return rows[0]!;
}
