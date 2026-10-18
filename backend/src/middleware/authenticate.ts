import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthenticated } from '../lib/errors.js';
import { findActiveUserById, type UserRole } from '../modules/auth/auth.repository.js';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Resolves req.user from a JWT carried in the ppfc_token cookie or an
// Authorization: Bearer header (the latter for API tools/tests — see
// CLAUDE.md). The token payload only ever holds `{ sub: userId }`: role is
// deliberately NOT in the token, so it's re-read from the DB on every
// request and a role change/deactivation takes effect immediately instead
// of waiting for the token to expire.
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw unauthenticated();

    let decoded: JwtPayload;
    try {
      const verified = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof verified === 'string') throw new Error('unexpected string payload');
      decoded = verified;
    } catch {
      throw unauthenticated();
    }

    const userId = Number(decoded.sub);
    if (!Number.isInteger(userId)) throw unauthenticated();

    const user = await findActiveUserById(userId);
    if (!user) throw unauthenticated();

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.ppfc_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  const header = req.header('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length);

  return null;
}
