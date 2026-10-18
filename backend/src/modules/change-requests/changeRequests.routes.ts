import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as crController from './changeRequests.controller.js';
import {
  crIdParamsSchema,
  crListQuerySchema,
  createCrBodySchema,
  decisionBodySchema,
  projectIdParamsSchema,
  resubmitBodySchema,
} from './changeRequests.schemas.js';

// Mounted at /api/v1/projects — nested under a project.
export const projectCrRoutes = Router();

projectCrRoutes.post(
  '/:projectId/change-requests',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createCrBodySchema }),
  asyncHandler(crController.createCr),
);

// Mounted at /api/v1/change-requests.
export const changeRequestsRoutes = Router();

changeRequestsRoutes.get(
  '/',
  authenticate,
  validate({ query: crListQuerySchema }),
  asyncHandler(crController.listCrs),
);

changeRequestsRoutes.get(
  '/:id',
  authenticate,
  validate({ params: crIdParamsSchema }),
  asyncHandler(crController.getCrById),
);

changeRequestsRoutes.post(
  '/:id/decision',
  authenticate,
  idempotent(),
  validate({ params: crIdParamsSchema, body: decisionBodySchema }),
  asyncHandler(crController.decide),
);

changeRequestsRoutes.post(
  '/:id/resubmit',
  authenticate,
  validate({ params: crIdParamsSchema, body: resubmitBodySchema }),
  asyncHandler(crController.resubmit),
);
