import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const costIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CostIdParams = z.infer<typeof costIdParamsSchema>;

const statusListSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()) : undefined))
  .pipe(z.array(z.enum(['draft', 'posted'])).optional());

const entryTypeSchema = z.enum(['expense', 'reversal']);

const SORTABLE = ['txnDate', 'amount', 'status'] as const;

export const projectCostsQuerySchema = z.object({
  status: statusListSchema,
  categoryId: z.coerce.number().int().positive().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  entryType: entryTypeSchema.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SORTABLE).default('txnDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ProjectCostsQuery = z.infer<typeof projectCostsQuerySchema>;

export const crossProjectCostsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  asOf: dateSchema.optional(),
  postedOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  upToAsOf: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  status: statusListSchema,
  categoryId: z.coerce.number().int().positive().optional(),
  entryType: entryTypeSchema.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SORTABLE).default('txnDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CrossProjectCostsQuery = z.infer<typeof crossProjectCostsQuerySchema>;

export const createCostBodySchema = z
  .object({
    categoryId: z.number().int().positive(),
    txnDate: dateSchema,
    amount: z.number().positive('Amount must be greater than zero'),
    description: z.string().trim().min(1),
    vendor: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateCostBody = z.infer<typeof createCostBodySchema>;

export const updateCostBodySchema = z
  .object({
    categoryId: z.number().int().positive().optional(),
    txnDate: dateSchema.optional(),
    amount: z.number().positive('Amount must be greater than zero').optional(),
    description: z.string().trim().min(1).optional(),
    vendor: z.string().trim().min(1).nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (body) =>
      body.categoryId !== undefined ||
      body.txnDate !== undefined ||
      body.amount !== undefined ||
      body.description !== undefined ||
      body.vendor !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateCostBody = z.infer<typeof updateCostBodySchema>;

export const reverseCostBodySchema = z
  .object({
    reason: z.string().trim().min(1),
    txnDate: dateSchema.optional(),
  })
  .strict();

export type ReverseCostBody = z.infer<typeof reverseCostBodySchema>;
