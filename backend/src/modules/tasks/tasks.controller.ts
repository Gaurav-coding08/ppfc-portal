import type { Request, Response } from 'express';
import * as tasksService from './tasks.service.js';
import { updateTask as updateTaskService } from './tasks.update.service.js';
import type {
  CreateTaskBody,
  MyTasksQuery,
  ProjectIdParams,
  ProjectTasksQuery,
  TaskDetailQuery,
  TaskIdParams,
  UpdateTaskBody,
} from './tasks.schemas.js';

export async function listProjectTasks(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ProjectTasksQuery;
  const { rows, meta } = await tasksService.listProjectTasks(req.user!, projectId, query);
  res.status(200).json({ data: rows, meta });
}

export async function listMyTasks(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as MyTasksQuery;
  const { rows, meta } = await tasksService.listMyTasks(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getTaskById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TaskIdParams;
  const query = req.query as unknown as TaskDetailQuery;
  const task = await tasksService.getTaskById(req.user!, id, query);
  res.status(200).json({ data: task });
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params as unknown as ProjectIdParams;
  const body = req.body as CreateTaskBody;
  const task = await tasksService.createTask(req.user!, projectId, body, req.id as string);
  res.status(201).json({ data: task });
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TaskIdParams;
  const body = req.body as UpdateTaskBody;
  const task = await updateTaskService(req.user!, id, body, req.id as string);
  res.status(200).json({ data: task });
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TaskIdParams;
  await tasksService.deleteTask(req.user!, id, req.id as string);
  res.status(204).send();
}
