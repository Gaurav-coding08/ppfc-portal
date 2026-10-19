import type { Client, Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { OutboxQuery, RunsQuery } from './automation.schemas.js';

type Queryable = Pool | PoolClient | Client;

export interface AutomationRunRow {
  id: number;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed';
  trigger: 'schedule' | 'manual';
  itemsFound: number | null;
  itemsCreated: number | null;
  error: string | null;
}

function toRunRow(row: {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  trigger: 'schedule' | 'manual';
  items_found: number | null;
  items_created: number | null;
  error: string | null;
}): AutomationRunRow {
  return {
    id: row.id,
    jobName: row.job_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    trigger: row.trigger,
    itemsFound: row.items_found,
    itemsCreated: row.items_created,
    error: row.error,
  };
}

export interface OutboxRow {
  id: number;
  eventType: string;
  entityType: string;
  entityId: number;
  eventDate: string | null;
  payload: unknown;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  processedAt: string | null;
}

function toOutboxRow(row: {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number;
  event_date: string | null;
  payload: unknown;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  processed_at: string | null;
}): OutboxRow {
  return {
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventDate: row.event_date,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export async function listRuns(filters: RunsQuery, client: Queryable = pool): Promise<ListResult<AutomationRunRow>> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.jobName) {
    params.push(filters.jobName);
    conditions.push(`job_name = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT id, job_name, started_at, finished_at, status, trigger, items_found, items_created, error,
            count(*) OVER() AS total_count
     FROM automation_runs
     ${where}
     ORDER BY id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toRunRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

export async function listOutbox(filters: OutboxQuery, client: Queryable = pool): Promise<ListResult<OutboxRow>> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.eventType) {
    params.push(filters.eventType);
    conditions.push(`event_type = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT id, event_type, entity_type, entity_id, event_date, payload, status, attempts,
            last_error, next_attempt_at, created_at, processed_at,
            count(*) OVER() AS total_count
     FROM outbox
     ${where}
     ORDER BY id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toOutboxRow),
    total: rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0,
  };
}

export interface RawOutboxRow {
  id: number;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
}

export async function findRawOutboxById(id: number, client: Queryable = pool): Promise<RawOutboxRow | null> {
  const { rows } = await client.query<RawOutboxRow>(`SELECT id, status, attempts FROM outbox WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Row lock for the admin retry action, so a concurrent dispatcher pass
// can't be mid-processing the same row when the retry resets it.
export async function findRawOutboxForUpdate(id: number, client: PoolClient): Promise<RawOutboxRow | null> {
  const { rows } = await client.query<RawOutboxRow>(
    `SELECT id, status, attempts FROM outbox WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}
