import type { Request, Response } from 'express';
import * as risksService from './risks.service.js';
import { updateRisk as updateRiskService } from './risks.update.service.js';
import type {
  CreateRiskBody,
  HighExposureQuery,
  ProjectIdParams,
  ProjectRisksQuery,
  RiskIdParams,
  RisksListQuery,
  UpdateRiskBody,
} from './risks.schemas.js';

export async function listProjectRisks(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ProjectRisksQuery;
  const { rows, meta } = await risksService.listProjectRisks(req.user!, projectId, query);
  res.status(200).json({ data: rows, meta });
}

export async function listRisksScoped(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as RisksListQuery;
  const { rows, meta } = await risksService.listRisksScoped(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function listHighExposureRisks(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as HighExposureQuery;
  const { rows, meta } = await risksService.listHighExposureRisks(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getRiskById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as RiskIdParams;
  const risk = await risksService.getRiskById(req.user!, id);
  res.status(200).json({ data: risk });
}

export async function createRisk(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateRiskBody;
  const risk = await risksService.createRisk(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: risk });
}

export async function updateRisk(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as RiskIdParams;
  const body = req.body as UpdateRiskBody;
  const risk = await updateRiskService(req.user!, id, body, req.id as string);
  res.status(200).json({ data: risk });
}
