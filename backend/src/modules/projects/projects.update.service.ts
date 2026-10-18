import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, notFound } from '../../lib/errors.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as mutationsRepo from './projects.mutations.repository.js';
import * as projectsRepo from './projects.repository.js';
import type { ProjectSummaryRow, RawProjectRow } from './projects.repository.js';
import { isEligibleOwner } from './projects.shared.js';
import type { UpdateProjectBody } from './projects.schemas.js';

export async function updateProject(
  caller: AuthUser,
  id: number,
  body: UpdateProjectBody,
  requestId: string,
): Promise<ProjectSummaryRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, id, 'manage', client);
    const target = await projectsRepo.findProjectRowById(id, client);
    if (!target) throw notFound();

    const effectiveStart = body.startDate ?? target.start_date;
    const effectiveEnd = body.endDate ?? target.end_date;
    if (effectiveEnd < effectiveStart) {
      throw businessRule('End date must be on or after start date');
    }

    // "completed" only when every task on the project is done — checked
    // against the field actually submitted, not the row's current status.
    if (body.status === 'completed') {
      const openCount = await mutationsRepo.countOpenTasks(id, client);
      if (openCount > 0) {
        throw businessRule(`Cannot complete a project with ${openCount} open task(s)`, { openTaskCount: openCount });
      }
    }

    let newOwnerId: number | undefined;
    if (body.ownerId !== undefined && body.ownerId !== target.owner_id) {
      const owner = await mutationsRepo.findEligibleOwner(body.ownerId, client);
      if (!isEligibleOwner(owner)) {
        throw businessRule('Owner must be an active project manager or admin');
      }
      newOwnerId = body.ownerId;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) {
      params.push(body.name);
      sets.push(`name = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(body.description);
      sets.push(`description = $${params.length}`);
    }
    if (body.departmentId !== undefined) {
      params.push(body.departmentId);
      sets.push(`department_id = $${params.length}`);
    }
    if (body.ownerId !== undefined) {
      params.push(body.ownerId);
      sets.push(`owner_id = $${params.length}`);
    }
    if (body.status !== undefined) {
      params.push(body.status);
      sets.push(`status = $${params.length}`);
    }
    if (body.startDate !== undefined) {
      params.push(body.startDate);
      sets.push(`start_date = $${params.length}`);
    }
    if (body.endDate !== undefined) {
      params.push(body.endDate);
      sets.push(`end_date = $${params.length}`);
    }

    await updateWithVersion<RawProjectRow>(client, 'projects', id, body.version, sets.join(', '), params);

    if (newOwnerId !== undefined) {
      await mutationsRepo.upsertMember(id, newOwnerId, 'manager', client);
    }

    const after = await projectsRepo.findProjectSummaryById(id, resolveAsOf({}), client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'project',
      entityId: id,
      action: 'project.update',
      projectId: id,
      before: target,
      after,
      requestId,
    });

    return after!;
  });
}
