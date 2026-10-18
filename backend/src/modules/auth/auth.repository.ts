import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

export type UserRole = 'contributor' | 'project_manager' | 'admin';

// Row shape as read for authentication purposes only — includes
// password_hash and is_active, which never leave this module. The public
// shape handed to controllers/clients is AuthUser (see authenticate.ts).
export interface AuthUserRow {
  id: number;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  departmentId: number | null;
  isActive: boolean;
}

export interface MembershipRow {
  projectId: number;
  projectCode: string;
  memberRole: 'manager' | 'contributor';
}

type Queryable = Pool | PoolClient;

// Email is matched case-insensitively against the same expression the
// unique index uses (lower(email)), so this can never return a different
// row than the one the DB would reject as a duplicate.
export async function findUserByEmail(email: string, client: Queryable = pool): Promise<AuthUserRow | null> {
  const { rows } = await client.query<{
    id: number;
    email: string;
    full_name: string;
    password_hash: string;
    role: UserRole;
    department_id: number | null;
    is_active: boolean;
  }>(
    `SELECT id, email, full_name, password_hash, role, department_id, is_active
     FROM users
     WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    role: row.role,
    departmentId: row.department_id,
    isActive: row.is_active,
  };
}

// Used by authenticate.ts on every protected request. Filters is_active at
// the SQL level so a deactivated user's existing token stops working the
// moment they're deactivated, without the caller having to remember a
// separate check.
export async function findActiveUserById(
  id: number,
  client: Queryable = pool,
): Promise<Omit<AuthUserRow, 'passwordHash' | 'isActive'> | null> {
  const { rows } = await client.query<{
    id: number;
    email: string;
    full_name: string;
    role: UserRole;
    department_id: number | null;
  }>(
    `SELECT id, email, full_name, role, department_id
     FROM users
     WHERE id = $1 AND is_active = true`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
  };
}

export async function findMembershipsByUserId(userId: number, client: Queryable = pool): Promise<MembershipRow[]> {
  const { rows } = await client.query<{ project_id: number; project_code: string; member_role: 'manager' | 'contributor' }>(
    `SELECT pm.project_id, p.code AS project_code, pm.member_role
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.user_id = $1
     ORDER BY p.code`,
    [userId],
  );

  return rows.map((row) => ({
    projectId: row.project_id,
    projectCode: row.project_code,
    memberRole: row.member_role,
  }));
}
