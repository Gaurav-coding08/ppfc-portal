import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';

type Queryable = Pool | PoolClient | Client;

export interface FinancialSummaryRow {
  projectId: number;
  initialBudget: number | null;
  approvedRevisions: number | null;
  currentBudget: number | null;
  actualSpend: number | null;
  remainingBudget: number | null;
  utilization: number | null;
  forecastToComplete: number | null;
  eac: number | null;
  projectedVariance: number | null;
  forecastMissing: boolean;
  isOverrun: boolean;
  isNearBudget: boolean;
}

interface FinancialDbRow {
  project_id: number;
  initial_budget: string;
  approved_revisions: string;
  current_budget: string;
  actual_spend: string;
  remaining_budget: string;
  utilization: string | null;
  forecast_to_complete: string;
  eac: string;
  projected_variance: string;
  forecast_missing: boolean;
  is_overrun: boolean;
  is_near_budget: boolean;
}

function toFinancialRow(row: FinancialDbRow): FinancialSummaryRow {
  return {
    projectId: row.project_id,
    initialBudget: toMoney(row.initial_budget),
    approvedRevisions: toMoney(row.approved_revisions),
    currentBudget: toMoney(row.current_budget),
    actualSpend: toMoney(row.actual_spend),
    remainingBudget: toMoney(row.remaining_budget),
    utilization: row.utilization !== null ? toMoney(row.utilization) : null,
    forecastToComplete: toMoney(row.forecast_to_complete),
    eac: toMoney(row.eac),
    projectedVariance: toMoney(row.projected_variance),
    forecastMissing: row.forecast_missing,
    isOverrun: row.is_overrun,
    isNearBudget: row.is_near_budget,
  };
}

export async function getProjectFinancials(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<FinancialSummaryRow | null> {
  const { rows } = await client.query<FinancialDbRow>(
    `SELECT * FROM fn_project_financials($1) WHERE project_id = $2`,
    [asOf, projectId],
  );
  if (rows.length === 0) return null;
  return toFinancialRow(rows[0]!);
}

export async function getProjectFinancialsMulti(
  projectIds: number[],
  asOf: string,
  client: Queryable = pool,
): Promise<FinancialSummaryRow[]> {
  if (projectIds.length === 0) return [];
  const { rows } = await client.query<FinancialDbRow>(
    `SELECT * FROM fn_project_financials($1) WHERE project_id = ANY($2)`,
    [asOf, projectIds],
  );
  return rows.map(toFinancialRow);
}

export interface SpendByCategoryRow {
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  totalSpend: number | null;
}

export async function getSpendByCategory(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<SpendByCategoryRow[]> {
  const { rows } = await client.query<{
    category_id: number;
    category_code: string;
    category_name: string;
    total_spend: string;
  }>(
    `SELECT ct.category_id,
            cc.code AS category_code,
            cc.name AS category_name,
            SUM(CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END) AS total_spend
     FROM cost_transactions ct
     JOIN cost_categories cc ON cc.id = ct.category_id
     WHERE ct.project_id = $1
       AND ct.status = 'posted'
       AND ct.txn_date <= $2::date
     GROUP BY ct.category_id, cc.code, cc.name
     ORDER BY total_spend DESC`,
    [projectId, asOf],
  );
  return rows.map((r) => ({
    categoryId: r.category_id,
    categoryCode: r.category_code,
    categoryName: r.category_name,
    totalSpend: toMoney(r.total_spend),
  }));
}

export interface MonthlyTrendRow {
  month: string;
  actualSpend: number | null;
  forecast: number | null;
}

export async function getMonthlyTrend(
  projectId: number,
  asOf: string,
  client: Queryable = pool,
): Promise<MonthlyTrendRow[]> {
  // generate_series from project start to end, LEFT JOIN actual and forecast separately
  const { rows } = await client.query<{
    month: string;
    actual_spend: string | null;
    forecast: string | null;
  }>(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', p.start_date)::date,
         date_trunc('month', p.end_date)::date,
         '1 month'
       )::date AS month
       FROM projects p WHERE p.id = $1
     ),
     actuals AS (
       SELECT date_trunc('month', ct.txn_date)::date AS month,
              SUM(CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END) AS spend
       FROM cost_transactions ct
       WHERE ct.project_id = $1
         AND ct.status = 'posted'
         AND ct.txn_date <= $2::date
       GROUP BY date_trunc('month', ct.txn_date)
     ),
     forecasts AS (
       SELECT ff.month, ff.amount
       FROM financial_forecasts ff
       WHERE ff.project_id = $1
     )
     SELECT m.month,
            a.spend AS actual_spend,
            f.amount AS forecast
     FROM months m
     LEFT JOIN actuals a ON a.month = m.month
     LEFT JOIN forecasts f ON f.month = m.month
     ORDER BY m.month`,
    [projectId, asOf],
  );
  return rows.map((r) => ({
    month: r.month,
    actualSpend: r.actual_spend !== null ? toMoney(r.actual_spend) : null,
    forecast: r.forecast !== null ? toMoney(r.forecast) : null,
  }));
}

export type AlertType = 'OVERRUN_FORECAST' | 'NEAR_BUDGET' | 'OVERSPENT' | 'FORECAST_MISSING';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertRow {
  projectId: number;
  projectCode: string;
  projectName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  currentBudget: number | null;
  actualSpend: number | null;
  eac: number | null;
  utilization: number | null;
}

// Alerts: one row per triggered condition across scoped projects
export async function getAlerts(
  asOf: string,
  scopeSql: string,
  scopeParams: unknown[],
  departmentId?: number,
  client: Queryable = pool,
): Promise<AlertRow[]> {
  const deptFilter = departmentId != null
    ? `AND p.department_id = $${scopeParams.length + 2}`
    : '';
  const params: unknown[] = [asOf, ...scopeParams];
  if (departmentId != null) params.push(departmentId);

  const { rows } = await client.query<{
    project_id: number;
    project_code: string;
    project_name: string;
    alert_type: AlertType;
    severity: AlertSeverity;
    current_budget: string;
    actual_spend: string;
    eac: string;
    utilization: string | null;
  }>(
    `WITH fin AS (
       SELECT f.*, p.code AS project_code, p.name AS project_name, p.status AS project_status
       FROM fn_project_financials($1) f
       JOIN projects p ON p.id = f.project_id
       WHERE p.status NOT IN ('cancelled', 'closed')
         ${scopeSql} ${deptFilter}
     )
     -- OVERRUN_FORECAST: EAC > budget
     SELECT project_id, project_code, project_name,
            'OVERRUN_FORECAST'::text AS alert_type, 'critical'::text AS severity,
            current_budget, actual_spend, eac, utilization
     FROM fin WHERE is_overrun = TRUE
     UNION ALL
     -- OVERSPENT: actual > budget (regardless of forecast)
     SELECT project_id, project_code, project_name,
            'OVERSPENT'::text, 'critical'::text,
            current_budget, actual_spend, eac, utilization
     FROM fin WHERE actual_spend > current_budget
     UNION ALL
     -- NEAR_BUDGET: utilization >= 90% and not overrun
     SELECT project_id, project_code, project_name,
            'NEAR_BUDGET'::text, 'warning'::text,
            current_budget, actual_spend, eac, utilization
     FROM fin WHERE is_near_budget = TRUE
     UNION ALL
     -- FORECAST_MISSING: active project with no forecast rows
     SELECT project_id, project_code, project_name,
            'FORECAST_MISSING'::text, 'info'::text,
            current_budget, actual_spend, eac, utilization
     FROM fin WHERE forecast_missing = TRUE
     ORDER BY severity, project_code`,
    params,
  );

  return rows.map((r) => ({
    projectId: r.project_id,
    projectCode: r.project_code,
    projectName: r.project_name,
    alertType: r.alert_type,
    severity: r.severity,
    currentBudget: toMoney(r.current_budget),
    actualSpend: toMoney(r.actual_spend),
    eac: toMoney(r.eac),
    utilization: r.utilization !== null ? toMoney(r.utilization) : null,
  }));
}
