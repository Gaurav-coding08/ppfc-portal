import type { Request, Response } from 'express';
import * as dashboardService from './dashboard.service.js';
import type { DashboardFilters } from './dashboard.filters.js';
import type {
  DrillCostsQuery,
  DrillTasksQuery,
  DrillRisksQuery,
  DrillCrQuery,
} from './dashboard.schemas.js';

type F = DashboardFilters;

export async function getKpis(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getKpis(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getProjectHealth(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getProjectHealth(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getBudgetVsActual(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getBudgetVsActual(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getMonthlySpend(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getMonthlySpend(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getSpendByCategory(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getSpendByCategory(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getOverdueByOwner(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getOverdueByOwner(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getRiskMatrix(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getRiskMatrix(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function getMilestones(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getMilestones(req.user!, req.query as unknown as F);
  res.json(result);
}

export async function drillCosts(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.drillCosts(req.user!, req.query as unknown as DrillCostsQuery);
  res.json(result);
}

export async function drillTasks(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.drillTasks(req.user!, req.query as unknown as DrillTasksQuery);
  res.json(result);
}

export async function drillRisks(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.drillRisks(req.user!, req.query as unknown as DrillRisksQuery);
  res.json(result);
}

export async function drillChangeRequests(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.drillChangeRequests(req.user!, req.query as unknown as DrillCrQuery);
  res.json(result);
}

export async function getFilterOptions(req: Request, res: Response): Promise<void> {
  const result = await dashboardService.getFilterOptions(req.user!, req.query as unknown as F);
  res.json(result);
}
