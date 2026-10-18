import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 doesn't catch rejected promises from an async route handler —
// an unhandled rejection would just hang the request. Wrapping every async
// controller with this forwards the rejection to next(), so it reaches
// errorHandler like any synchronously-thrown error.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
