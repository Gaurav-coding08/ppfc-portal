// All dashboard queries start from the `filtered_projects` CTE built in
// dashboard.filters.ts. Each fact (tasks, costs, risks, etc.) is aggregated
// in its own CTE first, then joined — preventing fan-out inflation that would
// happen if multiple one-to-many tables were joined directly.

import type { Pool, PoolClient, Client } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';
import type { FilteredCte, DashboardFilters } from './dashboard.filters.js';

type Queryable = Pool | PoolClient | Client;

interface KpiDbRow {
  total_projects: string;
  active_projects: string;
  portfolio_progress_pct: string | null;
  task_completion_pct: string | null;
  overdue_incomplete_tasks: string;
  milestones_due_14d: string;
  open_high_exposure_risks: string;
  blocked_tasks: string;
  pending_change_requests: string;
  approved_budget: string;
  actual_spend: string;
  remaining_budget: string;
  utilization_pct: string | null;
  forecast_eac: string;
  projected_overrun_count: string;
  projected_overrun_amount: string;
}

export interface KpiRow {
  key: string;
  value: number | null;
  unit: 'count' | 'pct' | 'AED';
  drill: { endpoint: string; params?: Record<string, string> };
}

function n(v: string | null): number | null {
  if (v === null) return null;
  return Math.round(parseFloat(v) * 100) / 100;
}

export async function getKpis(
  cte: FilteredCte,
  filters: DashboardFilters,
  client: Queryable = pool,
): Promise<KpiRow[]> {
  const p = [...cte.params];
  p.push(cte.asOf);
  const asOfIdx = p.length;

  // Timeframe clauses for entities that respect from/to
  let taskTimeframe = '';
  let milestoneTimeframe = '';
  let crTimeframe = '';
  if (filters.from) {
    p.push(filters.from);
    taskTimeframe += ` AND t.due_date >= $${p.length}`;
    milestoneTimeframe += ` AND m.due_date >= $${p.length}`;
    crTimeframe += ` AND cr.submitted_at >= $${p.length}::date`;
  }
  if (filters.to) {
    p.push(filters.to);
    taskTimeframe += ` AND t.due_date <= $${p.length}`;
    milestoneTimeframe += ` AND m.due_date <= $${p.length}`;
    crTimeframe += ` AND cr.submitted_at <= $${p.length}::date`;
  }

  const { rows } = await client.query<KpiDbRow>(
    `WITH ${cte.sql},
     -- Delivery: project counts and progress
     proj AS (
       SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE p.status = 'active') AS active
       FROM projects p WHERE p.id IN (SELECT id FROM filtered_projects)
     ),
     prog AS (
       SELECT COALESCE(
         SUM(pp.progress_pct * pp.task_count) / NULLIF(SUM(pp.task_count), 0), 0
       ) AS portfolio_pct
       FROM fn_project_progress() pp
       WHERE pp.project_id IN (SELECT id FROM filtered_projects)
     ),
     task_stats AS (
       SELECT
         COUNT(*) FILTER (WHERE t.status = 'done') AS done,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date < $${asOfIdx}::date) AS overdue,
         COUNT(*) FILTER (WHERE t.status = 'blocked') AS blocked
       FROM tasks t
       WHERE t.project_id IN (SELECT id FROM filtered_projects)
         ${taskTimeframe}
     ),
     ms AS (
       SELECT COUNT(*) AS due_14d
       FROM milestones m
       WHERE m.project_id IN (SELECT id FROM filtered_projects)
         AND m.status = 'planned'
         AND m.due_date BETWEEN $${asOfIdx}::date AND ($${asOfIdx}::date + 14)
         ${milestoneTimeframe}
     ),
     risk_stats AS (
       SELECT COUNT(*) FILTER (WHERE r.score >= 15) AS high_exposure
       FROM risks r
       WHERE r.project_id IN (SELECT id FROM filtered_projects)
         AND r.status <> 'closed'
     ),
     cr_stats AS (
       SELECT COUNT(*) AS pending
       FROM change_requests cr
       WHERE cr.project_id IN (SELECT id FROM filtered_projects)
         AND cr.status = 'submitted'
         ${crTimeframe}
     ),
     fin AS (
       SELECT
         COALESCE(SUM(f.current_budget), 0) AS budget,
         COALESCE(SUM(f.actual_spend), 0) AS actual,
         COALESCE(SUM(f.remaining_budget), 0) AS remaining,
         COALESCE(SUM(f.actual_spend), 0) / NULLIF(COALESCE(SUM(f.current_budget), 0), 0) AS util,
         COALESCE(SUM(f.eac), 0) AS eac,
         COUNT(*) FILTER (WHERE f.is_overrun) AS overrun_count,
         COALESCE(SUM(f.eac - f.current_budget) FILTER (WHERE f.is_overrun), 0) AS overrun_amount
       FROM fn_project_financials($${asOfIdx}) f
       WHERE f.project_id IN (SELECT id FROM filtered_projects)
     )
     SELECT
       proj.total AS total_projects, proj.active AS active_projects,
       prog.portfolio_pct AS portfolio_progress_pct,
       CASE WHEN task_stats.total > 0
         THEN (task_stats.done::numeric / task_stats.total * 100)
         ELSE NULL END AS task_completion_pct,
       task_stats.overdue AS overdue_incomplete_tasks,
       ms.due_14d AS milestones_due_14d,
       risk_stats.high_exposure AS open_high_exposure_risks,
       task_stats.blocked AS blocked_tasks,
       cr_stats.pending AS pending_change_requests,
       fin.budget AS approved_budget, fin.actual AS actual_spend,
       fin.remaining AS remaining_budget, fin.util AS utilization_pct,
       fin.eac AS forecast_eac,
       fin.overrun_count AS projected_overrun_count,
       fin.overrun_amount AS projected_overrun_amount
     FROM proj, prog, task_stats, ms, risk_stats, cr_stats, fin`,
    p,
  );

  const r = rows[0]!;
  return [
    { key: 'totalProjects', value: parseInt(r.total_projects), unit: 'count', drill: { endpoint: '/api/v1/dashboard/project-health' } },
    { key: 'activeProjects', value: parseInt(r.active_projects), unit: 'count', drill: { endpoint: '/api/v1/dashboard/project-health', params: { status: 'active' } } },
    { key: 'portfolioProgressPct', value: n(r.portfolio_progress_pct), unit: 'pct', drill: { endpoint: '/api/v1/dashboard/project-health' } },
    { key: 'taskCompletionPct', value: n(r.task_completion_pct), unit: 'pct', drill: { endpoint: '/api/v1/dashboard/drill/tasks', params: { kind: 'all' } } },
    { key: 'overdueIncompleteTasks', value: parseInt(r.overdue_incomplete_tasks), unit: 'count', drill: { endpoint: '/api/v1/dashboard/drill/tasks', params: { kind: 'overdue' } } },
    { key: 'milestonesDue14d', value: parseInt(r.milestones_due_14d), unit: 'count', drill: { endpoint: '/api/v1/dashboard/milestones', params: { withinDays: '14' } } },
    { key: 'openHighExposureRisks', value: parseInt(r.open_high_exposure_risks), unit: 'count', drill: { endpoint: '/api/v1/dashboard/drill/risks', params: { kind: 'high-exposure' } } },
    { key: 'blockedTasks', value: parseInt(r.blocked_tasks), unit: 'count', drill: { endpoint: '/api/v1/dashboard/drill/tasks', params: { kind: 'blocked' } } },
    { key: 'pendingChangeRequests', value: parseInt(r.pending_change_requests), unit: 'count', drill: { endpoint: '/api/v1/dashboard/drill/change-requests' } },
    { key: 'approvedBudget', value: toMoney(r.approved_budget), unit: 'AED', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
    { key: 'actualSpend', value: toMoney(r.actual_spend), unit: 'AED', drill: { endpoint: '/api/v1/dashboard/drill/costs' } },
    { key: 'remainingBudget', value: toMoney(r.remaining_budget), unit: 'AED', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
    { key: 'utilizationPct', value: n(r.utilization_pct) !== null ? Math.round(n(r.utilization_pct)! * 10000) / 100 : null, unit: 'pct', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
    { key: 'forecastEac', value: toMoney(r.forecast_eac), unit: 'AED', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
    { key: 'projectedOverrunCount', value: parseInt(r.projected_overrun_count), unit: 'count', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
    { key: 'projectedOverrunAmount', value: toMoney(r.projected_overrun_amount), unit: 'AED', drill: { endpoint: '/api/v1/dashboard/budget-vs-actual-eac' } },
  ];
}

export interface ProjectHealthRow {
  projectId: number;
  code: string;
  name: string;
  status: string;
  progressPct: number | null;
  deliveryStatus: string;
  utilization: number | null;
  currentBudget: number | null;
  eac: number | null;
  openHighRisks: number;
  overdueTasks: number;
}

export async function getProjectHealth(
  cte: FilteredCte,
  client: Queryable = pool,
): Promise<ProjectHealthRow[]> {
  const p = [...cte.params];
  p.push(cte.asOf);
  const asOfIdx = p.length;

  const { rows } = await client.query<{
    project_id: number; code: string; name: string; status: string;
    progress_pct: string | null; delivery_status: string;
    utilization: string | null; current_budget: string; eac: string;
    open_high_risks: string; overdue_tasks: string;
  }>(
    `WITH ${cte.sql}
     SELECT p.id AS project_id, p.code, p.name, p.status,
       pp.progress_pct::text, ds.delivery_status,
       f.utilization::text, f.current_budget::text, f.eac::text,
       COALESCE(hr.cnt, 0)::text AS open_high_risks,
       COALESCE(ot.cnt, 0)::text AS overdue_tasks
     FROM projects p
     JOIN filtered_projects fp ON fp.id = p.id
     LEFT JOIN fn_project_progress() pp ON pp.project_id = p.id
     LEFT JOIN fn_project_delivery_status($${asOfIdx}) ds ON ds.project_id = p.id
     LEFT JOIN fn_project_financials($${asOfIdx}) f ON f.project_id = p.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt FROM risks r
       WHERE r.project_id = p.id AND r.status <> 'closed' AND r.score >= 15
     ) hr ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt FROM tasks t
       WHERE t.project_id = p.id AND t.status <> 'done' AND t.due_date < $${asOfIdx}::date
     ) ot ON TRUE
     ORDER BY p.code`,
    p,
  );

  return rows.map((r) => ({
    projectId: r.project_id,
    code: r.code,
    name: r.name,
    status: r.status,
    progressPct: n(r.progress_pct),
    deliveryStatus: r.delivery_status,
    utilization: n(r.utilization),
    currentBudget: toMoney(r.current_budget),
    eac: toMoney(r.eac),
    openHighRisks: parseInt(r.open_high_risks),
    overdueTasks: parseInt(r.overdue_tasks),
  }));
}

export interface BudgetVsActualRow {
  projectId: number;
  code: string;
  name: string;
  currentBudget: number | null;
  actualSpend: number | null;
  eac: number | null;
  isOverrun: boolean;
}

export async function getBudgetVsActual(
  cte: FilteredCte,
  client: Queryable = pool,
): Promise<BudgetVsActualRow[]> {
  const p = [...cte.params, cte.asOf];
  const { rows } = await client.query<{
    project_id: number; code: string; name: string;
    current_budget: string; actual_spend: string; eac: string; is_overrun: boolean;
  }>(
    // is_overrun comes from the same function as the KPI's overrun count, so
    // the chart's highlighted bars always match projectedOverrunCount.
    `WITH ${cte.sql}
     SELECT p.id AS project_id, p.code, p.name,
       f.current_budget::text, f.actual_spend::text, f.eac::text,
       COALESCE(f.is_overrun, FALSE) AS is_overrun
     FROM projects p
     JOIN filtered_projects fp ON fp.id = p.id
     LEFT JOIN fn_project_financials($${p.length}) f ON f.project_id = p.id
     ORDER BY p.code`,
    p,
  );
  return rows.map((r) => ({
    projectId: r.project_id,
    code: r.code,
    name: r.name,
    currentBudget: toMoney(r.current_budget),
    actualSpend: toMoney(r.actual_spend),
    eac: toMoney(r.eac),
    isOverrun: r.is_overrun,
  }));
}
