import { addDays, atTime } from './dates.js';
import type { ProjectMemberRow, ProjectRow } from './types.js';

// A project's record is created two weeks before its own kickoff — always
// before the reporting date, since every seeded project starts in 2026.
function projectTimestamps(startDate: string): { created_at: string; updated_at: string } {
  const createdAt = atTime(addDays(startDate, -14));
  return { created_at: createdAt, updated_at: createdAt };
}

// Each project is hand-picked to carry exactly one of the mandatory edge
// cases from the feature spec (see docs/data-dictionary.md → "Edge-case
// catalogue" for the full map). Dates and amounts for these projects are
// not randomized — the financial fixtures in finance.ts are built to match
// them exactly, so changing a date here would silently break a fixture.
export const PROJECTS: ProjectRow[] = [
  {
    id: 1,
    code: 'PRJ-001',
    name: 'Digital Platforms Modernization',
    description: 'Replatform the internal portal stack onto the new shared services.',
    department_id: 1,
    owner_id: 2,
    status: 'active',
    start_date: '2026-01-05',
    end_date: '2027-03-31',
    created_by: 2,
    ...projectTimestamps('2026-01-05'),
  },
  {
    id: 2,
    code: 'PRJ-002',
    name: 'Core Network Refresh',
    description: 'Replace end-of-life core switches across primary sites.',
    department_id: 2,
    owner_id: 3,
    status: 'active',
    start_date: '2026-01-12',
    end_date: '2026-12-31',
    created_by: 3,
    ...projectTimestamps('2026-01-12'),
  },
  {
    id: 3,
    code: 'PRJ-003',
    name: 'Enterprise ERP Upgrade',
    description: 'Upgrade the finance and HR ERP modules to the current major version.',
    department_id: 3,
    owner_id: 4,
    status: 'active',
    start_date: '2026-02-01',
    end_date: '2026-12-31',
    created_by: 4,
    ...projectTimestamps('2026-02-01'),
  },
  {
    id: 4,
    code: 'PRJ-004',
    name: 'Field Mobility App',
    description: 'Mobile app for field technicians to close work orders on site.',
    department_id: 1,
    owner_id: 2,
    status: 'completed',
    start_date: '2026-01-10',
    end_date: '2026-06-30',
    created_by: 2,
    ...projectTimestamps('2026-01-10'),
  },
  {
    id: 5,
    code: 'PRJ-005',
    name: 'Security Operations Uplift',
    description: 'Stand up 24/7 SOC monitoring and incident response tooling.',
    department_id: 2,
    owner_id: 3,
    status: 'active',
    start_date: '2026-03-01',
    end_date: '2027-01-31',
    created_by: 3,
    ...projectTimestamps('2026-03-01'),
  },
  {
    id: 6,
    code: 'PRJ-006',
    name: 'Data Center Migration',
    description: 'Migrate the legacy data center to the new regional facility.',
    department_id: 3,
    owner_id: 4,
    status: 'active',
    start_date: '2026-01-20',
    end_date: '2026-11-30',
    created_by: 4,
    ...projectTimestamps('2026-01-20'),
  },
  {
    id: 7,
    code: 'PRJ-007',
    name: 'Customer Portal Revamp',
    description: 'Redesign the self-service customer portal.',
    department_id: 1,
    owner_id: 2,
    status: 'planning',
    start_date: '2026-06-01',
    end_date: '2027-06-30',
    created_by: 2,
    ...projectTimestamps('2026-06-01'),
  },
  {
    id: 8,
    code: 'PRJ-008',
    name: 'Identity & Access Management',
    description: 'Roll out centralized SSO and access reviews.',
    department_id: 2,
    owner_id: 3,
    status: 'on_hold',
    start_date: '2026-04-01',
    end_date: '2026-10-31',
    created_by: 3,
    ...projectTimestamps('2026-04-01'),
  },
];

// owner (manager) + 4 contributors per project, cycling through the 10
// contributor users (ids 6-15) so every contributor sits on multiple
// projects, same as a real small org.
export const CONTRIBUTOR_SETS: number[][] = [
  [6, 7, 8, 9],
  [7, 8, 9, 10],
  [8, 9, 10, 11],
  [9, 10, 11, 12],
  [10, 11, 12, 13],
  [11, 12, 13, 14],
  [12, 13, 14, 15],
  [13, 14, 15, 6],
];

export function buildProjects(): ProjectRow[] {
  return PROJECTS;
}

export function buildProjectMembers(): ProjectMemberRow[] {
  const members: ProjectMemberRow[] = [];
  PROJECTS.forEach((project, i) => {
    // Members are added the moment the project itself is created.
    members.push({
      project_id: project.id,
      user_id: project.owner_id,
      member_role: 'manager',
      added_at: project.created_at,
    });
    for (const userId of CONTRIBUTOR_SETS[i]!) {
      members.push({
        project_id: project.id,
        user_id: userId,
        member_role: 'contributor',
        added_at: project.created_at,
      });
    }
  });
  return members;
}
