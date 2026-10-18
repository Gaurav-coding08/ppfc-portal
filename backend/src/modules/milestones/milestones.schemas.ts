import { z } from 'zod';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRe, 'Date must be YYYY-MM-DD');

export const MILESTONE_STATUSES = ['planned', 'achieved', 'missed'] as const;
const statusSchema = z.enum(MILESTONE_STATUSES);

export const projectIdParamsSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

export const milestoneIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type MilestoneIdParams = z.infer<typeof milestoneIdParamsSchema>;

export const milestonesListQuerySchema = z.object({
  status: statusSchema.optional(),
  dueWithinDays: z.coerce.number().int().min(0).optional(),
  asOf: dateSchema.optional(),
});

export type MilestonesListQuery = z.infer<typeof milestonesListQuerySchema>;

export const createMilestoneBodySchema = z
  .object({
    name: z.string().trim().min(1),
    dueDate: dateSchema,
    status: statusSchema.optional(),
    achievedDate: dateSchema.optional(),
  })
  .strict();

export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>;

export const updateMilestoneBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    dueDate: dateSchema.optional(),
    status: statusSchema.optional(),
    achievedDate: dateSchema.nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (body) => body.name !== undefined || body.dueDate !== undefined || body.status !== undefined || body.achievedDate !== undefined,
    { message: 'At least one updatable field must be provided' },
  );

export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>;
