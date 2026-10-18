import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { ProjectsListQuery } from './projects.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface DepartmentRef {
  id: number;
  code: string;
  name: string;
}

export interface UserRef {
  id: number;
  fullName: string;
  email: string;
}

export interface ProjectSummaryRow {
  id: number;
  code: string;
  name: string;
  department: DepartmentRef;
  owner: UserRef;
  status: string;
  startDate: string;
  endDate: string;
  progressPct: number;
  deliveryStatus: string;
  version: number;
}

// Raw columns selected for every project list/detail query — kept in one
// place so the two mapping functions below stay in sync with the SQL.
interface ProjectJoinRow {
  id: number;
  code: string;
  name: string;
  department_id: number;
  department_code: string;
  department_name: string;
  owner_id: number;
  owner_full_name: string;
  owner_email: string;
  status: string;
  start_date: string;
  end_date: string;
  version: number;
  progress_pct: string | null;
  delivery_status: string;
}

function toProjectSummary(row: ProjectJoinRow): ProjectSummaryRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    department: { id: row.department_id, code: row.department_code, name: row.department_name },
    owner: { id: row.owner_id, fullName: row.owner_full_name, email: row.owner_email },
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    progressPct: row.progress_pct === null ? 0 : parseFloat(row.progress_pct),
    deliveryStatus: row.delivery_status,
    version: row.version,
  };
}

// `scope`: null for admin (no restriction); otherwise the caller's own id,
// restricting to projects they own or are a member of (canView rule).
// Mirrors getProjectAccess's canView logic but as a set filter for a list,
// so it can't be expressed as scopedProjectIdsSql (that helper assumes a
// fact table's project_id FK column, not the projects table's own id).
export async function listProjects(
  filters: ProjectsListQuery,
  scope: number | null,
  asOf: string,
  client: Queryable = pool,
): Promise<{ rows: ProjectSummaryRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [asOf];

  if (scope !== null) {
    params.push(scope);
    conditions.push(`(p.owner_id = $${params.length} OR EXISTS (
      SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $${params.length}
    ))`);
  }

  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(p.code ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  if (filters.departmentId !== undefined) {
    params.push(filters.departmentId);
    conditions.push(`p.department_id = $${params.length}`);
  }
  if (filters.ownerId !== undefined) {
    params.push(filters.ownerId);
    conditions.push(`p.owner_id = $${params.length}`);
  }
  if (filters.status && filters.status.length > 0) {
    params.push(filters.status);
    conditions.push(`p.status = ANY($${params.length}::text[])`);
  }
  if (filters.startFrom) {
    params.push(filters.startFrom);
    conditions.push(`p.start_date >= $${params.length}`);
  }
  if (filters.endTo) {
    params.push(filters.endTo);
    conditions.push(`p.end_date <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // sort/order come from a fixed zod enum (projects.schemas.ts) — never the
  // raw query string — so this map is the only place a client value turns
  // into a real column identifier.
  const sortColumns: Record<ProjectsListQuery['sort'], string> = {
    code: 'p.code',
    name: 'p.name',
    status: 'p.status',
    startDate: 'p.start_date',
    endDate: 'p.end_date',
    progress: 'pr.progress_pct',
  };
  const orderColumn = sortColumns[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';

  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query<ProjectJoinRow & { total_count: string }>(
    `SELECT p.id, p.code, p.name, p.version, p.status, p.start_date, p.end_date,
            d.id AS department_id, d.code AS department_code, d.name AS department_name,
            o.id AS owner_id, o.full_name AS owner_full_name, o.email AS owner_email,
            COALESCE(pr.progress_pct, 0) AS progress_pct,
            ds.delivery_status,
            count(*) OVER() AS total_count
     FROM projects p
     JOIN departments d ON d.id = p.department_id
     JOIN users o ON o.id = p.owner_id
     LEFT JOIN fn_project_progress() pr ON pr.project_id = p.id
     LEFT JOIN fn_project_delivery_status($1) ds ON ds.project_id = p.id
     ${where}
     ORDER BY ${orderColumn} ${orderDir}, p.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toProjectSummary),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

export async function findProjectSummaryById(
  id: number,
  asOf: string,
  client: Queryable = pool,
): Promise<ProjectSummaryRow | null> {
  const { rows } = await client.query<ProjectJoinRow>(
    `SELECT p.id, p.code, p.name, p.version, p.status, p.start_date, p.end_date,
            d.id AS department_id, d.code AS department_code, d.name AS department_name,
            o.id AS owner_id, o.full_name AS owner_full_name, o.email AS owner_email,
            COALESCE(pr.progress_pct, 0) AS progress_pct,
            ds.delivery_status
     FROM projects p
     JOIN departments d ON d.id = p.department_id
     JOIN users o ON o.id = p.owner_id
     LEFT JOIN fn_project_progress() pr ON pr.project_id = p.id
     LEFT JOIN fn_project_delivery_status($2) ds ON ds.project_id = p.id
     WHERE p.id = $1`,
    [id, asOf],
  );
  return rows[0] ? toProjectSummary(rows[0]) : null;
}

// Raw row (snake_case) used for business-rule checks and before/after audit
// snapshots — never returned to a client directly.
export interface RawProjectRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  department_id: number;
  owner_id: number;
  status: string;
  start_date: string;
  end_date: string;
  version: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export async function findProjectRowById(id: number, client: Queryable = pool): Promise<RawProjectRow | null> {
  const { rows } = await client.query<RawProjectRow>(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Next free PRJ-NNN code, derived from the current max numeric suffix —
// used only when the caller omits `code` on create.
export async function nextProjectCode(client: Queryable = pool): Promise<string> {
  const { rows } = await client.query<{ next: string }>(
    `SELECT 'PRJ-' || lpad((COALESCE(MAX(substring(code FROM 5)::int), 0) + 1)::text, 3, '0') AS next
     FROM projects WHERE code ~ '^PRJ-[0-9]+$'`,
  );
  return rows[0]!.next;
}

