import { z } from 'zod';

export const CR_STATUSES = ['submitted', 'approved', 'rejected', 'returned'] as const;
export const CR_DECISIONS = ['approve', 'reject', 'return'] as const;

const statusListSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()) : undefined))
  .pipe(z.array(z.enum(CR_STATUSES)).optional());

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

// --- Params ---

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const crIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type CrIdParams = z.infer<typeof crIdParamsSchema>;

// --- Query schemas ---

export const crListQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  status: statusListSchema,
  requestedBy: z.coerce.number().int().positive().optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CrListQuery = z.infer<typeof crListQuerySchema>;

// --- Body schemas ---

export const createCrBodySchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    impactSummary: z.string().trim().min(1).optional(),
  })
  .strict();
export type CreateCrBody = z.infer<typeof createCrBodySchema>;

export const decisionBodySchema = z
  .object({
    decision: z.enum(CR_DECISIONS),
    reason: z.string().trim().min(1),
    version: z.number().int().min(1),
  })
  .strict();
export type DecisionBody = z.infer<typeof decisionBodySchema>;

export const resubmitBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    version: z.number().int().min(1),
  })
  .strict();
export type ResubmitBody = z.infer<typeof resubmitBodySchema>;
