import type { AuditEventRow, ChangeRequestRow, CostTransactionRow } from './types.js';

// Audit events exist only where a real mutation happened: a CR decision or
// a cost post. Nothing else in the dataset writes audit rows, matching
// CLAUDE.md's rule that audit writes happen inside the same transaction as
// the mutation they record.
export function buildAuditEvents(
  changeRequests: ChangeRequestRow[],
  costTransactions: CostTransactionRow[]
): AuditEventRow[] {
  const events: AuditEventRow[] = [];
  let id = 1;

  for (const cr of changeRequests) {
    if (!cr.decided_by) continue;
    events.push({
      id: id++,
      actor_id: cr.decided_by,
      entity_type: 'change_request',
      entity_id: cr.id,
      action: 'decide',
      project_id: cr.project_id,
      before: JSON.stringify({ status: 'submitted' }),
      after: JSON.stringify({ status: cr.status, decisionReason: cr.decision_reason }),
    });
  }

  for (const cost of costTransactions) {
    if (cost.status !== 'posted') continue;
    events.push({
      id: id++,
      actor_id: cost.posted_by,
      entity_type: 'cost_transaction',
      entity_id: cost.id,
      action: 'post',
      project_id: cost.project_id,
      before: JSON.stringify({ status: 'draft' }),
      after: JSON.stringify({ status: 'posted', amount: cost.amount, entryType: cost.entry_type }),
    });
  }

  return events;
}
