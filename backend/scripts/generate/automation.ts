import type { AutomationRunRow, NotificationRow, OutboxRow } from './types.js';

// Historical runs of the background jobs described in migration 005
// (outbox/automation_runs/notifications). One is deliberately failed so
// the "success + one failed" requirement is met without relying on chance.
export function buildAutomationRuns(): AutomationRunRow[] {
  return [
    {
      id: 1,
      job_name: 'overdue-task-notifier',
      started_at: '2026-02-01T06:00:00Z',
      finished_at: '2026-02-01T06:00:42Z',
      status: 'success',
      items_found: 12,
      items_created: 12,
      error: null,
    },
    {
      id: 2,
      job_name: 'budget-threshold-check',
      started_at: '2026-04-01T06:00:00Z',
      finished_at: '2026-04-01T06:00:11Z',
      status: 'success',
      items_found: 3,
      items_created: 3,
      error: null,
    },
    {
      id: 3,
      job_name: 'milestone-reminder',
      started_at: '2026-06-01T06:00:00Z',
      finished_at: '2026-06-01T06:00:19Z',
      status: 'success',
      items_found: 5,
      items_created: 5,
      error: null,
    },
    {
      id: 4,
      job_name: 'cr-sla-check',
      started_at: '2026-08-01T06:00:00Z',
      finished_at: '2026-08-01T06:00:30Z',
      status: 'failed',
      items_found: null,
      items_created: null,
      error: 'Connection to notification service timed out',
    },
    {
      id: 5,
      job_name: 'overdue-task-notifier',
      started_at: '2026-09-01T06:00:00Z',
      finished_at: '2026-09-01T06:00:37Z',
      status: 'success',
      items_found: 8,
      items_created: 8,
      error: null,
    },
  ];
}

// Seed evidence for feature 15's outbox/dispatcher, paired with run id 5
// above (the most recent successful 'overdue-task-notifier' run) and with
// CR-001 (project 1's always-approved change request — see governance.ts).
// Task ids 1, 2 and 6 (project 1) are genuinely overdue as of 2026-09-01
// in the seeded tasks dataset (due 2026-02-12 / 2026-03-21 / 2026-08-18,
// all status != 'done') — these are real rows, not invented ones, so the
// payloads below match what the real producer would have written.
export function buildOutboxEvents(): OutboxRow[] {
  return [
    {
      id: 1,
      event_type: 'TASK_OVERDUE',
      entity_type: 'task',
      entity_id: 1,
      event_date: '2026-09-01',
      payload: JSON.stringify({
        taskId: 1, projectId: 1, projectCode: 'PRJ-001', title: 'PRJ-001 task 1',
        dueDate: '2026-02-12', daysOverdue: 201, assigneeId: 6, managerId: 2,
      }),
      status: 'sent',
      attempts: 0,
      last_error: null,
      created_at: '2026-09-01T06:00:01Z',
      processed_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 2,
      event_type: 'TASK_OVERDUE',
      entity_type: 'task',
      entity_id: 2,
      event_date: '2026-09-01',
      payload: JSON.stringify({
        taskId: 2, projectId: 1, projectCode: 'PRJ-001', title: 'PRJ-001 task 2',
        dueDate: '2026-03-21', daysOverdue: 164, assigneeId: 7, managerId: 2,
      }),
      status: 'sent',
      attempts: 0,
      last_error: null,
      created_at: '2026-09-01T06:00:01Z',
      processed_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 3,
      event_type: 'TASK_OVERDUE',
      entity_type: 'task',
      entity_id: 6,
      event_date: '2026-09-01',
      payload: JSON.stringify({
        taskId: 6, projectId: 1, projectCode: 'PRJ-001', title: 'PRJ-001 task 6',
        dueDate: '2026-08-18', daysOverdue: 14, assigneeId: 7, managerId: 2,
      }),
      // Exhausted its retries — demonstrates the "failed, needs an admin
      // retry" state (docs/automation.md) without every seeded row
      // looking like a clean success. Deliberately 'failed', not
      // 'pending': a pending seed row would otherwise be claimed by the
      // dispatcher the moment any test calls dispatchPending().
      status: 'failed',
      attempts: 3,
      last_error: 'simulated delivery failure (seed data)',
      created_at: '2026-09-01T06:00:01Z',
      processed_at: null,
    },
    {
      id: 4,
      event_type: 'CR_APPROVED',
      entity_type: 'change_request',
      entity_id: 1,
      event_date: '2026-06-01',
      payload: JSON.stringify({
        crId: 1, code: 'CR-001', projectId: 1, requesterId: 6, decidedBy: 2,
        reason: 'Approved — within agreed scope.',
      }),
      status: 'sent',
      attempts: 0,
      last_error: null,
      created_at: '2026-06-01T00:00:01Z',
      processed_at: '2026-06-01T00:00:05Z',
    },
  ];
}

// One notification per recipient per sent/pending-but-attempted outbox
// event above — mirrors exactly what outboxDispatcher.ts would have
// written (assignee + manager for TASK_OVERDUE, requester for
// CR_APPROVED). Event id 3 is still 'pending' so it has none yet.
export function buildNotifications(): NotificationRow[] {
  return [
    {
      id: 1, user_id: 6, title: 'Task overdue: PRJ-001 task 1',
      body: 'PRJ-001: due 2026-02-12, 201 day(s) overdue',
      link: '/projects/1/tasks/1', outbox_id: 1, read_at: '2026-09-02T09:00:00Z',
      created_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 2, user_id: 2, title: 'Task overdue: PRJ-001 task 1',
      body: 'PRJ-001: due 2026-02-12, 201 day(s) overdue',
      link: '/projects/1/tasks/1', outbox_id: 1, read_at: null,
      created_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 3, user_id: 7, title: 'Task overdue: PRJ-001 task 2',
      body: 'PRJ-001: due 2026-03-21, 164 day(s) overdue',
      link: '/projects/1/tasks/2', outbox_id: 2, read_at: null,
      created_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 4, user_id: 2, title: 'Task overdue: PRJ-001 task 2',
      body: 'PRJ-001: due 2026-03-21, 164 day(s) overdue',
      link: '/projects/1/tasks/2', outbox_id: 2, read_at: null,
      created_at: '2026-09-01T06:00:38Z',
    },
    {
      id: 5, user_id: 6, title: 'Change request approved: CR-001',
      body: 'Approved: Approved — within agreed scope.',
      link: '/projects/1/change-requests/1', outbox_id: 4, read_at: '2026-06-02T08:00:00Z',
      created_at: '2026-06-01T00:00:05Z',
    },
  ];
}
