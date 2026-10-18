import type { NextFunction, Request, Response } from 'express';
import { authenticate } from './authenticate.js';

// Routes matched here are evaluated against req.path/req.method as seen
// *inside* this middleware, i.e. with the /api/v1 mount prefix already
// stripped by Express — so these are relative, not the full /api/v1/... URL.
const PUBLIC_ROUTES: { method: string; path: string }[] = [
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/health' },
];

// Single authentication gate for the whole API, mounted on /api/v1 before
// every router. Everything under it requires a valid session except the
// two routes above — so an unmatched or undocumented path 401s instead of
// falling through to notFoundHandler. This middleware answers "who are
// you"; routes and services still answer "what are you allowed to do"
// (requireRole, assertProjectAccess, etc.) exactly as before.
export function authGate(req: Request, res: Response, next: NextFunction): void {
  const isPublic = PUBLIC_ROUTES.some((r) => r.method === req.method && r.path === req.path);
  if (isPublic) {
    next();
    return;
  }
  void authenticate(req, res, next);
}
