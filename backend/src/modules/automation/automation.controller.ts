import type { Request, Response } from 'express';
import * as automationService from './automation.service.js';
import type { OutboxIdParams, OutboxQuery, RunsQuery } from './automation.schemas.js';

export async function runOverdueEscalation(req: Request, res: Response): Promise<void> {
  const result = await automationService.runManualEscalation(req.user!, req.id as string);
  res.status(200).json({ data: result });
}

export async function listRuns(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as RunsQuery;
  const { rows, meta } = await automationService.listRuns(query);
  res.status(200).json({ data: rows, meta });
}

export async function listOutbox(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as OutboxQuery;
  const { rows, meta } = await automationService.listOutbox(query);
  res.status(200).json({ data: rows, meta });
}

export async function retryOutboxEvent(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as OutboxIdParams;
  await automationService.retryOutboxEvent(req.user!, id, req.id as string);
  res.status(200).json({ data: { id, status: 'pending' } });
}
