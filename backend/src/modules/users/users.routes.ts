import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as usersController from './users.controller.js';
import { userIdParamsSchema, usersListQuerySchema } from './users.schemas.js';

// Mounted at /api/v1/departments — reference data visible to any
// authenticated role (contributors need it too, e.g. a profile screen).
export const departmentsRoutes = Router();
departmentsRoutes.get('/', authenticate, asyncHandler(usersController.listDepartments));

// Mounted at /api/v1/users — assignee-picker lookups for PM and admin only
// (CLAUDE.md: contributors never see the user directory).
export const usersRoutes = Router();

usersRoutes.get(
  '/',
  authenticate,
  requireRole('project_manager', 'admin'),
  validate({ query: usersListQuerySchema }),
  asyncHandler(usersController.listUsers),
);

usersRoutes.get(
  '/:id',
  authenticate,
  requireRole('project_manager', 'admin'),
  validate({ params: userIdParamsSchema }),
  asyncHandler(usersController.getUserById),
);
