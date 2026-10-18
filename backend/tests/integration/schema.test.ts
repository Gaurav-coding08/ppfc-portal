import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

// Direct DB connection for schema-level tests — no HTTP layer needed.
let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

// Helper: insert the minimum rows needed for finance tests.
// Returns IDs for cleanup / assertions.
async function insertFinanceFixture(c: pg.Client) {
  // Department
  const { rows: [dept] } = await c.query<{ id: string }>(
    `INSERT INTO departments (code, name) VALUES ('TEST', 'Test Dept') RETURNING id`
  );
  // User
  const { rows: [user1] } = await c.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, role, department_id)
     VALUES ('fin-test@example.com', 'Fin Tester', 'hash', 'admin', $1) RETURNING id`,
    [dept!.id]
  );
  const { rows: [user2] } = await c.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, role, department_id)
     VALUES ('fin-test2@example.com', 'Fin Tester 2', 'hash', 'project_manager', $1) RETURNING id`,
    [dept!.id]
  );
  // Project
  const { rows: [proj] } = await c.query<{ id: string }>(
    `INSERT INTO projects (code, name, department_id, owner_id, status, start_date, end_date, created_by)
     VALUES ('PRJ-FIN', 'Finance Test', $1, $2, 'active', '2026-01-01', '2026-12-31', $2) RETURNING id`,
    [dept!.id, user1!.id]
  );
  // Cost category
  const { rows: [cat] } = await c.query<{ id: string }>(
    `INSERT INTO cost_categories (code, name) VALUES ('TEST-CAT', 'Test Category') RETURNING id`
  );

  return { deptId: dept!.id, userId1: user1!.id, userId2: user2!.id, projectId: proj!.id, categoryId: cat!.id };
}

async function cleanupFinanceFixture(c: pg.Client, f: Awaited<ReturnType<typeof insertFinanceFixture>>) {
  await c.query('DELETE FROM financial_forecasts WHERE project_id = $1', [f.projectId]);
  await c.query('DELETE FROM cost_transactions WHERE project_id = $1', [f.projectId]);
  await c.query('DELETE FROM budget_revisions WHERE project_id = $1', [f.projectId]);
  await c.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
  await c.query('DELETE FROM cost_categories WHERE id = $1', [f.categoryId]);
  await c.query('DELETE FROM projects WHERE id = $1', [f.projectId]);
  await c.query('DELETE FROM users WHERE id IN ($1, $2)', [f.userId1, f.userId2]);
  await c.query('DELETE FROM departments WHERE id = $1', [f.deptId]);
}

describe('Schema constraints', () => {
  test('cost_transactions: amount = 0 violates check constraint', async () => {
    const f = await insertFinanceFixture(client);
    try {
      await expect(
        client.query(
          `INSERT INTO cost_transactions (project_id, category_id, txn_date, amount, description, created_by)
           VALUES ($1, $2, '2026-06-01', 0, 'zero cost', $3)`,
          [f.projectId, f.categoryId, f.userId1]
        )
      ).rejects.toThrow(/check/i);
    } finally {
      await cleanupFinanceFixture(client, f);
    }
  });

  test('cost_transactions: updating a posted cost fails (trigger)', async () => {
    const f = await insertFinanceFixture(client);
    try {
      // Insert a posted cost
      const { rows: [cost] } = await client.query<{ id: string }>(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-06-01', 100, 'posted cost', 'posted', $3, now(), $3)
         RETURNING id`,
        [f.projectId, f.categoryId, f.userId1]
      );

      await expect(
        client.query(
          `UPDATE cost_transactions SET description = 'changed' WHERE id = $1`,
          [cost!.id]
        )
      ).rejects.toThrow(/immutable/i);
    } finally {
      // Cleanup: the posted row can't be deleted via normal DELETE because of
      // the trigger. Disable the trigger temporarily.
      await client.query('ALTER TABLE cost_transactions DISABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM cost_transactions WHERE project_id = $1', [f.projectId]);
      await client.query('ALTER TABLE cost_transactions ENABLE TRIGGER trg_prevent_posted_cost_mutation');
      await cleanupFinanceFixture(client, f);
    }
  });

  test('change_requests: decided_by = requested_by violates self-approval check', async () => {
    const f = await insertFinanceFixture(client);
    try {
      await expect(
        client.query(
          `INSERT INTO change_requests (code, project_id, title, requested_by, decided_by, decided_at, decision_reason)
           VALUES ('CR-SELF', $1, 'Self-approve', $2, $2, now(), 'because')`,
          [f.projectId, f.userId1]
        )
      ).rejects.toThrow(/check|constraint/i);
    } finally {
      await client.query('DELETE FROM change_requests WHERE code = $1', ['CR-SELF']);
      await cleanupFinanceFixture(client, f);
    }
  });

  test('cost_transactions: deleting a posted cost fails (trigger)', async () => {
    const f = await insertFinanceFixture(client);
    try {
      const { rows: [cost] } = await client.query<{ id: string }>(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-06-01', 100, 'posted cost', 'posted', $3, now(), $3)
         RETURNING id`,
        [f.projectId, f.categoryId, f.userId1]
      );

      await expect(
        client.query('DELETE FROM cost_transactions WHERE id = $1', [cost!.id])
      ).rejects.toThrow(/immutable/i);
    } finally {
      await client.query('ALTER TABLE cost_transactions DISABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM cost_transactions WHERE project_id = $1', [f.projectId]);
      await client.query('ALTER TABLE cost_transactions ENABLE TRIGGER trg_prevent_posted_cost_mutation');
      await cleanupFinanceFixture(client, f);
    }
  });

  test('budget_revisions: decided_by = requested_by violates self-approval check', async () => {
    const f = await insertFinanceFixture(client);
    try {
      await expect(
        client.query(
          `INSERT INTO budget_revisions
             (project_id, amount, rationale, status, requested_by, decided_by, decided_at, effective_date)
           VALUES ($1, 100, 'self-approve', 'approved', $2, $2, now(), '2026-06-01')`,
          [f.projectId, f.userId1]
        )
      ).rejects.toThrow(/check|constraint/i);
    } finally {
      await cleanupFinanceFixture(client, f);
    }
  });

  test('risks: score is computed as probability * impact', async () => {
    const f = await insertFinanceFixture(client);
    try {
      const { rows: [risk] } = await client.query<{ score: number }>(
        `INSERT INTO risks (project_id, type, title, probability, impact, owner_id)
         VALUES ($1, 'risk', 'Test risk', 3, 4, $2)
         RETURNING score`,
        [f.projectId, f.userId1]
      );
      expect(risk!.score).toBe(12);
    } finally {
      await client.query('DELETE FROM risks WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });
});

describe('fn_project_financials', () => {
  test('computes all KPIs correctly for a hand-built fixture', async () => {
    const f = await insertFinanceFixture(client);
    try {
      const asOf = '2026-09-30';

      // Budget: initial 1000
      await client.query(
        `INSERT INTO project_budgets (project_id, initial_amount, approved_by, approved_at)
         VALUES ($1, 1000, $2, now())`,
        [f.projectId, f.userId1]
      );
      // Approved revision +200 (effective before asOf)
      await client.query(
        `INSERT INTO budget_revisions (project_id, amount, rationale, status, requested_by, decided_by, decided_at, effective_date)
         VALUES ($1, 200, 'scope increase', 'approved', $2, $3, now(), '2026-06-01')`,
        [f.projectId, f.userId2, f.userId1]
      );
      // Pending revision +500 (should NOT affect current budget)
      await client.query(
        `INSERT INTO budget_revisions (project_id, amount, rationale, status, requested_by, effective_date)
         VALUES ($1, 500, 'wishful thinking', 'pending', $2, '2026-07-01')`,
        [f.projectId, f.userId2]
      );

      // Posted cost 300 on/before asOf
      await client.query(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-08-15', 300, 'Hardware', 'posted', $3, now(), $3)`,
        [f.projectId, f.categoryId, f.userId1]
      );
      // Draft cost 100 (should NOT count as actual)
      await client.query(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, created_by)
         VALUES ($1, $2, '2026-09-01', 100, 'Draft cost', 'draft', $3)`,
        [f.projectId, f.categoryId, f.userId1]
      );
      // Posted cost 50 AFTER asOf (should NOT count as actual)
      await client.query(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-10-15', 50, 'Future cost', 'posted', $3, now(), $3)`,
        [f.projectId, f.categoryId, f.userId1]
      );

      // Forecasts: 2 months after September 2026 → October and November
      await client.query(
        `INSERT INTO financial_forecasts (project_id, month, amount, updated_by)
         VALUES ($1, '2026-10-01', 100, $2), ($1, '2026-11-01', 100, $2)`,
        [f.projectId, f.userId1]
      );

      // Query
      const { rows } = await client.query(
        `SELECT * FROM fn_project_financials($1::date) WHERE project_id = $2`,
        [asOf, f.projectId]
      );
      expect(rows).toHaveLength(1);
      const r = rows[0]!;

      // current_budget = 1000 + 200 = 1200
      expect(Number(r.current_budget)).toBe(1200);
      expect(Number(r.initial_budget)).toBe(1000);
      expect(Number(r.approved_revisions)).toBe(200);

      // actual_spend = 300 (only posted, on/before asOf)
      expect(Number(r.actual_spend)).toBe(300);

      // remaining = 1200 - 300 = 900
      expect(Number(r.remaining_budget)).toBe(900);

      // utilization = 300 / 1200 = 0.25
      expect(Number(r.utilization)).toBeCloseTo(0.25, 4);

      // FTC = 100 + 100 = 200
      expect(Number(r.forecast_to_complete)).toBe(200);

      // EAC = 300 + 200 = 500
      expect(Number(r.eac)).toBe(500);

      // variance = 1200 - 500 = 700
      expect(Number(r.projected_variance)).toBe(700);

      expect(r.forecast_missing).toBe(false);
      expect(r.is_overrun).toBe(false);
      expect(r.is_near_budget).toBe(false);
    } finally {
      // Cleanup: disable trigger to allow deleting posted costs
      await client.query('ALTER TABLE cost_transactions DISABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM financial_forecasts WHERE project_id = $1', [f.projectId]);
      await client.query('DELETE FROM cost_transactions WHERE project_id = $1', [f.projectId]);
      await client.query('ALTER TABLE cost_transactions ENABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM budget_revisions WHERE project_id = $1', [f.projectId]);
      await client.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });

  test('zero-budget project returns utilization null', async () => {
    const f = await insertFinanceFixture(client);
    try {
      // Budget with initial_amount = 0
      await client.query(
        `INSERT INTO project_budgets (project_id, initial_amount) VALUES ($1, 0)`,
        [f.projectId]
      );

      const { rows } = await client.query(
        `SELECT * FROM fn_project_financials('2026-09-30'::date) WHERE project_id = $1`,
        [f.projectId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.utilization).toBeNull();
    } finally {
      await client.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });

  test('reversal entry reduces actual spend', async () => {
    const f = await insertFinanceFixture(client);
    try {
      await client.query(
        `INSERT INTO project_budgets (project_id, initial_amount) VALUES ($1, 1000)`,
        [f.projectId]
      );
      // Post an expense of 300
      const { rows: [expense] } = await client.query<{ id: string }>(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-08-01', 300, 'Expense', 'posted', $3, now(), $3)
         RETURNING id`,
        [f.projectId, f.categoryId, f.userId1]
      );
      // Post a reversal of 300 against it
      await client.query(
        `INSERT INTO cost_transactions
           (project_id, category_id, txn_date, amount, description, status, entry_type, reverses_id, posted_by, posted_at, created_by)
         VALUES ($1, $2, '2026-08-15', 300, 'Reversal', 'posted', 'reversal', $3, $4, now(), $4)`,
        [f.projectId, f.categoryId, expense!.id, f.userId1]
      );

      const { rows } = await client.query(
        `SELECT * FROM fn_project_financials('2026-09-30'::date) WHERE project_id = $1`,
        [f.projectId]
      );
      // 300 expense - 300 reversal = 0 actual spend
      expect(Number(rows[0]!.actual_spend)).toBe(0);
      expect(Number(rows[0]!.remaining_budget)).toBe(1000);
    } finally {
      await client.query('ALTER TABLE cost_transactions DISABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM cost_transactions WHERE project_id = $1', [f.projectId]);
      await client.query('ALTER TABLE cost_transactions ENABLE TRIGGER trg_prevent_posted_cost_mutation');
      await client.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });

  test('forecast in asOf month excluded from FTC', async () => {
    const f = await insertFinanceFixture(client);
    try {
      const asOf = '2026-09-30';
      await client.query(
        `INSERT INTO project_budgets (project_id, initial_amount) VALUES ($1, 1000)`,
        [f.projectId]
      );
      // Forecast for September (the asOf month) — should NOT count in FTC
      await client.query(
        `INSERT INTO financial_forecasts (project_id, month, amount, updated_by)
         VALUES ($1, '2026-09-01', 500, $2)`,
        [f.projectId, f.userId1]
      );
      // Forecast for October (after asOf month) — should count
      await client.query(
        `INSERT INTO financial_forecasts (project_id, month, amount, updated_by)
         VALUES ($1, '2026-10-01', 200, $2)`,
        [f.projectId, f.userId1]
      );

      const { rows } = await client.query(
        `SELECT * FROM fn_project_financials($1::date) WHERE project_id = $2`,
        [asOf, f.projectId]
      );
      // FTC should be 200 (October only), not 700 (Sep + Oct)
      expect(Number(rows[0]!.forecast_to_complete)).toBe(200);
    } finally {
      await client.query('DELETE FROM financial_forecasts WHERE project_id = $1', [f.projectId]);
      await client.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });

  test('approved revision effective after asOf excluded from current budget', async () => {
    const f = await insertFinanceFixture(client);
    try {
      const asOf = '2026-06-30';
      await client.query(
        `INSERT INTO project_budgets (project_id, initial_amount) VALUES ($1, 1000)`,
        [f.projectId]
      );
      // Approved revision effective BEFORE asOf — should count
      await client.query(
        `INSERT INTO budget_revisions
           (project_id, amount, rationale, status, requested_by, decided_by, decided_at, effective_date)
         VALUES ($1, 200, 'early', 'approved', $2, $3, now(), '2026-05-01')`,
        [f.projectId, f.userId2, f.userId1]
      );
      // Approved revision effective AFTER asOf — should NOT count
      await client.query(
        `INSERT INTO budget_revisions
           (project_id, amount, rationale, status, requested_by, decided_by, decided_at, effective_date)
         VALUES ($1, 300, 'future', 'approved', $2, $3, now(), '2026-07-15')`,
        [f.projectId, f.userId2, f.userId1]
      );

      const { rows } = await client.query(
        `SELECT * FROM fn_project_financials($1::date) WHERE project_id = $2`,
        [asOf, f.projectId]
      );
      // current_budget = 1000 + 200 = 1200, not 1500
      expect(Number(rows[0]!.current_budget)).toBe(1200);
      expect(Number(rows[0]!.approved_revisions)).toBe(200);
    } finally {
      await client.query('DELETE FROM budget_revisions WHERE project_id = $1', [f.projectId]);
      await client.query('DELETE FROM project_budgets WHERE project_id = $1', [f.projectId]);
      await cleanupFinanceFixture(client, f);
    }
  });
});
