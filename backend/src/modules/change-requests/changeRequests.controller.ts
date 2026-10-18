import type { Request, Response } from 'express';
import * as crService from './changeRequests.service.js';
import { decideCr, resubmitCr } from './changeRequests.decision.service.js';
import type {
  CreateCrBody,
  CrIdParams,
  CrListQuery,
  DecisionBody,
  ProjectIdParams,
  ResubmitBody,
} from './changeRequests.schemas.js';

export async function listCrs(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CrListQuery;
  const { rows, meta } = await crService.listCrs(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getCrById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CrIdParams;
  const { cr, history } = await crService.getCrById(req.user!, id);
  res.status(200).json({ data: { ...cr, history } });
}

export async function createCr(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateCrBody;
  const cr = await crService.createCr(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: cr });
}

export async function decide(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CrIdParams;
  const body = req.body as DecisionBody;
  const { cr, history } = await decideCr(req.user!, id, body, req.id as string);
  res.status(200).json({ data: { ...cr, history } });
}

export async function resubmit(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CrIdParams;
  const body = req.body as ResubmitBody;
  const { cr, history } = await resubmitCr(req.user!, id, body, req.id as string);
  res.status(200).json({ data: { ...cr, history } });
}
