import type { AutomationRunRow } from './types.js';

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
