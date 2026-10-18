import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { businessRule, invalidTransition, notFound } from '../../lib/errors.js';
import { toMoney } from '../../lib/money.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import type { PageMeta } from '../../lib/pagination.js';
import * as categoriesRepo from './categories.repository.js';
import * as costsRepo from './costs.repository.js';
import type { CostRow, RawCostRow } from './costs.repository.js';
import * as mutationsRepo from './costs.mutations.repository.js';
import type {
  CreateCostBody,
  CrossProjectCostsQuery,
  ProjectCostsQuery,
  ReverseCostBody,
  UpdateCostBody,
} from './costs.schemas.js';

export async function listProjectCosts(
  caller: AuthUser,
  projectId: number,
  filters: ProjectCostsQuery,
): Promise<{ rows: CostRow[]; meta: PageMeta }> {
  await assertProjectAccess(caller, projectId, 'view');
  const { rows, total } = await costsRepo.listProjectCosts(projectId, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listCostsScoped(
  caller: AuthUser,
  filters: CrossProjectCostsQuery,
): Promise<{ rows: CostRow[]; meta: PageMeta }> {
  const { rows, total } = await costsRepo.listCostsScoped(caller, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function getCostById(caller: AuthUser, id: number): Promise<CostRow> {
  const raw = await costsRepo.findRawCostById(id);
  if (!raw) throw notFound();
  await assertProjectAccess(caller, raw.project_id, 'view');

  const cost = await costsRepo.findCostById(id);
  if (!cost) throw notFound();
  return cost;
}

export async function createCost(
  caller: AuthUser,
  projectId: number,
  body: CreateCostBody,
  requestId: string,
): Promise<CostRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);

    // Project must not be cancelled
    const { rows: projRows } = await client.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    if (projRows[0]?.status === 'cancelled') {
      throw businessRule('Cannot create costs on a cancelled project');
    }

    // Category must be active
    const category = await categoriesRepo.findCategoryById(body.categoryId, client);
    if (!category) {
      throw businessRule('Cost category not found');
    }
    if (!category.isActive) {
      throw businessRule('Cannot use an inactive cost category');
    }

    const raw = await mutationsRepo.insertCost(
      {
        projectId,
        categoryId: body.categoryId,
        txnDate: body.txnDate,
        amount: body.amount,
        description: body.description,
        vendor: body.vendor ?? null,
        createdBy: caller.id,
      },
      client,
    );

    const cost = await costsRepo.findCostById(raw.id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'cost_transaction',
      entityId: raw.id,
      action: 'cost.create',
      projectId,
      before: null,
      after: cost,
      requestId,
    });

    return cost!;
  });
}

export async function updateCost(
  caller: AuthUser,
  id: number,
  body: UpdateCostBody,
  requestId: string,
): Promise<CostRow> {
  return withTx(async (client) => {
    const raw = await costsRepo.findRawCostForUpdate(id, client);
    if (!raw) throw notFound();

    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    // Only drafts can be updated
    if (raw.status === 'posted') {
      throw invalidTransition('Posted cost transactions are immutable — use a reversal entry');
    }

    // Validate new category if changing
    if (body.categoryId !== undefined && body.categoryId !== raw.category_id) {
      const category = await categoriesRepo.findCategoryById(body.categoryId, client);
      if (!category) throw businessRule('Cost category not found');
      if (!category.isActive) throw businessRule('Cannot use an inactive cost category');
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (body.categoryId !== undefined) {
      params.push(body.categoryId);
      sets.push(`category_id = $${params.length}`);
    }
    if (body.txnDate !== undefined) {
      params.push(body.txnDate);
      sets.push(`txn_date = $${params.length}`);
    }
    if (body.amount !== undefined) {
      params.push(body.amount);
      sets.push(`amount = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(body.description);
      sets.push(`description = $${params.length}`);
    }
    if (body.vendor !== undefined) {
      params.push(body.vendor);
      sets.push(`vendor = $${params.length}`);
    }

    await updateWithVersion<RawCostRow>(client, 'cost_transactions', id, body.version, sets.join(', '), params);

    const cost = await costsRepo.findCostById(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'cost_transaction',
      entityId: id,
      action: 'cost.update',
      projectId: raw.project_id,
      before: raw,
      after: cost,
      requestId,
    });

    return cost!;
  });
}

export async function deleteCost(
  caller: AuthUser,
  id: number,
  requestId: string,
): Promise<void> {
  return withTx(async (client) => {
    const raw = await costsRepo.findRawCostForUpdate(id, client);
    if (!raw) throw notFound();

    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    if (raw.status === 'posted') {
      throw invalidTransition('Posted cost transactions are immutable — use a reversal entry');
    }

    await client.query(`DELETE FROM cost_transactions WHERE id = $1`, [id]);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'cost_transaction',
      entityId: id,
      action: 'cost.delete',
      projectId: raw.project_id,
      before: raw,
      after: null,
      requestId,
    });
  });
}

export interface PostCostResult {
  cost: CostRow;
  financials: {
    actualSpend: number | null;
    remainingBudget: number | null;
    utilization: number | null;
    currency: string;
  };
}

// Idempotent post: draft → posted. Returns the cost plus a refreshed
// financial summary from fn_project_financials so the caller can see the
// immediate impact on actual spend and utilization.
export async function postCost(
  caller: AuthUser,
  id: number,
  requestId: string,
): Promise<PostCostResult> {
  return withTx(async (client) => {
    const raw = await costsRepo.findRawCostForUpdate(id, client);
    if (!raw) throw notFound();

    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    // Already posted → idempotent success (the idempotency middleware handles
    // the key-level replay, but if the caller omits a key or this is a
    // different key for the same cost, return the current state).
    if (raw.status === 'posted') {
      const cost = await costsRepo.findCostById(id, client);
      const financials = await getProjectFinancials(raw.project_id, raw.txn_date, client);
      return { cost: cost!, financials };
    }

    const posted = await mutationsRepo.postCost(id, raw.version, caller.id, client);
    if (!posted) {
      throw invalidTransition('Cost is no longer in draft status');
    }

    const cost = await costsRepo.findCostById(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'cost_transaction',
      entityId: id,
      action: 'cost.post',
      projectId: raw.project_id,
      before: raw,
      after: cost,
      requestId,
    });

    const financials = await getProjectFinancials(raw.project_id, raw.txn_date, client);
    return { cost: cost!, financials };
  });
}

export async function reverseCost(
  caller: AuthUser,
  id: number,
  body: ReverseCostBody,
  requestId: string,
): Promise<CostRow> {
  return withTx(async (client) => {
    const raw = await costsRepo.findRawCostForUpdate(id, client);
    if (!raw) throw notFound();

    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    // Only posted expenses can be reversed
    if (raw.status !== 'posted') {
      throw invalidTransition('Only posted cost transactions can be reversed');
    }
    if (raw.entry_type !== 'expense') {
      throw invalidTransition('Only expense entries can be reversed (not reversals)');
    }

    const alreadyReversed = await costsRepo.isAlreadyReversed(id, client);
    if (alreadyReversed) {
      throw invalidTransition('This cost transaction has already been reversed');
    }

    const reversal = await mutationsRepo.insertReversal(
      {
        projectId: raw.project_id,
        categoryId: raw.category_id,
        txnDate: body.txnDate ?? raw.txn_date,
        amount: parseFloat(raw.amount),
        description: `Reversal: ${body.reason}`,
        reversesId: id,
        createdBy: caller.id,
        postedBy: caller.id,
      },
      client,
    );

    const cost = await costsRepo.findCostById(reversal.id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'cost_transaction',
      entityId: reversal.id,
      action: 'cost.reverse',
      projectId: raw.project_id,
      before: raw,
      after: cost,
      requestId,
    });

    return cost!;
  });
}

async function getProjectFinancials(
  projectId: number,
  asOf: string,
  client: import('pg').PoolClient | import('pg').Client,
): Promise<PostCostResult['financials']> {
  const { rows } = await client.query<{
    actual_spend: string;
    remaining_budget: string;
    utilization: string | null;
  }>(
    `SELECT actual_spend, remaining_budget, utilization
     FROM fn_project_financials($1) WHERE project_id = $2`,
    [asOf, projectId],
  );
  const row = rows[0];
  return {
    actualSpend: row ? toMoney(row.actual_spend) : 0,
    remainingBudget: row ? toMoney(row.remaining_budget) : 0,
    utilization: row ? toMoney(row.utilization) : null,
    currency: 'AED',
  };
}
