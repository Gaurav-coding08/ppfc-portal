import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { authenticate } from '../../middleware/authenticate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as budgetsController from './budgets.controller.js';
import {
  budgetQuerySchema,
  createRevisionBodySchema,
  projectIdParamsSchema,
  revisionDecisionBodySchema,
  revisionIdParamsSchema,
} from './budgets.schemas.js';

// Mounted at /api/v1/projects — nested under a project
export const projectBudgetRoutes = Router();

projectBudgetRoutes.get(
  '/:projectId/budget',
  authenticate,
  validate({ params: projectIdParamsSchema, query: budgetQuerySchema }),
  asyncHandler(budgetsController.getBudget),
);

projectBudgetRoutes.post(
  '/:projectId/budget-revisions',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createRevisionBodySchema }),
  asyncHandler(budgetsController.createRevision),
);

// Mounted at /api/v1/budget-revisions
export const budgetRevisionsRoutes = Router();

budgetRevisionsRoutes.post(
  '/:id/decision',
  authenticate,
  requireRole('admin'),
  idempotent(),
  validate({ params: revisionIdParamsSchema, body: revisionDecisionBodySchema }),
  asyncHandler(budgetsController.decideRevision),
);
