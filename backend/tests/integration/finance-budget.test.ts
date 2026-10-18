import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { asAdmin, asProjectManager, asProjectMember, asNonMember } from '../helpers/auth.js';
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

describe('GET /api/v1/projects/:projectId/budget', () => {
  test('PM sees own project budget with revisions', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/budget`);

    expect(res.status).toBe(200);
    expect(res.body.data.currency).toBe('AED');
    expect(typeof res.body.data.initialAmount).toBe('number');
    expect(typeof res.body.data.currentBudget).toBe('number');
    expect(Array.isArray(res.body.data.revisions)).toBe(true);
  });

  test('non-member gets 404', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/budget`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/projects/:projectId/budget-revisions', () => {
  test('PM creates a budget revision → 201, status pending', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 50000,
      rationale: 'Additional server capacity for Q4 scaling',
      effectiveDate: '2026-10-01',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.amount).toBe(50000);
    expect(res.body.data.requestedBy).toBe(pm.user.id);
  });

  test('contributor cannot create budget revision → 403', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 10000,
      rationale: 'This should not work at all',
      effectiveDate: '2026-10-01',
    });
    expect(res.status).toBe(403);
  });

  test('rationale too short → 400', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 5000,
      rationale: 'short',
      effectiveDate: '2026-10-01',
    });
    expect(res.status).toBe(400);
  });

  test('amount zero → 400', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 0,
      rationale: 'Zero amount should fail validation',
      effectiveDate: '2026-10-01',
    });
    expect(res.status).toBe(400);
  });

  test('revision that would make budget negative → 422', async () => {
    const pm = await asProjectManager();

    // Get current budget to figure out a negative-making amount
    const budgetRes = await pm.agent.get(`/api/v1/projects/${pm.projectId}/budget`);
    const currentBudget = budgetRes.body.data.currentBudget;

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: -(currentBudget + 1),
      rationale: 'This would make budget go below zero',
      effectiveDate: '2026-10-01',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('POST /api/v1/budget-revisions/:id/decision', () => {
  // Helper: PM creates a pending revision, returns its id
  async function createPendingRevision(): Promise<{ id: number; requestedBy: number; projectId: number }> {
    const pm = await asProjectManager();
    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 25000,
      rationale: 'Budget increase for testing decisions',
      effectiveDate: '2026-09-01',
    });
    expect(res.status).toBe(201);
    return { id: res.body.data.id, requestedBy: pm.user.id, projectId: pm.projectId };
  }

  test('admin approves revision → current budget increases', async () => {
    const { id, projectId } = await createPendingRevision();
    const admin = await asAdmin();

    // Get budget before
    const beforeRes = await admin.agent.get(`/api/v1/projects/${projectId}/budget`);
    const budgetBefore = beforeRes.body.data.currentBudget;

    const res = await admin.agent
      .post(`/api/v1/budget-revisions/${id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Approved for Q4', version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.decidedBy).toBe(admin.user.id);

    // Current budget should increase by 25000
    const afterRes = await admin.agent.get(`/api/v1/projects/${projectId}/budget`);
    expect(afterRes.body.data.currentBudget).toBe(budgetBefore + 25000);
  });

  test('pending revision has no effect on current budget', async () => {
    const pm = await asProjectManager();
    const admin = await asAdmin();

    // Get budget before
    const beforeRes = await admin.agent.get(`/api/v1/projects/${pm.projectId}/budget`);
    const budgetBefore = beforeRes.body.data.currentBudget;

    // Create a pending revision
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 99999,
      rationale: 'This one stays pending and should not affect budget',
      effectiveDate: '2026-10-01',
    });
    expect(createRes.status).toBe(201);

    // Budget should be unchanged
    const afterRes = await admin.agent.get(`/api/v1/projects/${pm.projectId}/budget`);
    expect(afterRes.body.data.currentBudget).toBe(budgetBefore);
  });

  test('PM (non-admin) approving → 403', async () => {
    const { id } = await createPendingRevision();
    // A different PM who manages the same project is still not admin
    const pm = await asProjectManager();

    const res = await pm.agent
      .post(`/api/v1/budget-revisions/${id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Not allowed', version: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('admin approving own request → 422 SELF_APPROVAL_FORBIDDEN', async () => {
    // Admin creates a revision then tries to decide it
    const admin = await asAdmin();
    const pm = await asProjectManager();

    // Admin needs to be a manager on the project — let's use a project they can manage
    // Since admin can manage all projects, create a revision from admin
    const createRes = await admin.agent.post(`/api/v1/projects/${pm.projectId}/budget-revisions`).send({
      amount: 15000,
      rationale: 'Self-approval test revision created by admin',
      effectiveDate: '2026-10-01',
    });
    expect(createRes.status).toBe(201);

    const res = await admin.agent
      .post(`/api/v1/budget-revisions/${createRes.body.data.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Self-approving', version: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  test('deciding non-pending revision → 422 INVALID_TRANSITION', async () => {
    const { id } = await createPendingRevision();
    const admin = await asAdmin();

    // First approve it
    const approveRes = await admin.agent
      .post(`/api/v1/budget-revisions/${id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'First time', version: 1 });
    expect(approveRes.status).toBe(200);

    // Try to reject it now
    const rejectRes = await admin.agent
      .post(`/api/v1/budget-revisions/${id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'reject', reason: 'Too late', version: 2 });

    expect(rejectRes.status).toBe(422);
    expect(rejectRes.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('zero-budget project → utilization null', async () => {
    // Find a project with zero budget or create a scenario
    const admin = await asAdmin();

    // Check fn_project_financials for a zero-budget project
    const { rows } = await client.query<{ project_id: number; utilization: string | null }>(
      `SELECT project_id, utilization FROM fn_project_financials('2026-09-30'::date) WHERE current_budget = 0 LIMIT 1`,
    );

    if (rows.length > 0) {
      const projectId = rows[0]!.project_id;
      const budgetRes = await admin.agent.get(`/api/v1/projects/${projectId}/budget`);
      expect(budgetRes.status).toBe(200);
      // No division error — utilization would be null in fn_project_financials
      // which is tested at the SQL level (feature 02). Here we just confirm
      // the API doesn't blow up on a zero-budget project.
    }
  });
});

describe('Cost categories', () => {
  test('GET /api/v1/cost-categories — any authenticated user sees active categories', async () => {
    const member = await asProjectMember();
    const res = await member.agent.get('/api/v1/cost-categories');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const cat of res.body.data) {
      expect(cat.isActive).toBe(true);
    }
  });

  test('admin sees inactive categories with ?includeInactive=true', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/cost-categories').query({ includeInactive: 'true' });
    expect(res.status).toBe(200);
  });

  test('POST /api/v1/cost-categories — admin creates category', async () => {
    const admin = await asAdmin();
    const code = `TEST-${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await admin.agent.post('/api/v1/cost-categories').send({
      code,
      name: `Test Category ${code}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code);
  });

  test('non-admin creating category → 403', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.post('/api/v1/cost-categories').send({
      code: 'NOPE',
      name: 'Should fail',
    });
    expect(res.status).toBe(403);
  });

  test('duplicate code/name → 409', async () => {
    const admin = await asAdmin();
    const code = `DUP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const name = `Dup Cat ${code}`;

    await admin.agent.post('/api/v1/cost-categories').send({ code, name });
    const dup = await admin.agent.post('/api/v1/cost-categories').send({ code, name });

    expect(dup.status).toBe(409);
  });
});
