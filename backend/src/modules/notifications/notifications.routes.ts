import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as notificationsController from './notifications.controller.js';
import { notificationIdParamsSchema, notificationsQuerySchema } from './notifications.schemas.js';

// Mounted at /api/v1/notifications — any authenticated role; every
// handler scopes to the caller's own rows (see notifications.service.ts).
export const notificationsRoutes = Router();

notificationsRoutes.get(
  '/',
  validate({ query: notificationsQuerySchema }),
  asyncHandler(notificationsController.listMine),
);

notificationsRoutes.patch(
  '/:id/read',
  validate({ params: notificationIdParamsSchema }),
  asyncHandler(notificationsController.markRead),
);
