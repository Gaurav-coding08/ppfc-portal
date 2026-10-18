import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const RISK_TYPES = ['risk', 'issue'] as const;
const typeSchema = z.enum(RISK_TYPES);

export const RISK_STATUSES = ['open', 'mitigating', 'closed'] as const;
const statusSchema = z.enum(RISK_STATUSES);

const SORTABLE = ['score', 'dueDate', 'status'] as const;

// `status` accepts a single value or a comma-separated list, same pattern
// used by projects.schemas.ts/tasks.schemas.ts — never interpolated raw.
const statusListSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()) : undefined))
  .pipe(z.array(statusSchema).optional());

const commonListFields = {
  type: typeSchema.optional(),
  status: statusListSchema,
  ownerId: z.coerce.number().int().positive().optional(),
  minScore: z.coerce.number().int().min(1).max(25).optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SORTABLE).default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
};

export const projectRisksQuerySchema = z.object(commonListFields);

export type ProjectRisksQuery = z.infer<typeof projectRisksQuerySchema>;

// Cross-portfolio list: same filters plus projectId/departmentId, scoped to
// the caller's visible projects (admin sees all) via scopedProjectIdsSql.
export const risksListQuerySchema = z.object({
  ...commonListFields,
  projectId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
});

export type RisksListQuery = z.infer<typeof risksListQuerySchema>;

export const highExposureQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type HighExposureQuery = z.infer<typeof highExposureQuerySchema>;

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const riskIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type RiskIdParams = z.infer<typeof riskIdParamsSchema>;

export const createRiskBodySchema = z
  .object({
    type: typeSchema,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    ownerId: z.number().int().positive(),
    probability: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    mitigation: z.string().trim().min(1).optional(),
    dueDate: dateSchema.optional(),
    status: statusSchema.optional(),
  })
  .strict();

export type CreateRiskBody = z.infer<typeof createRiskBodySchema>;

export const updateRiskBodySchema = z
  .object({
    type: typeSchema.optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    ownerId: z.number().int().positive().nullable().optional(),
    probability: z.number().int().min(1).max(5).optional(),
    impact: z.number().int().min(1).max(5).optional(),
    mitigation: z.string().trim().min(1).nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    status: statusSchema.optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (body) =>
      body.type !== undefined ||
      body.title !== undefined ||
      body.description !== undefined ||
      body.ownerId !== undefined ||
      body.probability !== undefined ||
      body.impact !== undefined ||
      body.mitigation !== undefined ||
      body.dueDate !== undefined ||
      body.status !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateRiskBody = z.infer<typeof updateRiskBodySchema>;
