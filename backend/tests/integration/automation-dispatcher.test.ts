import pg from 'pg';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { resetDb } from '../helpers/resetDb.js';
import { dispatchPending } from '../../src/modules/automation/outboxDispatcher.js';
import { retryOutboxEvent } from '../../src/modules/automation/automation.mutations.repository.js';

// Stable seeded ids (see scripts/generate/users.ts: id 2 is the admin's
// first project_manager, 6/7 are contributors on project 1).
const MANAGER_ID = 2;
const ASSIGNEE_ID = 6;

let client: pg.Client;
let nextTaskId = 90000;

beforeAll(async () => {
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

// Fresh outbox row per call, with a unique entity_id so the UNIQUE
// (event_type, entity_id, event_date) constraint never collides between
// tests in this file. Not a real task — the dispatcher only reads the
// payload, never joins back to `tasks`.
async function insertTaskOverdueEvent(opts: { assigneeId: number | null } = { assigneeId: ASSIGNEE_ID }): Promise<number> {
  const taskId = nextTaskId++;
  const payload = {
    taskId,
    projectId: 1,
    projectCode: 'PRJ-001',
    title: `dispatcher test task ${taskId}`,
    dueDate: '2026-01-01',
    daysOverdue: 5,
    assigneeId: opts.assigneeId,
    managerId: MANAGER_ID,
  };
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO outbox (event_type, entity_type, entity_id, event_date, payload)
     VALUES ('TASK_OVERDUE', 'task', $1, '2026-01-06', $2::jsonb)
     RETURNING id`,
    [taskId, JSON.stringify(payload)],
  );
  return rows[0]!.id;
}

async function outboxStatus(id: number): Promise<{ status: string; attempts: number; last_error: string | null; next_attempt_at: string; processed_at: string | null }> {
  const { rows } = await client.query(
    `SELECT status, attempts, last_error, next_attempt_at, processed_at FROM outbox WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function notificationCount(outboxId: number): Promise<number> {
  const { rows } = await client.query(`SELECT count(*) FROM notifications WHERE outbox_id = $1`, [outboxId]);
  return Number(rows[0].count);
}

describe('dispatchPending (outbox dispatcher)', () => {
  test('success: notifies assignee + manager, marks outbox sent', async () => {
    const outboxId = await insertTaskOverdueEvent();

    const result = await dispatchPending({ limit: 1 });

    expect(result).toEqual({ processed: 1, sent: 1, retried: 0, failed: 0 });

    const status = await outboxStatus(outboxId);
    expect(status.status).toBe('sent');
    expect(status.processed_at).not.toBeNull();
    expect(await notificationCount(outboxId)).toBe(2);
  });

  test('unassigned task notifies the manager only', async () => {
    const outboxId = await insertTaskOverdueEvent({ assigneeId: null });

    await dispatchPending({ limit: 1 });

    expect(await notificationCount(outboxId)).toBe(1);
    const { rows } = await client.query(`SELECT user_id FROM notifications WHERE outbox_id = $1`, [outboxId]);
    expect(rows[0].user_id).toBe(MANAGER_ID);
  });

  test('a failing deliver rolls back: attempts incremented, still pending, zero notifications', async () => {
    const outboxId = await insertTaskOverdueEvent();

    const result = await dispatchPending({
      limit: 1,
      deliver: async () => {
        throw new Error('simulated delivery failure');
      },
    });

    expect(result).toEqual({ processed: 1, sent: 0, retried: 1, failed: 0 });

    const status = await outboxStatus(outboxId);
    expect(status.status).toBe('pending');
    expect(status.attempts).toBe(1);
    expect(status.last_error).toBe('simulated delivery failure');
    expect(new Date(status.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    expect(await notificationCount(outboxId)).toBe(0);
  });

  test('exhausting AUTOMATION_MAX_ATTEMPTS marks the event failed; the dispatcher stops picking it up; admin retry resets it', async () => {
    const outboxId = await insertTaskOverdueEvent();
    const failingDeliver = async (): Promise<void> => {
      throw new Error('still failing');
    };

    // AUTOMATION_MAX_ATTEMPTS defaults to 3 — three failures in a row
    // exhausts it. Each call's backoff is in the future, but that only
    // blocks the *next* dispatcher pass, not this same explicit call.
    await client.query(`UPDATE outbox SET next_attempt_at = now() WHERE id = $1`, [outboxId]);
    await dispatchPending({ limit: 1, deliver: failingDeliver });
    await client.query(`UPDATE outbox SET next_attempt_at = now() WHERE id = $1`, [outboxId]);
    await dispatchPending({ limit: 1, deliver: failingDeliver });
    await client.query(`UPDATE outbox SET next_attempt_at = now() WHERE id = $1`, [outboxId]);
    await dispatchPending({ limit: 1, deliver: failingDeliver });

    let status = await outboxStatus(outboxId);
    expect(status.status).toBe('failed');
    expect(status.attempts).toBe(3);

    // Queue is otherwise empty in this test file's isolation, so a
    // dispatcher pass now finds nothing to claim.
    const emptyResult = await dispatchPending({ limit: 5 });
    expect(emptyResult.processed).toBe(0);

    await retryOutboxEvent(outboxId, client);
    status = await outboxStatus(outboxId);
    expect(status.status).toBe('pending');
    expect(status.attempts).toBe(0);

    const result = await dispatchPending({ limit: 1 });
    expect(result.sent).toBe(1);
    expect((await outboxStatus(outboxId)).status).toBe('sent');
  });

  test('re-dispatching an already-sent event is still exactly one notification per recipient', async () => {
    const outboxId = await insertTaskOverdueEvent();
    await dispatchPending({ limit: 1 });
    expect(await notificationCount(outboxId)).toBe(2);

    // Simulates a worker re-processing the same row (e.g. two dispatcher
    // instances racing without SKIP LOCKED, or a manual re-run) — the
    // UNIQUE(outbox_id, user_id) backstop (migration 015) must hold even
    // though this bypasses claimNextPendingOutboxEvent's own filtering.
    await client.query(`UPDATE outbox SET status = 'pending', next_attempt_at = now() WHERE id = $1`, [outboxId]);
    await dispatchPending({ limit: 1 });

    expect(await notificationCount(outboxId)).toBe(2);
  });
});
