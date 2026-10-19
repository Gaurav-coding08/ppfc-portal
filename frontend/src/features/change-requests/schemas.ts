import { z } from 'zod';

// Mirrors backend changeRequests.schemas.ts. The backend rejects empty
// strings (min length 1) on optional text, so blank fields are omitted
// from the request body rather than sent as ''.

export const submitCrSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim(),
  impactSummary: z.string().trim(),
});

export type SubmitCrValues = z.infer<typeof submitCrSchema>;
export const SUBMIT_CR_FIELDS = ['title', 'description', 'impactSummary'] as const;

export function toSubmitBody(v: SubmitCrValues) {
  return {
    title: v.title,
    description: v.description || undefined,
    impactSummary: v.impactSummary || undefined,
  };
}

// Every decision (approve, reject, return) needs a reason: it is stored
// on the CR and in its history so the requester knows why.
export const decisionSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required for every decision'),
});

export type DecisionValues = z.infer<typeof decisionSchema>;

export const resubmitSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim(),
});

export type ResubmitValues = z.infer<typeof resubmitSchema>;
export const RESUBMIT_FIELDS = ['title', 'description'] as const;
