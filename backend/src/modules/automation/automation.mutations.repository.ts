import type { Client, PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

// Started in its own short transaction (via the pool, not the caller's
// client) so a run row exists even if the producer's main transaction later
// rolls back or throws before it can mark the run finished.
export async function startRun(jobName: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO automation_runs (job_name, status) VALUES ($1, 'running') RETURNING id`,
    [jobName],
  );
  return rows[0]!.id;
}

// Also uses the pool directly — called from a catch block after the main
// transaction has already rolled back, so there is no live `client` to
// reuse, and the run's own finish must still commit independently.
export async function finishRun(
  id: number,
  status: 'success' | 'failed',
  counts: { itemsFound: number | null; itemsCreated: number | null },
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE automation_runs
     SET finished_at = now(), status = $1, items_found = $2, items_created = $3, error = $4
     WHERE id = $5`,
    [status, counts.itemsFound, counts.itemsCreated, error, id],
  );
}

export interface OverdueTaskForEvent {
  taskId: number;
  projectId: number;
  projectCode: string;
  title: string;
  dueDate: string;
  daysOverdue: number;
  assigneeId: number | null;
  managerId: number;
}

// Selects overdue incomplete tasks as of `asOf`, reusing the same predicate
// tasks.repository.ts uses for its own `overdue` filter — see
// OVERDUE_CONDITION_SQL there. The project's manager is its owner_id (the
// single project_manager who owns it; see CLAUDE.md canManage).
export async function selectOverdueTasks(asOf: string, client: PoolClient | Client): Promise<OverdueTaskForEvent[]> {
  const { rows } = await client.query<{
    task_id: number;
    project_id: number;
    project_code: string;
    title: string;
    due_date: string;
    days_overdue: number;
    assignee_id: number | null;
    manager_id: number;
  }>(
    `SELECT t.id AS task_id, t.project_id, p.code AS project_code, t.title, t.due_date,
            ($1::date - t.due_date) AS days_overdue, t.assignee_id, p.owner_id AS manager_id
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.status <> 'done' AND t.due_date < $1::date
     ORDER BY t.id`,
    [asOf],
  );

  return rows.map((r) => ({
    taskId: r.task_id,
    projectId: r.project_id,
    projectCode: r.project_code,
    title: r.title,
    dueDate: r.due_date,
    daysOverdue: r.days_overdue,
    assigneeId: r.assignee_id,
    managerId: r.manager_id,
  }));
}

// Batch insert, idempotent via the outbox's own UNIQUE(event_type,
// entity_id, event_date) — a row already queued for the same task/day is
// silently skipped, which is how re-running the producer on the same day
// becomes a no-op (RETURNING only lists the rows actually inserted).
export async function insertOverdueOutboxRows(
  asOf: string,
  tasks: OverdueTaskForEvent[],
  client: PoolClient | Client,
): Promise<number[]> {
  if (tasks.length === 0) return [];

  const entityIds = tasks.map((t) => t.taskId);
  const payloads = tasks.map((t) =>
    JSON.stringify({
      taskId: t.taskId,
      projectId: t.projectId,
      projectCode: t.projectCode,
      title: t.title,
      dueDate: t.dueDate,
      daysOverdue: t.daysOverdue,
      assigneeId: t.assigneeId,
      managerId: t.managerId,
    }),
  );

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO outbox (event_type, entity_type, entity_id, event_date, payload)
     SELECT 'TASK_OVERDUE', 'task', x.entity_id, $1::date, x.payload
     FROM UNNEST($2::bigint[], $3::jsonb[]) AS x(entity_id, payload)
     ON CONFLICT (event_type, entity_id, event_date) DO NOTHING
     RETURNING id`,
    [asOf, entityIds, payloads],
  );
  return rows.map((r) => r.id);
}

export interface CrApprovedEvent {
  crId: number;
  code: string;
  projectId: number;
  requesterId: number;
  decidedBy: number;
  reason: string | null;
}

// Called from inside the CR decision transaction (changeRequests.decision.
// service.ts) — same client, so if this insert fails the whole decision
// rolls back along with it (CLAUDE.md "any mutation atomic with its
// history uses withTx").
export async function insertCrApprovedOutbox(input: CrApprovedEvent, client: PoolClient | Client): Promise<void> {
  await client.query(
    `INSERT INTO outbox (event_type, entity_type, entity_id, event_date, payload)
     VALUES ('CR_APPROVED', 'change_request', $1, CURRENT_DATE, $2::jsonb)
     ON CONFLICT (event_type, entity_id, event_date) DO NOTHING`,
    [
      input.crId,
      JSON.stringify({
        crId: input.crId,
        code: input.code,
        projectId: input.projectId,
        requesterId: input.requesterId,
        decidedBy: input.decidedBy,
        reason: input.reason,
      }),
    ],
  );
}

export interface ClaimedOutboxEvent {
  id: number;
  eventType: string;
  entityType: string;
  entityId: number;
  payload: Record<string, unknown>;
  attempts: number;
}

// FOR UPDATE SKIP LOCKED: lets two dispatcher passes (e.g. the worker's
// cron tick overlapping a manual trigger) run concurrently without either
// one blocking on, or double-processing, the other's row.
export async function claimNextPendingOutboxEvent(client: PoolClient): Promise<ClaimedOutboxEvent | null> {
  const { rows } = await client.query<{
    id: number;
    event_type: string;
    entity_type: string;
    entity_id: number;
    payload: Record<string, unknown>;
    attempts: number;
  }>(
    `SELECT id, event_type, entity_type, entity_id, payload, attempts
     FROM outbox
     WHERE status = 'pending' AND next_attempt_at <= now()
     ORDER BY id
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    eventType: rows[0].event_type,
    entityType: rows[0].entity_type,
    entityId: rows[0].entity_id,
    payload: rows[0].payload,
    attempts: rows[0].attempts,
  };
}

export interface NotificationInput {
  userId: number;
  title: string;
  body: string | null;
  link: string | null;
}

// ON CONFLICT DO NOTHING is the defence-in-depth backstop for
// UNIQUE(outbox_id, user_id) (migration 015) — re-dispatching the same
// event (e.g. a retry after a partial failure) never creates a second
// notification for the same recipient.
export async function insertNotifications(
  outboxId: number,
  notifications: NotificationInput[],
  client: PoolClient,
): Promise<void> {
  if (notifications.length === 0) return;

  const userIds = notifications.map((n) => n.userId);
  const titles = notifications.map((n) => n.title);
  const bodies = notifications.map((n) => n.body);
  const links = notifications.map((n) => n.link);

  await client.query(
    `INSERT INTO notifications (user_id, title, body, link, outbox_id)
     SELECT x.user_id, x.title, x.body, x.link, $5
     FROM UNNEST($1::bigint[], $2::text[], $3::text[], $4::text[]) AS x(user_id, title, body, link)
     ON CONFLICT (outbox_id, user_id) DO NOTHING`,
    [userIds, titles, bodies, links, outboxId],
  );
}

export async function markOutboxSent(id: number, client: PoolClient): Promise<void> {
  await client.query(`UPDATE outbox SET status = 'sent', processed_at = now() WHERE id = $1`, [id]);
}

// Exponential backoff: 2^attempts minutes. Called in a fresh transaction
// after the event's own transaction rolled back, so the attempt count
// persists even though the notification insert that failed did not.
export async function markOutboxRetryOrFailed(
  id: number,
  attempts: number,
  error: string,
  maxAttempts: number,
  client: PoolClient,
): Promise<'pending' | 'failed'> {
  const nextStatus = attempts >= maxAttempts ? 'failed' : 'pending';
  await client.query(
    `UPDATE outbox
     SET attempts = $1::int, last_error = $2, status = $3,
         next_attempt_at = now() + (power(2, $1::int)::float8 * interval '1 minute')
     WHERE id = $4`,
    [attempts, error, nextStatus, id],
  );
  return nextStatus;
}

// Caller (automation.service.ts#retryOutboxEvent) has already locked and
// checked the row is 'failed' with findRawOutboxForUpdate — this just
// performs the reset inside the same transaction.
export async function retryOutboxEvent(id: number, client: PoolClient | Client): Promise<void> {
  await client.query(
    `UPDATE outbox
     SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = now(), processed_at = NULL
     WHERE id = $1`,
    [id],
  );
}
