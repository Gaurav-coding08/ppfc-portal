import { withTx } from '../../db/tx.js';
import { env } from '../../config/env.js';
import { conflict } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import * as mutationsRepo from './automation.mutations.repository.js';

const JOB_NAME = 'overdue-escalation';

export interface OverdueEscalationResult {
  runId: number;
  itemsFound: number;
  itemsCreated: number;
}

export interface RunOverdueEscalationInput {
  asOf?: string;
  trigger: 'schedule' | 'manual';
  actorId?: number;
}

// Finds overdue incomplete tasks as of `asOf` and queues one TASK_OVERDUE
// outbox event per task per day.
//
// The automation_runs row is inserted in its own short transaction
// (mutationsRepo.startRun uses the pool directly, not the client below)
// *before* the main transaction even opens, so a run row exists — and can
// be marked 'failed' — even if the advisory lock attempt or the scan
// itself throws. Production would schedule this against `current_date`;
// it takes `asOf` instead so the API/tests can pin it to the reporting
// date (REPORTING_DATE), per CLAUDE.md's financial-definitions pattern.
export async function runOverdueEscalation(input: RunOverdueEscalationInput): Promise<OverdueEscalationResult> {
  const asOf = input.asOf ?? env.REPORTING_DATE;
  const runId = await mutationsRepo.startRun(JOB_NAME);

  try {
    const { itemsFound, itemsCreated } = await withTx(async (client) => {
      // Non-blocking: a concurrent run (cron tick overlapping a manual
      // trigger) fails fast instead of queueing behind this one. The lock
      // is scoped to this transaction and releases automatically on
      // commit or rollback.
      const { rows } = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext('${JOB_NAME}')) AS locked`,
      );
      if (!rows[0]!.locked) {
        throw conflict('JOB_ALREADY_RUNNING');
      }

      const overdueTasks = await mutationsRepo.selectOverdueTasks(asOf, client);
      const createdIds = await mutationsRepo.insertOverdueOutboxRows(asOf, overdueTasks, client);

      return { itemsFound: overdueTasks.length, itemsCreated: createdIds.length };
    });

    await mutationsRepo.finishRun(runId, 'success', { itemsFound, itemsCreated }, null);
    logger.info({ jobName: JOB_NAME, runId, trigger: input.trigger, itemsFound, itemsCreated }, 'overdue escalation run finished');
    return { runId, itemsFound, itemsCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await mutationsRepo.finishRun(runId, 'failed', { itemsFound: null, itemsCreated: null }, message);
    logger.error({ jobName: JOB_NAME, runId, trigger: input.trigger, err: message }, 'overdue escalation run failed');
    throw err;
  }
}
