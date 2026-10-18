import type { Request, Response } from 'express';
import * as milestonesService from './milestones.service.js';
import type {
  CreateMilestoneBody,
  MilestoneIdParams,
  MilestonesListQuery,
  ProjectIdParams,
  UpdateMilestoneBody,
} from './milestones.schemas.js';

export async function listProjectMilestones(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as MilestonesListQuery;
  const rows = await milestonesService.listProjectMilestones(req.user!, projectId, query);
  res.status(200).json({ data: rows });
}

export async function createMilestone(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateMilestoneBody;
  const milestone = await milestonesService.createMilestone(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: milestone });
}

export async function updateMilestone(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as MilestoneIdParams;
  const body = req.body as UpdateMilestoneBody;
  const milestone = await milestonesService.updateMilestone(req.user!, id, body, req.id as string);
  res.status(200).json({ data: milestone });
}
