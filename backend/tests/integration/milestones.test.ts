import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { asNonMember, asProjectManager, asProjectMember } from '../helpers/auth.js';
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

async function projectDates(projectId: number): Promise<{ startDate: string; endDate: string }> {
  const { rows } = await client.query<{ start_date: string; end_date: string }>(
    'SELECT start_date, end_date FROM projects WHERE id = $1',
    [projectId],
  );
  return { startDate: rows[0]!.start_date, endDate: rows[0]!.end_date };
}

describe('GET /api/v1/projects/:projectId/milestones', () => {
  test('non-member contributor gets 404', async () => {
    const nonMember = await asNonMember();
    const pm = await asProjectManager();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/milestones`);
    expect(res.status).toBe(404);
  });

  test('view member can list, rows include isOverdue and daysToDue', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/milestones`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row).toMatchObject({
        id: expect.any(Number),
        projectId: pm.projectId,
        isOverdue: expect.any(Boolean),
        daysToDue: expect.any(Number),
      });
    }
  });

  test('dueWithinDays=14 includes a milestone just inside the window and excludes one just outside it', async () => {
    // The seeded milestones (3 per project, spread at 15%/50%/100% of the
    // project's span) never happen to land inside a 14-day window after the
    // reporting date, so this creates two fixtures that pin the boundary
    // precisely instead of relying on data that doesn't exercise it.
    const pm = await asProjectManager();
    const inWindow = await pm.agent
      .post(`/api/v1/projects/${pm.projectId}/milestones`)
      .send({ name: `Inside window ${randomUUID()}`, dueDate: '2026-10-10' });
    const outsideWindow = await pm.agent
      .post(`/api/v1/projects/${pm.projectId}/milestones`)
      .send({ name: `Outside window ${randomUUID()}`, dueDate: '2026-11-15' });
    expect(inWindow.status).toBe(201);
    expect(outsideWindow.status).toBe(201);

    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/milestones`).query({ dueWithinDays: 14 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((m) => m.id);
    expect(ids).toContain(inWindow.body.data.id);
    expect(ids).not.toContain(outsideWindow.body.data.id);
  });
});

describe('POST /api/v1/projects/:projectId/milestones', () => {
  test('contributor is forbidden', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/milestones`).send({ name: 'x', dueDate: endDate });
    expect(res.status).toBe(403);
  });

  test('validation failure returns 400', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/milestones`).send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('due date outside project dates returns 422', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const pastEnd = new Date(endDate);
    pastEnd.setDate(pastEnd.getDate() + 30);

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/milestones`).send({
      name: `Milestone ${randomUUID()}`,
      dueDate: pastEnd.toISOString().slice(0, 10),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('achieved without achievedDate returns 422', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/milestones`).send({
      name: `Milestone ${randomUUID()}`,
      dueDate: endDate,
      status: 'achieved',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('manager creates a milestone: 201 and audited', async () => {
    const pm = await asProjectManager();
    const { endDate } = await projectDates(pm.projectId);
    const name = `Milestone ${randomUUID()}`;

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/milestones`).send({ name, dueDate: endDate });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(name);
    expect(res.body.data.status).toBe('planned');

    const { rows } = await client.query(`SELECT * FROM audit_events WHERE action = 'milestone.create' AND entity_id = $1`, [
      res.body.data.id,
    ]);
    expect(rows.length).toBe(1);
  });
});

describe('PATCH /api/v1/milestones/:id', () => {
  test('stale version returns 409', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query('SELECT id, version FROM milestones WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const milestone = rows[0];

    const first = await pm.agent.patch(`/api/v1/milestones/${milestone.id}`).send({ name: 'Renamed Once', version: milestone.version });
    expect(first.status).toBe(200);

    const second = await pm.agent.patch(`/api/v1/milestones/${milestone.id}`).send({ name: 'Renamed Twice', version: milestone.version });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('achieved without achievedDate returns 422', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT id, version FROM milestones WHERE project_id = $1 AND status = 'planned' LIMIT 1`,
      [pm.projectId],
    );
    const milestone = rows[0];
    expect(milestone).toBeDefined();

    const res = await pm.agent.patch(`/api/v1/milestones/${milestone.id}`).send({ status: 'achieved', version: milestone.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('achieving with a valid achievedDate succeeds and is audited', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT id, version FROM milestones WHERE project_id = $1 AND status = 'planned' LIMIT 1`,
      [pm.projectId],
    );
    const milestone = rows[0];

    const res = await pm.agent
      .patch(`/api/v1/milestones/${milestone.id}`)
      .send({ status: 'achieved', achievedDate: '2026-09-30', version: milestone.version });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('achieved');
    expect(res.body.data.achievedDate).toBe('2026-09-30');

    const { rows: auditRows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'milestone.update' AND entity_id = $1`,
      [milestone.id],
    );
    expect(auditRows.length).toBe(1);
  });

  test('a view-only member is forbidden; a non-member gets 404', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const nonMember = await asNonMember();
    const { rows } = await client.query('SELECT id, version FROM milestones WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const milestone = rows[0];

    const memberRes = await member.agent.patch(`/api/v1/milestones/${milestone.id}`).send({ name: 'x', version: milestone.version });
    expect(memberRes.status).toBe(403);

    const nonMemberRes = await nonMember.agent
      .patch(`/api/v1/milestones/${milestone.id}`)
      .send({ name: 'x', version: milestone.version });
    expect(nonMemberRes.status).toBe(404);
  });
});
