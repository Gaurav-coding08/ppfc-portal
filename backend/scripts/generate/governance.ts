import { faker } from '@faker-js/faker';
import { CONTRIBUTOR_SETS, PROJECTS } from './projects.js';
import type { ChangeHistoryRow, ChangeRequestRow } from './types.js';

// Each project gets 2 CRs: the first is always decided (approved). The
// second defaults to "submitted" (still pending) except for the two
// projects below, which are overridden to cover the mandatory "returned"
// and "rejected" edge cases.
const FORCE_REJECTED_PROJECT = 3;
const FORCE_RETURNED_PROJECT = 6;

interface CrSpec {
  status: ChangeRequestRow['status'];
  impactSummary: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
}

function buildCr(
  id: number,
  project: (typeof PROJECTS)[number],
  requester: number,
  spec: CrSpec
): ChangeRequestRow {
  return {
    id,
    code: `CR-${String(id).padStart(3, '0')}`,
    project_id: project.id,
    title: `${project.code}: ${faker.company.catchPhrase()}`,
    description: faker.lorem.sentence(),
    impact_summary: spec.impactSummary,
    requested_by: requester,
    status: spec.status,
    decided_by: spec.decidedAt ? project.owner_id : null,
    decided_at: spec.decidedAt,
    decision_reason: spec.decisionReason,
  };
}

export function buildChangeRequests(): ChangeRequestRow[] {
  const requests: ChangeRequestRow[] = [];
  let id = 1;

  PROJECTS.forEach((project, projectIdx) => {
    const requester = CONTRIBUTOR_SETS[projectIdx]![0]!;

    requests.push(
      buildCr(id++, project, requester, {
        status: 'approved',
        impactSummary: 'Adds scope within the current phase; no schedule impact.',
        decisionReason: 'Approved — within agreed scope.',
        decidedAt: '2026-06-01T00:00:00Z',
      })
    );

    if (project.id === FORCE_REJECTED_PROJECT) {
      requests.push(
        buildCr(id++, project, requester, {
          status: 'rejected',
          impactSummary: 'Would add unbudgeted scope with no funding identified.',
          decisionReason: 'Rejected — no funding available for this scope.',
          decidedAt: '2026-07-15T00:00:00Z',
        })
      );
    } else if (project.id === FORCE_RETURNED_PROJECT) {
      requests.push(
        buildCr(id++, project, requester, {
          status: 'returned',
          impactSummary: 'Impact on the migration schedule is not yet quantified.',
          decisionReason: 'Returned — please quantify the schedule impact and resubmit.',
          decidedAt: '2026-07-20T00:00:00Z',
        })
      );
    } else {
      requests.push(
        buildCr(id++, project, requester, {
          status: 'submitted',
          impactSummary: null,
          decisionReason: null,
          decidedAt: null,
        })
      );
    }
  });

  return requests;
}

// One history row for the initial submission, plus one more for the
// decision when the CR has already been decided — mirrors exactly how the
// change-requests service (feature 10) will write change_history.
export function buildChangeHistory(changeRequests: ChangeRequestRow[]): ChangeHistoryRow[] {
  const history: ChangeHistoryRow[] = [];
  let id = 1;

  for (const cr of changeRequests) {
    history.push({
      id: id++,
      change_request_id: cr.id,
      from_status: null,
      to_status: 'submitted',
      actor_id: cr.requested_by,
      reason: null,
    });
    if (cr.decided_by) {
      history.push({
        id: id++,
        change_request_id: cr.id,
        from_status: 'submitted',
        to_status: cr.status,
        actor_id: cr.decided_by,
        reason: cr.decision_reason,
      });
    }
  }

  return history;
}
