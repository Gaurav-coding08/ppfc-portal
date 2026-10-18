import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { businessRule, notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as membersRepo from '../projects/projects.members.repository.js';
import * as mutationsRepo from './risks.mutations.repository.js';
import * as risksRepo from './risks.repository.js';
import type { RiskRow } from './risks.repository.js';
import { hasRequiredMitigation } from './risks.shared.js';
import type { CreateRiskBody, HighExposureQuery, ProjectRisksQuery, RisksListQuery } from './risks.schemas.js';

export async function listProjectRisks(
  caller: AuthUser,
  projectId: number,
  filters: ProjectRisksQuery,
): Promise<{ rows: RiskRow[]; meta: PageMeta }> {
  await assertProjectAccess(caller, projectId, 'view');
  const { rows, total } = await risksRepo.listProjectRisks(projectId, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listRisksScoped(
  caller: AuthUser,
  filters: RisksListQuery,
): Promise<{ rows: RiskRow[]; meta: PageMeta }> {
  const { rows, total } = await risksRepo.listRisksScoped(caller, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function listHighExposureRisks(
  caller: AuthUser,
  filters: HighExposureQuery,
): Promise<{ rows: RiskRow[]; meta: PageMeta }> {
  const { rows, total } = await risksRepo.listHighExposureRisks(caller, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function getRiskById(caller: AuthUser, id: number): Promise<RiskRow> {
  const raw = await risksRepo.findRawRiskById(id);
  if (!raw) throw notFound();
  await assertProjectAccess(caller, raw.project_id, 'view');

  const risk = await risksRepo.findRiskById(id);
  if (!risk) throw notFound();
  return risk;
}

export async function createRisk(
  caller: AuthUser,
  projectId: number,
  body: CreateRiskBody,
  requestId: string,
): Promise<RiskRow> {
  return withTx(async (client) => {
    await assertProjectAccess(caller, projectId, 'manage', client);

    const memberRole = await membersRepo.findMemberRole(projectId, body.ownerId, client);
    if (memberRole === null) {
      throw businessRule('Owner must be a member of this project');
    }

    const score = body.probability * body.impact;
    if (!hasRequiredMitigation(score, body.mitigation)) {
      throw businessRule('Mitigation is required once a risk reaches high exposure (score >= 15)');
    }

    const created = await mutationsRepo.insertRisk(
      {
        projectId,
        type: body.type,
        title: body.title,
        description: body.description ?? null,
        ownerId: body.ownerId,
        probability: body.probability,
        impact: body.impact,
        mitigation: body.mitigation ?? null,
        dueDate: body.dueDate ?? null,
        status: body.status ?? 'open',
      },
      client,
    );

    const risk = await risksRepo.findRiskById(created.id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'risk',
      entityId: created.id,
      action: 'risk.create',
      projectId,
      before: null,
      after: risk,
      requestId,
    });

    return risk!;
  });
}
