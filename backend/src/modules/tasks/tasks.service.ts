import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as membersRepo from '../projects/projects.members.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as mutationsRepo from './tasks.mutations.repository.js';
import * as tasksRepo from './tasks.repository.js';
import type { TaskRow } from './tasks.repository.js';
import { resolveStatusProgress } from './tasks.shared.js';
import type { CreateTaskBody, MyTasksQuery, ProjectTasksQuery } from './tasks.schemas.js';

export async function listProjectTasks(
  caller: AuthUser,
  projectId: number,
  filters: ProjectTasksQuery,
): Promise<{ rows: TaskRow[]; meta: PageMeta }> {
  await assertProjectAccess(caller, projectId, 'view');
  const asOf = resolveAsOf({ asOf: filters.asOf });
  const { rows, total } = await tasksRepo.listProjectTasks(projectId, filters, asOf);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listMyTasks(caller: AuthUser, filters: MyTasksQuery): Promise<{ rows: TaskRow[]; meta: PageMeta }> {
  const asOf = resolveAsOf({ asOf: filters.asOf });
  const { rows, total } = await tasksRepo.listMyTasks(caller.id, filters, asOf);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function getTaskById(caller: AuthUser, id: number, asOfQuery: { asOf?: string }): Promise<TaskRow> {
  const raw = await tasksRepo.findRawTaskById(id);
  if (!raw) throw notFound();
  await assertProjectAccess(caller, raw.project_id, 'view');

  const asOf = resolveAsOf(asOfQuery);
  const task = await tasksRepo.findTaskById(id, asOf);
  if (!task) throw notFound();
  return task;
}

export async function createTask(
  caller: AuthUser,
  projectId: number,
  body: CreateTaskBody,
  requestId: string,
): Promise<TaskRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);

    const project = await projectsRepo.findProjectRowById(projectId, client);
    if (!project) throw notFound();

    if (body.assigneeId !== undefined) {
      const memberRole = await membersRepo.findMemberRole(projectId, body.assigneeId, client);
      if (memberRole === null) {
        throw businessRule('Assignee must be a member of this project');
      }
    }

    const effectiveStart = body.startDate ?? null;
    if (effectiveStart && body.dueDate < effectiveStart) {
      throw businessRule('Due date must be on or after the start date');
    }
    if (body.dueDate < project.start_date || body.dueDate > project.end_date) {
      throw businessRule('Due date must fall within the project dates');
    }

    const resolved = resolveStatusProgress(
      { status: 'todo', progress: 0, completedAt: null },
      { status: body.status, progress: body.progress },
    );

    const created = await mutationsRepo.insertTask(
      {
        projectId,
        title: body.title,
        description: body.description ?? null,
        assigneeId: body.assigneeId ?? null,
        status: resolved.status,
        priority: body.priority,
        startDate: effectiveStart,
        dueDate: body.dueDate,
        weight: body.weight,
        progress: resolved.progress,
        completedAt: resolved.completedAt,
      },
      client,
    );

    const task = await tasksRepo.findTaskById(created.id, resolveAsOf({}), client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'task',
      entityId: created.id,
      action: 'task.create',
      projectId,
      before: null,
      after: task,
      requestId,
    });

    return task!;
  });
}

export async function deleteTask(caller: AuthUser, id: number, requestId: string): Promise<void> {
  return withTx(async (client) => {
    const raw = await tasksRepo.findRawTaskById(id, client);
    if (!raw) throw notFound();
    await assertProjectAccess(caller, raw.project_id, 'manage', client);

    if (raw.status !== 'todo' || raw.progress !== 0) {
      throw businessRule('Only a task with no progress (status todo, progress 0) can be deleted');
    }

    await mutationsRepo.deleteTask(id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'task',
      entityId: id,
      action: 'task.delete',
      projectId: raw.project_id,
      before: raw,
      after: null,
      requestId,
    });
  });
}
