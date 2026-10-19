import { HttpResponse, http } from 'msw';
import type { AdminUser, AuditEvent } from '@/features/admin/types';
import type { AutomationRun, OutboxEvent } from '@/features/automation/types';
import type { Notification } from '@/features/notifications/components/NotificationItem';
import { API } from '@/test/handlers';

// Shapes copied from real `GET /users`, `/admin/audit-events`,
// `/admin/automation/runs`, `/admin/automation/outbox` and
// `/notifications` responses against the seeded dev DB (feature 18B).

export function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 12,
    email: 'adaline.bahringer@ppfc.demo',
    fullName: 'Adaline Bahringer',
    role: 'contributor',
    departmentId: 1,
    isActive: true,
    version: 1,
    createdAt: '2025-12-15T09:00:00.000Z',
    updatedAt: '2025-12-15T09:00:00.000Z',
    ...overrides,
  };
}

export function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 90,
    actorId: 2,
    actorName: 'Christelle Satterfield',
    entityType: 'task',
    entityId: 75,
    action: 'task.update',
    projectId: 7,
    before: { progress: 20, status: 'in_progress', version: 3 },
    after: { progress: 60, status: 'in_progress', version: 4 },
    requestId: '94ae93cb-3665-4cbe-8021-7c3fd18ce1b4',
    createdAt: '2026-10-19T08:22:46.789Z',
    ...overrides,
  };
}

export function automationRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: 8,
    jobName: 'overdue-escalation',
    startedAt: '2026-10-18T20:27:00.063Z',
    finishedAt: '2026-10-18T20:27:00.091Z',
    status: 'success',
    trigger: 'schedule',
    itemsFound: 42,
    itemsCreated: 0,
    error: null,
    ...overrides,
  };
}

export function outboxEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 3,
    eventType: 'TASK_OVERDUE',
    entityType: 'task',
    entityId: 6,
    eventDate: '2026-09-01',
    payload: { taskId: 6, projectId: 1 },
    status: 'failed',
    attempts: 3,
    lastError: 'simulated delivery failure (seed data)',
    nextAttemptAt: '2026-10-18T20:24:22.745Z',
    createdAt: '2026-09-01T06:00:01.000Z',
    processedAt: null,
    ...overrides,
  };
}

export function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 72,
    userId: 2,
    title: 'Task overdue: PRJ-007 task 3',
    body: 'PRJ-007: due 2026-09-08, 22 day(s) overdue',
    link: '/projects/7/tasks/75',
    outboxId: 38,
    readAt: null,
    createdAt: '2026-10-18T20:24:26.193Z',
    ...overrides,
  };
}

export const departmentsResponse = {
  data: [
    { id: 1, code: 'DIGPLT', name: 'Digital Platforms' },
    { id: 3, code: 'ENTIT', name: 'Enterprise IT' },
    { id: 2, code: 'NETENG', name: 'Network Engineering' },
  ],
};

/** `GET /departments` — the users page and the create form both need it. */
export const departmentsHandler = http.get(`${API}/departments`, () =>
  HttpResponse.json(departmentsResponse),
);
