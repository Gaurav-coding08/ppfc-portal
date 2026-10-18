import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { MilestonesListQuery } from './milestones.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface MilestoneRow {
  id: number;
  projectId: number;
  name: string;
  dueDate: string;
  status: string;
  achievedDate: string | null;
  version: number;
  isOverdue: boolean;
  daysToDue: number;
}

interface MilestoneJoinRow {
  id: number;
  project_id: number;
  name: string;
  due_date: string;
  status: string;
  achieved_date: string | null;
  version: number;
  is_overdue: boolean;
  days_to_due: number;
}

function toMilestoneRow(row: MilestoneJoinRow): MilestoneRow {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    dueDate: row.due_date,
    status: row.status,
    achievedDate: row.achieved_date,
    version: row.version,
    isOverdue: row.is_overdue,
    daysToDue: row.days_to_due,
  };
}

// `isOverdue`: still 'planned' (not yet achieved/missed) and past asOf —
// same "planned past due" reasoning fn_project_delivery_status (feature 07)
// uses for a missed milestone, kept local here since the badge there only
// needs a project_id set, not a per-milestone row.
const MILESTONE_SELECT = `
  SELECT m.id, m.project_id, m.name, m.due_date, m.status, m.achieved_date, m.version,
         (m.status = 'planned' AND m.due_date < $1::date) AS is_overdue,
         (m.due_date - $1::date) AS days_to_due
  FROM milestones m
`;

export async function listProjectMilestones(
  projectId: number,
  filters: MilestonesListQuery,
  asOf: string,
  client: Queryable = pool,
): Promise<MilestoneRow[]> {
  const params: unknown[] = [asOf, projectId];
  const conditions = [`m.project_id = $2`];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`m.status = $${params.length}`);
  }
  if (filters.dueWithinDays !== undefined) {
    params.push(filters.dueWithinDays);
    conditions.push(`m.due_date >= $1::date AND m.due_date <= ($1::date + $${params.length}::int)`);
  }

  const { rows } = await client.query<MilestoneJoinRow>(
    `${MILESTONE_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.due_date ASC, m.id ASC`,
    params,
  );

  return rows.map(toMilestoneRow);
}

export async function findMilestoneById(id: number, asOf: string, client: Queryable = pool): Promise<MilestoneRow | null> {
  const { rows } = await client.query<MilestoneJoinRow>(`${MILESTONE_SELECT} WHERE m.id = $2`, [asOf, id]);
  return rows[0] ? toMilestoneRow(rows[0]) : null;
}

// Raw row (snake_case) used for business-rule checks and before/after audit
// snapshots — never returned to a client directly.
export interface RawMilestoneRow {
  id: number;
  project_id: number;
  name: string;
  due_date: string;
  status: string;
  achieved_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function findRawMilestoneById(id: number, client: Queryable = pool): Promise<RawMilestoneRow | null> {
  const { rows } = await client.query<RawMilestoneRow>(`SELECT * FROM milestones WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertMilestone(
  input: { projectId: number; name: string; dueDate: string; status: string; achievedDate: string | null },
  client: PoolClient | Client,
): Promise<RawMilestoneRow> {
  const { rows } = await client.query<RawMilestoneRow>(
    `INSERT INTO milestones (project_id, name, due_date, status, achieved_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.projectId, input.name, input.dueDate, input.status, input.achievedDate],
  );
  return rows[0]!;
}
