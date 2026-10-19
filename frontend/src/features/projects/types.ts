import type { components } from '@/api/schema';

export type ProjectListItem = components['schemas']['ProjectListItem'];
export type ProjectDetail = components['schemas']['ProjectDetail'];
export type ProjectMember = components['schemas']['ProjectMember'];
export type ProgressSnapshot = components['schemas']['ProgressSnapshot'];
export type ActivityEvent = components['schemas']['ActivityEvent'];
export type ProjectStatus = NonNullable<ProjectListItem['status']>;

// Mirrors the backend's PROJECT_STATUSES (projects.schemas.ts), in
// lifecycle order for dropdowns.
export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// The list page's URL search params. Every value is a string because that
// is what the URL holds; `toListQuery` converts them for the API call.
export const PROJECT_LIST_DEFAULTS = {
  q: '',
  departmentId: '',
  ownerId: '',
  status: '',
  startFrom: '',
  endTo: '',
  sort: 'code',
  order: 'asc',
  page: '1',
};

export type ProjectListFilters = typeof PROJECT_LIST_DEFAULTS;
