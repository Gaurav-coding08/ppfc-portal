import { withTx } from '../../db/tx.js';
import { assertProjectAccess } from '../../lib/access.js';
import { writeAudit } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import type { PageMeta } from '../../lib/pagination.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as crRepo from './changeRequests.repository.js';
import type { CrRow, HistoryRow } from './changeRequests.repository.js';
import * as mutationsRepo from './changeRequests.mutations.repository.js';
import type { CreateCrBody, CrListQuery } from './changeRequests.schemas.js';

export async function listCrs(
  caller: AuthUser,
  filters: CrListQuery,
): Promise<{ rows: CrRow[]; meta: PageMeta }> {
  const { rows, total } = await crRepo.listCrsScoped(caller, filters);
  return { rows, meta: { page: filters.page, pageSize: filters.pageSize, total } };
}

export async function getCrById(
  caller: AuthUser,
  id: number,
): Promise<{ cr: CrRow; history: HistoryRow[] }> {
  const raw = await crRepo.findRawCrById(id);
  if (!raw) throw notFound();
  await assertProjectAccess(caller, raw.project_id, 'view');

  const cr = await crRepo.findCrById(id);
  if (!cr) throw notFound();
  const history = await crRepo.findCrHistory(id);
  return { cr, history };
}

export async function createCr(
  caller: AuthUser,
  projectId: number,
  body: CreateCrBody,
  requestId: string,
): Promise<CrRow> {
  return withTx(async (client) => {
    // Any project member can submit a CR — view access suffices.
    await assertProjectAccess(caller, projectId, 'view', client);

    const code = await mutationsRepo.nextCrCode(client);
    const created = await mutationsRepo.insertCr(
      {
        code,
        projectId,
        title: body.title,
        description: body.description ?? null,
        impactSummary: body.impactSummary ?? null,
        requestedBy: caller.id,
      },
      client,
    );

    // History: null → submitted
    await mutationsRepo.insertHistory(created.id, null, 'submitted', caller.id, null, client);

    const cr = await crRepo.findCrById(created.id, client);

    await writeAudit(client, {
      actorId: caller.id,
      entityType: 'change_request',
      entityId: created.id,
      action: 'change_request.submit',
      projectId,
      before: null,
      after: cr,
      requestId,
    });

    return cr!;
  });
}
