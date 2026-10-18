import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as ctrl from './dashboard.controller.js';
import { baseQuerySchema, drillCostsQuerySchema, drillTasksQuerySchema, drillRisksQuerySchema, drillCrQuerySchema } from './dashboard.schemas.js';

export const dashboardRoutes = Router();

dashboardRoutes.get('/kpis', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getKpis));
dashboardRoutes.get('/project-health', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getProjectHealth));
dashboardRoutes.get('/budget-vs-actual-eac', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getBudgetVsActual));
dashboardRoutes.get('/monthly-spend', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getMonthlySpend));
dashboardRoutes.get('/spend-by-category', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getSpendByCategory));
dashboardRoutes.get('/overdue-by-owner', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getOverdueByOwner));
dashboardRoutes.get('/risk-matrix', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getRiskMatrix));
dashboardRoutes.get('/milestones', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getMilestones));
dashboardRoutes.get('/drill/costs', authenticate, validate({ query: drillCostsQuerySchema }), asyncHandler(ctrl.drillCosts));
dashboardRoutes.get('/drill/tasks', authenticate, validate({ query: drillTasksQuerySchema }), asyncHandler(ctrl.drillTasks));
dashboardRoutes.get('/drill/risks', authenticate, validate({ query: drillRisksQuerySchema }), asyncHandler(ctrl.drillRisks));
dashboardRoutes.get('/drill/change-requests', authenticate, validate({ query: drillCrQuerySchema }), asyncHandler(ctrl.drillChangeRequests));
dashboardRoutes.get('/filters', authenticate, validate({ query: baseQuerySchema }), asyncHandler(ctrl.getFilterOptions));
