import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, type FieldErrorDetails } from '@/api/errors';

// CLAUDE.md "show field `details` inline on forms". A 400 VALIDATION_ERROR
// carries zod's flatten() output (`details.fieldErrors`, keyed by the same
// camelCase names the form uses), so each message is attached to its field.
// Anything that can't be pinned to a known field — a 422 business rule
// ("Owner must be an active project manager"), a field the form doesn't
// render, `formErrors` — is returned as one form-level message for the
// caller to show above the submit button.
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';

  const details = err.details as FieldErrorDetails | undefined;
  const leftovers: string[] = [...(details?.formErrors ?? [])];
  let attached = 0;

  for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
    if (!messages?.length) continue;
    if ((knownFields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message: messages[0] });
      attached += 1;
    } else {
      leftovers.push(`${field}: ${messages[0]}`);
    }
  }

  if (leftovers.length) return leftovers.join(' ');
  // Every message landed on a field — no extra banner needed.
  if (attached > 0) return null;
  return err.message;
}
