import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, invalidTransition, notFound, selfApproval } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as budgetsRepo from './budgets.repository.js';
import type { BudgetSummary } from './budgets.repository.js';
import * as mutationsRepo from './budgets.mutations.repository.js';
import type { CreateRevisionBody, RevisionDecisionBody } from './budgets.schemas.js';

export async function getBudget(
  caller: AuthUser,
  projectId: number,
  query: { asOf?: string },
): Promise<BudgetSummary> {
  await assertProjectAccess(caller, projectId, 'view');
  const asOf = resolveAsOf(query);
  return budgetsRepo.findBudgetSummary(projectId, asOf);
}

export async function createRevision(
  caller: AuthUser,
  projectId: number,
  body: CreateRevisionBody,
  requestId: string,
): Promise<budgetsRepo.RevisionRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);

    // A revision that would make current budget < 0 is rejected upfront.
    const asOf = body.effectiveDate;
    const wouldGoNegative = await mutationsRepo.wouldMakeBudgetNegative(
      projectId,
      body.amount,
      asOf,
      client,
    );
    if (wouldGoNegative) {
      throw businessRule('This revision would make the current budget negative');
    }

    const raw = await mutationsRepo.insertRevision(
      {
        projectId,
        amount: body.amount,
        rationale: body.rationale,
        effectiveDate: body.effectiveDate,
        requestedBy: caller.id,
      },
      client,
    );

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'budget_revision',
      entityId: raw.id,
      action: 'budget_revision.create',
      projectId,
      before: null,
      after: raw,
      requestId,
    });

    // Re-read with joined names for the response
    const summary = await budgetsRepo.findBudgetSummary(projectId, asOf, client);
    return summary.revisions.find((r) => r.id === raw.id)!;
  });
}

// Admin-only decision on a budget revision. Check order:
//   1. Existence (404)
//   2. Self-approval (422 SELF_APPROVAL_FORBIDDEN)
//   3. State — must be pending (422 INVALID_TRANSITION)
//   4. Apply decision atomically with audit
export async function decideRevision(
  caller: AuthUser,
  id: number,
  body: RevisionDecisionBody,
  requestId: string,
): Promise<budgetsRepo.RevisionRow> {
  return withTx(async (client) => {
    const raw = await budgetsRepo.findRawRevisionForUpdate(id, client);
    if (!raw) throw notFound();

    // Requester cannot decide their own revision
    if (caller.id === raw.requested_by) {
      throw selfApproval('You cannot decide your own budget revision');
    }

    if (raw.status !== 'pending') {
      throw invalidTransition(
        `Cannot ${body.decision} a budget revision in status '${raw.status}'`,
      );
    }

    const statusMap = { approve: 'approved', reject: 'rejected' } as const;
    const newStatus = statusMap[body.decision];

    const updated = await mutationsRepo.updateRevisionDecision(
      id,
      newStatus,
      caller.id,
      body.reason,
      client,
    );
    if (!updated) {
      throw invalidTransition('Revision is no longer pending');
    }

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'budget_revision',
      entityId: id,
      action: `budget_revision.${body.decision}`,
      projectId: raw.project_id,
      before: raw,
      after: updated,
      requestId,
    });

    const summary = await budgetsRepo.findBudgetSummary(raw.project_id, raw.effective_date, client);
    return summary.revisions.find((r) => r.id === id)!;
  });
}
