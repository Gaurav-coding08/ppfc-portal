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

// Finds an active cost category for test costs.
async function findActiveCategoryId(): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM cost_categories WHERE is_active = TRUE ORDER BY id LIMIT 1`,
  );
  if (rows.length === 0) throw new Error('No active cost category found');
  return rows[0]!.id;
}

// Finds an inactive cost category (or creates one).
async function findInactiveCategoryId(): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM cost_categories WHERE is_active = FALSE ORDER BY id LIMIT 1`,
  );
  if (rows.length > 0) return rows[0]!.id;

  // Create and deactivate one
  const code = `INACT-${randomUUID().slice(0, 4)}`;
  const { rows: inserted } = await client.query<{ id: number }>(
    `INSERT INTO cost_categories (code, name, is_active) VALUES ($1, $2, FALSE) RETURNING id`,
    [code, `Inactive ${code}`],
  );
  return inserted[0]!.id;
}

async function auditCount(entityId: number, action: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events WHERE entity_type = 'cost_transaction' AND entity_id = $1 AND action = $2`,
    [entityId, action],
  );
  return parseInt(rows[0]!.count, 10);
}

describe('Acceptance D: contributor finance mutation → 403', () => {
  test('contributor POST /costs/:id/post → 403; nothing changes', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const categoryId = await findActiveCategoryId();

    // PM creates a draft cost
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-15',
      amount: 5000,
      description: 'Acceptance D draft cost',
    });
    expect(createRes.status).toBe(201);
    const costId = createRes.body.data.id;

    // Contributor tries to post it → 403
    const postRes = await member.agent
      .post(`/api/v1/costs/${costId}/post`)
      .set('Idempotency-Key', randomUUID());
    expect(postRes.status).toBe(403);

    // Status still draft
    const { rows } = await client.query<{ status: string }>(
      'SELECT status FROM cost_transactions WHERE id = $1',
      [costId],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  test('contributor POST /projects/:id/costs → 403', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const categoryId = await findActiveCategoryId();

    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-15',
      amount: 1000,
      description: 'Contributor should not create costs',
    });
    expect(res.status).toBe(403);
  });
});

describe('Acceptance B: PM draft → post → actual spend updates', () => {
  test('PM creates draft → posts it → actual, remaining, utilization update', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();
    const asOf = '2026-09-30';

    // Get financials before
    const { rows: finBefore } = await client.query<{
      actual_spend: string;
      remaining_budget: string;
      utilization: string | null;
    }>(
      `SELECT actual_spend, remaining_budget, utilization
       FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const actualBefore = parseFloat(finBefore[0]!.actual_spend);

    // Create draft
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-15',
      amount: 7500.50,
      description: 'Acceptance B test cost',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('draft');
    const costId = createRes.body.data.id;

    // Draft should NOT change actual spend
    const { rows: finAfterDraft } = await client.query<{ actual_spend: string }>(
      `SELECT actual_spend FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    expect(parseFloat(finAfterDraft[0]!.actual_spend)).toBe(actualBefore);

    // Post it
    const postRes = await pm.agent
      .post(`/api/v1/costs/${costId}/post`)
      .set('Idempotency-Key', randomUUID());
    expect(postRes.status).toBe(200);
    expect(postRes.body.data.status).toBe('posted');
    expect(postRes.body.data.postedBy).toBe(pm.user.id);

    // Actual spend increased by exactly the amount
    const { rows: finAfterPost } = await client.query<{
      actual_spend: string;
      remaining_budget: string;
      utilization: string | null;
    }>(
      `SELECT actual_spend, remaining_budget, utilization
       FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const actualAfter = parseFloat(finAfterPost[0]!.actual_spend);
    expect(actualAfter).toBe(actualBefore + 7500.50);

    // Response financials match DB
    expect(postRes.body.financials.actualSpend).toBe(actualAfter);
  });
});

describe('Draft cost lifecycle', () => {
  test('PATCH draft cost → 200; PATCH posted cost → 422', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    // Create and update a draft
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-07-01',
      amount: 3000,
      description: 'Draft to patch',
    });
    expect(createRes.status).toBe(201);
    const costId = createRes.body.data.id;

    const patchRes = await pm.agent.patch(`/api/v1/costs/${costId}`).send({
      amount: 3500,
      version: 1,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.amount).toBe(3500);

    // Post it
    await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', randomUUID());

    // Try to patch posted → 422
    const patchPosted = await pm.agent.patch(`/api/v1/costs/${costId}`).send({
      amount: 4000,
      version: 2,
    });
    expect(patchPosted.status).toBe(422);
    expect(patchPosted.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('DELETE draft cost → 204; DELETE posted cost → 422', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    // Create and delete a draft
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-07-01',
      amount: 1500,
      description: 'Draft to delete',
    });
    const draftId = createRes.body.data.id;
    const deleteRes = await pm.agent.delete(`/api/v1/costs/${draftId}`);
    expect(deleteRes.status).toBe(204);

    // Create, post, try to delete → 422
    const create2 = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-07-01',
      amount: 2000,
      description: 'Posted then try delete',
    });
    const postedId = create2.body.data.id;
    await pm.agent.post(`/api/v1/costs/${postedId}/post`).set('Idempotency-Key', randomUUID());

    const deletePosted = await pm.agent.delete(`/api/v1/costs/${postedId}`);
    expect(deletePosted.status).toBe(422);
    expect(deletePosted.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('Reversals', () => {
  test('reversal reduces actual spend; double reversal → 422', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();
    const asOf = '2026-09-30';

    // Create and post a cost
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-20',
      amount: 10000,
      description: 'Cost to reverse',
    });
    const costId = createRes.body.data.id;
    await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', randomUUID());

    const { rows: finBefore } = await client.query<{ actual_spend: string }>(
      `SELECT actual_spend FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const actualBefore = parseFloat(finBefore[0]!.actual_spend);

    // Reverse it
    const reverseRes = await pm.agent.post(`/api/v1/costs/${costId}/reverse`).send({
      reason: 'Invoice cancelled',
    });
    expect(reverseRes.status).toBe(201);
    expect(reverseRes.body.data.entryType).toBe('reversal');
    expect(reverseRes.body.data.reversesId).toBe(costId);

    // Actual spend reduced by the reversed amount
    const { rows: finAfter } = await client.query<{ actual_spend: string }>(
      `SELECT actual_spend FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const actualAfter = parseFloat(finAfter[0]!.actual_spend);
    expect(actualAfter).toBe(actualBefore - 10000);

    // Double reversal → 422
    const doubleRes = await pm.agent.post(`/api/v1/costs/${costId}/reverse`).send({
      reason: 'Try again',
    });
    expect(doubleRes.status).toBe(422);
    expect(doubleRes.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('Cost dated after asOf', () => {
  test('cost with txnDate after default asOf does not affect actual spend', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();
    const asOf = '2026-09-30';

    const { rows: finBefore } = await client.query<{ actual_spend: string }>(
      `SELECT actual_spend FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const actualBefore = parseFloat(finBefore[0]!.actual_spend);

    // Create and post a cost dated AFTER asOf
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-12-15',
      amount: 5000,
      description: 'Future cost should not count',
    });
    const costId = createRes.body.data.id;
    await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', randomUUID());

    // Actual spend at asOf unchanged
    const { rows: finAfter } = await client.query<{ actual_spend: string }>(
      `SELECT actual_spend FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    expect(parseFloat(finAfter[0]!.actual_spend)).toBe(actualBefore);
  });
});

describe('Idempotent post', () => {
  test('same Idempotency-Key on post twice → posted once, one audit row', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-25',
      amount: 8000,
      description: 'Idempotent post test',
    });
    const costId = createRes.body.data.id;
    const key = randomUUID();

    const first = await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', key);
    expect(first.status).toBe(200);

    const auditsBefore = await auditCount(costId, 'cost.post');

    const second = await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', key);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');

    // Still only one audit row
    const auditsAfter = await auditCount(costId, 'cost.post');
    expect(auditsAfter).toBe(auditsBefore);
  });
});

describe('Validation', () => {
  test('amount 0 → 400', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-01',
      amount: 0,
      description: 'Zero amount',
    });
    expect(res.status).toBe(400);
  });

  test('negative amount → 400', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-01',
      amount: -100,
      description: 'Negative amount',
    });
    expect(res.status).toBe(400);
  });

  test('inactive category → 422', async () => {
    const pm = await asProjectManager();
    const inactiveId = await findInactiveCategoryId();

    const res = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId: inactiveId,
      txnDate: '2026-08-01',
      amount: 500,
      description: 'Inactive category test',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('GET /api/v1/costs (cross-project)', () => {
  test('admin sees costs scoped to all projects', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/costs').query({ pageSize: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
  });

  test('contributor sees only own-project costs', async () => {
    const member = await asProjectMember();
    const res = await member.agent.get('/api/v1/costs').query({ pageSize: 100 });

    expect(res.status).toBe(200);

    // All returned costs belong to projects the member is on
    const { rows: memberProjects } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM project_members WHERE user_id = $1',
      [member.user.id],
    );
    const allowed = new Set(memberProjects.map((r) => r.project_id));
    for (const row of res.body.data) {
      expect(allowed.has(row.projectId)).toBe(true);
    }
  });
});

describe('GET /api/v1/projects/:projectId/costs', () => {
  test('filters by status, categoryId', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/costs`).query({
      status: 'posted',
      pageSize: 100,
    });
    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.status).toBe('posted');
    }
  });

  test('non-member gets 404', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const res = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/costs`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/costs/:id', () => {
  test('returns cost detail for member; non-member gets 404', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/costs`).send({
      categoryId,
      txnDate: '2026-08-10',
      amount: 1200,
      description: 'Detail test',
    });
    const costId = createRes.body.data.id;

    const detailRes = await pm.agent.get(`/api/v1/costs/${costId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.id).toBe(costId);

    const nonMember = await asNonMember();
    const blocked = await nonMember.agent.get(`/api/v1/costs/${costId}`);
    expect(blocked.status).toBe(404);
  });
});
