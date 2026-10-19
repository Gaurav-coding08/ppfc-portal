import type { ProjectDetail, ProjectListItem } from '@/features/projects/types';

// Shapes copied from real `GET /projects` / `GET /projects/1` responses
// against the seeded dev DB (feature 16 Part B contract check).
export const projectListItem: ProjectListItem = {
  id: 1,
  code: 'PRJ-001',
  name: 'Digital Platforms Modernization',
  department: { id: 1, code: 'DIGPLT', name: 'Digital Platforms' },
  owner: { id: 2, fullName: 'Christelle Satterfield', email: 'christelle.satterfield@ppfc.demo' },
  status: 'active',
  startDate: '2026-01-05',
  endDate: '2027-03-31',
  progressPct: 42.42,
  deliveryStatus: 'at_risk',
  version: 3,
};

export const projectDetail: ProjectDetail = {
  ...projectListItem,
  description: 'Replatform the internal portal stack onto the new shared services.',
  members: [
    {
      userId: 2,
      fullName: 'Christelle Satterfield',
      email: 'christelle.satterfield@ppfc.demo',
      memberRole: 'manager',
      addedAt: '2025-12-22T09:00:00.000Z',
    },
    {
      userId: 6,
      fullName: 'Estell Conroy',
      email: 'estell.conroy@ppfc.demo',
      memberRole: 'contributor',
      addedAt: '2025-12-22T09:00:00.000Z',
    },
  ],
  counts: { taskCount: 12, overdueTaskCount: 6, openRiskCount: 2, pendingCrCount: 1 },
  budget: { currentBudget: 220000, actualSpend: 150000, utilization: 0.6818, currency: 'AED' },
};

export const departmentsResponse = {
  data: [
    { id: 1, code: 'DIGPLT', name: 'Digital Platforms' },
    { id: 2, code: 'NETENG', name: 'Network Engineering' },
  ],
};

export const filterOptionsResponse = {
  data: {
    departments: [
      { id: 1, label: 'Digital Platforms' },
      { id: 2, label: 'Network Engineering' },
    ],
    projects: [],
    managers: [{ id: 2, label: 'Christelle Satterfield' }],
    statuses: ['active'],
    categories: [],
  },
};
