import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
const statusSchema = z.enum(PROJECT_STATUSES);

export const MEMBER_ROLES = ['manager', 'contributor'] as const;
const memberRoleSchema = z.enum(MEMBER_ROLES);

const SORTABLE = ['code', 'name', 'status', 'startDate', 'endDate', 'progress'] as const;

// `status` accepts either a single value or a comma-separated list (multi
// select), always normalized to an array of validated enum values — never
// interpolated into SQL directly.
const statusListSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()) : undefined))
  .pipe(z.array(statusSchema).optional());

export const projectsListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  status: statusListSchema,
  startFrom: dateSchema.optional(),
  endTo: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SORTABLE).default('code'),
  order: z.enum(['asc', 'desc']).default('asc'),
  asOf: dateSchema.optional(),
});

export type ProjectsListQuery = z.infer<typeof projectsListQuerySchema>;

export const projectIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const projectDetailQuerySchema = z.object({
  asOf: dateSchema.optional(),
});

export type ProjectDetailQuery = z.infer<typeof projectDetailQuerySchema>;

export const createProjectBodySchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    departmentId: z.number().int().positive(),
    ownerId: z.number().int().positive(),
    status: statusSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    initialBudget: z.number().min(0),
  })
  .strict();

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

// `.strict()`: an initialBudget (or any other unknown field) on a PATCH is
// rejected rather than silently ignored — CLAUDE.md says budget changes
// only ever happen through budget revisions (feature 12), never here.
export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    departmentId: z.number().int().positive().optional(),
    ownerId: z.number().int().positive().optional(),
    status: statusSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.departmentId !== undefined ||
      body.ownerId !== undefined ||
      body.status !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;

export const addMemberBodySchema = z
  .object({
    userId: z.number().int().positive(),
    memberRole: memberRoleSchema,
  })
  .strict();

export type AddMemberBody = z.infer<typeof addMemberBodySchema>;

export const memberIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

export type MemberIdParams = z.infer<typeof memberIdParamsSchema>;

export const progressSnapshotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProgressSnapshotsQuery = z.infer<typeof progressSnapshotsQuerySchema>;
