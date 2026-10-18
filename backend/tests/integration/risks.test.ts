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

async function anyMemberOf(projectId: number): Promise<number> {
  const { rows } = await client.query<{ user_id: number }>(
    'SELECT user_id FROM project_members WHERE project_id = $1 ORDER BY user_id LIMIT 1',
    [projectId],
  );
  return rows[0]!.user_id;
}

describe('GET /api/v1/risks/high-exposure', () => {
  test('includes the seeded open high-exposure risk and excludes the closed one', async () => {
    const admin = await asAdmin();
    const openProjectId = await projectIdByCode('PRJ-005');
    const closedProjectId = await projectIdByCode('PRJ-002');

    const { rows: openRisk } = await client.query<{ id: number }>(
      `SELECT id FROM risks WHERE project_id = $1 AND status = 'open' AND score >= 15`,
      [openProjectId],
    );
    const { rows: closedRisk } = await client.query<{ id: number }>(
      `SELECT id FROM risks WHERE project_id = $1 AND status = 'closed' AND score >= 15`,
      [closedProjectId],
    );
    expect(openRisk.length).toBe(1);
    expect(closedRisk.length).toBe(1);

    const res = await admin.agent.get('/api/v1/risks/high-exposure').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((r) => r.id);
    expect(ids).toContain(openRisk[0]!.id);
    expect(ids).not.toContain(closedRisk[0]!.id);
    for (const row of res.body.data) {
      expect(row.status).not.toBe('closed');
      expect(row.score).toBeGreaterThanOrEqual(15);
    }
  });

  test('is scoped: a contributor only sees high-exposure risks on their own member projects', async () => {
    const member = await asProjectMember();
    const res = await member.agent.get('/api/v1/risks/high-exposure').query({ pageSize: 100 });
    expect(res.status).toBe(200);

    const { rows: scopedProjectIds } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM project_members WHERE user_id = $1',
      [member.user.id],
    );
    const allowed = new Set(scopedProjectIds.map((r) => r.project_id));
    for (const row of res.body.data) {
      expect(allowed.has(row.projectId)).toBe(true);
    }
  });
});

describe('GET /api/v1/risks (cross-portfolio)', () => {
  test('a contributor sees only risks on their member projects', async () => {
    const member = await asProjectMember();
    const { rows: scopedProjectIds } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM project_members WHERE user_id = $1',
      [member.user.id],
    );
    const { rows: expected } = await client.query<{ id: number }>(
      'SELECT id FROM risks WHERE project_id = ANY($1::bigint[])',
      [scopedProjectIds.map((r) => r.project_id)],
    );

    const res = await member.agent.get('/api/v1/risks').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual(expected.map((r) => r.id).sort((a, b) => a - b));
  });

  test('admin sees every seeded risk (24: 8 projects x 3)', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/risks').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(24);
  });

  test('filters by projectId and departmentId', async () => {
    const admin = await asAdmin();
    const projectId = await projectIdByCode('PRJ-001');
    const byProject = await admin.agent.get('/api/v1/risks').query({ projectId, pageSize: 100 });
    expect(byProject.status).toBe(200);
    for (const row of byProject.body.data) expect(row.projectId).toBe(projectId);

    const { rows } = await client.query<{ department_id: number }>('SELECT department_id FROM projects WHERE id = $1', [
      projectId,
    ]);
    const byDept = await admin.agent.get('/api/v1/risks').query({ departmentId: rows[0]!.department_id, pageSize: 100 });
    expect(byDept.status).toBe(200);
    expect(byDept.body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/projects/:projectId/risks', () => {
  test('non-member contributor gets 404', async () => {
    const nonMember = await asNonMember();
    const pm = await asProjectManager();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/risks`);
    expect(res.status).toBe(404);
  });

  test('view member can list, rows include exposure band', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/risks`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(['high', 'medium', 'low']).toContain(row.exposure);
    }
  });
});

describe('GET /api/v1/risks/:id', () => {
  test('view access via the risk\'s project; non-member gets 404', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query<{ id: number }>('SELECT id FROM risks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const riskId = rows[0]!.id;

    const ok = await pm.agent.get(`/api/v1/risks/${riskId}`);
    expect(ok.status).toBe(200);

    const nonMember = await asNonMember();
    const blocked = await nonMember.agent.get(`/api/v1/risks/${riskId}`);
    expect(blocked.status).toBe(404);
  });
});

describe('POST /api/v1/projects/:projectId/risks', () => {
  test('contributor (member) is forbidden', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const ownerId = await anyMemberOf(pm.projectId);
    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/risks`).send({
      type: 'risk',
      title: 'x',
      ownerId,
      probability: 2,
      impact: 2,
    });
    expect(res.status).toBe(403);
  });

  test('probability 6 is a validation failure (400)', async () => {
    const pm = await asProjectManager();
    const ownerId = await anyMemberOf(pm.projectId);
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/risks`).send({
      type: 'risk',
      title: 'x',
      ownerId,
      probability: 6,
      impact: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('score >= 15 without mitigation returns 422', async () => {
    const pm = await asProjectManager();
    const ownerId = await anyMemberOf(pm.projectId);
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/risks`).send({
      type: 'risk',
      title: `High risk ${randomUUID()}`,
      ownerId,
      probability: 5,
      impact: 5,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('owner must be a project member (422)', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/risks`).send({
      type: 'risk',
      title: `Risk ${randomUUID()}`,
      ownerId: nonMember.user.id,
      probability: 2,
      impact: 2,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('manager creates a risk with mitigation: 201 and audited', async () => {
    const pm = await asProjectManager();
    const ownerId = await anyMemberOf(pm.projectId);
    const title = `High risk ${randomUUID()}`;

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/risks`).send({
      type: 'risk',
      title,
      ownerId,
      probability: 5,
      impact: 5,
      mitigation: 'Weekly review with vendor',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.score).toBe(25);
    expect(res.body.data.exposure).toBe('high');
    expect(res.body.data.status).toBe('open');

    const { rows } = await client.query(`SELECT * FROM audit_events WHERE action = 'risk.create' AND entity_id = $1`, [
      res.body.data.id,
    ]);
    expect(rows.length).toBe(1);
  });
});

describe('PATCH /api/v1/risks/:id', () => {
  test('contributor (member) is forbidden', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const { rows } = await client.query('SELECT id, version FROM risks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const risk = rows[0];

    const res = await member.agent.patch(`/api/v1/risks/${risk.id}`).send({ title: 'x', version: risk.version });
    expect(res.status).toBe(403);
  });

  test('closing sets closed_at; reopening clears it', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(`SELECT * FROM risks WHERE project_id = $1 AND status <> 'closed' LIMIT 1`, [
      pm.projectId,
    ]);
    const risk = rows[0];
    expect(risk).toBeDefined();

    const closed = await pm.agent.patch(`/api/v1/risks/${risk.id}`).send({ status: 'closed', version: risk.version });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');
    expect(closed.body.data.closedAt).not.toBeNull();

    const reopened = await pm.agent
      .patch(`/api/v1/risks/${risk.id}`)
      .send({ status: 'open', version: closed.body.data.version });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.status).toBe('open');
    expect(reopened.body.data.closedAt).toBeNull();
  });

  test('raising probability/impact into high exposure without mitigation returns 422', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT * FROM risks WHERE project_id = $1 AND (mitigation IS NULL OR mitigation = '') AND probability * impact < 15 LIMIT 1`,
      [pm.projectId],
    );
    const risk = rows[0];
    expect(risk).toBeDefined();

    const res = await pm.agent
      .patch(`/api/v1/risks/${risk.id}`)
      .send({ probability: 5, impact: 5, version: risk.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('raising into high exposure with mitigation supplied in the same patch succeeds', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query(
      `SELECT * FROM risks WHERE project_id = $1 AND (mitigation IS NULL OR mitigation = '') AND probability * impact < 15 LIMIT 1`,
      [pm.projectId],
    );
    const risk = rows[0];
    expect(risk).toBeDefined();

    const res = await pm.agent
      .patch(`/api/v1/risks/${risk.id}`)
      .send({ probability: 5, impact: 5, mitigation: 'Escalated to steering committee', version: risk.version });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(25);
    expect(res.body.data.exposure).toBe('high');
  });

  test('stale version returns 409', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query('SELECT id, version FROM risks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const risk = rows[0];

    const first = await pm.agent.patch(`/api/v1/risks/${risk.id}`).send({ title: 'Renamed Once', version: risk.version });
    expect(first.status).toBe(200);

    const second = await pm.agent.patch(`/api/v1/risks/${risk.id}`).send({ title: 'Renamed Twice', version: risk.version });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('non-member gets 404', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const { rows } = await client.query('SELECT id, version FROM risks WHERE project_id = $1 LIMIT 1', [pm.projectId]);
    const risk = rows[0];

    const res = await nonMember.agent.patch(`/api/v1/risks/${risk.id}`).send({ title: 'x', version: risk.version });
    expect(res.status).toBe(404);
  });
});
