import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

type Queryable = Pool | PoolClient | Client;

export interface ProjectCounts {
  taskCount: number;
  overdueTaskCount: number;
  openRiskCount: number;
  pendingCrCount: number;
}

// Each count is its own scalar subquery rather than a join — with four
// unrelated one-to-many facts (tasks, risks, change requests) a join would
// fan out rows across all of them, inflating every count (CLAUDE.md: never
// join facts to a project directly in one aggregate query).
// "Pending" change requests = status 'submitted' (still awaiting a
// decision); 'returned' is back with the requester, not pending one.
export async function findProjectCounts(projectId: number, asOf: string, client: Queryable = pool): Promise<ProjectCounts> {
  const { rows } = await client.query<{
    task_count: string;
    overdue_task_count: string;
    open_risk_count: string;
    pending_cr_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM tasks WHERE project_id = $1) AS task_count,
       (SELECT count(*) FROM tasks WHERE project_id = $1 AND status <> 'done' AND due_date < $2) AS overdue_task_count,
       (SELECT count(*) FROM risks WHERE project_id = $1 AND status <> 'closed') AS open_risk_count,
       (SELECT count(*) FROM change_requests WHERE project_id = $1 AND status = 'submitted') AS pending_cr_count`,
    [projectId, asOf],
  );
  const row = rows[0]!;
  return {
    taskCount: parseInt(row.task_count, 10),
    overdueTaskCount: parseInt(row.overdue_task_count, 10),
    openRiskCount: parseInt(row.open_risk_count, 10),
    pendingCrCount: parseInt(row.pending_cr_count, 10),
  };
}

export interface BudgetHeadline {
  currentBudget: string;
  actualSpend: string;
  utilization: string | null;
}

// Reads the one project's row out of fn_project_financials — CLAUDE.md's
// single source of truth for every finance KPI (feature 02/07's function,
// built for feature 12's full finance module but already safe to read here
// for the detail-view headline).
export async function findBudgetHeadline(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<BudgetHeadline> {
  const { rows } = await client.query<{ current_budget: string; actual_spend: string; utilization: string | null }>(
    `SELECT current_budget, actual_spend, utilization FROM fn_project_financials($1) WHERE project_id = $2`,
    [asOf, projectId],
  );
  const row = rows[0];
  if (!row) return { currentBudget: '0', actualSpend: '0', utilization: null };
  return { currentBudget: row.current_budget, actualSpend: row.actual_spend, utilization: row.utilization };
}

export interface ProgressSnapshotRow {
  snapshotDate: string;
  progressPct: string | null;
  actualSpend: string | null;
}

export async function findProgressSnapshots(
  projectId: number,
  page: number,
  pageSize: number,
  client: Queryable = pool,
): Promise<{ rows: ProgressSnapshotRow[]; total: number }> {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const { rows } = await client.query<{
    snapshot_date: string;
    progress_pct: string | null;
    actual_spend: string | null;
    total_count: string;
  }>(
    `SELECT snapshot_date, progress_pct, actual_spend, count(*) OVER() AS total_count
     FROM progress_snapshots
     WHERE project_id = $1
     ORDER BY snapshot_date
     LIMIT $2 OFFSET $3`,
    [projectId, limit, offset],
  );

  return {
    rows: rows.map((r) => ({ snapshotDate: r.snapshot_date, progressPct: r.progress_pct, actualSpend: r.actual_spend })),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}
