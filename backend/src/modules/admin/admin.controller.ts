import type { Request, Response } from 'express';
import * as adminService from './admin.service.js';
import type {
  ActivityQuery,
  AdminUserIdParams,
  AuditEventsQuery,
  CreateUserBody,
  ProjectIdParams,
  UpdateUserBody,
} from './admin.schemas.js';

export async function createUser(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserBody;
  const user = await adminService.createUser(req.user!, body, req.id as string);
  res.status(201).json({ data: user });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as AdminUserIdParams;
  const body = req.body as UpdateUserBody;
  const user = await adminService.updateUser(req.user!, id, body, req.id as string);
  res.status(200).json({ data: user });
}

export async function listAuditEvents(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as AuditEventsQuery;
  const { rows, meta } = await adminService.listAuditEvents(query);
  res.status(200).json({ data: rows, meta });
}

export async function listProjectActivity(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ActivityQuery;
  const { rows, meta } = await adminService.listProjectActivity(req.user!, projectId, query);
  res.status(200).json({ data: rows, meta });
}
