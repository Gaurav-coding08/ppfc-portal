import { z } from 'zod';
import type { UpdateMilestoneBody } from './hooks/useMilestones';
import { MILESTONE_STATUS_OPTIONS, type MilestoneStatus } from './types';

const statusValues = MILESTONE_STATUS_OPTIONS.map((o) => o.value) as [MilestoneStatus, ...MilestoneStatus[]];

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.enum(statusValues, { error: 'Status is required' }),
  achievedDate: z.string(),
});

export type MilestoneFormValues = z.infer<typeof baseSchema>;

export const MILESTONE_FORM_FIELDS = ['name', 'dueDate', 'status', 'achievedDate'] as const;

// Mirrors the backend's milestone 422 rules (milestones.service.ts):
// - the due date falls within the project's own start/end dates
// - an achieved milestone needs an achieved date, not after the reporting
//   date (`asOf`; skipped if the reporting date hasn't loaded yet — the
//   backend still checks)
// YYYY-MM-DD strings compare correctly as plain strings, so no Date parsing.
export function milestoneFormSchema(ctx: { startDate?: string; endDate?: string; asOf?: string }) {
  return baseSchema
    .refine(
      (v) => (!ctx.startDate || v.dueDate >= ctx.startDate) && (!ctx.endDate || v.dueDate <= ctx.endDate),
      {
        path: ['dueDate'],
        message: 'Due date must fall within the project dates',
        when: (payload) => baseSchema.pick({ dueDate: true }).safeParse(payload.value).success,
      },
    )
    .refine((v) => v.status !== 'achieved' || v.achievedDate !== '', {
      path: ['achievedDate'],
      message: 'An achieved milestone needs an achieved date',
      when: (payload) => baseSchema.pick({ status: true }).safeParse(payload.value).success,
    })
    .refine((v) => v.status !== 'achieved' || !ctx.asOf || !v.achievedDate || v.achievedDate <= ctx.asOf, {
      path: ['achievedDate'],
      message: 'Achieved date cannot be after the reporting date',
      when: (payload) => baseSchema.pick({ status: true }).safeParse(payload.value).success,
    });
}

export function toCreateBody(v: MilestoneFormValues) {
  return {
    name: v.name,
    dueDate: v.dueDate,
    status: v.status,
    achievedDate: v.achievedDate || undefined,
  };
}

type DirtyFields = Partial<Record<keyof MilestoneFormValues, boolean | undefined>>;

// Changed fields only, like the task form; a cleared achieved date is sent
// as null (the PATCH schema allows it). Empty result = nothing to save.
export function toUpdateBody(
  v: MilestoneFormValues,
  dirty: DirtyFields,
): Omit<UpdateMilestoneBody, 'version'> {
  const body: Omit<UpdateMilestoneBody, 'version'> = {};
  if (dirty.name) body.name = v.name;
  if (dirty.dueDate) body.dueDate = v.dueDate;
  if (dirty.status) body.status = v.status;
  if (dirty.achievedDate) body.achievedDate = v.achievedDate || null;
  return body;
}
