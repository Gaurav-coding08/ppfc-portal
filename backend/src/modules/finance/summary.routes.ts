import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as summaryController from './summary.controller.js';
import {
  alertsQuerySchema,
  comparisonQuerySchema,
  projectIdParamsSchema,
  summaryQuerySchema,
} from './summary.schemas.js';

// Mounted at /api/v1/projects
export const projectSummaryRoutes = Router();

projectSummaryRoutes.get(
  '/:projectId/financial-summary',
  authenticate,
  validate({ params: projectIdParamsSchema, query: summaryQuerySchema }),
  asyncHandler(summaryController.getProjectSummary),
);

// Mounted at /api/v1/finance
export const financeRoutes = Router();

financeRoutes.get(
  '/alerts',
  authenticate,
  validate({ query: alertsQuerySchema }),
  asyncHandler(summaryController.getAlerts),
);

financeRoutes.get(
  '/comparison',
  authenticate,
  validate({ query: comparisonQuerySchema }),
  asyncHandler(summaryController.getComparison),
);
