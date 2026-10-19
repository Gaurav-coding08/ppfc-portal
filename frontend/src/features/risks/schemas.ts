import { z } from 'zod';
import type { UpdateRiskBody } from './hooks/useRiskMutations';
import { RISK_STATUS_OPTIONS, RISK_TYPE_OPTIONS, type RiskStatus, type RiskType } from './types';

const typeValues = RISK_TYPE_OPTIONS.map((o) => o.value) as [RiskType, ...RiskType[]];
const statusValues = RISK_STATUS_OPTIONS.map((o) => o.value) as [RiskStatus, ...RiskStatus[]];

// Mirrors the backend's createRiskBodySchema / updateRiskBodySchema
// (backend/src/modules/risks/risks.schemas.ts) for the obvious mistakes.
// Selects hold strings ('' = nothing picked); `toCreateBody`/`toUpdateBody`
// convert them.
//
// The "mitigation required at score >= 15" rule is deliberately NOT
// enforced here: the form marks the field required as a hint, but the
// backend owns the rule and its 422 message is shown on the field
// (feature 17 spec: "still rely on the backend 422").
export const riskFormSchema = z.object({
  type: z.enum(typeValues, { error: 'Type is required' }),
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim(),
  ownerId: z.string().min(1, 'Owner is required'),
  probability: z.string().min(1, 'Probability is required'),
  impact: z.string().min(1, 'Impact is required'),
  mitigation: z.string().trim(),
  dueDate: z.string(),
  status: z.enum(statusValues, { error: 'Status is required' }),
});

export type RiskFormValues = z.infer<typeof riskFormSchema>;

export const RISK_FORM_FIELDS = [
  'type',
  'title',
  'description',
  'ownerId',
  'probability',
  'impact',
  'mitigation',
  'dueDate',
  'status',
] as const;

// The backend rejects empty strings (min length 1), so blank = omitted.
export function toCreateBody(v: RiskFormValues) {
  return {
    type: v.type,
    title: v.title,
    description: v.description || undefined,
    ownerId: Number(v.ownerId),
    probability: Number(v.probability),
    impact: Number(v.impact),
    mitigation: v.mitigation || undefined,
    dueDate: v.dueDate || undefined,
    status: v.status,
  };
}

type DirtyFields = Partial<Record<keyof RiskFormValues, boolean | undefined>>;

// PATCH sends only what the user changed (same approach as tasks): the
// audit diff stays minimal and untouched fields can't clobber a concurrent
// edit's intent. A cleared mitigation or due date becomes `null` (the
// PATCH schema allows it); a cleared description is left out because the
// backend can't blank it (min length 1, not nullable).
// An empty result means nothing changed; the caller skips the request.
export function toUpdateBody(v: RiskFormValues, dirty: DirtyFields): Omit<UpdateRiskBody, 'version'> {
  const body: Omit<UpdateRiskBody, 'version'> = {};
  if (dirty.type) body.type = v.type;
  if (dirty.title) body.title = v.title;
  if (dirty.description && v.description) body.description = v.description;
  if (dirty.ownerId) body.ownerId = Number(v.ownerId);
  if (dirty.probability) body.probability = Number(v.probability);
  if (dirty.impact) body.impact = Number(v.impact);
  if (dirty.mitigation) body.mitigation = v.mitigation || null;
  if (dirty.dueDate) body.dueDate = v.dueDate || null;
  if (dirty.status) body.status = v.status;
  return body;
}
