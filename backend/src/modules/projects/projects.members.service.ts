import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { businessRule, conflict, notFound } from '../../lib/errors.js';
import { toMoney } from '../../lib/money.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as detailRepo from './projects.detail.repository.js';
import * as membersRepo from './projects.members.repository.js';
import type { MemberRow } from './projects.members.repository.js';
import * as mutationsRepo from './projects.mutations.repository.js';
import * as projectsRepo from './projects.repository.js';
import type { AddMemberBody, ProgressSnapshotsQuery } from './projects.schemas.js';

export async function listMembers(caller: AuthUser, id: number): Promise<MemberRow[]> {
  await assertProjectAccess(caller, id, 'view');
  return membersRepo.findMembers(id);
}

export async function addMember(caller: AuthUser, id: number, body: AddMemberBody, requestId: string): Promise<MemberRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, id, 'manage', client);

    const user = await membersRepo.findActiveUser(body.userId, client);
    if (!user) throw notFound();
    if (!user.isActive) throw businessRule('User is not active');

    const existingRole = await membersRepo.findMemberRole(id, body.userId, client);
    if (existingRole !== null) throw conflict('User is already a member of this project');

    await membersRepo.insertMember(id, body.userId, body.memberRole, client);
    const after: MemberRow = {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      memberRole: body.memberRole,
      addedAt: new Date().toISOString(),
    };

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'project_member',
      entityId: body.userId,
      action: 'project_member.add',
      projectId: id,
      before: null,
      after,
      requestId,
    });

    return after;
  });
}

export async function removeMember(caller: AuthUser, id: number, userId: number, requestId: string): Promise<void> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, id, 'manage', client);

    const project = await projectsRepo.findProjectRowById(id, client);
    if (!project) throw notFound();
    if (project.owner_id === userId) {
      throw businessRule('Cannot remove the project owner from its membership');
    }

    const memberRole = await membersRepo.findMemberRole(id, userId, client);
    if (memberRole === null) throw notFound('User is not a member of this project');

    const openCount = await mutationsRepo.countOpenTasks(id, client, userId);
    if (openCount > 0) {
      throw businessRule(`Member has ${openCount} open assigned task(s) on this project`, { openTaskCount: openCount });
    }

    await membersRepo.removeMember(id, userId, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'project_member',
      entityId: userId,
      action: 'project_member.remove',
      projectId: id,
      before: { userId, memberRole },
      after: null,
      requestId,
    });
  });
}

export async function listProgressSnapshots(
  caller: AuthUser,
  id: number,
  query: ProgressSnapshotsQuery,
): Promise<{ rows: { snapshotDate: string; progressPct: number | null; actualSpend: number | null }[]; meta: PageMeta }> {
  await assertProjectAccess(caller, id, 'view');
  const { rows, total } = await detailRepo.findProgressSnapshots(id, query.page, query.pageSize);
  return {
    rows: rows.map((r) => ({
      snapshotDate: r.snapshotDate,
      progressPct: r.progressPct === null ? null : parseFloat(r.progressPct),
      actualSpend: toMoney(r.actualSpend),
    })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}
