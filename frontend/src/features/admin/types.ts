import type { components } from '@/api/schema';

export type AdminUser = components['schemas']['UserDirectoryEntry'];
export type AuditEvent = components['schemas']['AuditEvent'];
export type Role = 'contributor' | 'project_manager' | 'admin';

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'contributor', label: 'Contributor' },
  { value: 'project_manager', label: 'Project manager' },
  { value: 'admin', label: 'Admin' },
];

export function roleLabel(role: string | undefined): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? '';
}

// URL filter shapes (strings; '' = no filter). `GET /users` sorts by a
// fixed enum; the admin list sorts by name like the directory default.
export const USER_LIST_DEFAULTS = {
  q: '',
  role: '',
  departmentId: '',
  sort: 'fullName',
  order: 'asc',
  page: '1',
};
export type UserListFilters = typeof USER_LIST_DEFAULTS;

export const AUDIT_LIST_DEFAULTS = {
  entityType: '',
  actorId: '',
  from: '',
  to: '',
  page: '1',
};
export type AuditListFilters = typeof AUDIT_LIST_DEFAULTS;

// The entity types the backend writes (grep of `entityType:` in
// backend/src). The API filters on any string; this list only feeds the
// dropdown.
export const AUDIT_ENTITY_TYPES = [
  'automation_run',
  'budget_revision',
  'change_request',
  'cost_transaction',
  'financial_forecast',
  'milestone',
  'outbox',
  'project',
  'project_member',
  'risk',
  'task',
  'user',
].map((value) => ({ value, label: value.replace(/_/g, ' ') }));
