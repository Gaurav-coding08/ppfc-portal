import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// A subset of the `pg` driver's DatabaseError shape we care about. Importing
// the real type would pull a hard dependency on `pg` into error handling for
// no benefit — we only ever read `.code`.
interface PgError extends Error {
  code?: string;
}

function isPgError(err: unknown): err is PgError {
  return err instanceof Error && typeof (err as PgError).code === 'string';
}

// Centralised so every route gets the same `{ error: { code, message,
// details?, requestId } }` shape and stack traces never leak to clients.
// Must be registered last, after all routes and notFoundHandler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR' satisfies ErrorCode,
        message: 'Request failed validation',
        details: err.flatten(),
        requestId: req.id,
      },
    });
    return;
  }

  if (isPgError(err)) {
    const mapped = mapPgErrorCode(err.code);
    if (mapped) {
      res
        .status(mapped.status)
        .json({ error: { code: mapped.code, message: mapped.message, requestId: req.id } });
      return;
    }
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  res
    .status(500)
    .json({ error: { code: 'INTERNAL' satisfies ErrorCode, message: 'Internal server error', requestId: req.id } });
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
function mapPgErrorCode(code: string | undefined): { status: number; code: ErrorCode; message: string } | null {
  switch (code) {
    case '23505': // unique_violation
      return { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Duplicate record' };
    case '23503': // foreign_key_violation
      return { status: 422, code: 'BUSINESS_RULE', message: 'Referenced record does not exist' };
    case '23514': // check_violation
      return { status: 422, code: 'BUSINESS_RULE', message: 'Record violates a data constraint' };
    default:
      return null;
  }
}
