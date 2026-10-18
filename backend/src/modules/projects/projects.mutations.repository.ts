import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { RawProjectRow } from './projects.repository.js';

type Queryable = Pool | PoolClient | Client;

// Writes used inside the create/update transactions — split out from
// projects.repository.ts (reads) to keep each file under ~250 lines.

export async function insertProject(
  input: {
    code: string;
    name: string;
    description: string | null;
    departmentId: number;
    ownerId: number;
    status: string;
    startDate: string;
    endDate: string;
    createdBy: number;
  },
  client: PoolClient | Client,
): Promise<RawProjectRow> {
  const { rows } = await client.query<RawProjectRow>(
    `INSERT INTO projects (code, name, description, department_id, owner_id, status, start_date, end_date, created_by, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
     RETURNING *`,
    [
      input.code,
      input.name,
      input.description,
      input.departmentId,
      input.ownerId,
      input.status,
      input.startDate,
      input.endDate,
      input.createdBy,
    ],
  );
  return rows[0]!;
}

export async function insertProjectBudget(
  projectId: number,
  initialAmount: number,
  approvedBy: number,
  client: PoolClient | Client,
): Promise<void> {
  await client.query(
    `INSERT INTO project_budgets (project_id, initial_amount, approved_by, approved_at)
     VALUES ($1, $2, $3, now())`,
    [projectId, initialAmount, approvedBy],
  );
}

// Candidate owner for create/ownership-transfer: must be active and either
// a project_manager or admin (CLAUDE.md + feature spec).
export async function findEligibleOwner(
  userId: number,
  client: Queryable = pool,
): Promise<{ id: number; role: string; isActive: boolean } | null> {
  const { rows } = await client.query<{ id: number; role: string; is_active: boolean }>(
    `SELECT id, role, is_active FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, role: row.role, isActive: row.is_active };
}

// Adds (or promotes) a user as a project member with the given role —
// used both for the owner's own membership on create, and for a new
// owner's membership after an ownership transfer on PATCH.
export async function upsertMember(
  projectId: number,
  userId: number,
  memberRole: string,
  client: PoolClient | Client,
): Promise<void> {
  await client.query(
    `INSERT INTO project_members (project_id, user_id, member_role)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role`,
    [projectId, userId, memberRole],
  );
}

// Count of tasks that are not status='done' — used by both the
// "complete a project" guard and the "remove a member" guard.
export async function countOpenTasks(
  projectId: number,
  client: Queryable = pool,
  assigneeId?: number,
): Promise<number> {
  const params: unknown[] = [projectId];
  let assigneeClause = '';
  if (assigneeId !== undefined) {
    params.push(assigneeId);
    assigneeClause = `AND assignee_id = $${params.length}`;
  }
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*) FROM tasks WHERE project_id = $1 AND status <> 'done' ${assigneeClause}`,
    params,
  );
  return parseInt(rows[0]!.count, 10);
}
