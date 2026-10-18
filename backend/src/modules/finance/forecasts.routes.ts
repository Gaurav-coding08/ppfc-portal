import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as forecastsController from './forecasts.controller.js';
import {
  forecastQuerySchema,
  projectIdParamsSchema,
  upsertForecastsBodySchema,
} from './forecasts.schemas.js';

// Mounted at /api/v1/projects
export const projectForecastRoutes = Router();

projectForecastRoutes.get(
  '/:projectId/forecasts',
  validate({ params: projectIdParamsSchema, query: forecastQuerySchema }),
  asyncHandler(forecastsController.listForecasts),
);

projectForecastRoutes.put(
  '/:projectId/forecasts',
  validate({ params: projectIdParamsSchema, query: forecastQuerySchema, body: upsertForecastsBodySchema }),
  asyncHandler(forecastsController.upsertForecasts),
);
