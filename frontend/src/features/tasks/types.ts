import type { components } from '@/api/schema';

export type TaskRow = components['schemas']['TaskRow'];
export type TaskStatus = NonNullable<TaskRow['status']>;
export type TaskPriority = NonNullable<TaskRow['priority']>;

// Mirrors the backend's TASK_STATUSES / TASK_PRIORITIES (tasks.schemas.ts),
// in workflow / severity order for dropdowns.
export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// The assignee filter's "Unassigned" choice. The backend models it as a
// separate `unassigned=true` flag rather than an assigneeId, so the URL
// stores this sentinel and `toTaskListQuery` translates it.
export const UNASSIGNED = 'unassigned';

// The project Tasks tab's URL search params (all strings, as the URL holds
// them). `overdue` is 'true' or '' (no filter).
export const TASK_LIST_DEFAULTS = {
  q: '',
  status: '',
  assignee: '',
  priority: '',
  overdue: '',
  sort: 'dueDate',
  order: 'asc',
  page: '1',
};

export type TaskListFilters = typeof TASK_LIST_DEFAULTS;

// Every key the Tasks tab writes to the URL — the detail page clears these
// when the user switches to another tab so they don't linger.
export const TASK_FILTER_KEYS = Object.keys(TASK_LIST_DEFAULTS);

/** A manager may delete a task only while it is untouched (backend rule: todo and 0 %). */
export function isUntouched(task: TaskRow): boolean {
  return task.status === 'todo' && task.progress === 0;
}
