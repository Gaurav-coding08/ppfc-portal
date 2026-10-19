// The backend's one error shape (CLAUDE.md "Errors (always)"):
//   { error: { code, message, details?, requestId } }
// Every place in the app that needs to show a failure parses the response
// into this type instead of reaching into `response.error...` ad hoc.

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'BUSINESS_RULE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;
  requestId: string;

  constructor(params: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
  }
}

interface BackendErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
}

// openapi-fetch gives us `{ data, error, response }` — `error` is already the
// parsed JSON body (or undefined on success). This turns that body plus the
// raw Response's status into a throwable ApiError with a safe fallback for
// a body that doesn't match the documented shape (e.g. a proxy error page).
export function toApiError(error: unknown, response: Response): ApiError {
  const body = error as BackendErrorBody | undefined;
  return new ApiError({
    status: response.status,
    code: (body?.error?.code as ApiErrorCode) ?? 'INTERNAL',
    message: body?.error?.message ?? 'Something went wrong. Please try again.',
    details: body?.error?.details,
    requestId: body?.error?.requestId ?? response.headers.get('x-request-id') ?? '',
  });
}

export function isForbidden(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'FORBIDDEN';
}

export function isVersionConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'VERSION_CONFLICT';
}

export function isValidation(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'VALIDATION_ERROR';
}

export function isNotFound(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'NOT_FOUND';
}

// Shape of `details` on a VALIDATION_ERROR (zod's flatten() output, see
// backend/src/middleware/validate.ts) — used to show field errors inline.
export interface FieldErrorDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
}

// Shape of `details` on a FORBIDDEN caused by a contributor touching fields
// they don't own (see backend tasks.update.service.ts).
export interface ForbiddenFieldDetails {
  fields?: string[];
}

// Shape of `details` on a VERSION_CONFLICT.
export interface VersionConflictDetails {
  currentVersion?: number;
}
