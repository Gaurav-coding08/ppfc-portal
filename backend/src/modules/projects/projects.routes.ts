import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { validate } from '../../middleware/validate.js';
import * as projectsController from './projects.controller.js';
import {
  addMemberBodySchema,
  createProjectBodySchema,
  memberIdParamsSchema,
  progressSnapshotsQuerySchema,
  projectDetailQuerySchema,
  projectIdParamsSchema,
  projectsListQuerySchema,
  updateProjectBodySchema,
} from './projects.schemas.js';

// Mounted at /api/v1/projects, alongside admin.routes.ts's
// projectActivityRoutes (GET /:projectId/activity) — no path collisions.
export const projectsRoutes = Router();

projectsRoutes.get(
  '/',
  validate({ query: projectsListQuerySchema }),
  asyncHandler(projectsController.listProjects),
);

// Only a project_manager or admin may create a project; which owner they
// may assign is a business rule enforced in the service, not here.
projectsRoutes.post(
  '/',
  requireRole('project_manager', 'admin'),
  validate({ body: createProjectBodySchema }),
  asyncHandler(projectsController.createProject),
);

projectsRoutes.get(
  '/:id',
  validate({ params: projectIdParamsSchema, query: projectDetailQuerySchema }),
  asyncHandler(projectsController.getProjectById),
);

projectsRoutes.patch(
  '/:id',
  validate({ params: projectIdParamsSchema, body: updateProjectBodySchema }),
  asyncHandler(projectsController.updateProject),
);

projectsRoutes.get(
  '/:id/members',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(projectsController.listMembers),
);

projectsRoutes.post(
  '/:id/members',
  validate({ params: projectIdParamsSchema, body: addMemberBodySchema }),
  asyncHandler(projectsController.addMember),
);

projectsRoutes.delete(
  '/:id/members/:userId',
  validate({ params: memberIdParamsSchema }),
  asyncHandler(projectsController.removeMember),
);

projectsRoutes.get(
  '/:id/progress-snapshots',
  validate({ params: projectIdParamsSchema, query: progressSnapshotsQuerySchema }),
  asyncHandler(projectsController.listProgressSnapshots),
);
