import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as authController from './auth.controller.js';
import { loginBodySchema } from './auth.schemas.js';

export const authRoutes = Router();

authRoutes.post('/login', loginRateLimit, validate({ body: loginBodySchema }), asyncHandler(authController.login));
authRoutes.get('/me', authenticate, asyncHandler(authController.me));
authRoutes.post('/logout', authenticate, authController.logout);
