import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { loginRateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as authController from './auth.controller.js';
import { loginBodySchema } from './auth.schemas.js';

export const authRoutes = Router();

authRoutes.post('/login', loginRateLimit, validate({ body: loginBodySchema }), asyncHandler(authController.login));
authRoutes.get('/me', asyncHandler(authController.me));
authRoutes.post('/logout', authController.logout);
