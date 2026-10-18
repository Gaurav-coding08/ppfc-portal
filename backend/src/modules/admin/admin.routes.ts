import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { validate } from '../../middleware/validate.js';
import * as adminController from './admin.controller.js';
import {
  activityQuerySchema,
  adminUserIdParamsSchema,
  auditEventsQuerySchema,
  createUserBodySchema,
  projectIdParamsSchema,
  updateUserBodySchema,
} from './admin.schemas.js';

// Mounted at /api/v1/admin — every route here is admin-only.
export const adminRoutes = Router();
adminRoutes.use(requireRole('admin'));

adminRoutes.post('/users', validate({ body: createUserBodySchema }), asyncHandler(adminController.createUser));

adminRoutes.patch(
  '/users/:id',
  validate({ params: adminUserIdParamsSchema, body: updateUserBodySchema }),
  asyncHandler(adminController.updateUser),
);

adminRoutes.get(
  '/audit-events',
  validate({ query: auditEventsQuerySchema }),
  asyncHandler(adminController.listAuditEvents),
);

// Mounted at /api/v1/projects — access is project-scoped (view), not
// admin-only: a contributor can see activity on their own member projects.
export const projectActivityRoutes = Router();
projectActivityRoutes.get(
  '/:projectId/activity',
  validate({ params: projectIdParamsSchema, query: activityQuerySchema }),
  asyncHandler(adminController.listProjectActivity),
);
