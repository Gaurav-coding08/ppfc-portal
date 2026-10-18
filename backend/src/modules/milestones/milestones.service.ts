import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, notFound } from '../../lib/errors.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as milestonesRepo from './milestones.repository.js';
import type { MilestoneRow, RawMilestoneRow } from './milestones.repository.js';
import type { CreateMilestoneBody, MilestonesListQuery, UpdateMilestoneBody } from './milestones.schemas.js';

// Shared by create and update: an 'achieved' milestone must carry an
// achievedDate that is not in the future relative to asOf — the DB CHECK
// only enforces "achieved requires some achievedDate", not this stricter
// "not in the future" rule, so it's applied here.
function assertAchievedDateValid(status: string | undefined, achievedDate: string | null | undefined, asOf: string): void {
  if (status !== 'achieved') return;
  if (!achievedDate) {
    throw businessRule('An achieved milestone requires an achievedDate');
  }
  if (achievedDate > asOf) {
    throw businessRule('achievedDate cannot be in the future');
  }
}

export async function listProjectMilestones(
  caller: AuthUser,
  projectId: number,
  filters: MilestonesListQuery,
): Promise<MilestoneRow[]> {
  await assertProjectAccess(caller, projectId, 'view');
  const asOf = resolveAsOf({ asOf: filters.asOf });
  return milestonesRepo.listProjectMilestones(projectId, filters, asOf);
}

export async function createMilestone(
  caller: AuthUser,
  projectId: number,
  body: CreateMilestoneBody,
  requestId: string,
): Promise<MilestoneRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);

    const project = await projectsRepo.findProjectRowById(projectId, client);
    if (!project) throw notFound();

    if (body.dueDate < project.start_date || body.dueDate > project.end_date) {
      throw businessRule('Due date must fall within the project dates');
    }

    const status = body.status ?? 'planned';
    const asOf = resolveAsOf({});
    assertAchievedDateValid(status, body.achievedDate, asOf);

    const created = await milestonesRepo.insertMilestone(
      {
        projectId,
        name: body.name,
        dueDate: body.dueDate,
        status,
        achievedDate: body.achievedDate ?? null,
      },
      client,
    );

    const milestone = await milestonesRepo.findMilestoneById(created.id, asOf, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'milestone',
      entityId: created.id,
      action: 'milestone.create',
      projectId,
      before: null,
      after: milestone,
      requestId,
    });

    return milestone!;
  });
}

export async function updateMilestone(
  caller: AuthUser,
  id: number,
  body: UpdateMilestoneBody,
  requestId: string,
): Promise<MilestoneRow> {
  return withTx(async (client) => {
    const target = await milestonesRepo.findRawMilestoneById(id, client);
    if (!target) throw notFound();
    await assertProjectAccess(caller, target.project_id, 'manage', client);

    const effectiveStatus = body.status ?? target.status;
    const effectiveAchievedDate = body.achievedDate !== undefined ? body.achievedDate : target.achieved_date;
    const asOf = resolveAsOf({});
    assertAchievedDateValid(effectiveStatus, effectiveAchievedDate, asOf);

    if (body.dueDate !== undefined) {
      const project = await projectsRepo.findProjectRowById(target.project_id, client);
      if (!project) throw notFound();
      if (body.dueDate < project.start_date || body.dueDate > project.end_date) {
        throw businessRule('Due date must fall within the project dates');
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) {
      params.push(body.name);
      sets.push(`name = $${params.length}`);
    }
    if (body.dueDate !== undefined) {
      params.push(body.dueDate);
      sets.push(`due_date = $${params.length}`);
    }
    if (body.status !== undefined) {
      params.push(body.status);
      sets.push(`status = $${params.length}`);
    }
    if (body.achievedDate !== undefined) {
      params.push(body.achievedDate);
      sets.push(`achieved_date = $${params.length}`);
    }

    await updateWithVersion<RawMilestoneRow>(client, 'milestones', id, body.version, sets.join(', '), params);

    const after = await milestonesRepo.findMilestoneById(id, asOf, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'milestone',
      entityId: id,
      action: 'milestone.update',
      projectId: target.project_id,
      before: target,
      after,
      requestId,
    });

    return after!;
  });
}
