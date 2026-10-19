import type { components } from '@/api/schema';

export type AutomationRun = components['schemas']['AutomationRun'];
export type OutboxEvent = components['schemas']['OutboxEvent'];

// One URL state for the page: the tab, the outbox status filter and the
// page of whichever tab is showing (reset to 1 on tab switch).
export const AUTOMATION_DEFAULTS = { tab: 'runs', status: '', page: '1' };
export type AutomationListFilters = typeof AUTOMATION_DEFAULTS;

export const OUTBOX_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

// Display names for job_name values. Older seeded runs use other names
// and fall back to the raw value.
export const JOB_LABELS: Record<string, string> = {
  'overdue-escalation': 'Overdue escalation',
};

export const TRIGGER_LABELS: Record<string, string> = {
  schedule: 'Scheduled',
  manual: 'Manual',
};

/**
 * Wall-clock length of a run, for display only (not a KPI): the gap
 * between two server timestamps, shown as "28 ms" / "1.2 s" / "3 min".
 */
export function formatDuration(startedAt: string | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
