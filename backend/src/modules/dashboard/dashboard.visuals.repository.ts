import type { Pool, PoolClient, Client } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';
import type { FilteredCte, DashboardFilters } from './dashboard.filters.js';

type Queryable = Pool | PoolClient | Client;

export interface MonthlySpendRow {
  month: string;
  actualSpend: number | null;
  forecast: number | null;
  cumulativeActual: number | null;
}

export async function getMonthlySpend(
  cte: FilteredCte,
  filters: DashboardFilters,
  client: Queryable = pool,
): Promise<MonthlySpendRow[]> {
  const p = [...cte.params, cte.asOf];
  const asOfIdx = p.length;

  let categoryFilter = '';
  if (filters.categoryId) {
    p.push(filters.categoryId);
    categoryFilter = `AND ct.category_id = ANY($${p.length})`;
  }

  const { rows } = await client.query<{
    month: string; actual_spend: string | null;
    forecast: string | null; cumulative_actual: string | null;
  }>(
    `WITH ${cte.sql},
     months AS (
       SELECT generate_series(
         (SELECT MIN(date_trunc('month', p.start_date)::date) FROM projects p JOIN filtered_projects fp ON fp.id = p.id),
         (SELECT MAX(date_trunc('month', p.end_date)::date) FROM projects p JOIN filtered_projects fp ON fp.id = p.id),
         '1 month'
       )::date AS month
     ),
     actuals AS (
       SELECT date_trunc('month', ct.txn_date)::date AS month,
              SUM(CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END) AS spend
       FROM cost_transactions ct
       WHERE ct.project_id IN (SELECT id FROM filtered_projects)
         AND ct.status = 'posted' AND ct.txn_date <= $${asOfIdx}::date
         ${categoryFilter}
       GROUP BY date_trunc('month', ct.txn_date)
     ),
     forecasts AS (
       SELECT ff.month, SUM(ff.amount) AS amount
       FROM financial_forecasts ff
       WHERE ff.project_id IN (SELECT id FROM filtered_projects)
       GROUP BY ff.month
     )
     SELECT m.month, a.spend AS actual_spend, f.amount AS forecast,
            SUM(a.spend) OVER (ORDER BY m.month) AS cumulative_actual
     FROM months m
     LEFT JOIN actuals a ON a.month = m.month
     LEFT JOIN forecasts f ON f.month = m.month
     ORDER BY m.month`,
    p,
  );

  return rows.map((r) => ({
    month: r.month,
    actualSpend: r.actual_spend !== null ? toMoney(r.actual_spend) : null,
    forecast: r.forecast !== null ? toMoney(r.forecast) : null,
    cumulativeActual: r.cumulative_actual !== null ? toMoney(r.cumulative_actual) : null,
  }));
}

export interface SpendByCategoryRow {
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  totalSpend: number | null;
}

export async function getSpendByCategory(
  cte: FilteredCte,
  filters: DashboardFilters,
  client: Queryable = pool,
): Promise<SpendByCategoryRow[]> {
  const p = [...cte.params, cte.asOf];
  const asOfIdx = p.length;

  let categoryFilter = '';
  if (filters.categoryId) {
    p.push(filters.categoryId);
    categoryFilter = `AND ct.category_id = ANY($${p.length})`;
  }

  const { rows } = await client.query<{
    category_id: number; category_code: string;
    category_name: string; total_spend: string;
  }>(
    `WITH ${cte.sql}
     SELECT ct.category_id, cc.code AS category_code, cc.name AS category_name,
            SUM(CASE WHEN ct.entry_type = 'expense' THEN ct.amount ELSE -ct.amount END) AS total_spend
     FROM cost_transactions ct
     JOIN cost_categories cc ON cc.id = ct.category_id
     WHERE ct.project_id IN (SELECT id FROM filtered_projects)
       AND ct.status = 'posted' AND ct.txn_date <= $${asOfIdx}::date
       ${categoryFilter}
     GROUP BY ct.category_id, cc.code, cc.name
     ORDER BY total_spend DESC`,
    p,
  );

  return rows.map((r) => ({
    categoryId: r.category_id,
    categoryCode: r.category_code,
    categoryName: r.category_name,
    totalSpend: toMoney(r.total_spend),
  }));
}

export interface OverdueByOwnerRow {
  assigneeId: number | null;
  assigneeName: string;
  count: number;
}

export async function getOverdueByOwner(
  cte: FilteredCte,
  filters: DashboardFilters,
  client: Queryable = pool,
): Promise<OverdueByOwnerRow[]> {
  const p = [...cte.params, cte.asOf];
  const asOfIdx = p.length;

  let timeframe = '';
  if (filters.from) {
    p.push(filters.from);
    timeframe += ` AND t.due_date >= $${p.length}`;
  }
  if (filters.to) {
    p.push(filters.to);
    timeframe += ` AND t.due_date <= $${p.length}`;
  }

  const { rows } = await client.query<{
    assignee_id: number | null; assignee_name: string; count: string;
  }>(
    `WITH ${cte.sql}
     SELECT t.assignee_id,
            COALESCE(u.full_name, 'Unassigned') AS assignee_name,
            COUNT(*) AS count
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.project_id IN (SELECT id FROM filtered_projects)
       AND t.status <> 'done' AND t.due_date < $${asOfIdx}::date
       ${timeframe}
     GROUP BY t.assignee_id, u.full_name
     ORDER BY count DESC`,
    p,
  );

  return rows.map((r) => ({
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    count: parseInt(r.count),
  }));
}

export interface RiskMatrixCell {
  probability: number;
  impact: number;
  count: number;
  band: string;
}

export async function getRiskMatrix(
  cte: FilteredCte,
  client: Queryable = pool,
): Promise<RiskMatrixCell[]> {
  const { rows } = await client.query<{
    probability: number; impact: number; count: string; band: string;
  }>(
    `WITH ${cte.sql}
     SELECT r.probability, r.impact, COUNT(*) AS count,
            fn_exposure_band(r.score) AS band
     FROM risks r
     WHERE r.project_id IN (SELECT id FROM filtered_projects)
       AND r.status <> 'closed'
     GROUP BY r.probability, r.impact, r.score
     ORDER BY r.probability, r.impact`,
    cte.params,
  );
  return rows.map((r) => ({
    probability: r.probability,
    impact: r.impact,
    count: parseInt(r.count),
    band: r.band,
  }));
}

export interface MilestoneRow {
  id: number;
  projectId: number;
  projectCode: string;
  name: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
  daysToDue: number;
}

export async function getMilestones(
  cte: FilteredCte,
  withinDays: number | undefined,
  client: Queryable = pool,
): Promise<MilestoneRow[]> {
  const p = [...cte.params, cte.asOf];
  const asOfIdx = p.length;

  let withinClause = '';
  if (withinDays != null) {
    p.push(withinDays);
    withinClause = `AND m.due_date <= ($${asOfIdx}::date + $${p.length}::int)`;
  }

  const { rows } = await client.query<{
    id: number; project_id: number; project_code: string; name: string;
    due_date: string; status: string; is_overdue: boolean; days_to_due: string;
  }>(
    `WITH ${cte.sql}
     SELECT m.id, m.project_id, p.code AS project_code, m.name, m.due_date, m.status,
            (m.status = 'planned' AND m.due_date < $${asOfIdx}::date) AS is_overdue,
            (m.due_date - $${asOfIdx}::date)::int AS days_to_due
     FROM milestones m
     JOIN projects p ON p.id = m.project_id
     WHERE m.project_id IN (SELECT id FROM filtered_projects)
       AND m.status = 'planned'
       ${withinClause}
     ORDER BY m.due_date`,
    p,
  );

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectCode: r.project_code,
    name: r.name,
    dueDate: r.due_date,
    status: r.status,
    isOverdue: r.is_overdue,
    daysToDue: parseInt(r.days_to_due),
  }));
}

export interface FilterOption {
  id: number;
  label: string;
}

export async function getFilterOptions(
  cte: FilteredCte,
  client: Queryable = pool,
): Promise<{
  departments: FilterOption[];
  projects: FilterOption[];
  managers: FilterOption[];
  statuses: string[];
  categories: FilterOption[];
}> {
  const { rows: depts } = await client.query<{ id: number; label: string }>(
    `WITH ${cte.sql}
     SELECT DISTINCT d.id, d.name AS label
     FROM departments d
     JOIN projects p ON p.department_id = d.id
     WHERE p.id IN (SELECT id FROM filtered_projects)
     ORDER BY d.name`,
    cte.params,
  );

  const { rows: projects } = await client.query<{ id: number; label: string }>(
    `WITH ${cte.sql}
     SELECT p.id, (p.code || ' — ' || p.name) AS label
     FROM projects p WHERE p.id IN (SELECT id FROM filtered_projects)
     ORDER BY p.code`,
    cte.params,
  );

  const { rows: managers } = await client.query<{ id: number; label: string }>(
    `WITH ${cte.sql}
     SELECT DISTINCT u.id, u.full_name AS label
     FROM users u
     JOIN projects p ON p.owner_id = u.id
     WHERE p.id IN (SELECT id FROM filtered_projects)
     ORDER BY u.full_name`,
    cte.params,
  );

  const { rows: statuses } = await client.query<{ status: string }>(
    `WITH ${cte.sql}
     SELECT DISTINCT p.status
     FROM projects p WHERE p.id IN (SELECT id FROM filtered_projects)
     ORDER BY p.status`,
    cte.params,
  );

  const { rows: categories } = await client.query<{ id: number; label: string }>(
    `SELECT id, (code || ' — ' || name) AS label
     FROM cost_categories WHERE is_active = TRUE ORDER BY code`,
  );

  return {
    departments: depts,
    projects,
    managers,
    statuses: statuses.map((r) => r.status),
    categories,
  };
}
