import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const summaryQuerySchema = z.object({
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
});

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const alertsQuerySchema = z.object({
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
  departmentId: z.coerce.number().int().positive().optional(),
});

export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export const comparisonQuerySchema = z.object({
  projectIds: z
    .string()
    .transform((val) => val.split(',').map(Number))
    .pipe(z.array(z.number().int().positive()).min(1).max(10)),
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
});

export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
