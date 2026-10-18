import { z } from 'zod';

export const runsQuerySchema = z.object({
  status: z.enum(['running', 'success', 'failed']).optional(),
  jobName: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RunsQuery = z.infer<typeof runsQuerySchema>;

export const outboxQuerySchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  eventType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type OutboxQuery = z.infer<typeof outboxQuerySchema>;

export const outboxIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type OutboxIdParams = z.infer<typeof outboxIdParamsSchema>;
