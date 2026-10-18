import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { resolveAsOf } from '../../lib/dates.js';
import { businessRule, forbidden, notFound } from '../../lib/errors.js';
import { toMoney } from '../../lib/money.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as detailRepo from './projects.detail.repository.js';
import * as membersRepo from './projects.members.repository.js';
import * as mutationsRepo from './projects.mutations.repository.js';
import * as projectsRepo from './projects.repository.js';
import type { ProjectSummaryRow } from './projects.repository.js';
import type { MemberRow } from './projects.members.repository.js';
import { isEligibleOwner, viewScopeFor } from './projects.shared.js';
import type { CreateProjectBody, ProjectDetailQuery, ProjectsListQuery } from './projects.schemas.js';

export async function listProjects(
  caller: AuthUser,
  filters: ProjectsListQuery,
): Promise<{ rows: ProjectSummaryRow[]; meta: PageMeta }> {
  const asOf = resolveAsOf({ asOf: filters.asOf });
  const { rows, total } = await projectsRepo.listProjects(filters, viewScopeFor(caller), asOf);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export interface ProjectDetail extends ProjectSummaryRow {
  description: string | null;
  members: MemberRow[];
  counts: {
    taskCount: number;
    overdueTaskCount: number;
    openRiskCount: number;
    pendingCrCount: number;
  };
  budget: {
    currentBudget: number | null;
    actualSpend: number | null;
    utilization: number | null;
    currency: 'AED';
  };
}

export async function getProjectDetail(caller: AuthUser, id: number, query: ProjectDetailQuery): Promise<ProjectDetail> {
  await assertProjectAccess(caller, id, 'view');
  const asOf = resolveAsOf(query);

  const [summary, raw, members, counts, headline] = await Promise.all([
    projectsRepo.findProjectSummaryById(id, asOf),
    projectsRepo.findProjectRowById(id),
    membersRepo.findMembers(id),
    detailRepo.findProjectCounts(id, asOf),
    detailRepo.findBudgetHeadline(id, asOf),
  ]);
  if (!summary || !raw) throw notFound();

  return {
    ...summary,
    description: raw.description,
    members,
    counts,
    budget: {
      currentBudget: toMoney(headline.currentBudget),
      actualSpend: toMoney(headline.actualSpend),
      utilization: headline.utilization === null ? null : parseFloat(headline.utilization),
      currency: 'AED',
    },
  };
}

export async function createProject(
  caller: AuthUser,
  body: CreateProjectBody,
  requestId: string,
): Promise<ProjectSummaryRow> {
  // A project_manager may only create a project they themselves own; only
  // admin can assign a different owner.
  if (caller.role === 'project_manager' && body.ownerId !== caller.id) {
    throw forbidden('Project managers can only create projects they own');
  }

  const owner = await mutationsRepo.findEligibleOwner(body.ownerId);
  if (!isEligibleOwner(owner)) {
    throw businessRule('Owner must be an active project manager or admin');
  }

  if (body.endDate < body.startDate) {
    throw businessRule('End date must be on or after start date');
  }

  return withTx(async (client) => {
    const code = body.code ?? (await projectsRepo.nextProjectCode(client));

    const created = await mutationsRepo.insertProject(
      {
        code,
        name: body.name,
        description: body.description ?? null,
        departmentId: body.departmentId,
        ownerId: body.ownerId,
        status: body.status,
        startDate: body.startDate,
        endDate: body.endDate,
        createdBy: caller.id,
      },
      client,
    );

    // Owner is always also a project_members row with the 'manager' role —
    // one atomic transaction with the project and its initial budget.
    await mutationsRepo.upsertMember(created.id, body.ownerId, 'manager', client);
    await mutationsRepo.insertProjectBudget(created.id, body.initialBudget, caller.id, client);

    const summary = await projectsRepo.findProjectSummaryById(created.id, resolveAsOf({}), client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'project',
      entityId: created.id,
      action: 'project.create',
      projectId: created.id,
      before: null,
      after: summary,
      requestId,
    });

    return summary!;
  });
}
