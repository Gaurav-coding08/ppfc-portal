import type { Client, PoolClient } from 'pg';
import type { RawCrRow } from './changeRequests.repository.js';

export async function nextCrCode(client: PoolClient | Client): Promise<string> {
  const { rows } = await client.query<{ max_num: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(code FROM 4) AS INT)) AS max_num FROM change_requests`,
  );
  const next = (rows[0]?.max_num ?? 0) + 1;
  return `CR-${String(next).padStart(3, '0')}`;
}

export interface InsertCrInput {
  code: string;
  projectId: number;
  title: string;
  description: string | null;
  impactSummary: string | null;
  requestedBy: number;
}

export async function insertCr(
  input: InsertCrInput,
  client: PoolClient | Client,
): Promise<RawCrRow> {
  const { rows } = await client.query<RawCrRow>(
    `INSERT INTO change_requests
       (code, project_id, title, description, impact_summary, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.code, input.projectId, input.title, input.description, input.impactSummary, input.requestedBy],
  );
  return rows[0]!;
}

export async function insertHistory(
  crId: number,
  fromStatus: string | null,
  toStatus: string,
  actorId: number,
  reason: string | null,
  client: PoolClient | Client,
): Promise<{ id: number }> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO change_history (change_request_id, from_status, to_status, actor_id, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [crId, fromStatus, toStatus, actorId, reason],
  );
  return rows[0]!;
}

// Updates CR status + decision fields; returns the updated raw row.
// Uses version check for optimistic locking.
export async function updateCrDecision(
  id: number,
  version: number,
  status: string,
  decidedBy: number,
  reason: string,
  client: PoolClient | Client,
): Promise<RawCrRow | null> {
  const { rows } = await client.query<RawCrRow>(
    `UPDATE change_requests
     SET status = $1, decided_by = $2, decided_at = now(), decision_reason = $3,
         version = version + 1, updated_at = now()
     WHERE id = $4 AND version = $5
     RETURNING *`,
    [status, decidedBy, reason, id, version],
  );
  return rows[0] ?? null;
}

// Resubmit: sets status back to submitted, clears decision fields,
// optionally updates title/description.
export async function updateCrResubmit(
  id: number,
  version: number,
  title: string | undefined,
  description: string | undefined,
  client: PoolClient | Client,
): Promise<RawCrRow | null> {
  const setClauses = [
    `status = 'submitted'`,
    `decided_by = NULL`,
    `decided_at = NULL`,
    `decision_reason = NULL`,
    `submitted_at = now()`,
    `version = version + 1`,
    `updated_at = now()`,
  ];
  const params: unknown[] = [];

  if (title !== undefined) {
    params.push(title);
    setClauses.push(`title = $${params.length}`);
  }
  if (description !== undefined) {
    params.push(description);
    setClauses.push(`description = $${params.length}`);
  }

  params.push(id, version);
  const { rows } = await client.query<RawCrRow>(
    `UPDATE change_requests
     SET ${setClauses.join(', ')}
     WHERE id = $${params.length - 1} AND version = $${params.length}
     RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}
