import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { validate } from '../../middleware/validate.js';
import * as automationController from './automation.controller.js';
import { outboxIdParamsSchema, outboxQuerySchema, runsQuerySchema } from './automation.schemas.js';

// Mounted at /api/v1/admin/automation — every route here is admin-only.
export const automationRoutes = Router();
automationRoutes.use(requireRole('admin'));

automationRoutes.post('/overdue-escalation/run', asyncHandler(automationController.runOverdueEscalation));

automationRoutes.get('/runs', validate({ query: runsQuerySchema }), asyncHandler(automationController.listRuns));

automationRoutes.get('/outbox', validate({ query: outboxQuerySchema }), asyncHandler(automationController.listOutbox));

automationRoutes.post(
  '/outbox/:id/retry',
  validate({ params: outboxIdParamsSchema }),
  asyncHandler(automationController.retryOutboxEvent),
);
