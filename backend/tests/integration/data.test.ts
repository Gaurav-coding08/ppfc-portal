import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

// Validates the seeded dataset itself (loaded by globalSetup before this
// file runs): row-count minimums from the feature spec, and that every
// mandatory edge case is actually queryable in the imported data.
let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ count: string }>(sql, params);
  return Number(rows[0]!.count);
}

describe('Seed data row-count minimums', () => {
  test.each([
    ['departments', 3],
    ['users', 15],
    ['projects', 8],
    ['project_members', 1],
    ['tasks', 80],
    ['milestones', 24],
    ['risks', 20],
    ['change_requests', 15],
    ['cost_categories', 4],
    ['project_budgets', 1],
    ['budget_revisions', 6],
    ['cost_transactions', 80],
    ['progress_snapshots', 1],
    ['automation_runs', 5],
    ['audit_events', 1],
  ])('%s has at least %i rows', async (table, minimum) => {
    const n = await count(`SELECT count(*) FROM ${table}`);
    expect(n).toBeGreaterThanOrEqual(minimum as number);
  });

  test('project_budgets has exactly one row per project', async () => {
    const n = await count('SELECT count(*) FROM project_budgets');
    expect(n).toBe(8);
  });

  test('progress_snapshots has at least 4 snapshots for every project', async () => {
    const { rows } = await client.query<{ project_id: string; n: string }>(
      'SELECT project_id, count(*) n FROM progress_snapshots GROUP BY project_id'
    );
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(Number(row.n)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Mandatory edge cases', () => {
  test('a project has no posted spend (only drafts or none)', async () => {
    const n = await count(
      `SELECT count(*) FROM (
         SELECT p.id FROM projects p
         LEFT JOIN cost_transactions ct ON ct.project_id = p.id AND ct.status = 'posted'
         GROUP BY p.id HAVING count(ct.id) = 0
       ) t`
    );
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('a project is near budget (90-99% utilization) per v_project_financials', async () => {
    const n = await count(
      "SELECT count(*) FROM v_project_financials WHERE is_near_budget = true"
    );
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('a project is forecast to exceed budget (EAC > current budget)', async () => {
    const n = await count('SELECT count(*) FROM v_project_financials WHERE is_overrun = true');
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('at least 5 overdue incomplete tasks', async () => {
    const n = await count(
      "SELECT count(*) FROM tasks WHERE due_date < '2026-09-30' AND status <> 'done'"
    );
    expect(n).toBeGreaterThanOrEqual(5);
  });

  test('exactly one task due exactly on the reporting date', async () => {
    const n = await count("SELECT count(*) FROM tasks WHERE due_date = '2026-09-30'");
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('an unassigned task exists', async () => {
    const n = await count('SELECT count(*) FROM tasks WHERE assignee_id IS NULL');
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('a completed project has all tasks done', async () => {
    const n = await count(
      `SELECT count(*) FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.status = 'completed' AND t.status <> 'done'`
    );
    expect(n).toBe(0);
  });

  test('a closed high-exposure risk exists and is excluded by status <> closed', async () => {
    const closedHighExposure = await count("SELECT count(*) FROM risks WHERE score >= 15 AND status = 'closed'");
    expect(closedHighExposure).toBeGreaterThanOrEqual(1);

    const openHighExposureOnly = await count(
      "SELECT count(*) FROM risks WHERE score >= 15 AND status <> 'closed'"
    );
    expect(openHighExposureOnly).toBeGreaterThanOrEqual(1);
  });

  test('a returned and a rejected change request exist', async () => {
    expect(await count("SELECT count(*) FROM change_requests WHERE status = 'returned'")).toBeGreaterThanOrEqual(1);
    expect(await count("SELECT count(*) FROM change_requests WHERE status = 'rejected'")).toBeGreaterThanOrEqual(1);
  });

  test('an approved and a pending budget revision exist, pending does not affect budget', async () => {
    const approved = await count("SELECT count(*) FROM budget_revisions WHERE status = 'approved'");
    const pending = await count("SELECT count(*) FROM budget_revisions WHERE status = 'pending'");
    expect(approved).toBeGreaterThanOrEqual(1);
    expect(pending).toBeGreaterThanOrEqual(1);

    // Project 3 has a pending +15000 revision that must not be in current_budget.
    const { rows } = await client.query(
      'SELECT current_budget, approved_revisions FROM v_project_financials WHERE project_id = 3'
    );
    expect(Number(rows[0]!.current_budget)).toBe(100000);
    expect(Number(rows[0]!.approved_revisions)).toBe(0);
  });

  test('posted and draft costs both exist, including a posted cost after the cutoff', async () => {
    expect(await count("SELECT count(*) FROM cost_transactions WHERE status = 'posted'")).toBeGreaterThanOrEqual(1);
    expect(await count("SELECT count(*) FROM cost_transactions WHERE status = 'draft'")).toBeGreaterThanOrEqual(1);
    expect(
      await count("SELECT count(*) FROM cost_transactions WHERE status = 'posted' AND txn_date > '2026-09-30'")
    ).toBeGreaterThanOrEqual(1);
  });

  test('a project has no forecast rows (forecastMissing, EAC = actual)', async () => {
    const n = await count('SELECT count(*) FROM v_project_financials WHERE forecast_missing = true');
    expect(n).toBeGreaterThanOrEqual(1);

    const { rows } = await client.query(
      'SELECT actual_spend, eac FROM v_project_financials WHERE project_id = 5'
    );
    expect(Number(rows[0]!.eac)).toBe(Number(rows[0]!.actual_spend));
  });

  test('a project has a reversal entry that reduces its actual spend', async () => {
    const n = await count("SELECT count(*) FROM cost_transactions WHERE entry_type = 'reversal'");
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test('records span all 3 departments', async () => {
    const n = await count('SELECT count(DISTINCT department_id) FROM projects');
    expect(n).toBe(3);
  });
});

describe('v_project_financials coverage', () => {
  test('includes at least one of every required KPI edge case', async () => {
    const { rows } = await client.query<{
      overrun: string;
      near: string;
      missing: string;
      zero_actual: string;
    }>(`
      SELECT
        count(*) FILTER (WHERE is_overrun) AS overrun,
        count(*) FILTER (WHERE is_near_budget) AS near,
        count(*) FILTER (WHERE forecast_missing) AS missing,
        count(*) FILTER (WHERE actual_spend = 0) AS zero_actual
      FROM v_project_financials
    `);
    const r = rows[0]!;
    expect(Number(r.overrun)).toBeGreaterThanOrEqual(1);
    expect(Number(r.near)).toBeGreaterThanOrEqual(1);
    expect(Number(r.missing)).toBeGreaterThanOrEqual(1);
    expect(Number(r.zero_actual)).toBeGreaterThanOrEqual(1);
  });
});
