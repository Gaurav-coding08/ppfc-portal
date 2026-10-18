import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as milestonesController from './milestones.controller.js';
import {
  createMilestoneBodySchema,
  milestoneIdParamsSchema,
  milestonesListQuerySchema,
  projectIdParamsSchema,
  updateMilestoneBodySchema,
} from './milestones.schemas.js';

// Mounted at /api/v1/projects — nested under a project, alongside
// projects.routes.ts, tasks.routes.ts's projectTasksRoutes and
// admin.routes.ts's projectActivityRoutes.
export const projectMilestonesRoutes = Router();

projectMilestonesRoutes.get(
  '/:projectId/milestones',
  authenticate,
  validate({ params: projectIdParamsSchema, query: milestonesListQuerySchema }),
  asyncHandler(milestonesController.listProjectMilestones),
);

projectMilestonesRoutes.post(
  '/:projectId/milestones',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createMilestoneBodySchema }),
  asyncHandler(milestonesController.createMilestone),
);

// Mounted at /api/v1/milestones.
export const milestonesRoutes = Router();

milestonesRoutes.patch(
  '/:id',
  authenticate,
  validate({ params: milestoneIdParamsSchema, body: updateMilestoneBodySchema }),
  asyncHandler(milestonesController.updateMilestone),
);
