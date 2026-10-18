import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { AuditEventsQuery } from './admin.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface AdminUserRow {
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

export function toAdminUser(row: {
  id: number;
  email: string;
  full_name: string;
  role: 'contributor' | 'project_manager' | 'admin';
  department_id: number | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}): AdminUserRow {
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

export async function emailExists(email: string, client: Queryable = pool): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows.length > 0;
}

export async function createUser(
  input: { email: string; fullName: string; role: string; departmentId: number; passwordHash: string },
  client: Queryable,
): Promise<AdminUserRow> {
  const { rows } = await client.query(
    `INSERT INTO users (email, full_name, password_hash, role, department_id, is_active, version)
     VALUES ($1, $2, $3, $4, $5, true, 1)
     RETURNING id, email, full_name, role, department_id, is_active, version, created_at, updated_at`,
    [input.email, input.fullName, input.passwordHash, input.role, input.departmentId],
  );
  return toAdminUser(rows[0]);
}

// Full row (minus password_hash) for business-rule checks and the "before"
// audit snapshot ahead of a PATCH — unlike auth.repository's
// findActiveUserById, this does NOT filter is_active so an admin can also
// look up (and reactivate) a deactivated user.
export async function findUserRowById(id: number, client: Queryable = pool): Promise<AdminUserRow | null> {
  const { rows } = await client.query(
    `SELECT id, email, full_name, role, department_id, is_active, version, created_at, updated_at
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ? toAdminUser(rows[0]) : null;
}

// Used by the last-active-admin guard before a role change/deactivation.
export async function countActiveAdmins(client: Queryable = pool): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*) FROM users WHERE role = 'admin' AND is_active = true`,
  );
  return parseInt(rows[0]!.count, 10);
}

export interface AuditEventRow {
  id: number;
  actorId: number | null;
  actorName: string | null;
  entityType: string;
  entityId: number;
  action: string;
  projectId: number | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  createdAt: string;
}

function toAuditEvent(row: {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: number;
  action: string;
  project_id: number | null;
  before: unknown;
  after: unknown;
  request_id: string | null;
  created_at: string;
}): AuditEventRow {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    projectId: row.project_id,
    before: row.before,
    after: row.after,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export async function listAuditEvents(
  filters: AuditEventsQuery,
  client: Queryable = pool,
): Promise<ListResult<AuditEventRow>> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.entityType) {
    params.push(filters.entityType);
    conditions.push(`ae.entity_type = $${params.length}`);
  }
  if (filters.entityId !== undefined) {
    params.push(filters.entityId);
    conditions.push(`ae.entity_id = $${params.length}`);
  }
  if (filters.actorId !== undefined) {
    params.push(filters.actorId);
    conditions.push(`ae.actor_id = $${params.length}`);
  }
  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    conditions.push(`ae.project_id = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conditions.push(`ae.action = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`ae.created_at >= $${params.length}::date`);
  }
  if (filters.to) {
    // Inclusive of the whole `to` day.
    params.push(filters.to);
    conditions.push(`ae.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT ae.id, ae.actor_id, u.full_name AS actor_name, ae.entity_type, ae.entity_id, ae.action,
            ae.project_id, ae.before, ae.after, ae.request_id, ae.created_at,
            count(*) OVER() AS total_count
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_id
     ${where}
     ORDER BY ae.created_at DESC, ae.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toAuditEvent),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

export async function listProjectActivity(
  projectId: number,
  page: number,
  pageSize: number,
  client: Queryable = pool,
): Promise<ListResult<AuditEventRow>> {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const { rows } = await client.query(
    `SELECT ae.id, ae.actor_id, u.full_name AS actor_name, ae.entity_type, ae.entity_id, ae.action,
            ae.project_id, ae.before, ae.after, ae.request_id, ae.created_at,
            count(*) OVER() AS total_count
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_id
     WHERE ae.project_id = $1
     ORDER BY ae.created_at DESC, ae.id DESC
     LIMIT $2 OFFSET $3`,
    [projectId, limit, offset],
  );

  return {
    rows: rows.map(toAuditEvent),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}
