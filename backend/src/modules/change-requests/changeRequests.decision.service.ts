import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import {
  forbidden,
  invalidTransition,
  notFound,
  selfApproval,
  versionConflict,
} from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as crRepo from './changeRequests.repository.js';
import type { CrRow, HistoryRow } from './changeRequests.repository.js';
import * as mutationsRepo from './changeRequests.mutations.repository.js';
import type { DecisionBody, ResubmitBody } from './changeRequests.schemas.js';
import { nextStatus } from './changeRequests.workflow.js';

// Decide (approve / reject / return) a change request.
//
// Check order matters and is documented here:
//   1. scope  (404) — does the CR exist and can the caller see its project?
//   2. role   (403) — does the caller have manage access on the project?
//   3. self   (422) — is the caller the requester? (SELF_APPROVAL_FORBIDDEN)
//   4. state  (409) — is the transition legal? (INVALID_TRANSITION)
//   5. version(409) — is the version current? (VERSION_CONFLICT)
//
// FOR UPDATE + version check: the row lock serializes concurrent deciders
// so only one proceeds at a time; the version check catches stale clients
// who read the row before someone else decided it.
export async function decideCr(
  caller: AuthUser,
  id: number,
  body: DecisionBody,
  requestId: string,
): Promise<{ cr: CrRow; history: HistoryRow[] }> {
  return withTx(async (client) => {
    // 1. Lock and load
    const raw = await crRepo.findRawCrForUpdate(id, client);
    if (!raw) throw notFound();

    // 2. Scope → 404 if out of scope; role → 403 if not manage
    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    // 3. Self-approval → 422
    if (caller.id === raw.requested_by) {
      throw selfApproval();
    }

    // 4. State transition → 409
    const newStatus = nextStatus(raw.status as Parameters<typeof nextStatus>[0], body.decision);
    if (!newStatus) {
      throw invalidTransition(
        `Cannot ${body.decision} a change request in status '${raw.status}'`,
      );
    }

    // 5. Version check via the UPDATE's WHERE clause
    const updated = await mutationsRepo.updateCrDecision(
      id,
      body.version,
      newStatus,
      caller.id,
      body.reason,
      client,
    );
    if (!updated) {
      throw versionConflict();
    }

    await mutationsRepo.insertHistory(
      id,
      raw.status,
      newStatus,
      caller.id,
      body.reason,
      client,
    );

    const cr = await crRepo.findCrById(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'change_request',
      entityId: id,
      action: `change_request.${body.decision}`,
      projectId: raw.project_id,
      before: raw,
      after: cr,
      requestId,
    });

    // TODO: outbox insert for approved-change notification (automation phase)

    const history = await crRepo.findCrHistory(id, client);
    return { cr: cr!, history };
  });
}

// Resubmit a returned change request — requester only.
export async function resubmitCr(
  caller: AuthUser,
  id: number,
  body: ResubmitBody,
  requestId: string,
): Promise<{ cr: CrRow; history: HistoryRow[] }> {
  return withTx(async (client) => {
    const raw = await crRepo.findRawCrForUpdate(id, client);
    if (!raw) throw notFound();

    await assertProjectAccess(caller, raw.project_id, 'view', client);

    // Only the original requester can resubmit.
    if (caller.id !== raw.requested_by) {
      throw forbidden('Only the original requester can resubmit');
    }

    // State check
    const newStatus = nextStatus(raw.status as Parameters<typeof nextStatus>[0], 'resubmit');
    if (!newStatus) {
      throw invalidTransition(
        `Cannot resubmit a change request in status '${raw.status}'`,
      );
    }

    const updated = await mutationsRepo.updateCrResubmit(
      id,
      body.version,
      body.title,
      body.description,
      client,
    );
    if (!updated) {
      throw versionConflict();
    }

    await mutationsRepo.insertHistory(
      id,
      raw.status,
      newStatus,
      caller.id,
      null,
      client,
    );

    const cr = await crRepo.findCrById(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'change_request',
      entityId: id,
      action: 'change_request.resubmit',
      projectId: raw.project_id,
      before: raw,
      after: cr,
      requestId,
    });

    const history = await crRepo.findCrHistory(id, client);
    return { cr: cr!, history };
  });
}
