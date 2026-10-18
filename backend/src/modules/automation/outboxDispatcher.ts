import type { PoolClient } from 'pg';
import { withTx } from '../../db/tx.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import * as mutationsRepo from './automation.mutations.repository.js';
import type { ClaimedOutboxEvent, NotificationInput } from './automation.mutations.repository.js';

// Turns one outbox event into the notification rows for its recipients.
// Injectable (the `deliver` param on dispatchPending) so tests can force a
// delivery failure without needing a real external channel — production
// swaps this for an adapter that also sends email/Teams, still writing the
// same in-app notification rows.
export type DeliverFn = (event: ClaimedOutboxEvent, client: PoolClient) => Promise<void>;

function resolveRecipients(event: ClaimedOutboxEvent): { userId: number; title: string; body: string; link: string }[] {
  if (event.eventType === 'TASK_OVERDUE') {
    const p = event.payload as {
      taskId: number;
      projectId: number;
      projectCode: string;
      title: string;
      dueDate: string;
      daysOverdue: number;
      assigneeId: number | null;
      managerId: number;
    };
    const link = `/projects/${p.projectId}/tasks/${p.taskId}`;
    const title = `Task overdue: ${p.title}`;
    const body = `${p.projectCode}: due ${p.dueDate}, ${p.daysOverdue} day(s) overdue`;

    // Unassigned task → manager only; otherwise assignee + manager,
    // de-duplicated in case the manager is also the assignee.
    const recipientIds = [...new Set([p.assigneeId, p.managerId].filter((id): id is number => id !== null))];
    return recipientIds.map((userId) => ({ userId, title, body, link }));
  }

  if (event.eventType === 'CR_APPROVED') {
    const p = event.payload as {
      crId: number;
      code: string;
      projectId: number;
      requesterId: number;
      reason: string | null;
    };
    return [
      {
        userId: p.requesterId,
        title: `Change request approved: ${p.code}`,
        body: p.reason ? `Approved: ${p.reason}` : 'Approved',
        link: `/projects/${p.projectId}/change-requests/${p.crId}`,
      },
    ];
  }

  // Unknown event types are delivered as a no-op rather than thrown — an
  // outbox row with no recipients still gets marked 'sent' with zero
  // notifications, which is correct: there was nothing to deliver.
  return [];
}

export const createInAppNotifications: DeliverFn = async (event, client) => {
  const recipients = resolveRecipients(event);
  const notifications: NotificationInput[] = recipients.map((r) => ({
    userId: r.userId,
    title: r.title,
    body: r.body,
    link: r.link,
  }));
  await mutationsRepo.insertNotifications(event.id, notifications, client);
};

export interface DispatchResult {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
}

// Carries the claimed event out of a rolled-back transaction so the
// retry/backoff step (which runs in a brand-new transaction, after the
// failed one has already rolled back) still knows which row and attempt
// count it's updating.
class DeliveryFailure extends Error {
  constructor(readonly event: ClaimedOutboxEvent, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

// Processes exactly one claimed event per call. Returns null when the
// queue was empty (nothing to claim).
//
// On success: claim + deliver + mark 'sent' commit together in one
// transaction (CLAUDE.md "any mutation atomic with its history uses
// withTx" — here the "history" is the outbox row itself).
//
// On failure: that transaction rolls back (so the failed notification
// insert never commits), then — in a brand-new transaction — attempts is
// incremented and next_attempt_at is pushed out with exponential backoff.
// Splitting this into two transactions is deliberate: the failure record
// must survive even though the work it describes didn't.
async function processOneEvent(deliver: DeliverFn): Promise<'sent' | 'retried' | 'failed' | null> {
  try {
    const event = await withTx(async (client) => {
      const claimed = await mutationsRepo.claimNextPendingOutboxEvent(client);
      if (!claimed) return null;

      try {
        await deliver(claimed, client);
      } catch (err) {
        throw new DeliveryFailure(claimed, err);
      }
      await mutationsRepo.markOutboxSent(claimed.id, client);
      return claimed;
    });
    return event ? 'sent' : null;
  } catch (err) {
    if (!(err instanceof DeliveryFailure)) throw err;

    const newAttempts = err.event.attempts + 1;
    const outcome = await withTx((client) =>
      mutationsRepo.markOutboxRetryOrFailed(err.event.id, newAttempts, err.message, env.AUTOMATION_MAX_ATTEMPTS, client),
    );
    logger.warn(
      { outboxId: err.event.id, eventType: err.event.eventType, attempts: newAttempts, err: err.message, outcome },
      'outbox event delivery failed',
    );
    return outcome === 'pending' ? 'retried' : 'failed';
  }
}

export async function dispatchPending(opts: { limit?: number; deliver?: DeliverFn } = {}): Promise<DispatchResult> {
  const limit = opts.limit ?? 50;
  const deliver = opts.deliver ?? createInAppNotifications;

  const result: DispatchResult = { processed: 0, sent: 0, retried: 0, failed: 0 };

  for (let i = 0; i < limit; i++) {
    const outcome = await processOneEvent(deliver);
    if (outcome === null) break;
    result.processed++;
    result[outcome]++;
  }

  return result;
}
