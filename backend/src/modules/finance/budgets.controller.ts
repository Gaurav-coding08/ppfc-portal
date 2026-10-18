import type { Request, Response } from 'express';
import * as budgetsService from './budgets.service.js';
import type {
  BudgetQuery,
  CreateRevisionBody,
  ProjectIdParams,
  RevisionDecisionBody,
  RevisionIdParams,
} from './budgets.schemas.js';

export async function getBudget(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as BudgetQuery;
  const budget = await budgetsService.getBudget(req.user!, projectId, query);
  res.status(200).json({ data: budget });
}

export async function createRevision(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateRevisionBody;
  const revision = await budgetsService.createRevision(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: revision });
}

export async function decideRevision(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as RevisionIdParams;
  const body = req.body as RevisionDecisionBody;
  const revision = await budgetsService.decideRevision(req.user!, id, body, req.id as string);
  res.status(200).json({ data: revision });
}
