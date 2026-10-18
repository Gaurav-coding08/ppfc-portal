import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import {
  asAdmin,
  asProjectManager,
  asProjectMember,
} from '../helpers/auth.js';
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
  return rows[0]!.id;
}

describe('GET /api/v1/dashboard/kpis', () => {
  test('returns all expected KPI keys with units and drill endpoints', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/kpis');

    expect(res.status).toBe(200);
    expect(res.body.meta.asOf).toBeDefined();
    expect(res.body.meta.generatedAt).toBeDefined();

    const kpis = res.body.data.kpis;
    expect(kpis.length).toBeGreaterThanOrEqual(16);

    const keys = kpis.map((k: { key: string }) => k.key);
    expect(keys).toContain('totalProjects');
    expect(keys).toContain('activeProjects');
    expect(keys).toContain('portfolioProgressPct');
    expect(keys).toContain('overdueIncompleteTasks');
    expect(keys).toContain('actualSpend');
    expect(keys).toContain('approvedBudget');
    expect(keys).toContain('forecastEac');

    for (const kpi of kpis) {
      expect(['count', 'pct', 'AED']).toContain(kpi.unit);
      expect(kpi.drill.endpoint).toBeDefined();
    }
  });

  test('every KPI drill.endpoint returns 200', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/kpis');

    const kpis = res.body.data.kpis;
    const checked = new Set<string>();

    for (const kpi of kpis) {
      const ep = kpi.drill.endpoint as string;
      if (checked.has(ep)) continue;
      checked.add(ep);

      const drillRes = await admin.agent.get(ep).query(kpi.drill.params ?? {});
      expect(drillRes.status).toBe(200);
    }
  });
});

describe('Integrity after mutation', () => {
  test('contributor updates task progress → portfolioProgressPct changes', async () => {
    const admin = await asAdmin();
    const member = await asProjectMember();

    // Get initial KPI
    const before = await admin.agent.get('/api/v1/dashboard/kpis');
    const progressBefore = before.body.data.kpis.find(
      (k: { key: string }) => k.key === 'portfolioProgressPct',
    ).value;

    // Find a task assigned to the contributor that isn't done
    const { rows: tasks } = await client.query<{
      id: number;
      progress: number;
      project_id: number;
    }>(
      `SELECT t.id, t.progress, t.project_id
       FROM tasks t
       JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
       WHERE t.assignee_id = $1 AND t.status <> 'done'
       ORDER BY t.id LIMIT 1`,
      [member.user.id],
    );

    if (tasks.length === 0) return; // skip if no assignable task

    const task = tasks[0]!;
    const newProgress = task.progress >= 50 ? task.progress - 10 : task.progress + 10;

    // Get task version
    const taskRes = await member.agent.get(`/api/v1/tasks/${task.id}`);
    const version = taskRes.body.data.version;

    // Update progress
    const patchRes = await member.agent.patch(`/api/v1/tasks/${task.id}`).send({
      progress: newProgress,
      version,
    });
    expect(patchRes.status).toBe(200);

    // Get KPI again — portfolioProgressPct must have changed
    const after = await admin.agent.get('/api/v1/dashboard/kpis');
    const progressAfter = after.body.data.kpis.find(
      (k: { key: string }) => k.key === 'portfolioProgressPct',
    ).value;

    expect(progressAfter).not.toBe(progressBefore);
  });

  test('PM posts a cost → actualSpend increases by exactly that amount', async () => {
    const pm = await asProjectManager();
    const admin = await asAdmin();
    const categoryId = await findActiveCategoryId();

    const beforeKpis = await admin.agent.get('/api/v1/dashboard/kpis');
    const spendBefore = beforeKpis.body.data.kpis.find(
      (k: { key: string }) => k.key === 'actualSpend',
    ).value;

    // Create and post a cost
    const createRes = await pm.agent
      .post(`/api/v1/projects/${pm.projectId}/costs`)
      .send({ categoryId, txnDate: '2026-08-15', amount: 1234.56, description: 'KPI integrity test' });
    expect(createRes.status).toBe(201);

    await pm.agent
      .post(`/api/v1/costs/${createRes.body.data.id}/post`)
      .set('Idempotency-Key', randomUUID());

    const afterKpis = await admin.agent.get('/api/v1/dashboard/kpis');
    const spendAfter = afterKpis.body.data.kpis.find(
      (k: { key: string }) => k.key === 'actualSpend',
    ).value;

    expect(spendAfter).toBe(Math.round((spendBefore + 1234.56) * 100) / 100);
  });
});

describe('Drill reconciliation', () => {
  test('drill/costs sum == actualSpend (no filters)', async () => {
    const admin = await asAdmin();

    const kpiRes = await admin.agent.get('/api/v1/dashboard/kpis');
    const actualSpend = kpiRes.body.data.kpis.find(
      (k: { key: string }) => k.key === 'actualSpend',
    ).value;

    // Use SQL for the total to avoid paging through
    const { rows } = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         CASE WHEN entry_type = 'expense' THEN amount ELSE -amount END
       ), 0) AS total
       FROM cost_transactions
       WHERE status = 'posted' AND txn_date <= '2026-09-30'`,
    );
    const sqlTotal = Math.round(parseFloat(rows[0]!.total) * 100) / 100;

    expect(actualSpend).toBe(sqlTotal);
  });

  test('drill/tasks?kind=overdue count == overdueIncompleteTasks', async () => {
    const admin = await asAdmin();

    const kpiRes = await admin.agent.get('/api/v1/dashboard/kpis');
    const overdue = kpiRes.body.data.kpis.find(
      (k: { key: string }) => k.key === 'overdueIncompleteTasks',
    ).value;

    const drillRes = await admin.agent
      .get('/api/v1/dashboard/drill/tasks')
      .query({ kind: 'overdue', pageSize: 1 });

    expect(drillRes.body.meta.total).toBe(overdue);
  });

  test('drill/risks?kind=high-exposure count == openHighExposureRisks', async () => {
    const admin = await asAdmin();

    const kpiRes = await admin.agent.get('/api/v1/dashboard/kpis');
    const highExposure = kpiRes.body.data.kpis.find(
      (k: { key: string }) => k.key === 'openHighExposureRisks',
    ).value;

    const drillRes = await admin.agent
      .get('/api/v1/dashboard/drill/risks')
      .query({ kind: 'high-exposure', pageSize: 1 });

    expect(drillRes.body.meta.total).toBe(highExposure);
  });

  test('drill reconciliation with department + status filter', async () => {
    const admin = await asAdmin();

    // Get first department with an active project
    const { rows: depts } = await client.query<{ department_id: number }>(
      `SELECT DISTINCT department_id FROM projects WHERE status = 'active' ORDER BY department_id LIMIT 1`,
    );
    if (depts.length === 0) return;
    const deptId = depts[0]!.department_id;

    const filters = { departmentId: `${deptId}`, status: 'active' };

    const kpiRes = await admin.agent.get('/api/v1/dashboard/kpis').query(filters);
    const overdue = kpiRes.body.data.kpis.find(
      (k: { key: string }) => k.key === 'overdueIncompleteTasks',
    ).value;

    const drillRes = await admin.agent
      .get('/api/v1/dashboard/drill/tasks')
      .query({ ...filters, kind: 'overdue', pageSize: 1 });

    expect(drillRes.body.meta.total).toBe(overdue);
  });
});

describe('Fan-out guard', () => {
  test('actualSpend from dashboard equals direct SUM on cost_transactions', async () => {
    const pm = await asProjectManager();
    const asOf = '2026-09-30';

    // Dashboard for one project
    const kpiRes = await pm.agent
      .get('/api/v1/dashboard/kpis')
      .query({ projectId: `${pm.projectId}` });

    const actualSpend = kpiRes.body.data.kpis.find(
      (k: { key: string }) => k.key === 'actualSpend',
    ).value;

    // Direct SQL
    const { rows } = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         CASE WHEN entry_type = 'expense' THEN amount ELSE -amount END
       ), 0) AS total
       FROM cost_transactions
       WHERE project_id = $1 AND status = 'posted' AND txn_date <= $2::date`,
      [pm.projectId, asOf],
    );
    const sqlTotal = Math.round(parseFloat(rows[0]!.total) * 100) / 100;

    expect(actualSpend).toBe(sqlTotal);
  });
});

describe('categoryId filter handling', () => {
  test('categoryId changes finance endpoints but is ignored on delivery endpoints', async () => {
    const admin = await asAdmin();
    const categoryId = await findActiveCategoryId();

    // Finance endpoint: spend-by-category with categoryId
    const finRes = await admin.agent
      .get('/api/v1/dashboard/spend-by-category')
      .query({ categoryId: `${categoryId}` });
    expect(finRes.status).toBe(200);
    expect(finRes.body.meta.appliedFilters).toContain('categoryId');

    // Delivery endpoint: project-health with categoryId → ignored
    const delRes = await admin.agent
      .get('/api/v1/dashboard/project-health')
      .query({ categoryId: `${categoryId}` });
    expect(delRes.status).toBe(200);
    expect(delRes.body.meta.ignoredFilters).toContain('categoryId');
  });
});

describe('Contributor scoping', () => {
  test('contributor KPIs equal admin KPIs filtered to contributor member projects', async () => {
    const member = await asProjectMember();
    const admin = await asAdmin();

    // Get contributor's visible project IDs
    const { rows: memberProjects } = await client.query<{ project_id: number }>(
      `SELECT project_id FROM project_members WHERE user_id = $1`,
      [member.user.id],
    );
    const projectIds = memberProjects.map((r) => r.project_id);

    // Contributor's unfiltered dashboard
    const contribRes = await member.agent.get('/api/v1/dashboard/kpis');
    const contribKpis = contribRes.body.data.kpis;

    // Admin filtered to those same projects
    const adminRes = await admin.agent
      .get('/api/v1/dashboard/kpis')
      .query({ projectId: projectIds.join(',') });
    const adminKpis = adminRes.body.data.kpis;

    // Compare key KPIs
    for (const key of ['totalProjects', 'actualSpend', 'overdueIncompleteTasks']) {
      const cv = contribKpis.find((k: { key: string }) => k.key === key)?.value;
      const av = adminKpis.find((k: { key: string }) => k.key === key)?.value;
      expect(cv).toBe(av);
    }
  });
});

describe('Risk matrix', () => {
  test('risk matrix total == count of open risks for the filters', async () => {
    const admin = await asAdmin();

    const matrixRes = await admin.agent.get('/api/v1/dashboard/risk-matrix');
    expect(matrixRes.status).toBe(200);

    const totalFromMatrix = matrixRes.body.data.totalOpenRisks;

    // Count open risks directly
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM risks WHERE status <> 'closed'`,
    );
    const sqlCount = parseInt(rows[0]!.count);

    expect(totalFromMatrix).toBe(sqlCount);
  });
});

describe('Other dashboard endpoints', () => {
  test('GET /api/v1/dashboard/project-health returns scoped projects', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/project-health');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.projects)).toBe(true);
    for (const p of res.body.data.projects) {
      expect(p.projectId).toBeDefined();
      expect(p.deliveryStatus).toBeDefined();
    }
  });

  test('GET /api/v1/dashboard/budget-vs-actual-eac returns per-project financials', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/budget-vs-actual-eac');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.projects)).toBe(true);
  });

  test('GET /api/v1/dashboard/monthly-spend returns month series', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/monthly-spend');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.months)).toBe(true);
  });

  test('GET /api/v1/dashboard/overdue-by-owner returns assignee counts', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/overdue-by-owner');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.owners)).toBe(true);
  });

  test('GET /api/v1/dashboard/milestones returns planned milestones', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/milestones');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.milestones)).toBe(true);
  });

  test('GET /api/v1/dashboard/drill/change-requests returns pending CRs', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/drill/change-requests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/v1/dashboard/filters returns option lists', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/dashboard/filters');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.departments)).toBe(true);
    expect(Array.isArray(res.body.data.projects)).toBe(true);
    expect(Array.isArray(res.body.data.managers)).toBe(true);
    expect(Array.isArray(res.body.data.statuses)).toBe(true);
    expect(Array.isArray(res.body.data.categories)).toBe(true);
  });
});
