import pg from 'pg';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { loginAs } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';
import { runOverdueEscalation } from '../../src/modules/automation/overdueEscalation.job.js';

// A fixed asOf before every seeded task's due_date (earliest seeded
// due_date is 2026-01-24 — see data.test.ts/the generator) so the
// baseline overdue count is zero and this file's own fixtures are the
// only overdue tasks the producer can find.
const ASOF = '2026-01-01';

let client: pg.Client;

beforeAll(async () => {
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

async function insertTask(input: {
  dueDate: string;
  status?: string;
  progress?: number;
  assigneeId?: number | null;
}): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO tasks (project_id, title, assignee_id, status, priority, due_date, weight, progress)
     VALUES (1, 'producer test task', $1, $2, 'medium', $3, 1, $4)
     RETURNING id`,
    [input.assigneeId ?? null, input.status ?? 'todo', input.dueDate, input.progress ?? 0],
  );
  return rows[0]!.id;
}

async function outboxRowFor(taskId: number): Promise<{ status: string; event_date: string } | null> {
  const { rows } = await client.query(
    `SELECT status, event_date::text FROM outbox WHERE event_type = 'TASK_OVERDUE' AND entity_id = $1`,
    [taskId],
  );
  return rows[0] ?? null;
}

describe('runOverdueEscalation (producer)', () => {
  test('creates exactly one outbox row per overdue incomplete task; excludes due-exactly-on-asOf and done tasks', async () => {
    const overdueTaskId = await insertTask({ dueDate: '2025-12-01' });
    const dueExactlyOnAsOfId = await insertTask({ dueDate: ASOF });
    const doneTaskId = await insertTask({ dueDate: '2025-12-01', status: 'done', progress: 100 });

    const result = await runOverdueEscalation({ asOf: ASOF, trigger: 'manual' });

    expect(result.itemsFound).toBe(1);
    expect(result.itemsCreated).toBe(1);

    const overdueRow = await outboxRowFor(overdueTaskId);
    expect(overdueRow).not.toBeNull();
    expect(overdueRow!.status).toBe('pending');
    expect(overdueRow!.event_date).toBe(ASOF);

    expect(await outboxRowFor(dueExactlyOnAsOfId)).toBeNull();
    expect(await outboxRowFor(doneTaskId)).toBeNull();
  });

  test('running twice the same day is a no-op the second time', async () => {
    const taskId = await insertTask({ dueDate: '2025-11-01' });

    const first = await runOverdueEscalation({ asOf: ASOF, trigger: 'manual' });
    expect(first.itemsCreated).toBeGreaterThanOrEqual(1);

    const outboxCountAfterFirst = await client.query(
      `SELECT count(*) FROM outbox WHERE event_type = 'TASK_OVERDUE' AND entity_id = $1`,
      [taskId],
    );

    const second = await runOverdueEscalation({ asOf: ASOF, trigger: 'manual' });
    expect(second.itemsCreated).toBe(0);
    expect(second.itemsFound).toBe(first.itemsFound);

    const outboxCountAfterSecond = await client.query(
      `SELECT count(*) FROM outbox WHERE event_type = 'TASK_OVERDUE' AND entity_id = $1`,
      [taskId],
    );
    expect(outboxCountAfterSecond.rows[0].count).toBe(outboxCountAfterFirst.rows[0].count);

    const { rows: runs } = await client.query(
      `SELECT status FROM automation_runs WHERE job_name = 'overdue-escalation' ORDER BY id DESC LIMIT 2`,
    );
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === 'success')).toBe(true);
  });

  test('two concurrent runs never create duplicate outbox rows for the same task/day', async () => {
    const taskId = await insertTask({ dueDate: '2025-10-01' });

    const results = await Promise.allSettled([
      runOverdueEscalation({ asOf: ASOF, trigger: 'manual' }),
      runOverdueEscalation({ asOf: ASOF, trigger: 'manual' }),
    ]);

    // The advisory lock means at most one of the two actually scans and
    // inserts; a second concurrent caller may be rejected outright with
    // JOB_ALREADY_RUNNING, or may run after the first and find nothing
    // left to create (unique-key no-op) — either is correct.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect((r.reason as { code?: string }).code).toBe('IDEMPOTENCY_CONFLICT');
      }
    }

    const { rows } = await client.query(
      `SELECT count(*) FROM outbox WHERE event_type = 'TASK_OVERDUE' AND entity_id = $1`,
      [taskId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  test('a forced producer error leaves an automation_runs row failed with an error message', async () => {
    const { rows: before } = await client.query(`SELECT count(*) FROM automation_runs`);

    // An invalid asOf isn't caught by this internal function (only the
    // HTTP layer validates it via resolveAsOf) — it reaches the `$1::date`
    // cast inside the transaction and throws a real Postgres error, which
    // is exactly the kind of unexpected failure the run row must capture.
    await expect(runOverdueEscalation({ asOf: 'not-a-date', trigger: 'manual' })).rejects.toThrow();

    const { rows: after } = await client.query(`SELECT count(*) FROM automation_runs`);
    expect(Number(after[0].count)).toBe(Number(before[0].count) + 1);

    const { rows: lastRun } = await client.query(
      `SELECT status, error FROM automation_runs ORDER BY id DESC LIMIT 1`,
    );
    expect(lastRun[0].status).toBe('failed');
    expect(lastRun[0].error).toBeTruthy();
  });
});

describe('automation run trigger (migration 016)', () => {
  test('a scheduled pass is stored as schedule; an admin Run now is stored and listed as manual', async () => {
    const scheduled = await runOverdueEscalation({ asOf: ASOF, trigger: 'schedule' });
    const { rows } = await client.query<{ trigger: string }>(
      `SELECT trigger FROM automation_runs WHERE id = $1`,
      [scheduled.runId],
    );
    expect(rows[0]!.trigger).toBe('schedule');

    const { rows: admins } = await client.query<{ email: string }>(
      `SELECT email FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1`,
    );
    const admin = await loginAs(admins[0]!.email);
    const run = await admin.agent.post('/api/v1/admin/automation/overdue-escalation/run');
    expect(run.status).toBe(200);

    const list = await admin.agent.get('/api/v1/admin/automation/runs').query({ pageSize: 2 });
    expect(list.status).toBe(200);
    // Newest first: the manual run, then the scheduled one above.
    expect(list.body.data[0]).toMatchObject({ id: run.body.data.run.runId, trigger: 'manual' });
    expect(list.body.data[1]).toMatchObject({ id: scheduled.runId, trigger: 'schedule' });
  });
});
