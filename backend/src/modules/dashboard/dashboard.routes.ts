import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import * as ctrl from './dashboard.controller.js';
import { baseQuerySchema, drillCostsQuerySchema, drillTasksQuerySchema, drillRisksQuerySchema, drillCrQuerySchema } from './dashboard.schemas.js';

export const dashboardRoutes = Router();

dashboardRoutes.get('/kpis', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getKpis));
dashboardRoutes.get('/project-health', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getProjectHealth));
dashboardRoutes.get('/budget-vs-actual-eac', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getBudgetVsActual));
dashboardRoutes.get('/monthly-spend', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getMonthlySpend));
dashboardRoutes.get('/spend-by-category', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getSpendByCategory));
dashboardRoutes.get('/overdue-by-owner', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getOverdueByOwner));
dashboardRoutes.get('/risk-matrix', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getRiskMatrix));
dashboardRoutes.get('/milestones', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getMilestones));
dashboardRoutes.get('/drill/costs', validate({ query: drillCostsQuerySchema }), asyncHandler(ctrl.drillCosts));
dashboardRoutes.get('/drill/tasks', validate({ query: drillTasksQuerySchema }), asyncHandler(ctrl.drillTasks));
dashboardRoutes.get('/drill/risks', validate({ query: drillRisksQuerySchema }), asyncHandler(ctrl.drillRisks));
dashboardRoutes.get('/drill/change-requests', validate({ query: drillCrQuerySchema }), asyncHandler(ctrl.drillChangeRequests));
dashboardRoutes.get('/filters', validate({ query: baseQuerySchema }), asyncHandler(ctrl.getFilterOptions));
