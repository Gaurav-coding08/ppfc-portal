import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const budgetQuerySchema = z.object({
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
});

export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

export const createRevisionBodySchema = z
  .object({
    amount: z.number().refine((v) => v !== 0, { message: 'Amount must not be zero' }),
    rationale: z.string().trim().min(10, 'Rationale must be at least 10 characters'),
    effectiveDate: dateSchema,
  })
  .strict();

export type CreateRevisionBody = z.infer<typeof createRevisionBodySchema>;

export const revisionIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type RevisionIdParams = z.infer<typeof revisionIdParamsSchema>;

export const revisionDecisionBodySchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1),
    version: z.number().int().min(1),
  })
  .strict();

export type RevisionDecisionBody = z.infer<typeof revisionDecisionBodySchema>;
