// Every error code the API can return, per CLAUDE.md's API conventions table.
export type ErrorCode =
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

// Thrown anywhere in the request lifecycle and caught by errorHandler, which
// maps it straight to `{ error: { code, message, details, requestId } }`.
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}

export function unauthenticated(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message = 'Not allowed', details?: unknown): AppError {
  return new AppError(403, 'FORBIDDEN', message, details);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, 'IDEMPOTENCY_CONFLICT', message, details);
}

export function versionConflict(message = 'Resource was modified by someone else', details?: unknown): AppError {
  return new AppError(409, 'VERSION_CONFLICT', message, details);
}

export function invalidTransition(message: string): AppError {
  return new AppError(422, 'INVALID_TRANSITION', message);
}

export function selfApproval(message = 'You cannot approve your own request'): AppError {
  return new AppError(422, 'SELF_APPROVAL_FORBIDDEN', message);
}

export function businessRule(message: string, details?: unknown): AppError {
  return new AppError(422, 'BUSINESS_RULE', message, details);
}
