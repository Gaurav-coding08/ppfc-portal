import type { Request, Response } from 'express';
import * as forecastsService from './forecasts.service.js';
import type { ForecastQuery, ProjectIdParams, UpsertForecastsBody } from './forecasts.schemas.js';

export async function listForecasts(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ForecastQuery;
  const result = await forecastsService.listForecasts(req.user!, projectId, query);
  res.status(200).json({ data: result });
}

export async function upsertForecasts(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as UpsertForecastsBody;
  const query = req.query as unknown as ForecastQuery;
  const result = await forecastsService.upsertForecasts(req.user!, projectId, body, query, req.id as string);
  res.status(200).json({ data: result });
}
