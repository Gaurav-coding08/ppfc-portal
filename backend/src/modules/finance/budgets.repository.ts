import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';

type Queryable = Pool | PoolClient | Client;

export interface BudgetSummary {
  initialAmount: number | null;
  approvedRevisionsTotal: number | null;
  currentBudget: number | null;
  currency: string;
  revisions: RevisionRow[];
}

export interface RevisionRow {
  id: number;
  projectId: number;
  amount: number | null;
  rationale: string;
  status: string;
  requestedBy: number;
  requestedByName: string;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  effectiveDate: string;
  createdAt: string;
}

interface RevisionJoinRow {
  id: number;
  project_id: number;
  amount: string;
  rationale: string;
  status: string;
  requested_by: number;
  requested_by_name: string;
  decided_by: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  effective_date: string;
  created_at: string;
}

function toRevisionRow(row: RevisionJoinRow): RevisionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    amount: toMoney(row.amount),
    rationale: row.rationale,
    status: row.status,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
  };
}

export async function findBudgetSummary(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<BudgetSummary> {
  const { rows: finRows } = await client.query<{
    initial_budget: string;
    approved_revisions: string;
    current_budget: string;
  }>(
    `SELECT initial_budget, approved_revisions, current_budget
     FROM fn_project_financials($1) WHERE project_id = $2`,
    [asOf, projectId],
  );

  const fin = finRows[0];

  const { rows: revRows } = await client.query<RevisionJoinRow>(
    `SELECT br.id, br.project_id, br.amount, br.rationale, br.status,
            br.requested_by, req.full_name AS requested_by_name,
            br.decided_by, dec.full_name AS decided_by_name,
            br.decided_at, br.decision_reason, br.effective_date, br.created_at
     FROM budget_revisions br
     JOIN users req ON req.id = br.requested_by
     LEFT JOIN users dec ON dec.id = br.decided_by
     WHERE br.project_id = $1
     ORDER BY br.created_at DESC`,
    [projectId],
  );

  return {
    initialAmount: fin ? toMoney(fin.initial_budget) : 0,
    approvedRevisionsTotal: fin ? toMoney(fin.approved_revisions) : 0,
    currentBudget: fin ? toMoney(fin.current_budget) : 0,
    currency: 'AED',
    revisions: revRows.map(toRevisionRow),
  };
}

export interface RawRevisionRow {
  id: number;
  project_id: number;
  amount: string;
  rationale: string;
  status: string;
  requested_by: number;
  decided_by: number | null;
  decided_at: string | null;
  decision_reason: string | null;
  effective_date: string;
  created_at: string;
}

export async function findRawRevisionById(
  id: number,
  client: Queryable = pool,
): Promise<RawRevisionRow | null> {
  const { rows } = await client.query<RawRevisionRow>(
    `SELECT * FROM budget_revisions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findRawRevisionForUpdate(
  id: number,
  client: PoolClient | Client,
): Promise<RawRevisionRow | null> {
  const { rows } = await client.query<RawRevisionRow>(
    `SELECT * FROM budget_revisions WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}
