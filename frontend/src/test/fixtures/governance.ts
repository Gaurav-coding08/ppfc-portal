import type { ChangeHistoryEntry, ChangeRequestDetail } from '@/features/change-requests/types';
import type { Risk } from '@/features/risks/types';

// Shapes copied from real `GET /projects/1/risks`, `GET /change-requests`
// and `GET /change-requests/13` responses against the seeded dev DB
// (feature 17 Part A contract check). `score`/`exposure` are set exactly as
// the API would return them — tests never derive them.
export function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 1,
    projectId: 1,
    type: 'risk',
    title: 'Vendor delivery slips',
    description: 'Hardware vendor has signalled delays.',
    ownerId: 6,
    ownerName: 'Estell Conroy',
    probability: 2,
    impact: 3,
    score: 6,
    exposure: 'low',
    mitigation: null,
    dueDate: '2026-11-15',
    status: 'open',
    closedAt: null,
    version: 1,
    ...overrides,
  };
}

export function listResponse<T>(rows: T[], total = rows.length) {
  return { data: rows, meta: { page: 1, pageSize: 20, total } };
}

const submittedEntry: ChangeHistoryEntry = {
  id: 21,
  fromStatus: null,
  toStatus: 'submitted',
  actorId: 6,
  actorName: 'Estell Conroy',
  reason: null,
  createdAt: '2026-09-10T09:00:00.000Z',
};

// Default: a submitted CR on project 1 raised by Estell (id 6, contributor).
export function changeRequest(overrides: Partial<ChangeRequestDetail> = {}): ChangeRequestDetail {
  return {
    id: 14,
    code: 'CR-014',
    projectId: 1,
    title: 'Add offline mode to the field app',
    description: 'Field teams need to capture data without coverage.',
    impactSummary: 'Adds scope within the current phase; no schedule impact.',
    requestedBy: 6,
    requesterName: 'Estell Conroy',
    status: 'submitted',
    submittedAt: '2026-09-10T09:00:00.000Z',
    decidedBy: null,
    deciderName: null,
    decidedAt: null,
    decisionReason: null,
    version: 1,
    history: [submittedEntry],
    ...overrides,
  };
}

export const projectOptionsResponse = {
  data: {
    departments: [{ id: 1, label: 'Digital Platforms' }],
    projects: [
      { id: 1, label: 'PRJ-001 — Digital Platforms Modernization' },
      { id: 4, label: 'PRJ-004 — Field Mobility App' },
    ],
    managers: [{ id: 2, label: 'Christelle Satterfield' }],
    statuses: ['active'],
    categories: [],
  },
};
