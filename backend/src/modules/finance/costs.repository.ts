import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { scopedProjectIdsSql } from '../../lib/access.js';
import { toMoney } from '../../lib/money.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import type { CrossProjectCostsQuery, ProjectCostsQuery } from './costs.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface CostRow {
  id: number;
  projectId: number;
  categoryId: number;
  categoryName: string;
  txnDate: string;
  amount: number | null;
  signedAmount: number | null;
  description: string;
  vendor: string | null;
  status: string;
  entryType: string;
  reversesId: number | null;
  createdBy: number;
  createdByName: string;
  postedBy: number | null;
  postedByName: string | null;
  postedAt: string | null;
  version: number;
  createdAt: string;
}

interface CostJoinRow {
  id: number;
  project_id: number;
  category_id: number;
  category_name: string;
  txn_date: string;
  amount: string;
  signed_amount: string;
  description: string;
  vendor: string | null;
  status: string;
  entry_type: string;
  reverses_id: number | null;
  created_by: number;
  created_by_name: string;
  posted_by: number | null;
  posted_by_name: string | null;
  posted_at: string | null;
  version: number;
  created_at: string;
}

function toCostRow(row: CostJoinRow): CostRow {
  return {
    id: row.id,
    projectId: row.project_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    txnDate: row.txn_date,
    amount: toMoney(row.amount),
    signedAmount: toMoney(row.signed_amount),
    description: row.description,
    vendor: row.vendor,
    status: row.status,
    entryType: row.entry_type,
    reversesId: row.reverses_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    postedBy: row.posted_by,
    postedByName: row.posted_by_name,
    postedAt: row.posted_at,
    version: row.version,
    createdAt: row.created_at,
  };
}

const COST_COLUMNS = `
  ct.id, ct.project_id, ct.category_id, cc.name AS category_name,
  ct.txn_date, ct.amount,
  CASE WHEN ct.entry_type = 'reversal' THEN -ct.amount ELSE ct.amount END AS signed_amount,
  ct.description, ct.vendor, ct.status, ct.entry_type, ct.reverses_id,
  ct.created_by, cu.full_name AS created_by_name,
  ct.posted_by, pu.full_name AS posted_by_name,
  ct.posted_at, ct.version, ct.created_at
`;

const COST_FROM = `
  FROM cost_transactions ct
  JOIN cost_categories cc ON cc.id = ct.category_id
  JOIN users cu ON cu.id = ct.created_by
  LEFT JOIN users pu ON pu.id = ct.posted_by
`;

const SORT_COLUMNS: Record<ProjectCostsQuery['sort'], string> = {
  txnDate: 'ct.txn_date',
  amount: 'ct.amount',
  status: 'ct.status',
};

function buildCommonConditions(
  filters: {
    status?: readonly string[];
    categoryId?: number;
    from?: string;
    to?: string;
    entryType?: string;
    q?: string;
  },
  params: unknown[],
): string[] {
  const conditions: string[] = [];

  if (filters.status && filters.status.length > 0) {
    params.push(filters.status);
    conditions.push(`ct.status = ANY($${params.length}::text[])`);
  }
  if (filters.categoryId !== undefined) {
    params.push(filters.categoryId);
    conditions.push(`ct.category_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`ct.txn_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`ct.txn_date <= $${params.length}`);
  }
  if (filters.entryType) {
    params.push(filters.entryType);
    conditions.push(`ct.entry_type = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(ct.description ILIKE $${params.length} OR ct.vendor ILIKE $${params.length})`);
  }

  return conditions;
}

export async function listProjectCosts(
  projectId: number,
  filters: ProjectCostsQuery,
  client: Queryable = pool,
): Promise<{ rows: CostRow[]; total: number }> {
  const params: unknown[] = [projectId];
  const conditions = [`ct.project_id = $1`, ...buildCommonConditions(filters, params)];

  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<CostJoinRow & { total_count: string }>(
    `SELECT ${COST_COLUMNS}, count(*) OVER() AS total_count
     ${COST_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderColumn} ${orderDir}, ct.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows: rows.map(toCostRow), total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0 };
}

export async function listCostsScoped(
  caller: AuthUser,
  filters: CrossProjectCostsQuery,
  client: Queryable = pool,
): Promise<{ rows: CostRow[]; total: number }> {
  const scope = scopedProjectIdsSql(caller);
  const params: unknown[] = [...scope.params];
  const conditions: string[] = ['TRUE', ...buildCommonConditions(filters, params)];

  let from = COST_FROM;
  if (filters.departmentId !== undefined) {
    from += ` JOIN projects p ON p.id = ct.project_id`;
    params.push(filters.departmentId);
    conditions.push(`p.department_id = $${params.length}`);
  }
  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    conditions.push(`ct.project_id = $${params.length}`);
  }

  // postedOnly=true&upToAsOf=true gives exactly the rows behind "actual spend"
  if (filters.postedOnly) {
    conditions.push(`ct.status = 'posted'`);
  }
  if (filters.upToAsOf && filters.asOf) {
    params.push(filters.asOf);
    conditions.push(`ct.txn_date <= $${params.length}`);
  }

  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<CostJoinRow & { total_count: string }>(
    `SELECT ${COST_COLUMNS}, count(*) OVER() AS total_count
     ${from}
     WHERE ${conditions.join(' AND ')} ${scope.sql}
     ORDER BY ${orderColumn} ${orderDir}, ct.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows: rows.map(toCostRow), total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0 };
}

export async function findCostById(id: number, client: Queryable = pool): Promise<CostRow | null> {
  const { rows } = await client.query<CostJoinRow>(
    `SELECT ${COST_COLUMNS} ${COST_FROM} WHERE ct.id = $1`,
    [id],
  );
  return rows[0] ? toCostRow(rows[0]) : null;
}

export interface RawCostRow {
  id: number;
  project_id: number;
  category_id: number;
  txn_date: string;
  amount: string;
  description: string;
  vendor: string | null;
  status: string;
  entry_type: string;
  reverses_id: number | null;
  created_by: number;
  posted_by: number | null;
  posted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function findRawCostById(id: number, client: Queryable = pool): Promise<RawCostRow | null> {
  const { rows } = await client.query<RawCostRow>(
    `SELECT * FROM cost_transactions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findRawCostForUpdate(
  id: number,
  client: PoolClient | Client,
): Promise<RawCostRow | null> {
  const { rows } = await client.query<RawCostRow>(
    `SELECT * FROM cost_transactions WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

// Checks whether a posted cost has already been reversed.
export async function isAlreadyReversed(
  costId: number,
  client: Queryable = pool,
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM cost_transactions WHERE reverses_id = $1) AS exists`,
    [costId],
  );
  return rows[0]!.exists;
}
