import { withTx } from '../../db/tx.js';
import { writeAudit } from '../../lib/audit.js';
import { invalidTransition, notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as automationRepo from './automation.repository.js';
import type { AutomationRunRow, OutboxRow } from './automation.repository.js';
import * as mutationsRepo from './automation.mutations.repository.js';
import type { OutboxQuery, RunsQuery } from './automation.schemas.js';
import { runOverdueEscalation } from './overdueEscalation.job.js';
import { dispatchPending, type DispatchResult } from './outboxDispatcher.js';
import type { OverdueEscalationResult } from './overdueEscalation.job.js';

// Manual trigger: a producer pass followed by a dispatcher pass, both
// synchronous so the caller gets a complete, visible outcome in the
// response — this is also what the npm run automation:run CLI calls.
// Idempotent by design: a second call the same day finds the same
// unique-key conflicts the scheduled job would, so itemsCreated is 0 and
// no duplicate notifications are sent.
export async function runManualEscalation(
  actor: AuthUser,
  requestId: string,
): Promise<{ run: OverdueEscalationResult; dispatch: DispatchResult }> {
  const run = await runOverdueEscalation({ trigger: 'manual', actorId: actor.id });
  const dispatch = await dispatchPending();

  // The run and dispatch passes have already committed their own
  // transactions by this point; this audit row just records that an
  // admin triggered them manually (not atomic with either pass's work).
  await withTx((client) =>
    writeAudit(client, {
      actorId: actor.id,
      entityType: 'automation_run',
      entityId: run.runId,
      action: 'automation.overdue_escalation.run',
      before: null,
      after: { run, dispatch },
      requestId,
    }),
  );

  return { run, dispatch };
}

export async function listRuns(filters: RunsQuery): Promise<{ rows: AutomationRunRow[]; meta: PageMeta }> {
  const { rows, total } = await automationRepo.listRuns(filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listOutbox(filters: OutboxQuery): Promise<{ rows: OutboxRow[]; meta: PageMeta }> {
  const { rows, total } = await automationRepo.listOutbox(filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

// Admin-only recovery action: a 'failed' event (one that exhausted
// AUTOMATION_MAX_ATTEMPTS) is reset to 'pending' with attempts=0 so the
// dispatcher picks it up again. Any other status is an illegal transition.
export async function retryOutboxEvent(actor: AuthUser, id: number, requestId: string): Promise<void> {
  await withTx(async (client) => {
    const raw = await automationRepo.findRawOutboxForUpdate(id, client);
    if (!raw) throw notFound();
    if (raw.status !== 'failed') {
      throw invalidTransition(`Cannot retry an outbox event in status '${raw.status}'`);
    }

    await mutationsRepo.retryOutboxEvent(id, client);

    await writeAudit(client, {
      actorId: actor.id,
      entityType: 'outbox',
      entityId: id,
      action: 'outbox.retry',
      before: raw,
      after: { ...raw, status: 'pending', attempts: 0 },
      requestId,
    });
  });
}
