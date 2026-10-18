import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
const statusSchema = z.enum(TASK_STATUSES);

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const prioritySchema = z.enum(TASK_PRIORITIES);

const SORTABLE = ['dueDate', 'priority', 'status', 'progress', 'title'] as const;

// `status` accepts a single value or a comma-separated list, same pattern as
// projects.schemas.ts's statusListSchema — never interpolated into SQL raw.
const statusListSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()) : undefined))
  .pipe(z.array(statusSchema).optional());

// Query-string booleans arrive as the strings "true"/"false" — coerced
// explicitly rather than via z.coerce.boolean(), which would treat any
// non-empty string (including "false") as true.
const boolQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

const taskFilterFields = {
  status: statusListSchema,
  priority: prioritySchema.optional(),
  overdue: boolQueryParam,
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SORTABLE).default('dueDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
  asOf: dateSchema.optional(),
};

export const projectTasksQuerySchema = z.object({
  ...taskFilterFields,
  assigneeId: z.coerce.number().int().positive().optional(),
  unassigned: boolQueryParam,
});

export type ProjectTasksQuery = z.infer<typeof projectTasksQuerySchema>;

// `/tasks/mine` is always scoped to the caller — no assigneeId/unassigned
// filters, since the assignee is implicitly the caller.
export const myTasksQuerySchema = z.object(taskFilterFields);

export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>;

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const taskIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

export const taskDetailQuerySchema = z.object({
  asOf: dateSchema.optional(),
});

export type TaskDetailQuery = z.infer<typeof taskDetailQuerySchema>;

export const createTaskBodySchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    assigneeId: z.number().int().positive().optional(),
    // No default here: the service needs to tell "status omitted" apart
    // from "status explicitly 'todo'" to apply the done/progress inference
    // rule correctly — see tasks.shared.ts#resolveStatusProgress.
    status: statusSchema.optional(),
    priority: prioritySchema,
    startDate: dateSchema.optional(),
    dueDate: dateSchema,
    weight: z.number().positive(),
    progress: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

// `.strict()`: every field a client might try to change must appear here —
// the service decides which ones a contributor-assignee may actually set.
export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    startDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.optional(),
    weight: z.number().positive().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (body) =>
      body.title !== undefined ||
      body.description !== undefined ||
      body.assigneeId !== undefined ||
      body.status !== undefined ||
      body.priority !== undefined ||
      body.startDate !== undefined ||
      body.dueDate !== undefined ||
      body.weight !== undefined ||
      body.progress !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;

// The set of body keys a contributor who is only the task's assignee (not a
// project manager) is allowed to touch — enforced in tasks.update.service.ts.
export const CONTRIBUTOR_EDITABLE_FIELDS = ['status', 'progress'] as const;
