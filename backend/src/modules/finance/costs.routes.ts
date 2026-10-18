import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as costsController from './costs.controller.js';
import {
  costIdParamsSchema,
  createCostBodySchema,
  crossProjectCostsQuerySchema,
  projectCostsQuerySchema,
  projectIdParamsSchema,
  reverseCostBodySchema,
  updateCostBodySchema,
} from './costs.schemas.js';

// Mounted at /api/v1/projects — nested under a project
export const projectCostRoutes = Router();

projectCostRoutes.get(
  '/:projectId/costs',
  authenticate,
  validate({ params: projectIdParamsSchema, query: projectCostsQuerySchema }),
  asyncHandler(costsController.listProjectCosts),
);

projectCostRoutes.post(
  '/:projectId/costs',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createCostBodySchema }),
  asyncHandler(costsController.createCost),
);

// Mounted at /api/v1/costs
export const costsRoutes = Router();

costsRoutes.get(
  '/',
  authenticate,
  validate({ query: crossProjectCostsQuerySchema }),
  asyncHandler(costsController.listCostsScoped),
);

costsRoutes.get(
  '/:id',
  authenticate,
  validate({ params: costIdParamsSchema }),
  asyncHandler(costsController.getCostById),
);

costsRoutes.patch(
  '/:id',
  authenticate,
  validate({ params: costIdParamsSchema, body: updateCostBodySchema }),
  asyncHandler(costsController.updateCost),
);

costsRoutes.delete(
  '/:id',
  authenticate,
  validate({ params: costIdParamsSchema }),
  asyncHandler(costsController.deleteCost),
);

costsRoutes.post(
  '/:id/post',
  authenticate,
  idempotent(),
  validate({ params: costIdParamsSchema }),
  asyncHandler(costsController.postCost),
);

costsRoutes.post(
  '/:id/reverse',
  authenticate,
  validate({ params: costIdParamsSchema, body: reverseCostBodySchema }),
  asyncHandler(costsController.reverseCost),
);
