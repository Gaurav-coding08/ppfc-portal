import { z } from 'zod';
import { dashboardFiltersSchema } from './dashboard.filters.js';

// Most endpoints use just the shared dashboard filters.
export const baseQuerySchema = dashboardFiltersSchema;

// Drill: costs — adds optional project/category/month scoping
export const drillCostsQuerySchema = dashboardFiltersSchema.extend({
  drillProjectId: z.coerce.number().int().positive().optional(),
  drillCategoryId: z.coerce.number().int().positive().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DrillCostsQuery = z.infer<typeof drillCostsQuerySchema>;

// Drill: tasks
export const drillTasksQuerySchema = dashboardFiltersSchema.extend({
  kind: z.enum(['overdue', 'blocked', 'all']).default('all'),
  ownerId: z.coerce.number().int().positive().optional(),
  drillProjectId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DrillTasksQuery = z.infer<typeof drillTasksQuerySchema>;

// Drill: risks
export const drillRisksQuerySchema = dashboardFiltersSchema.extend({
  kind: z.enum(['high-exposure', 'cell', 'all']).default('all'),
  probability: z.coerce.number().int().min(1).max(5).optional(),
  impact: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DrillRisksQuery = z.infer<typeof drillRisksQuerySchema>;

// Drill: change-requests
export const drillCrQuerySchema = dashboardFiltersSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DrillCrQuery = z.infer<typeof drillCrQuerySchema>;
