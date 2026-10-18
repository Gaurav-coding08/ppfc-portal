import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { asAdmin, asNonMember, asProjectManager, asProjectMember, loginAs, type LoggedInUser } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';
import * as projectsService from '../../src/modules/projects/projects.service.js';
import type { AuthUser } from '../../src/middleware/authenticate.js';

let client: pg.Client;

beforeAll(async () => {
  // This file creates projects and members — start from a known-clean seed.
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

async function anyDepartmentId(): Promise<number> {
  const { rows } = await client.query<{ id: number }>('SELECT id FROM departments ORDER BY id LIMIT 1');
  return rows[0]!.id;
}

// A project_manager who owns no seeded project — safe to use as owner/actor
// for tests that create/mutate projects without disturbing the shared
// asProjectManager()/asProjectMember()/asNonMember() fixtures other tests
// in this file (and other files) rely on.
async function asUnrelatedPm(): Promise<LoggedInUser> {
  return loginAs('anderson.streich@ppfc.demo');
}

async function createProjectAs(
  pm: LoggedInUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; version: number; code: string }> {
  const departmentId = await anyDepartmentId();
  const res = await pm.agent.post('/api/v1/projects').send({
    name: `Test Project ${randomUUID()}`,
    departmentId,
    ownerId: pm.user.id,
    status: 'planning',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    initialBudget: 1000,
    ...overrides,
  });
  if (res.status !== 201) {
    throw new Error(`createProjectAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

describe('GET /api/v1/projects scoping', () => {
  test('admin sees all 8+ seeded projects', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/projects').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(8);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(8);
  });

  test('contributor sees exactly their own member projects', async () => {
    const member = await asProjectMember();
    const { rows } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM project_members WHERE user_id = $1',
      [member.user.id],
    );
    const expectedIds = rows.map((r) => r.project_id).sort((a, b) => a - b);

    const res = await member.agent.get('/api/v1/projects').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((p) => p.id).sort((a, b) => a - b);
    expect(ids).toEqual(expectedIds);
  });

  test('project manager sees owned + managed + member projects', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query<{ id: number }>(
      `SELECT id FROM projects WHERE owner_id = $1
       UNION
       SELECT project_id FROM project_members WHERE user_id = $1`,
      [pm.user.id],
    );
    const expectedIds = rows.map((r) => r.id).sort((a, b) => a - b);

    const res = await pm.agent.get('/api/v1/projects').query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: number }[]).map((p) => p.id).sort((a, b) => a - b);
    expect(ids).toEqual(expectedIds);
  });
});

describe('GET /api/v1/projects filters, sort and pagination', () => {
  test('filters by departmentId, status and ownerId', async () => {
    const admin = await asAdmin();

    const byDept = await admin.agent.get('/api/v1/projects').query({ departmentId: 1, pageSize: 100 });
    expect(byDept.status).toBe(200);
    for (const row of byDept.body.data) expect(row.department.id).toBe(1);

    const byStatus = await admin.agent.get('/api/v1/projects').query({ status: 'planning,on_hold', pageSize: 100 });
    expect(byStatus.status).toBe(200);
    for (const row of byStatus.body.data) expect(['planning', 'on_hold']).toContain(row.status);

    const pm = await asProjectManager();
    const byOwner = await admin.agent.get('/api/v1/projects').query({ ownerId: pm.user.id, pageSize: 100 });
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.length).toBeGreaterThan(0);
    for (const row of byOwner.body.data) expect(row.owner.id).toBe(pm.user.id);
  });

  test('filters by startFrom/endTo date range', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/projects').query({ startFrom: '2026-03-01', endTo: '2026-12-31', pageSize: 100 });
    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.startDate >= '2026-03-01').toBe(true);
      expect(row.endDate <= '2026-12-31').toBe(true);
    }
  });

  test('sorts by name and paginates with correct meta', async () => {
    const admin = await asAdmin();
    const sorted = await admin.agent.get('/api/v1/projects').query({ sort: 'name', order: 'asc', pageSize: 100 });
    const names = (sorted.body.data as { name: string }[]).map((p) => p.name);
    const expectedNames = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expectedNames);

    const page1 = await admin.agent.get('/api/v1/projects').query({ page: 1, pageSize: 2, sort: 'code' });
    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(2);
    expect(page1.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(page1.body.meta.total).toBeGreaterThanOrEqual(8);
  });
});

describe('GET /api/v1/projects/:id access', () => {
  test('non-member contributor gets 404', async () => {
    const nonMember = await asNonMember();
    const pm = await asProjectManager();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}`);
    expect(res.status).toBe(404);
  });

  test('member contributor can view but PATCH is forbidden (403)', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();

    const view = await member.agent.get(`/api/v1/projects/${pm.projectId}`);
    expect(view.status).toBe(200);

    const patch = await member.agent.patch(`/api/v1/projects/${pm.projectId}`).send({ name: 'x', version: 1 });
    expect(patch.status).toBe(403);
  });

  test('progressPct equals a hand-computed weighted average from seeded tasks', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query<{ weight: string; progress: number }>(
      'SELECT weight, progress FROM tasks WHERE project_id = $1',
      [pm.projectId],
    );
    const totalWeight = rows.reduce((sum, r) => sum + parseFloat(r.weight), 0);
    const weightedSum = rows.reduce((sum, r) => sum + parseFloat(r.weight) * r.progress, 0);
    const expected = totalWeight === 0 ? 0 : weightedSum / totalWeight;

    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.progressPct).toBeCloseTo(expected, 1);
  });

  test('detail includes counts and budget headline', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.counts).toMatchObject({
      taskCount: expect.any(Number),
      overdueTaskCount: expect.any(Number),
      openRiskCount: expect.any(Number),
      pendingCrCount: expect.any(Number),
    });
    expect(res.body.data.budget.currency).toBe('AED');
    expect(typeof res.body.data.deliveryStatus).toBe('string');
  });
});

describe('POST /api/v1/projects', () => {
  test('contributor is forbidden', async () => {
    const contributor = await asProjectMember();
    const departmentId = await anyDepartmentId();
    const res = await contributor.agent
      .post('/api/v1/projects')
      .send({ name: 'x', departmentId, ownerId: contributor.user.id, status: 'planning', startDate: '2026-01-01', endDate: '2026-12-31', initialBudget: 0 });
    expect(res.status).toBe(403);
  });

  test('validation failure returns 400', async () => {
    const pm = await asUnrelatedPm();
    const res = await pm.agent.post('/api/v1/projects').send({ name: '', departmentId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('PM creates a project: 201, owner membership + budget + audit rows exist in one transaction', async () => {
    const pm = await asUnrelatedPm();
    const departmentId = await anyDepartmentId();

    const res = await pm.agent.post('/api/v1/projects').send({
      name: 'Atomic Create Test',
      description: 'desc',
      departmentId,
      ownerId: pm.user.id,
      status: 'planning',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      initialBudget: 50000,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^PRJ-\d+$/);
    const projectId = res.body.data.id;

    const { rows: memberRows } = await client.query(
      `SELECT member_role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, pm.user.id],
    );
    expect(memberRows[0]?.member_role).toBe('manager');

    const { rows: budgetRows } = await client.query(
      `SELECT initial_amount, approved_by FROM project_budgets WHERE project_id = $1`,
      [projectId],
    );
    expect(parseFloat(budgetRows[0]!.initial_amount)).toBe(50000);
    expect(budgetRows[0]!.approved_by).toBe(pm.user.id);

    const { rows: auditRows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'project.create' AND entity_id = $1`,
      [projectId],
    );
    expect(auditRows.length).toBe(1);
  });

  test('transaction rolls back entirely when the budget insert fails (DB-level CHECK)', async () => {
    const pm = await asUnrelatedPm();
    const departmentId = await anyDepartmentId();
    const uniqueName = `Rollback Test ${randomUUID()}`;

    // Calls the service directly, bypassing the zod body schema (which
    // would itself reject a negative amount), to exercise the "one atomic
    // transaction" guarantee: a failure on ANY insert inside it — here the
    // budget's `initial_amount >= 0` CHECK — must leave no project row.
    await expect(
      projectsService.createProject(
        pm.user as unknown as AuthUser,
        {
          name: uniqueName,
          departmentId,
          ownerId: pm.user.id,
          status: 'planning',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          initialBudget: -100,
        },
        randomUUID(),
      ),
    ).rejects.toThrow();

    const { rows } = await client.query('SELECT 1 FROM projects WHERE name = $1', [uniqueName]);
    expect(rows.length).toBe(0);
  });

  test('a PM creating a project owned by someone else returns 403', async () => {
    const pmA = await asUnrelatedPm();
    const pmB = await asProjectManager();
    const departmentId = await anyDepartmentId();

    const res = await pmA.agent.post('/api/v1/projects').send({
      name: 'Should Not Be Created',
      departmentId,
      ownerId: pmB.user.id,
      status: 'planning',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      initialBudget: 1000,
    });
    expect(res.status).toBe(403);
  });

  test('admin may create a project owned by any active PM', async () => {
    const admin = await asAdmin();
    const pm = await asProjectManager();
    const departmentId = await anyDepartmentId();

    const res = await admin.agent.post('/api/v1/projects').send({
      name: 'Admin Created For PM',
      departmentId,
      ownerId: pm.user.id,
      status: 'planning',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      initialBudget: 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.owner.id).toBe(pm.user.id);
  });
});

describe('PATCH /api/v1/projects/:id', () => {
  test('stale version returns 409', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);

    const first = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ name: 'Renamed Once', version: project.version });
    expect(first.status).toBe(200);

    const second = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ name: 'Renamed Twice', version: project.version });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('end date before start date returns 422', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);

    const res = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ endDate: '2025-01-01', version: project.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('setting status=completed with open tasks returns 422', async () => {
    const pm = await asProjectManager();
    const detail = await pm.agent.get(`/api/v1/projects/${pm.projectId}`);

    const res = await pm.agent
      .patch(`/api/v1/projects/${pm.projectId}`)
      .send({ status: 'completed', version: detail.body.data.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('a budget field is rejected (strict schema), not silently dropped', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);

    const res = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ initialBudget: 999, version: project.version });
    expect(res.status).toBe(400);
  });

  test('changing owner validates the new owner and upserts their manager membership', async () => {
    const pm = await asUnrelatedPm();
    const otherPm = await asProjectManager();
    const project = await createProjectAs(pm);

    const res = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ ownerId: otherPm.user.id, version: project.version });
    expect(res.status).toBe(200);
    expect(res.body.data.owner.id).toBe(otherPm.user.id);

    const { rows } = await client.query(
      `SELECT member_role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [project.id, otherPm.user.id],
    );
    expect(rows[0]?.member_role).toBe('manager');
  });

  test('changing owner to an ineligible user returns 422', async () => {
    const pm = await asUnrelatedPm();
    const contributor = await asNonMember();
    const project = await createProjectAs(pm);

    const res = await pm.agent.patch(`/api/v1/projects/${project.id}`).send({ ownerId: contributor.user.id, version: project.version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('project members', () => {
  test('add member: 201, duplicate returns 409, audited', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);
    const nonMember = await asNonMember();

    const add = await pm.agent.post(`/api/v1/projects/${project.id}/members`).send({ userId: nonMember.user.id, memberRole: 'contributor' });
    expect(add.status).toBe(201);

    const dup = await pm.agent.post(`/api/v1/projects/${project.id}/members`).send({ userId: nonMember.user.id, memberRole: 'contributor' });
    expect(dup.status).toBe(409);

    const { rows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'project_member.add' AND entity_id = $1 AND project_id = $2`,
      [nonMember.user.id, project.id],
    );
    expect(rows.length).toBe(1);
  });

  test('cannot remove the project owner', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);

    const res = await pm.agent.delete(`/api/v1/projects/${project.id}/members/${pm.user.id}`);
    expect(res.status).toBe(422);
  });

  test('cannot remove a member with open assigned tasks', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();

    const res = await pm.agent.delete(`/api/v1/projects/${pm.projectId}/members/${member.user.id}`);
    expect(res.status).toBe(422);
    expect(res.body.error.details.openTaskCount).toBeGreaterThan(0);
  });

  test('removing a member with no open tasks succeeds (204) and is audited', async () => {
    const pm = await asUnrelatedPm();
    const project = await createProjectAs(pm);
    const nonMember = await asNonMember();

    await pm.agent.post(`/api/v1/projects/${project.id}/members`).send({ userId: nonMember.user.id, memberRole: 'contributor' });

    const res = await pm.agent.delete(`/api/v1/projects/${project.id}/members/${nonMember.user.id}`);
    expect(res.status).toBe(204);

    const { rows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'project_member.remove' AND entity_id = $1 AND project_id = $2`,
      [nonMember.user.id, project.id],
    );
    expect(rows.length).toBe(1);
  });
});

describe('GET /api/v1/projects/:id/progress-snapshots', () => {
  test('returns snapshots ordered by date, view-access scoped', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/progress-snapshots`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const dates = res.body.data.map((s: { snapshotDate: string }) => s.snapshotDate);
    expect(dates).toEqual([...dates].sort());

    const nonMember = await asNonMember();
    const blocked = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/progress-snapshots`);
    expect(blocked.status).toBe(404);
  });
});
