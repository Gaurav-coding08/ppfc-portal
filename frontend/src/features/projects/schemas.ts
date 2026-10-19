import { z } from 'zod';
import { PROJECT_STATUS_OPTIONS } from './types';

const statusValues = PROJECT_STATUS_OPTIONS.map((o) => o.value) as [string, ...string[]];

// Mirrors the backend's createProjectBodySchema / updateProjectBodySchema
// (backend/src/modules/projects/projects.schemas.ts) so obvious mistakes are
// caught before a round trip. The backend still validates everything; its
// 400/422 responses are mapped onto these same field names by
// lib/applyServerErrors.ts.
//
// Selects hold string ids (that is what a listbox value is); they are
// converted to numbers in `toCreateBody`/`toUpdateBody`.
const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().trim(),
  departmentId: z.string().min(1, 'Department is required'),
  ownerId: z.string().min(1, 'Owner is required'),
  status: z.enum(statusValues, { error: 'Status is required' }),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  // `register(..., { valueAsNumber: true })` turns an empty input into NaN,
  // which z.number() rejects with this message.
  initialBudget: z
    .number({ error: 'Initial budget is required' })
    .min(0, 'Initial budget cannot be negative')
    .optional(),
});

export type ProjectFormValues = z.infer<typeof baseSchema>;

export const PROJECT_FORM_FIELDS = [
  'name',
  'description',
  'departmentId',
  'ownerId',
  'status',
  'startDate',
  'endDate',
  'initialBudget',
] as const;

// `mode` decides whether the budget is required: it is set once on create;
// after that the budget only changes through budget revisions (CLAUDE.md
// financial definitions), so the edit form doesn't show the field at all.
//
// By default zod skips object-level refinements while *any* field is
// invalid, which would hide the date-order error until the rest of the
// form was filled in. `when` runs each check as soon as the fields it
// reads are valid on their own.
const datesSchema = baseSchema.pick({ startDate: true, endDate: true });

export function projectFormSchema(mode: 'create' | 'edit') {
  return baseSchema
    .refine(
      // YYYY-MM-DD strings compare correctly as plain strings — no Date
      // parsing (and so no timezone shift) needed. Same rule as the
      // backend's "End date must be on or after start date".
      (v) => v.endDate >= v.startDate,
      {
        path: ['endDate'],
        message: 'End date must be on or after start date',
        when: (payload) => datesSchema.safeParse(payload.value).success,
      },
    )
    .refine((v) => mode === 'edit' || v.initialBudget !== undefined, {
      path: ['initialBudget'],
      message: 'Initial budget is required',
      when: () => true,
    });
}

export function toCreateBody(v: ProjectFormValues) {
  return {
    name: v.name,
    // The backend rejects an empty description (min 1), so blank = omitted.
    description: v.description || undefined,
    departmentId: Number(v.departmentId),
    ownerId: Number(v.ownerId),
    status: v.status as (typeof PROJECT_STATUS_OPTIONS)[number]['value'],
    startDate: v.startDate,
    endDate: v.endDate,
    initialBudget: v.initialBudget ?? 0,
  };
}

// No `initialBudget`: the PATCH schema is strict and would reject it.
export function toUpdateBody(v: ProjectFormValues, version: number) {
  const { initialBudget: _ignored, ...rest } = toCreateBody(v);
  void _ignored;
  return { ...rest, version };
}
