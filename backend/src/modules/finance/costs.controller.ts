import type { Request, Response } from 'express';
import * as costsService from './costs.service.js';
import type {
  CostIdParams,
  CreateCostBody,
  CrossProjectCostsQuery,
  ProjectCostsQuery,
  ProjectIdParams,
  ReverseCostBody,
  UpdateCostBody,
} from './costs.schemas.js';

export async function listProjectCosts(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ProjectCostsQuery;
  const { rows, meta } = await costsService.listProjectCosts(req.user!, projectId, query);
  res.status(200).json({ data: rows, meta });
}

export async function listCostsScoped(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CrossProjectCostsQuery;
  const { rows, meta } = await costsService.listCostsScoped(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getCostById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CostIdParams;
  const cost = await costsService.getCostById(req.user!, id);
  res.status(200).json({ data: cost });
}

export async function createCost(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateCostBody;
  const cost = await costsService.createCost(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: cost });
}

export async function updateCost(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CostIdParams;
  const body = req.body as UpdateCostBody;
  const cost = await costsService.updateCost(req.user!, id, body, req.id as string);
  res.status(200).json({ data: cost });
}

export async function deleteCost(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CostIdParams;
  await costsService.deleteCost(req.user!, id, req.id as string);
  res.status(204).end();
}

export async function postCost(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CostIdParams;
  const result = await costsService.postCost(req.user!, id, req.id as string);
  res.status(200).json({ data: result.cost, financials: result.financials });
}

export async function reverseCost(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CostIdParams;
  const body = req.body as ReverseCostBody;
  const cost = await costsService.reverseCost(req.user!, id, body, req.id as string);
  res.status(201).json({ data: cost });
}
