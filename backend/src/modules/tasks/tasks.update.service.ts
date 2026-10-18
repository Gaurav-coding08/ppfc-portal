import { withTx } from '../../db/tx.js';
import { getProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, forbidden, notFound } from '../../lib/errors.js';
import { updateWithVersion } from '../../lib/versioning.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as membersRepo from '../projects/projects.members.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as tasksRepo from './tasks.repository.js';
import type { RawTaskRow, TaskRow } from './tasks.repository.js';
import { CONTRIBUTOR_EDITABLE_FIELDS, type UpdateTaskBody } from './tasks.schemas.js';
import { resolveStatusProgress } from './tasks.shared.js';

// Resolves whether `caller` may PATCH this task and, if so, which of the
// submitted fields they're allowed to apply. Mirrors CLAUDE.md's role table:
// manage access (project_manager/admin on their project) may change any
// field; a contributor who is the task's own assignee may change only
// progress/status; anyone else with view-only access is forbidden; no view
// access at all is 404 (don't leak existence).
async function assertFieldAccess(caller: AuthUser, task: RawTaskRow, body: UpdateTaskBody): Promise<void> {
  const access = await getProjectAccess(caller.id, caller.role, task.project_id);
  if (!access || !access.canView) throw notFound();
  if (access.canManage) return;

  const isAssignee = task.assignee_id === caller.id;
  if (!isAssignee) throw forbidden();

  const submittedFields = Object.keys(body).filter((key) => key !== 'version');
  const disallowed = submittedFields.filter(
    (key) => !(CONTRIBUTOR_EDITABLE_FIELDS as readonly string[]).includes(key),
  );
  if (disallowed.length > 0) {
    throw forbidden('Only progress and status may be updated on your own task', { fields: disallowed });
  }
}

export async function updateTask(
  caller: AuthUser,
  id: number,
  body: UpdateTaskBody,
  requestId: string,
): Promise<TaskRow> {
  return withTx(async (client) => {
    const target = await tasksRepo.findRawTaskById(id, client);
    if (!target) throw notFound();

    await assertFieldAccess(caller, target, body);

    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      const memberRole = await membersRepo.findMemberRole(target.project_id, body.assigneeId, client);
      if (memberRole === null) {
        throw businessRule('Assignee must be a member of this project');
      }
    }

    const effectiveStart = body.startDate !== undefined ? body.startDate : target.start_date;
    const effectiveDue = body.dueDate ?? target.due_date;
    if (effectiveStart && effectiveDue < effectiveStart) {
      throw businessRule('Due date must be on or after the start date');
    }
    if (body.dueDate !== undefined) {
      const project = await projectsRepo.findProjectRowById(target.project_id, client);
      if (!project) throw notFound();
      if (body.dueDate < project.start_date || body.dueDate > project.end_date) {
        throw businessRule('Due date must fall within the project dates');
      }
    }

    const resolved = resolveStatusProgress(
      { status: target.status, progress: target.progress, completedAt: target.completed_at },
      { status: body.status, progress: body.progress },
    );

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.title !== undefined) {
      params.push(body.title);
      sets.push(`title = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(body.description);
      sets.push(`description = $${params.length}`);
    }
    if (body.assigneeId !== undefined) {
      params.push(body.assigneeId);
      sets.push(`assignee_id = $${params.length}`);
    }
    if (body.priority !== undefined) {
      params.push(body.priority);
      sets.push(`priority = $${params.length}`);
    }
    if (body.startDate !== undefined) {
      params.push(body.startDate);
      sets.push(`start_date = $${params.length}`);
    }
    if (body.dueDate !== undefined) {
      params.push(body.dueDate);
      sets.push(`due_date = $${params.length}`);
    }
    if (body.weight !== undefined) {
      params.push(body.weight);
      sets.push(`weight = $${params.length}`);
    }
    params.push(resolved.status);
    sets.push(`status = $${params.length}`);
    params.push(resolved.progress);
    sets.push(`progress = $${params.length}`);
    params.push(resolved.completedAt);
    sets.push(`completed_at = $${params.length}`);

    await updateWithVersion<RawTaskRow>(client, 'tasks', id, body.version, sets.join(', '), params);

    const after = await tasksRepo.findTaskById(id, resolveAsOf({}), client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'task',
      entityId: id,
      action: 'task.update',
      projectId: target.project_id,
      before: target,
      after,
      requestId,
    });

    return after!;
  });
}
