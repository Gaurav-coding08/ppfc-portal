import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { UsersListQuery } from './users.schemas.js';

type Queryable = Pool | PoolClient;

export interface DepartmentRow {
  id: number;
  code: string;
  name: string;
}

// The only shape ever returned to a caller — password_hash never selected.
export interface UserSummaryRow {
  id: number;
  email: string;
  fullName: string;
  role: 'contributor' | 'project_manager' | 'admin';
  departmentId: number | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function findDepartments(client: Queryable = pool): Promise<DepartmentRow[]> {
  const { rows } = await client.query<DepartmentRow>(
    `SELECT id, code, name FROM departments ORDER BY name`,
  );
  return rows;
}

// Maps the client-facing sort key (camelCase, zod-validated against a fixed
// enum in users.schemas.ts) to its real column — the only values that ever
// reach SQL are these literals, never the raw query string.
const SORT_COLUMNS: Record<UsersListQuery['sort'], string> = {
  fullName: 'full_name',
  email: 'email',
  role: 'role',
  createdAt: 'created_at',
};

export interface ListUsersResult {
  rows: UserSummaryRow[];
  total: number;
}

// `managerScopeUserId`: when set (a project_manager caller), results are
// restricted to users who are members of a project this PM can manage
// (owns, or holds member_role='manager' on) — the "visible for assignee
// pickers" rule from the feature spec. `null` (admin) applies no such
// restriction.
export async function listUsers(
  filters: UsersListQuery,
  managerScopeUserId: number | null,
  client: Queryable = pool,
): Promise<ListUsersResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (managerScopeUserId !== null) {
    params.push(managerScopeUserId);
    conditions.push(`u.id IN (
      SELECT pm.user_id FROM project_members pm
      WHERE pm.project_id IN (
        SELECT id FROM projects WHERE owner_id = $${params.length}
        UNION
        SELECT project_id FROM project_members WHERE user_id = $${params.length} AND member_role = 'manager'
      )
    )`);
  }

  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  if (filters.role) {
    params.push(filters.role);
    conditions.push(`u.role = $${params.length}`);
  }

  if (filters.departmentId !== undefined) {
    params.push(filters.departmentId);
    conditions.push(`u.department_id = $${params.length}`);
  }

  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    conditions.push(`u.id IN (SELECT user_id FROM project_members WHERE project_id = $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';

  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query<{
    id: number;
    email: string;
    full_name: string;
    role: 'contributor' | 'project_manager' | 'admin';
    department_id: number | null;
    is_active: boolean;
    version: number;
    created_at: string;
    updated_at: string;
    total_count: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.department_id, u.is_active, u.version,
            u.created_at, u.updated_at, count(*) OVER() AS total_count
     FROM users u
     ${where}
     ORDER BY u.${orderColumn} ${orderDir}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toUserSummary),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

// `managerScopeUserId` has the same meaning as in listUsers. Returns null
// when the user doesn't exist or (for a PM) falls outside their scope — the
// service maps that to 404, never a 403, so scope can't be probed.
export async function findUserById(
  id: number,
  managerScopeUserId: number | null,
  client: Queryable = pool,
): Promise<UserSummaryRow | null> {
  const conditions = ['u.id = $1'];
  const params: unknown[] = [id];

  if (managerScopeUserId !== null) {
    params.push(managerScopeUserId);
    conditions.push(`u.id IN (
      SELECT pm.user_id FROM project_members pm
      WHERE pm.project_id IN (
        SELECT id FROM projects WHERE owner_id = $${params.length}
        UNION
        SELECT project_id FROM project_members WHERE user_id = $${params.length} AND member_role = 'manager'
      )
    )`);
  }

  const { rows } = await client.query<{
    id: number;
    email: string;
    full_name: string;
    role: 'contributor' | 'project_manager' | 'admin';
    department_id: number | null;
    is_active: boolean;
    version: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.department_id, u.is_active, u.version,
            u.created_at, u.updated_at
     FROM users u
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const row = rows[0];
  return row ? toUserSummary(row) : null;
}

function toUserSummary(row: {
  id: number;
  email: string;
  full_name: string;
  role: 'contributor' | 'project_manager' | 'admin';
  department_id: number | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}): UserSummaryRow {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
