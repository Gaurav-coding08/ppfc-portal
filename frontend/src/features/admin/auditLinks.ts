import type { AuditEvent } from './types';

// Which project tab shows each project-owned entity. There are no
// standalone task/risk/cost pages, so those link to the project tab.
const PROJECT_TAB: Record<string, string> = {
  task: 'tasks',
  milestone: 'milestones',
  risk: 'risks',
  cost_transaction: 'finance',
  budget_revision: 'finance',
  financial_forecast: 'finance',
  project_member: 'members',
};

/** Where in the app an audit row's entity can be seen, or null if nowhere. */
export function auditEntityHref(
  event: Pick<AuditEvent, 'entityType' | 'entityId' | 'projectId'>,
): string | null {
  const { entityType, entityId, projectId } = event;
  if (entityType === 'project') return `/projects/${entityId}`;
  if (entityType === 'change_request') return `/change-requests/${entityId}`;
  if (entityType === 'automation_run' || entityType === 'outbox') return '/admin/automation';
  const tab = entityType ? PROJECT_TAB[entityType] : undefined;
  if (tab && projectId) return `/projects/${projectId}?tab=${tab}`;
  return null;
}

export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

// Field-by-field comparison of the stored before/after snapshots, for
// display only. Values are compared by their JSON text, so nested objects
// (e.g. an automation run's `{ run, dispatch }`) count as one field.
export function diffSnapshots(before: unknown, after: unknown): DiffRow[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  return keys.map((key) => ({
    key,
    before: b[key],
    after: a[key],
    changed: JSON.stringify(b[key]) !== JSON.stringify(a[key]),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
