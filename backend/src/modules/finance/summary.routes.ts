import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
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
  validate({ params: projectIdParamsSchema, query: summaryQuerySchema }),
  asyncHandler(summaryController.getProjectSummary),
);

// Mounted at /api/v1/finance
export const financeRoutes = Router();

financeRoutes.get(
  '/alerts',
  validate({ query: alertsQuerySchema }),
  asyncHandler(summaryController.getAlerts),
);

financeRoutes.get(
  '/comparison',
  validate({ query: comparisonQuerySchema }),
  asyncHandler(summaryController.getComparison),
);
