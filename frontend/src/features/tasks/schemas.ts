import { z } from 'zod';
import type { UpdateTaskBody } from './hooks/useTaskMutations';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  UNASSIGNED,
  type TaskPriority,
  type TaskStatus,
} from './types';

const statusValues = TASK_STATUS_OPTIONS.map((o) => o.value) as [TaskStatus, ...TaskStatus[]];
const priorityValues = TASK_PRIORITY_OPTIONS.map((o) => o.value) as [TaskPriority, ...TaskPriority[]];

// `register(..., { valueAsNumber: true })` turns an empty input into NaN,
// which z.number() rejects with the `error` message.
const progressSchema = z
  .number({ error: 'Progress is required' })
  .int('Progress must be a whole number')
  .min(0, 'Progress must be between 0 and 100')
  .max(100, 'Progress must be between 0 and 100');

// Mirrors the backend's createTaskBodySchema / updateTaskBodySchema
// (backend/src/modules/tasks/tasks.schemas.ts) plus the service's 422
// rules, so obvious mistakes are caught before a round trip. The backend
// still validates everything. Select values are strings ('' = none) and
// are converted in `toCreateBody`/`toUpdateBody`.
const baseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim(),
  assigneeId: z.string(),
  status: z.enum(statusValues, { error: 'Status is required' }),
  priority: z.enum(priorityValues, { error: 'Priority is required' }),
  startDate: z.string(),
  dueDate: z.string().min(1, 'Due date is required'),
  weight: z.number({ error: 'Weight is required' }).positive('Weight must be greater than 0'),
  progress: progressSchema,
});

export type TaskFormValues = z.infer<typeof baseSchema>;

export const TASK_FORM_FIELDS = [
  'title',
  'description',
  'assigneeId',
  'status',
  'priority',
  'startDate',
  'dueDate',
  'weight',
  'progress',
] as const;

const datesSchema = baseSchema.pick({ startDate: true, dueDate: true });

// `projectDates` are the project's own start/end: the backend rejects a due
// date outside them with a 422, so the form says so up front. YYYY-MM-DD
// strings compare correctly as plain strings — no Date parsing needed.
// `when` runs each date check as soon as the date fields are valid, rather
// than waiting for the whole form (zod's default; see projects/schemas.ts).
export function taskFormSchema(projectDates: { startDate?: string; endDate?: string }) {
  return baseSchema
    .refine((v) => !v.startDate || v.dueDate >= v.startDate, {
      path: ['dueDate'],
      message: 'Due date must be on or after the start date',
      when: (payload) => datesSchema.safeParse(payload.value).success,
    })
    .refine(
      (v) =>
        (!projectDates.startDate || v.dueDate >= projectDates.startDate) &&
        (!projectDates.endDate || v.dueDate <= projectDates.endDate),
      {
        path: ['dueDate'],
        message: 'Due date must fall within the project dates',
        when: (payload) => datesSchema.safeParse(payload.value).success,
      },
    );
}

// The assignee select uses the UNASSIGNED sentinel for "nobody" (a listbox
// item needs a non-empty value); the API wants a user id or null.
function toAssigneeId(value: string): number | null {
  return value && value !== UNASSIGNED ? Number(value) : null;
}

export function toCreateBody(v: TaskFormValues) {
  return {
    title: v.title,
    // The backend rejects empty strings (min 1), so blank = omitted.
    description: v.description || undefined,
    assigneeId: toAssigneeId(v.assigneeId) ?? undefined,
    status: v.status,
    priority: v.priority,
    startDate: v.startDate || undefined,
    dueDate: v.dueDate,
    weight: v.weight,
    progress: v.progress,
  };
}

type DirtyFields = Partial<Record<keyof TaskFormValues, boolean | undefined>>;

// PATCH sends only the fields the user actually changed. This matters for
// the backend's status/progress rule: "progress 100 with no explicit
// status → done". Re-sending the untouched status alongside a new progress
// would count as an explicit status and switch that inference off.
// Cleared optional fields become `null` (the PATCH schema allows null for
// assignee and start date). A cleared description is left out: the
// backend has no way to blank it (min length 1, not nullable).
// An empty result means nothing changed; the caller skips the request (the
// backend would 400 "At least one updatable field").
export function toUpdateBody(v: TaskFormValues, dirty: DirtyFields): Omit<UpdateTaskBody, 'version'> {
  const body: Omit<UpdateTaskBody, 'version'> = {};
  if (dirty.title) body.title = v.title;
  if (dirty.description && v.description) body.description = v.description;
  if (dirty.assigneeId) body.assigneeId = toAssigneeId(v.assigneeId);
  if (dirty.status) body.status = v.status;
  if (dirty.priority) body.priority = v.priority;
  if (dirty.startDate) body.startDate = v.startDate || null;
  if (dirty.dueDate) body.dueDate = v.dueDate;
  if (dirty.weight) body.weight = v.weight;
  if (dirty.progress) body.progress = v.progress;
  return body;
}

// The reduced form a contributor gets for their own task: the backend's
// CONTRIBUTOR_EDITABLE_FIELDS (status, progress) and nothing else.
export const contributorTaskSchema = z.object({
  status: z.enum(statusValues, { error: 'Status is required' }),
  progress: progressSchema,
});

export type ContributorTaskValues = z.infer<typeof contributorTaskSchema>;

export const CONTRIBUTOR_TASK_FIELDS = ['status', 'progress'] as const;
