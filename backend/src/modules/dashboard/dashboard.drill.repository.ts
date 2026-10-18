import type { Pool, PoolClient, Client } from 'pg';
import { pool } from '../../db/pool.js';
import { toMoney } from '../../lib/money.js';
import type { FilteredCte } from './dashboard.filters.js';
import type { DrillCostsQuery, DrillTasksQuery, DrillRisksQuery, DrillCrQuery } from './dashboard.schemas.js';

type Queryable = Pool | PoolClient | Client;

interface Paginated<T> { data: T[]; total: number; }

export interface DrillCostRow {
  id: number;
  projectId: number;
  projectCode: string;
  categoryName: string;
  txnDate: string;
  amount: number | null;
  entryType: string;
  description: string;
}

export async function drillCosts(
  cte: FilteredCte,
  query: DrillCostsQuery,
  client: Queryable = pool,
): Promise<Paginated<DrillCostRow>> {
  const p = [...cte.params, cte.asOf];
  const asOfIdx = p.length;

  let extra = '';
  if (query.drillProjectId) {
    p.push(query.drillProjectId);
    extra += ` AND ct.project_id = $${p.length}`;
  }
  if (query.drillCategoryId) {
    p.push(query.drillCategoryId);
    extra += ` AND ct.category_id = $${p.length}`;
  }
  if (query.categoryId) {
    p.push(query.categoryId);
    extra += ` AND ct.category_id = ANY($${p.length})`;
  }
  if (query.month) {
    p.push(`${query.month}-01`);
    extra += ` AND date_trunc('month', ct.txn_date)::date = $${p.length}::date`;
  }

  const offset = (query.page - 1) * query.pageSize;
  p.push(query.pageSize, offset);

  const { rows } = await client.query<{
    id: number; project_id: number; project_code: string; category_name: string;
    txn_date: string; amount: string; entry_type: string; description: string;
    total: string;
  }>(
    `WITH ${cte.sql}
     SELECT ct.id, ct.project_id, prj.code AS project_code,
            cc.name AS category_name, ct.txn_date,
            ct.amount::text, ct.entry_type, ct.description,
            COUNT(*) OVER() AS total
     FROM cost_transactions ct
     JOIN projects prj ON prj.id = ct.project_id
     JOIN cost_categories cc ON cc.id = ct.category_id
     WHERE ct.project_id IN (SELECT id FROM filtered_projects)
       AND ct.status = 'posted' AND ct.txn_date <= $${asOfIdx}::date
       ${extra}
     ORDER BY ct.txn_date DESC, ct.id DESC
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );

  return {
    data: rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectCode: r.project_code,
      categoryName: r.category_name,
      txnDate: r.txn_date,
      amount: toMoney(r.amount),
      entryType: r.entry_type,
      description: r.description,
    })),
    total: rows.length > 0 ? parseInt(rows[0]!.total) : 0,
  };
}

export interface DrillTaskRow {
  id: number;
  projectId: number;
  projectCode: string;
  title: string;
  assigneeName: string | null;
  status: string;
  dueDate: string;
  progress: number;
}

export async function drillTasks(
  cte: FilteredCte,
  query: DrillTasksQuery,
  client: Queryable = pool,
): Promise<Paginated<DrillTaskRow>> {
  const p = [...cte.params];

  let kindClause = '';
  if (query.kind === 'overdue') {
    p.push(cte.asOf);
    kindClause = ` AND t.status <> 'done' AND t.due_date < $${p.length}::date`;
  } else if (query.kind === 'blocked') {
    kindClause = ` AND t.status = 'blocked'`;
  }

  let extra = '';
  if (query.ownerId) {
    p.push(query.ownerId);
    extra += ` AND t.assignee_id = $${p.length}`;
  }
  if (query.drillProjectId) {
    p.push(query.drillProjectId);
    extra += ` AND t.project_id = $${p.length}`;
  }

  // Timeframe
  if (query.from) {
    p.push(query.from);
    extra += ` AND t.due_date >= $${p.length}`;
  }
  if (query.to) {
    p.push(query.to);
    extra += ` AND t.due_date <= $${p.length}`;
  }

  const offset = (query.page - 1) * query.pageSize;
  p.push(query.pageSize, offset);

  const { rows } = await client.query<{
    id: number; project_id: number; project_code: string; title: string;
    assignee_name: string | null; status: string; due_date: string;
    progress: number; total: string;
  }>(
    `WITH ${cte.sql}
     SELECT t.id, t.project_id, prj.code AS project_code, t.title,
            u.full_name AS assignee_name, t.status, t.due_date, t.progress,
            COUNT(*) OVER() AS total
     FROM tasks t
     JOIN projects prj ON prj.id = t.project_id
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.project_id IN (SELECT id FROM filtered_projects)
       ${kindClause} ${extra}
     ORDER BY t.due_date, t.id
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );

  return {
    data: rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectCode: r.project_code,
      title: r.title,
      assigneeName: r.assignee_name,
      status: r.status,
      dueDate: r.due_date,
      progress: r.progress,
    })),
    total: rows.length > 0 ? parseInt(rows[0]!.total) : 0,
  };
}

export interface DrillRiskRow {
  id: number;
  projectId: number;
  projectCode: string;
  title: string;
  probability: number;
  impact: number;
  score: number;
  band: string;
  status: string;
}

export async function drillRisks(
  cte: FilteredCte,
  query: DrillRisksQuery,
  client: Queryable = pool,
): Promise<Paginated<DrillRiskRow>> {
  const p = [...cte.params];

  let kindClause = '';
  if (query.kind === 'high-exposure') {
    kindClause = ` AND r.score >= 15`;
  } else if (query.kind === 'cell') {
    if (query.probability) {
      p.push(query.probability);
      kindClause += ` AND r.probability = $${p.length}`;
    }
    if (query.impact) {
      p.push(query.impact);
      kindClause += ` AND r.impact = $${p.length}`;
    }
  }

  const offset = (query.page - 1) * query.pageSize;
  p.push(query.pageSize, offset);

  const { rows } = await client.query<{
    id: number; project_id: number; project_code: string; title: string;
    probability: number; impact: number; score: number;
    band: string; status: string; total: string;
  }>(
    `WITH ${cte.sql}
     SELECT r.id, r.project_id, prj.code AS project_code, r.title,
            r.probability, r.impact, r.score,
            fn_exposure_band(r.score) AS band, r.status,
            COUNT(*) OVER() AS total
     FROM risks r
     JOIN projects prj ON prj.id = r.project_id
     WHERE r.project_id IN (SELECT id FROM filtered_projects)
       AND r.status <> 'closed'
       ${kindClause}
     ORDER BY r.score DESC, r.id
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );

  return {
    data: rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectCode: r.project_code,
      title: r.title,
      probability: r.probability,
      impact: r.impact,
      score: r.score,
      band: r.band,
      status: r.status,
    })),
    total: rows.length > 0 ? parseInt(rows[0]!.total) : 0,
  };
}

export interface DrillCrRow {
  id: number;
  code: string;
  projectId: number;
  projectCode: string;
  title: string;
  requestedByName: string;
  submittedAt: string;
}

export async function drillChangeRequests(
  cte: FilteredCte,
  query: DrillCrQuery,
  client: Queryable = pool,
): Promise<Paginated<DrillCrRow>> {
  const p = [...cte.params];

  let timeframe = '';
  if (query.from) {
    p.push(query.from);
    timeframe += ` AND cr.submitted_at >= $${p.length}::date`;
  }
  if (query.to) {
    p.push(query.to);
    timeframe += ` AND cr.submitted_at <= $${p.length}::date`;
  }

  const offset = (query.page - 1) * query.pageSize;
  p.push(query.pageSize, offset);

  const { rows } = await client.query<{
    id: number; code: string; project_id: number; project_code: string;
    title: string; requested_by_name: string; submitted_at: string; total: string;
  }>(
    `WITH ${cte.sql}
     SELECT cr.id, cr.code, cr.project_id, prj.code AS project_code,
            cr.title, u.full_name AS requested_by_name, cr.submitted_at,
            COUNT(*) OVER() AS total
     FROM change_requests cr
     JOIN projects prj ON prj.id = cr.project_id
     JOIN users u ON u.id = cr.requested_by
     WHERE cr.project_id IN (SELECT id FROM filtered_projects)
       AND cr.status = 'submitted'
       ${timeframe}
     ORDER BY cr.submitted_at DESC, cr.id DESC
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );

  return {
    data: rows.map((r) => ({
      id: r.id,
      code: r.code,
      projectId: r.project_id,
      projectCode: r.project_code,
      title: r.title,
      requestedByName: r.requested_by_name,
      submittedAt: r.submitted_at,
    })),
    total: rows.length > 0 ? parseInt(rows[0]!.total) : 0,
  };
}
