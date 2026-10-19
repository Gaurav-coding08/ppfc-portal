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

async function findActiveCategoryId(): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM cost_categories WHERE is_active = TRUE ORDER BY id LIMIT 1`,
  );
  if (rows.length === 0) throw new Error('No active cost category found');
  return rows[0]!.id;
}

describe('GET /api/v1/projects/:projectId/financial-summary', () => {
  test('summary equals independent SQL computation', async () => {
    const pm = await asProjectManager();
    const asOf = '2026-09-30';

    const res = await pm.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    ).query({ asOf });

    expect(res.status).toBe(200);
    const fin = res.body.data.financials;

    // Independent SQL: compute the same KPIs without fn_project_financials
    const { rows: budgetRows } = await client.query<{
      initial_amount: string;
      approved_rev: string;
    }>(
      `SELECT
         COALESCE(pb.initial_amount, 0) AS initial_amount,
         COALESCE(SUM(br.amount) FILTER (
           WHERE br.status = 'approved' AND br.effective_date <= $1::date
         ), 0) AS approved_rev
       FROM project_budgets pb
       LEFT JOIN budget_revisions br ON br.project_id = pb.project_id
       WHERE pb.project_id = $2
       GROUP BY pb.project_id, pb.initial_amount`,
      [asOf, pm.projectId],
    );
    const initialBudget = budgetRows.length > 0 ? parseFloat(budgetRows[0]!.initial_amount) : 0;
    const approvedRev = budgetRows.length > 0 ? parseFloat(budgetRows[0]!.approved_rev) : 0;
    const currentBudget = initialBudget + approvedRev;

    const { rows: actualRows } = await client.query<{ spend: string }>(
      `SELECT COALESCE(SUM(
         CASE WHEN entry_type = 'expense' THEN amount ELSE -amount END
       ), 0) AS spend
       FROM cost_transactions
       WHERE project_id = $1 AND status = 'posted' AND txn_date <= $2::date`,
      [pm.projectId, asOf],
    );
    const actualSpend = parseFloat(actualRows[0]!.spend);

    const { rows: ftcRows } = await client.query<{ ftc: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS ftc
       FROM financial_forecasts
       WHERE project_id = $1 AND month > date_trunc('month', $2::date)::date`,
      [pm.projectId, asOf],
    );
    const ftc = parseFloat(ftcRows[0]!.ftc);
    const eac = actualSpend + ftc;

    expect(fin.initialBudget).toBe(Math.round(initialBudget * 100) / 100);
    expect(fin.currentBudget).toBe(Math.round(currentBudget * 100) / 100);
    expect(fin.actualSpend).toBe(Math.round(actualSpend * 100) / 100);
    expect(fin.forecastToComplete).toBe(Math.round(ftc * 100) / 100);
    expect(fin.eac).toBe(Math.round(eac * 100) / 100);
    expect(fin.remainingBudget).toBe(Math.round((currentBudget - actualSpend) * 100) / 100);

    expect(res.body.data.currency).toBe('AED');
    expect(Array.isArray(res.body.data.spendByCategory)).toBe(true);
    expect(Array.isArray(res.body.data.monthlyTrend)).toBe(true);
    expect(Array.isArray(res.body.data.alerts)).toBe(true);
  });

  test('non-member gets 404', async () => {
    const pm = await asProjectManager();
    const nonMember = await asNonMember();
    const res = await nonMember.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/finance/alerts', () => {
  test('alerts include expected alert types for seeded data', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/finance/alerts');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.alerts)).toBe(true);
    expect(res.body.data.currency).toBe('AED');

    // Every alert has required fields
    for (const alert of res.body.data.alerts) {
      expect(alert.projectId).toBeDefined();
      expect(['OVERRUN_FORECAST', 'NEAR_BUDGET', 'OVERSPENT', 'FORECAST_MISSING']).toContain(
        alert.alertType,
      );
      expect(['critical', 'warning', 'info']).toContain(alert.severity);
    }
  });

  test('FORECAST_MISSING projects have EAC = actual spend', async () => {
    const admin = await asAdmin();
    const asOf = '2026-09-30';
    const res = await admin.agent.get('/api/v1/finance/alerts').query({ asOf });

    const missingAlerts = res.body.data.alerts.filter(
      (a: { alertType: string }) => a.alertType === 'FORECAST_MISSING',
    );

    // For each FORECAST_MISSING project, verify eac = actualSpend
    for (const alert of missingAlerts) {
      expect(alert.eac).toBe(alert.actualSpend);
    }
  });

  test('overrun project appears as OVERRUN_FORECAST', async () => {
    const pm = await asProjectManager();
    const asOf = '2026-09-30';

    // Create large costs to push EAC above budget
    const { rows: finRows } = await client.query<{ current_budget: string; actual_spend: string }>(
      `SELECT current_budget, actual_spend
       FROM fn_project_financials($1) WHERE project_id = $2`,
      [asOf, pm.projectId],
    );
    const currentBudget = parseFloat(finRows[0]!.current_budget);

    // Post a large forecast to exceed budget
    const futureMonth = '2026-10';
    await pm.agent.put(`/api/v1/projects/${pm.projectId}/forecasts`).send({
      months: [{ month: futureMonth, amount: currentBudget + 500000 }],
    });

    const admin = await asAdmin();
    const alertRes = await admin.agent.get('/api/v1/finance/alerts').query({ asOf });

    const overrunAlerts = alertRes.body.data.alerts.filter(
      (a: { alertType: string; projectId: number }) =>
        a.alertType === 'OVERRUN_FORECAST' && a.projectId === pm.projectId,
    );
    expect(overrunAlerts.length).toBeGreaterThanOrEqual(1);
  });

  // Regression: the scope clause's user-id placeholder ($1) used to collide
  // with asOf, so every non-admin call failed with a 500.
  test('non-admin caller gets 200 with only projects they can see', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get('/api/v1/finance/alerts').query({ departmentId: 1 });
    expect(res.status).toBe(200);

    const { rows } = await client.query<{ id: number }>(
      `SELECT id FROM projects WHERE owner_id = $1
       UNION SELECT project_id FROM project_members WHERE user_id = $1`,
      [pm.user.id],
    );
    const visible = new Set(rows.map((r) => r.id));
    for (const alert of res.body.data.alerts as { projectId: number }[]) {
      expect(visible.has(alert.projectId)).toBe(true);
    }

    const member = await asProjectMember();
    expect((await member.agent.get('/api/v1/finance/alerts')).status).toBe(200);
  });
});

describe('asOf parameter', () => {
  test('asOf=2026-10-31 includes post-cutoff cost; default excludes it', async () => {
    const pm = await asProjectManager();
    const categoryId = await findActiveCategoryId();

    // Get actual spend at default asOf
    const defaultRes = await pm.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    );
    const actualBefore = defaultRes.body.data.financials.actualSpend;

    // Create and post a cost dated 2026-10-15 (after default 2026-09-30)
    const createRes = await pm.agent
      .post(`/api/v1/projects/${pm.projectId}/costs`)
      .send({ categoryId, txnDate: '2026-10-15', amount: 3333, description: 'Post-cutoff cost' });
    const costId = createRes.body.data.id;
    await pm.agent.post(`/api/v1/costs/${costId}/post`).set('Idempotency-Key', randomUUID());

    // Default asOf (2026-09-30) should not include it
    const afterDefault = await pm.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    );
    expect(afterDefault.body.data.financials.actualSpend).toBe(actualBefore);

    // asOf=2026-10-31 should include it
    const afterExtended = await pm.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    ).query({ asOf: '2026-10-31' });
    expect(afterExtended.body.data.financials.actualSpend).toBe(actualBefore + 3333);
  });
});

describe('PUT /api/v1/projects/:projectId/forecasts', () => {
  test('forecast PUT for past month → 422', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.put(`/api/v1/projects/${pm.projectId}/forecasts`).send({
      months: [{ month: '2026-08', amount: 5000 }],
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('contributor PUT → 403', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const res = await member.agent.put(`/api/v1/projects/${pm.projectId}/forecasts`).send({
      months: [{ month: '2026-10', amount: 5000 }],
    });

    expect(res.status).toBe(403);
  });

  test('upsert replaces existing month value', async () => {
    const pm = await asProjectManager();

    // Insert a forecast
    const month = '2026-11';
    const first = await pm.agent.put(`/api/v1/projects/${pm.projectId}/forecasts`).send({
      months: [{ month, amount: 10000 }],
    });
    expect(first.status).toBe(200);

    const firstRow = first.body.data.forecasts.find(
      (f: { month: string }) => f.month.startsWith('2026-11'),
    );
    expect(firstRow.amount).toBe(10000);

    // Upsert same month with different amount
    const second = await pm.agent.put(`/api/v1/projects/${pm.projectId}/forecasts`).send({
      months: [{ month, amount: 20000 }],
    });
    expect(second.status).toBe(200);

    const updatedRow = second.body.data.forecasts.find(
      (f: { month: string }) => f.month.startsWith('2026-11'),
    );
    expect(updatedRow.amount).toBe(20000);
  });

  test('GET /api/v1/projects/:projectId/forecasts returns rows and FTC', async () => {
    const pm = await asProjectManager();
    const res = await pm.agent.get(`/api/v1/projects/${pm.projectId}/forecasts`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.forecasts)).toBe(true);
    expect(typeof res.body.data.forecastToComplete).toBe('number');
    expect(res.body.data.currency).toBe('AED');
  });
});

describe('Monthly trend consistency', () => {
  test('monthly trend sums of actuals equal summary actual spend', async () => {
    const pm = await asProjectManager();
    const asOf = '2026-09-30';

    const res = await pm.agent.get(
      `/api/v1/projects/${pm.projectId}/financial-summary`,
    ).query({ asOf });

    expect(res.status).toBe(200);
    const trend: { actualSpend: number | null }[] = res.body.data.monthlyTrend;
    const sumActuals = trend.reduce(
      (sum, row) => sum + (row.actualSpend ?? 0),
      0,
    );

    // Round both to avoid floating point
    expect(Math.round(sumActuals * 100) / 100).toBe(
      res.body.data.financials.actualSpend,
    );
  });
});

describe('GET /api/v1/finance/comparison', () => {
  test('comparison returns financial rows for visible projects', async () => {
    const admin = await asAdmin();

    // Get a few project IDs
    const { rows: projectRows } = await client.query<{ id: number }>(
      `SELECT id FROM projects ORDER BY id LIMIT 3`,
    );
    const ids = projectRows.map((r) => r.id);

    const res = await admin.agent.get('/api/v1/finance/comparison').query({
      projectIds: ids.join(','),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.projects.length).toBe(ids.length);
    expect(res.body.data.excluded).toEqual([]);
    expect(res.body.data.currency).toBe('AED');

    // Each project row has KPIs
    for (const row of res.body.data.projects) {
      expect(typeof row.currentBudget).toBe('number');
      expect(typeof row.actualSpend).toBe('number');
    }
  });

  test('contributor comparison drops non-visible projects to excluded', async () => {
    const member = await asProjectMember();

    // Get all projects — contributor can only see their own
    const { rows: allProjects } = await client.query<{ id: number }>(
      `SELECT id FROM projects ORDER BY id`,
    );
    const allIds = allProjects.map((r) => r.id);

    // Get projects the contributor can see
    const { rows: memberProjects } = await client.query<{ project_id: number }>(
      `SELECT project_id FROM project_members WHERE user_id = $1`,
      [member.user.id],
    );
    const visibleSet = new Set(memberProjects.map((r) => r.project_id));

    const res = await member.agent.get('/api/v1/finance/comparison').query({
      projectIds: allIds.join(','),
    });

    expect(res.status).toBe(200);

    // All returned projects should be ones the contributor can see
    for (const row of res.body.data.projects) {
      expect(visibleSet.has(row.projectId)).toBe(true);
    }

    // Non-visible projects should be in excluded
    const excludedSet = new Set(res.body.data.excluded);
    for (const id of allIds) {
      if (!visibleSet.has(id)) {
        expect(excludedSet.has(id)).toBe(true);
      }
    }
  });
});
