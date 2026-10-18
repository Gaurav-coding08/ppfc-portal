import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { MyTasksQuery, ProjectTasksQuery } from './tasks.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface TaskRow {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string;
  weight: number;
  progress: number;
  completedAt: string | null;
  version: number;
  isOverdue: boolean;
  isDueSoon: boolean;
}

interface TaskJoinRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string;
  weight: string;
  progress: number;
  completed_at: string | null;
  version: number;
  is_overdue: boolean;
  is_due_soon: boolean;
}

function toTaskRow(row: TaskJoinRow): TaskRow {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    status: row.status,
    priority: row.priority,
    startDate: row.start_date,
    dueDate: row.due_date,
    weight: parseFloat(row.weight),
    progress: row.progress,
    completedAt: row.completed_at,
    version: row.version,
    isOverdue: row.is_overdue,
    isDueSoon: row.is_due_soon,
  };
}

// sort/order come from a fixed zod enum (tasks.schemas.ts) — never the raw
// query string — so this map is the only place a client value turns into a
// real column identifier.
const SORT_COLUMNS: Record<ProjectTasksQuery['sort'], string> = {
  dueDate: 't.due_date',
  priority: 't.priority',
  status: 't.status',
  progress: 't.progress',
  title: 't.title',
};

// The one place the "overdue" rule is expressed as SQL — every consumer
// (this file's columns/filter below, and the automation producer in
// modules/automation/) interpolates this instead of re-deriving it.
// Assumes the asOf date is bound as the query's parameter `$1`.
export const OVERDUE_CONDITION_SQL = `t.status <> 'done' AND t.due_date < $1::date`;

// Column list only (no FROM) so a caller can append `, count(*) OVER() AS
// total_count` to the same SELECT before adding its own FROM/WHERE —
// appending it after TASK_FROM would land it outside the SELECT list.
const TASK_COLUMNS = `
  t.id, t.project_id, t.title, t.description, t.assignee_id,
  u.full_name AS assignee_name,
  t.status, t.priority, t.start_date, t.due_date, t.weight, t.progress,
  t.completed_at, t.version,
  (${OVERDUE_CONDITION_SQL}) AS is_overdue,
  (t.status <> 'done' AND t.due_date >= $1::date AND t.due_date <= ($1::date + 7)) AS is_due_soon
`;

const TASK_FROM = `
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
`;

interface CommonFilters {
  status?: readonly string[];
  priority?: string;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  sort: ProjectTasksQuery['sort'];
  order: ProjectTasksQuery['order'];
  page: number;
  pageSize: number;
}

// Builds the WHERE conditions shared by both the project-scoped list and
// /tasks/mine. `params` already holds $1 = asOf when this is called — new
// conditions append starting at $2.
function buildCommonConditions(filters: CommonFilters, params: unknown[]): string[] {
  const conditions: string[] = [];

  if (filters.status && filters.status.length > 0) {
    params.push(filters.status);
    conditions.push(`t.status = ANY($${params.length}::text[])`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (filters.overdue) {
    conditions.push(OVERDUE_CONDITION_SQL);
  }
  if (filters.dueFrom) {
    params.push(filters.dueFrom);
    conditions.push(`t.due_date >= $${params.length}`);
  }
  if (filters.dueTo) {
    params.push(filters.dueTo);
    conditions.push(`t.due_date <= $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }

  return conditions;
}

export async function listProjectTasks(
  projectId: number,
  filters: ProjectTasksQuery,
  asOf: string,
  client: Queryable = pool,
): Promise<{ rows: TaskRow[]; total: number }> {
  const params: unknown[] = [asOf, projectId];
  const conditions = [`t.project_id = $2`, ...buildCommonConditions(filters, params)];

  if (filters.unassigned) {
    conditions.push(`t.assignee_id IS NULL`);
  } else if (filters.assigneeId !== undefined) {
    params.push(filters.assigneeId);
    conditions.push(`t.assignee_id = $${params.length}`);
  }

  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query<TaskJoinRow & { total_count: string }>(
    `SELECT ${TASK_COLUMNS}, count(*) OVER() AS total_count
     ${TASK_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderColumn} ${orderDir}, t.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toTaskRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

// Caller's own assigned tasks across every project — no project_id filter,
// since assignment already implies membership/visibility on that project.
export async function listMyTasks(
  userId: number,
  filters: MyTasksQuery,
  asOf: string,
  client: Queryable = pool,
): Promise<{ rows: TaskRow[]; total: number }> {
  const params: unknown[] = [asOf, userId];
  const conditions = [`t.assignee_id = $2`, ...buildCommonConditions(filters, params)];

  const orderColumn = SORT_COLUMNS[filters.sort];
  const orderDir = filters.order === 'desc' ? 'DESC' : 'ASC';
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query<TaskJoinRow & { total_count: string }>(
    `SELECT ${TASK_COLUMNS}, count(*) OVER() AS total_count
     ${TASK_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderColumn} ${orderDir}, t.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toTaskRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

export async function findTaskById(id: number, asOf: string, client: Queryable = pool): Promise<TaskRow | null> {
  const { rows } = await client.query<TaskJoinRow>(
    `SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = $2`,
    [asOf, id],
  );
  return rows[0] ? toTaskRow(rows[0]) : null;
}

// Raw row (snake_case) used for business-rule checks and before/after audit
// snapshots — never returned to a client directly.
export interface RawTaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  assignee_id: number | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string;
  weight: string;
  progress: number;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function findRawTaskById(id: number, client: Queryable = pool): Promise<RawTaskRow | null> {
  const { rows } = await client.query<RawTaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
