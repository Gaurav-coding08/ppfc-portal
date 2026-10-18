import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const monthRe = /^\d{4}-\d{2}$/;

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const forecastQuerySchema = z.object({
  asOf: z.string().regex(dateRe, 'asOf must be YYYY-MM-DD').optional(),
});

export type ForecastQuery = z.infer<typeof forecastQuerySchema>;

const monthEntrySchema = z.object({
  month: z.string().regex(monthRe, 'month must be YYYY-MM'),
  amount: z.number().min(0, 'amount must be >= 0'),
});

export const upsertForecastsBodySchema = z
  .object({
    months: z.array(monthEntrySchema).min(1),
  })
  .strict();

export type UpsertForecastsBody = z.infer<typeof upsertForecastsBodySchema>;
