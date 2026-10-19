import { z } from 'zod';
import type { paths } from '@/api/schema';

export type CreateCostBody =
  paths['/projects/{projectId}/costs']['post']['requestBody']['content']['application/json'];
export type UpdateCostBody = paths['/costs/{id}']['patch']['requestBody']['content']['application/json'];
export type CreateRevisionBody =
  paths['/projects/{projectId}/budget-revisions']['post']['requestBody']['content']['application/json'];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date');

// Mirrors backend createCostBodySchema: category, date, amount > 0 and a
// description are required; vendor is optional. Values stay strings in
// the form (inputs hold strings) and are converted only when building the
// request body.
export const costFormSchema = z.object({
  categoryId: z.string().min(1, 'Choose a category'),
  txnDate: dateString,
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Amount must be greater than zero'),
  description: z.string().trim().min(1, 'Enter a description'),
  vendor: z.string().trim(),
});

export type CostFormValues = z.infer<typeof costFormSchema>;
export const COST_FORM_FIELDS = ['categoryId', 'txnDate', 'amount', 'description', 'vendor'] as const;

export function toCreateCostBody(v: CostFormValues): CreateCostBody {
  return {
    categoryId: Number(v.categoryId),
    txnDate: v.txnDate,
    amount: Number(v.amount),
    description: v.description.trim(),
    vendor: v.vendor.trim() || undefined,
  };
}

// Draft edits send only the changed fields (plus version), like tasks and
// risks. A cleared vendor is sent as null so the backend clears it.
export function toUpdateCostBody(
  v: CostFormValues,
  dirty: Partial<Record<keyof CostFormValues, boolean | undefined>>,
): Omit<UpdateCostBody, 'version'> {
  const body: Omit<UpdateCostBody, 'version'> = {};
  if (dirty.categoryId) body.categoryId = Number(v.categoryId);
  if (dirty.txnDate) body.txnDate = v.txnDate;
  if (dirty.amount) body.amount = Number(v.amount);
  if (dirty.description) body.description = v.description.trim();
  if (dirty.vendor) body.vendor = v.vendor.trim() || null;
  return body;
}

// Mirrors backend createRevisionBodySchema: a non-zero amount (negative
// reduces the budget), rationale of at least 10 characters, effective date.
export const revisionFormSchema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) !== 0, 'Amount must not be zero'),
  rationale: z.string().trim().min(10, 'Rationale must be at least 10 characters'),
  effectiveDate: dateString,
});

export type RevisionFormValues = z.infer<typeof revisionFormSchema>;
export const REVISION_FORM_FIELDS = ['amount', 'rationale', 'effectiveDate'] as const;

export function toRevisionBody(v: RevisionFormValues): CreateRevisionBody {
  return { amount: Number(v.amount), rationale: v.rationale.trim(), effectiveDate: v.effectiveDate };
}

// Mirrors backend createCategoryBodySchema.
export const categoryFormSchema = z.object({
  code: z.string().trim().min(1, 'Enter a code'),
  name: z.string().trim().min(1, 'Enter a name'),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export const CATEGORY_FORM_FIELDS = ['code', 'name'] as const;
