import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Correlates one request across logs and the error response body. Reuses a
// caller-supplied x-request-id (useful for tracing across services/tests)
// instead of always generating a fresh one.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
