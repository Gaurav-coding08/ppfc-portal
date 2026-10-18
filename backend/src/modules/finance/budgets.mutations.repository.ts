import type { Client, PoolClient } from 'pg';
import type { RawRevisionRow } from './budgets.repository.js';

export async function insertRevision(
  input: {
    projectId: number;
    amount: number;
    rationale: string;
    effectiveDate: string;
    requestedBy: number;
  },
  client: PoolClient | Client,
): Promise<RawRevisionRow> {
  const { rows } = await client.query<RawRevisionRow>(
    `INSERT INTO budget_revisions (project_id, amount, rationale, effective_date, requested_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.projectId, input.amount, input.rationale, input.effectiveDate, input.requestedBy],
  );
  return rows[0]!;
}

export async function updateRevisionDecision(
  id: number,
  status: 'approved' | 'rejected',
  decidedBy: number,
  reason: string,
  client: PoolClient | Client,
): Promise<RawRevisionRow | null> {
  const { rows } = await client.query<RawRevisionRow>(
    `UPDATE budget_revisions
     SET status = $1, decided_by = $2, decided_at = now(), decision_reason = $3
     WHERE id = $4 AND status = 'pending'
     RETURNING *`,
    [status, decidedBy, reason, id],
  );
  return rows[0] ?? null;
}

// Checks whether approving this revision would make the current budget negative.
// current_budget already includes only approved revisions; adding this one's
// amount must leave the total >= 0.
export async function wouldMakeBudgetNegative(
  projectId: number,
  revisionAmount: number,
  asOf: string,
  client: PoolClient | Client,
): Promise<boolean> {
  const { rows } = await client.query<{ current_budget: string }>(
    `SELECT current_budget FROM fn_project_financials($1) WHERE project_id = $2`,
    [asOf, projectId],
  );
  const currentBudget = rows[0] ? parseFloat(rows[0].current_budget) : 0;
  return currentBudget + revisionAmount < 0;
}
