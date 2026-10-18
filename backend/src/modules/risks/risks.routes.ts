import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as risksController from './risks.controller.js';
import {
  createRiskBodySchema,
  highExposureQuerySchema,
  projectIdParamsSchema,
  projectRisksQuerySchema,
  riskIdParamsSchema,
  risksListQuerySchema,
  updateRiskBodySchema,
} from './risks.schemas.js';

// Mounted at /api/v1/projects — nested under a project, alongside
// projects.routes.ts, tasks.routes.ts and milestones.routes.ts.
export const projectRisksRoutes = Router();

projectRisksRoutes.get(
  '/:projectId/risks',
  authenticate,
  validate({ params: projectIdParamsSchema, query: projectRisksQuerySchema }),
  asyncHandler(risksController.listProjectRisks),
);

projectRisksRoutes.post(
  '/:projectId/risks',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createRiskBodySchema }),
  asyncHandler(risksController.createRisk),
);

// Mounted at /api/v1/risks. `/high-exposure` is registered before `/:id` so
// it isn't swallowed by the `:id` param route (same reasoning as
// tasks.routes.ts's `/mine`).
export const risksRoutes = Router();

risksRoutes.get(
  '/',
  authenticate,
  validate({ query: risksListQuerySchema }),
  asyncHandler(risksController.listRisksScoped),
);

risksRoutes.get(
  '/high-exposure',
  authenticate,
  validate({ query: highExposureQuerySchema }),
  asyncHandler(risksController.listHighExposureRisks),
);

risksRoutes.get(
  '/:id',
  authenticate,
  validate({ params: riskIdParamsSchema }),
  asyncHandler(risksController.getRiskById),
);

risksRoutes.patch(
  '/:id',
  authenticate,
  validate({ params: riskIdParamsSchema, body: updateRiskBodySchema }),
  asyncHandler(risksController.updateRisk),
);
