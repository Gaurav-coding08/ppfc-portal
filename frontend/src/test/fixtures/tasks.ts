import type { Milestone } from '@/features/milestones/types';
import type { TaskRow } from '@/features/tasks/types';

// Shapes copied from real `GET /projects/1/tasks`, `GET /tasks/mine` and
// `GET /projects/1/milestones` responses against the seeded dev DB
// (feature 16 Part C contract check). `isOverdue`/`isDueSoon`/`daysToDue`
// are set per fixture exactly as the API would return them for the
// 2026-09-30 reporting date — tests never derive them.
export function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 1,
    projectId: 1,
    title: 'Migrate identity service',
    description: 'Move the identity service onto the shared cluster',
    assigneeId: 6,
    assigneeName: 'Estell Conroy',
    status: 'in_progress',
    priority: 'medium',
    startDate: '2026-08-01',
    dueDate: '2026-10-20',
    weight: 2,
    progress: 40,
    completedAt: null,
    version: 3,
    isOverdue: false,
    isDueSoon: false,
    ...overrides,
  };
}

export function taskListResponse(rows: TaskRow[], total = rows.length) {
  return { data: rows, meta: { page: 1, pageSize: 20, total } };
}

export function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 1,
    projectId: 1,
    name: 'Go-live',
    dueDate: '2027-03-31',
    status: 'planned',
    achievedDate: null,
    version: 1,
    isOverdue: false,
    daysToDue: 182,
    ...overrides,
  };
}
