import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import { scopedProjectIdsSql } from '../../lib/access.js';
import type { HighExposureQuery, ProjectRisksQuery, RisksListQuery } from './risks.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface RiskRow {
  id: number;
  projectId: number;
  type: string;
  title: string;
  description: string | null;
  ownerId: number | null;
  ownerName: string | null;
  probability: number;
  impact: number;
  score: number;
  exposure: string;
  mitigation: string | null;
  dueDate: string | null;
  status: string;
  closedAt: string | null;
  version: number;
}

interface RiskJoinRow {
  id: number;
  project_id: number;
  type: string;
  title: string;
  description: string | null;
  owner_id: number | null;
  owner_name: string | null;
  probability: number;
  impact: number;
  score: number;
  exposure: string;
  mitigation: string | null;
  due_date: string | null;
  status: string;
  closed_at: string | null;
  version: number;
}

function toRiskRow(row: RiskJoinRow): RiskRow {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    probability: row.probability,
    impact: row.impact,
    score: row.score,
    exposure: row.exposure,
    mitigation: row.mitigation,
    dueDate: row.due_date,
    status: row.status,
    closedAt: row.closed_at,
    version: row.version,
  };
}

// Column list only (no FROM) — see tasks.repository.ts's TASK_COLUMNS for
// why: lets a caller inject `count(*) OVER()` into the SELECT list without
// it landing after the FROM/JOIN clause.
const RISK_COLUMNS = `
  r.id, r.project_id, r.type, r.title, r.description, r.owner_id,
  u.full_name AS owner_name,
  r.probability, r.impact, r.score, fn_exposure_band(r.score) AS exposure,
  r.mitigation, r.due_date, r.status, r.closed_at, r.version
`;

const RISK_FROM = `
  FROM risks r
  LEFT JOIN users u ON u.id = r.owner_id
`;

const SORT_COLUMNS: Record<ProjectRisksQuery['sort'], string> = {
  score: 'r.score',
  dueDate: 'r.due_date',
  status: 'r.status',
};

interface CommonFilters {
  type?: string;
  status?: readonly string[];
  ownerId?: number;
  minScore?: number;
  q?: string;
  sort: ProjectRisksQuery['sort'];
  order: ProjectRisksQuery['order'];
  page: number;
  pageSize: number;
}

// Builds the WHERE conditions shared by the project-nested list and the
// cross-portfolio list. `params` may already hold earlier params (e.g. a
// scope's user id at $1) — new conditions always append from the current
// params.length, so placeholder numbers stay correct either way.
function buildCommonConditions(filters: CommonFilters, params: unknown[]): string[] {
  const conditions: string[] = [];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`r.type = $${params.length}`);
  }
  if (filters.status && filters.status.length > 0) {
    params.push(filters.status);
    conditions.push(`r.status = ANY($${params.length}::text[])`);
  }
  if (filters.ownerId !== undefined) {
    params.push(filters.ownerId);
    conditions.push(`r.owner_id = $${params.length}`);
  }
  if (filters.minScore !== undefined) {
    params.push(filters.minScore);
    conditions.push(`r.score >= $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
  }

  return conditions;
}

export async function listProjectRisks(
  projectId: number,
  filters: ProjectRisksQuery,
  client: Queryable = pool,
): Promise<{ rows: RiskRow[]; total: number }> {
  const params: unknown[] = [projectId];
  const conditions = [`r.project_id = $1`, ...buildCommonConditions(filters, params)];

  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<RiskJoinRow & { total_count: string }>(
    `SELECT ${RISK_COLUMNS}, count(*) OVER() AS total_count
     ${RISK_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderColumn} ${orderDir}, r.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows: rows.map(toRiskRow), total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0 };
}

// Cross-portfolio list, scoped to the caller's visible projects (admin sees
// all). `scopedProjectIdsSql` hardcodes its user-id placeholder as $1, so
// its params (0 or 1 entries) must be the first thing in `params` — see
// lib/access.ts.
export async function listRisksScoped(
  caller: AuthUser,
  filters: RisksListQuery,
  client: Queryable = pool,
): Promise<{ rows: RiskRow[]; total: number }> {
  const scope = scopedProjectIdsSql(caller);
  const params: unknown[] = [...scope.params];
  const conditions = ['TRUE', ...buildCommonConditions(filters, params)];

  let from = RISK_FROM;
  if (filters.departmentId !== undefined) {
    from += ` JOIN projects p ON p.id = r.project_id`;
    params.push(filters.departmentId);
    conditions.push(`p.department_id = $${params.length}`);
  }
  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    conditions.push(`r.project_id = $${params.length}`);
  }

  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<RiskJoinRow & { total_count: string }>(
    `SELECT ${RISK_COLUMNS}, count(*) OVER() AS total_count
     ${from}
     WHERE ${conditions.join(' AND ')} ${scope.sql}
     ORDER BY r.score DESC, r.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows: rows.map(toRiskRow), total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0 };
}

// status <> 'closed' AND score >= 15, sorted score desc, due asc — the
// single cross-portfolio "what needs attention now" view (feature 09).
export async function listHighExposureRisks(
  caller: AuthUser,
  filters: HighExposureQuery,
  client: Queryable = pool,
): Promise<{ rows: RiskRow[]; total: number }> {
  const scope = scopedProjectIdsSql(caller);
  const params: unknown[] = [...scope.params];
  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<RiskJoinRow & { total_count: string }>(
    `SELECT ${RISK_COLUMNS}, count(*) OVER() AS total_count
     ${RISK_FROM}
     WHERE r.status <> 'closed' AND r.score >= 15 ${scope.sql}
     ORDER BY r.score DESC, r.due_date ASC, r.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { rows: rows.map(toRiskRow), total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0 };
}

export async function findRiskById(id: number, client: Queryable = pool): Promise<RiskRow | null> {
  const { rows } = await client.query<RiskJoinRow>(`SELECT ${RISK_COLUMNS} ${RISK_FROM} WHERE r.id = $1`, [id]);
  return rows[0] ? toRiskRow(rows[0]) : null;
}

// Raw row (snake_case) used for business-rule checks and before/after audit
// snapshots — never returned to a client directly.
export interface RawRiskRow {
  id: number;
  project_id: number;
  type: string;
  title: string;
  description: string | null;
  owner_id: number | null;
  probability: number;
  impact: number;
  score: number;
  mitigation: string | null;
  due_date: string | null;
  status: string;
  closed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function findRawRiskById(id: number, client: Queryable = pool): Promise<RawRiskRow | null> {
  const { rows } = await client.query<RawRiskRow>(`SELECT * FROM risks WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
