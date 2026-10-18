import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { asAdmin, asNonMember, asProjectManager, asProjectMember } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';

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

async function projectIdByCode(code: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>('SELECT id FROM projects WHERE code = $1', [code]);
  return rows[0]!.id;
}

async function projectDates(projectId: number): Promise<{ startDate: string; endDate: string }> {
  const { rows } = await client.query<{ start_date: string; end_date: string }>(
    'SELECT start_date, end_date FROM projects WHERE id = $1',
    [projectId],
  );
  return { startDate: rows[0]!.start_date, endDate: rows[0]!.end_date };
}

describe('GET /api/v1/projects/:projectId/tasks', () => {
  test('non-member contributor gets 404', async () => {
    const nonMember = await asNonMember();
    const pm = await asProjectManager();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/tasks`);
    expect(res.status).toBe(404);
  });

  test('view member can list and rows include computed fields', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/tasks`).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row).toMatchObject({
        id: expect.any(Number),
        projectId: pm.projectId,
        status: expect.any(String),
        priority: expect.any(String),
        isOverdue: expect.any(Boolean),
        isDueSoon: expect.any(Boolean),
      });
    }
  });

  test('overdue=true returns the seeded overdue tasks (>= 5) and excludes the task due exactly on 2026-09-30', async () => {
    const admin = await asAdmin();
    const projectId = await projectIdByCode('PRJ-001');

    const { rows: expected } = await client.query<{ id: number }>(
      `SELECT id FROM tasks WHERE project_id = $1 AND status <> 'done' AND due_date < '2026-09-30'`,
      [projectId],
    );
    expect(expected.length).toBeGreaterThanOrEqual(5);

    const res = await admin.agent.get(`/api/v1/projects/${projectId}/tasks`).query({ overdue: 'true', pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((t) => t.id).sort((a, b) => a - b);
    expect(ids).toEqual(expected.map((r) => r.id).sort((a, b) => a - b));

    const { rows: cutoffTask } = await client.query<{ id: number }>(
      `SELECT id FROM tasks WHERE project_id = $1 AND due_date = '2026-09-30'`,
      [projectId],
    );
    expect(cutoffTask.length).toBe(1);
    expect(ids).not.toContain(cutoffTask[0]!.id);
  });

  test('unassigned=true returns the seeded unassigned task', async () => {
    const admin = await asAdmin();
    const projectId = await projectIdByCode('PRJ-003');

    const res = await admin.agent.get(`/api/v1/projects/${projectId}/tasks`).query({ unassigned: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].assigneeId).toBeNull();
  });

  test('sorts by dueDate', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/tasks`).query({ sort: 'dueDate', order: 'asc', pageSize: 100 });
    expect(res.status).toBe(200);
    const dates = (res.body.data as { dueDate: string }[]).map((t) => t.dueDate);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('GET /api/v1/tasks/mine', () => {
  test('returns only the caller\'s own assigned tasks', async () => {
    const member = await asProjectMember();
    const res = await member.agent.get('/api/v1/tasks/mine').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.assigneeId).toBe(member.user.id);
    }
  });
});

describe('GET /api/v1/tasks/:id', () => {
  test('view access via the task\'s project; non-member gets 404', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query<{ id: number }>('SELECT id FROM tasks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const taskId = rows[0]!.id;

    const ok = await pm.agent.get(`/api/v1/tasks/${taskId}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(taskId);

    const nonMember = await asNonMember();
    const blocked = await nonMember.agent.get(`/api/v1/tasks/${taskId}`);
    expect(blocked.status).toBe(404);
  });
});

describe('POST /api/v1/projects/:projectId/tasks', () => {
  test('contributor is forbidden', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title: 'x',
      priority: 'medium',
      dueDate: endDate,
      weight: 1,
    });
    expect(res.status).toBe(403);
  });

  test('validation failure returns 400', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('assigning a non-member returns 422', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const { endDate } = await projectDates(pm.projectId);

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title: `Test Task ${randomUUID()}`,
      priority: 'medium',
      dueDate: endDate,
      weight: 1,
      assigneeId: nonMember.user.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('due date outside project dates returns 422', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const pastEnd = new Date(endDate);
    pastEnd.setDate(pastEnd.getDate() + 30);

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title: `Test Task ${randomUUID()}`,
      priority: 'medium',
      dueDate: pastEnd.toISOString().slice(0, 10),
      weight: 1,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('manager creates a task: 201 and audited', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const title = `Test Task ${randomUUID()}`;

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title,
      priority: 'high',
      dueDate: endDate,
      weight: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe(title);
    expect(res.body.data.status).toBe('todo');
    expect(res.body.data.progress).toBe(0);

    const { rows } = await client.query(`SELECT * FROM audit_events WHERE action = 'task.create' AND entity_id = $1`, [
      res.body.data.id,
    ]);
    expect(rows.length).toBe(1);
  });

  test('status: done at create normalises progress to 100', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title: `Test Task ${randomUUID()}`,
      priority: 'low',
      dueDate: endDate,
      weight: 1,
      status: 'done',
      progress: 60,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('done');
    expect(res.body.data.progress).toBe(100);
    expect(res.body.data.completedAt).not.toBeNull();
  });
});

describe('PATCH /api/v1/tasks/:id', () => {
  async function findMemberTask(projectId: number, assigneeId: number, statusNot: string | null = 'done') {
    const condition = statusNot ? `AND status <> $3` : '';
    const params = statusNot ? [projectId, assigneeId, statusNot] : [projectId, assigneeId];
    const { rows } = await client.query(
      `SELECT * FROM tasks WHERE project_id = $1 AND assignee_id = $2 ${condition} ORDER BY id LIMIT 1`,
      params,
    );
    return rows[0];
  }

  test("contributor updates own task's progress: 200, version increments, project progress recomputed", async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const task = await findMemberTask(pm.projectId, member.user.id);
    expect(task).toBeDefined();

    const res = await member.agent.patch(`/api/v1/tasks/${task.id}`).send({ progress: 40, version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBe(40);
    expect(res.body.data.version).toBe(task.version + 1);

    const { rows } = await client.query<{ weight: string; progress: number }>(
      'SELECT weight, progress FROM tasks WHERE project_id = $1',
      [pm.projectId],
    );
    const totalWeight = rows.reduce((sum, r) => sum + parseFloat(r.weight), 0);
    const weightedSum = rows.reduce((sum, r) => sum + parseFloat(r.weight) * r.progress, 0);
    const expected = totalWeight === 0 ? 0 : weightedSum / totalWeight;

    const detail = await pm.agent.get(`/api/v1/projects/${pm.projectId}`);
    expect(detail.body.data.progressPct).toBeCloseTo(expected, 1);
  });

  test('contributor changing dueDate or assigneeId on own task is forbidden with offending fields in details', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const task = await findMemberTask(pm.projectId, member.user.id);

    const res = await member.agent
      .patch(`/api/v1/tasks/${task.id}`)
      .send({ dueDate: '2026-12-01', assigneeId: member.user.id, version: task.version });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.details.fields).toEqual(expect.arrayContaining(['dueDate', 'assigneeId']));
  });

  test("updating another member's task is forbidden", async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const { rows: otherRows } = await client.query<{ assignee_id: number }>(
      `SELECT DISTINCT assignee_id FROM tasks WHERE project_id = $1 AND assignee_id IS NOT NULL AND assignee_id <> $2 LIMIT 1`,
      [pm.projectId, member.user.id],
    );
    expect(otherRows.length).toBe(1);
    const otherTask = await findMemberTask(pm.projectId, otherRows[0]!.assignee_id, null);
    expect(otherTask).toBeDefined();

    const res = await member.agent.patch(`/api/v1/tasks/${otherTask.id}`).send({ progress: 50, version: otherTask.version });
    expect(res.status).toBe(403);
  });

  test('task in a non-member project returns 404', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const { rows } = await client.query('SELECT id, version FROM tasks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const task = rows[0];

    const res = await nonMember.agent.patch(`/api/v1/tasks/${task.id}`).send({ progress: 10, version: task.version });
    expect(res.status).toBe(404);
  });

  test('stale version returns 409', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query('SELECT id, version FROM tasks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const task = rows[0];

    const first = await pm.agent.patch(`/api/v1/tasks/${task.id}`).send({ priority: 'high', version: task.version });
    expect(first.status).toBe(200);

    const second = await pm.agent.patch(`/api/v1/tasks/${task.id}`).send({ priority: 'low', version: task.version });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('status=done with progress 60 is normalised to 100, and completedAt is set', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT * FROM tasks WHERE project_id = $1 AND status <> 'done' ORDER BY id LIMIT 1`,
      [pm.projectId],
    );
    const task = rows[0];

    const res = await pm.agent.patch(`/api/v1/tasks/${task.id}`).send({ status: 'done', progress: 60, version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('done');
    expect(res.body.data.progress).toBe(100);
    expect(res.body.data.completedAt).not.toBeNull();
  });

  test('moving progress below 100 implicitly leaves done and clears completedAt', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(`SELECT * FROM tasks WHERE project_id = $1 AND status = 'done' ORDER BY id LIMIT 1`, [
      pm.projectId,
    ]);
    const task = rows[0];
    expect(task).toBeDefined();

    const res = await pm.agent.patch(`/api/v1/tasks/${task.id}`).send({ progress: 50, version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
    expect(res.body.data.progress).toBe(50);
    expect(res.body.data.completedAt).toBeNull();
  });

  test('assigning a non-member returns 422', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const { rows } = await client.query('SELECT id, version FROM tasks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const task = rows[0];

    const res = await pm.agent.patch(`/api/v1/tasks/${task.id}`).send({ assigneeId: nonMember.user.id, version: task.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('DELETE /api/v1/tasks/:id', () => {
  test('cannot delete a task with progress or non-todo status', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE project_id = $1 AND (progress > 0 OR status <> 'todo') LIMIT 1`,
      [pm.projectId],
    );
    const res = await pm.agent.delete(`/api/v1/tasks/${rows[0]!.id}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('deletes a fresh (todo, progress 0) task and audits it', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);

    const created = await pm.agent.post(`/api/v1/projects/${pm.projectId}/tasks`).send({
      title: `Deletable ${randomUUID()}`,
      priority: 'low',
      dueDate: endDate,
      weight: 1,
    });
    expect(created.status).toBe(201);

    const res = await pm.agent.delete(`/api/v1/tasks/${created.body.data.id}`);
    expect(res.status).toBe(204);

    const { rows } = await client.query(`SELECT * FROM audit_events WHERE action = 'task.delete' AND entity_id = $1`, [
      created.body.data.id,
    ]);
    expect(rows.length).toBe(1);
  });

  test('contributor is forbidden from deleting', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE project_id = $1 AND status = 'todo' AND progress = 0 LIMIT 1`,
      [pm.projectId],
    );
    if (rows.length === 0) return;
    const res = await member.agent.delete(`/api/v1/tasks/${rows[0]!.id}`);
    expect(res.status).toBe(403);
  });
});
