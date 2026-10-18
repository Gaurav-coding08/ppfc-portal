import type { Request, Response } from 'express';
import * as summaryService from './summary.service.js';
import type {
  AlertsQuery,
  ComparisonQuery,
  ProjectIdParams,
  SummaryQuery,
} from './summary.schemas.js';

export async function getProjectSummary(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as SummaryQuery;
  const result = await summaryService.getProjectSummary(req.user!, projectId, query);
  res.status(200).json({ data: result });
}

export async function getAlerts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as AlertsQuery;
  const result = await summaryService.getAlerts(req.user!, query);
  res.status(200).json({ data: result });
}

export async function getComparison(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ComparisonQuery;
  const result = await summaryService.getComparison(req.user!, query);
  res.status(200).json({ data: result });
}
