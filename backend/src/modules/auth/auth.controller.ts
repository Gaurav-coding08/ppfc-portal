import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import * as authService from './auth.service.js';
import type { LoginBody } from './auth.schemas.js';

const COOKIE_NAME = 'ppfc_token';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
};

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginBody;
  // req.id is typed as pino-http's ReqId (string | number | object) because
  // pino-http's own `http.IncomingMessage` augmentation shadows the
  // `string`-only one in middleware/requestId.ts, which is the only thing
  // that ever actually assigns it. It's always a string at runtime.
  const { user, token } = await authService.login(email, password, req.id as string);

  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: env.jwtExpiresInMs });
  res.status(200).json({ data: { user, token } });
}

export async function me(req: Request, res: Response): Promise<void> {
  // authenticate() has already loaded req.user from the DB for this request.
  const memberships = await authService.getMemberships(req.user!.id);
  res.status(200).json({ data: { user: req.user, memberships } });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).send();
}
