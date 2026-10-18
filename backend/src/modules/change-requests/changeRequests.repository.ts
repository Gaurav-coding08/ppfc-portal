import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { scopedProjectIdsSql } from '../../lib/access.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import type { CrListQuery } from './changeRequests.schemas.js';

type Queryable = Pool | PoolClient | Client;

// --- Row types ---

export interface CrRow {
  id: number;
  code: string;
  projectId: number;
  title: string;
  description: string | null;
  impactSummary: string | null;
  requestedBy: number;
  requesterName: string;
  status: string;
  submittedAt: string;
  decidedBy: number | null;
  deciderName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  version: number;
}

export interface HistoryRow {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  actorName: string;
  reason: string | null;
  createdAt: string;
}

interface CrJoinRow {
  id: number;
  code: string;
  project_id: number;
  title: string;
  description: string | null;
  impact_summary: string | null;
  requested_by: number;
  requester_name: string;
  status: string;
  submitted_at: string;
  decided_by: number | null;
  decider_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  version: number;
}

interface HistoryJoinRow {
  id: number;
  from_status: string | null;
  to_status: string;
  actor_id: number;
  actor_name: string;
  reason: string | null;
  created_at: string;
}

function toCrRow(row: CrJoinRow): CrRow {
  return {
    id: row.id,
    code: row.code,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    impactSummary: row.impact_summary,
    requestedBy: row.requested_by,
    requesterName: row.requester_name,
    status: row.status,
    submittedAt: row.submitted_at,
    decidedBy: row.decided_by,
    deciderName: row.decider_name,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    version: row.version,
  };
}

function toHistoryRow(row: HistoryJoinRow): HistoryRow {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorId: row.actor_id,
    actorName: row.actor_name,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

const CR_COLUMNS = `
  cr.id, cr.code, cr.project_id, cr.title, cr.description,
  cr.impact_summary, cr.requested_by,
  req.full_name AS requester_name,
  cr.status, cr.submitted_at, cr.decided_by,
  dec.full_name AS decider_name,
  cr.decided_at, cr.decision_reason, cr.version
`;

const CR_FROM = `
  FROM change_requests cr
  JOIN users req ON req.id = cr.requested_by
  LEFT JOIN users dec ON dec.id = cr.decided_by
`;

// --- List (cross-project, scoped) ---

export async function listCrsScoped(
  caller: AuthUser,
  filters: CrListQuery,
  client: Queryable = pool,
): Promise<{ rows: CrRow[]; total: number }> {
  const scope = scopedProjectIdsSql(caller);
  const params: unknown[] = [...scope.params];
  const conditions = ['TRUE'];

  if (filters.projectId !== undefined) {
    params.push(filters.projectId);
    conditions.push(`cr.project_id = $${params.length}`);
  }
  if (filters.status && filters.status.length > 0) {
    params.push(filters.status);
    conditions.push(`cr.status = ANY($${params.length}::text[])`);
  }
  if (filters.requestedBy !== undefined) {
    params.push(filters.requestedBy);
    conditions.push(`cr.requested_by = $${params.length}`);
  }
  if (filters.mine) {
    // caller.id may already be $1 from scope; push it again safely.
    params.push(caller.id);
    conditions.push(`cr.requested_by = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`cr.submitted_at >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`cr.submitted_at < ($${params.length}::date + 1)`);
  }

  params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);

  const { rows } = await client.query<CrJoinRow & { total_count: string }>(
    `SELECT ${CR_COLUMNS}, count(*) OVER() AS total_count
     ${CR_FROM}
     WHERE ${conditions.join(' AND ')} ${scope.sql}
     ORDER BY cr.submitted_at DESC, cr.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toCrRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

// --- Get by ID (with history) ---

export async function findCrById(
  id: number,
  client: Queryable = pool,
): Promise<CrRow | null> {
  const { rows } = await client.query<CrJoinRow>(
    `SELECT ${CR_COLUMNS} ${CR_FROM} WHERE cr.id = $1`,
    [id],
  );
  return rows[0] ? toCrRow(rows[0]) : null;
}

export async function findCrHistory(
  crId: number,
  client: Queryable = pool,
): Promise<HistoryRow[]> {
  const { rows } = await client.query<HistoryJoinRow>(
    `SELECT ch.id, ch.from_status, ch.to_status, ch.actor_id,
            u.full_name AS actor_name, ch.reason, ch.created_at
     FROM change_history ch
     JOIN users u ON u.id = ch.actor_id
     WHERE ch.change_request_id = $1
     ORDER BY ch.created_at ASC, ch.id ASC`,
    [crId],
  );
  return rows.map(toHistoryRow);
}

// Raw row for scope-check and before snapshot — not returned to clients.
export interface RawCrRow {
  id: number;
  code: string;
  project_id: number;
  title: string;
  description: string | null;
  impact_summary: string | null;
  requested_by: number;
  status: string;
  submitted_at: string;
  decided_by: number | null;
  decided_at: string | null;
  decision_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function findRawCrById(
  id: number,
  client: Queryable = pool,
): Promise<RawCrRow | null> {
  const { rows } = await client.query<RawCrRow>(
    `SELECT * FROM change_requests WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// FOR UPDATE lock — serializes concurrent deciders on the same CR.
export async function findRawCrForUpdate(
  id: number,
  client: PoolClient | Client,
): Promise<RawCrRow | null> {
  const { rows } = await client.query<RawCrRow>(
    `SELECT * FROM change_requests WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}
