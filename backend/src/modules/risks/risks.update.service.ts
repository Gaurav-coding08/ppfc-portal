import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { businessRule, notFound } from '../../lib/errors.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as membersRepo from '../projects/projects.members.repository.js';
import * as risksRepo from './risks.repository.js';
import type { RawRiskRow, RiskRow } from './risks.repository.js';
import { hasRequiredMitigation } from './risks.shared.js';
import type { UpdateRiskBody } from './risks.schemas.js';

export async function updateRisk(
  caller: AuthUser,
  id: number,
  body: UpdateRiskBody,
  requestId: string,
): Promise<RiskRow> {
  return withTx(async (client) => {
    const target = await risksRepo.findRawRiskById(id, client);
    if (!target) throw notFound();
    await assertProjectAccess(caller, target.project_id, 'manage', client);

    if (body.ownerId !== undefined && body.ownerId !== null) {
      const memberRole = await membersRepo.findMemberRole(target.project_id, body.ownerId, client);
      if (memberRole === null) {
        throw businessRule('Owner must be a member of this project');
      }
    }

    const effectiveProbability = body.probability ?? target.probability;
    const effectiveImpact = body.impact ?? target.impact;
    const effectiveMitigation = body.mitigation !== undefined ? body.mitigation : target.mitigation;
    const effectiveScore = effectiveProbability * effectiveImpact;

    if (!hasRequiredMitigation(effectiveScore, effectiveMitigation)) {
      throw businessRule('Mitigation is required once a risk reaches high exposure (score >= 15)');
    }

    // Closing sets closed_at to now() on the transition into 'closed';
    // reopening (moving away from 'closed') clears it; staying in either
    // state leaves it untouched.
    const effectiveStatus = body.status ?? target.status;
    let closedAt: string | null;
    if (effectiveStatus === 'closed') {
      closedAt = target.status === 'closed' ? target.closed_at : new Date().toISOString();
    } else {
      closedAt = null;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.type !== undefined) {
      params.push(body.type);
      sets.push(`type = $${params.length}`);
    }
    if (body.title !== undefined) {
      params.push(body.title);
      sets.push(`title = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(body.description);
      sets.push(`description = $${params.length}`);
    }
    if (body.ownerId !== undefined) {
      params.push(body.ownerId);
      sets.push(`owner_id = $${params.length}`);
    }
    if (body.probability !== undefined) {
      params.push(body.probability);
      sets.push(`probability = $${params.length}`);
    }
    if (body.impact !== undefined) {
      params.push(body.impact);
      sets.push(`impact = $${params.length}`);
    }
    if (body.mitigation !== undefined) {
      params.push(body.mitigation);
      sets.push(`mitigation = $${params.length}`);
    }
    if (body.dueDate !== undefined) {
      params.push(body.dueDate);
      sets.push(`due_date = $${params.length}`);
    }
    params.push(effectiveStatus);
    sets.push(`status = $${params.length}`);
    params.push(closedAt);
    sets.push(`closed_at = $${params.length}`);

    await updateWithVersion<RawRiskRow>(client, 'risks', id, body.version, sets.join(', '), params);

    const after = await risksRepo.findRiskById(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'risk',
      entityId: id,
      action: 'risk.update',
      projectId: target.project_id,
      before: target,
      after,
      requestId,
    });

    return after!;
  });
}
