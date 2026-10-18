import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

type Queryable = Pool | PoolClient | Client;

export interface MemberRow {
  userId: number;
  fullName: string;
  email: string;
  memberRole: 'manager' | 'contributor';
  addedAt: string;
}

export async function findMembers(projectId: number, client: Queryable = pool): Promise<MemberRow[]> {
  const { rows } = await client.query<{
    user_id: number;
    full_name: string;
    email: string;
    member_role: 'manager' | 'contributor';
    added_at: string;
  }>(
    `SELECT pm.user_id, u.full_name, u.email, pm.member_role, pm.added_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.added_at`,
    [projectId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    memberRole: row.member_role,
    addedAt: row.added_at,
  }));
}

export async function findMemberRole(
  projectId: number,
  userId: number,
  client: Queryable = pool,
): Promise<'manager' | 'contributor' | null> {
  const { rows } = await client.query<{ member_role: 'manager' | 'contributor' }>(
    `SELECT member_role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  return rows[0]?.member_role ?? null;
}

export async function insertMember(
  projectId: number,
  userId: number,
  memberRole: string,
  client: PoolClient | Client,
): Promise<void> {
  await client.query(
    `INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1, $2, $3)`,
    [projectId, userId, memberRole],
  );
}

export async function removeMember(projectId: number, userId: number, client: PoolClient | Client): Promise<void> {
  await client.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [projectId, userId]);
}

export async function findActiveUser(
  userId: number,
  client: Queryable = pool,
): Promise<{ id: number; fullName: string; email: string; isActive: boolean } | null> {
  const { rows } = await client.query<{ id: number; full_name: string; email: string; is_active: boolean }>(
    `SELECT id, full_name, email, is_active FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, fullName: row.full_name, email: row.email, isActive: row.is_active };
}
