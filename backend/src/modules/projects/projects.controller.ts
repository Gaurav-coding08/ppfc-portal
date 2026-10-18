import type { Request, Response } from 'express';
import * as membersService from './projects.members.service.js';
import * as projectsService from './projects.service.js';
import { updateProject as updateProjectService } from './projects.update.service.js';
import type {
  AddMemberBody,
  CreateProjectBody,
  MemberIdParams,
  ProgressSnapshotsQuery,
  ProjectDetailQuery,
  ProjectIdParams,
  ProjectsListQuery,
  UpdateProjectBody,
} from './projects.schemas.js';

export async function listProjects(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ProjectsListQuery;
  const { rows, meta } = await projectsService.listProjects(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getProjectById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ProjectDetailQuery;
  const project = await projectsService.getProjectDetail(req.user!, id, query);
  res.status(200).json({ data: project });
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateProjectBody;
  const project = await projectsService.createProject(req.user!, body, req.id as string);
  res.status(201).json({ data: project });
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProjectIdParams;
  const body = req.body as UpdateProjectBody;
  const project = await updateProjectService(req.user!, id, body, req.id as string);
  res.status(200).json({ data: project });
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProjectIdParams;
  const members = await membersService.listMembers(req.user!, id);
  res.status(200).json({ data: members });
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProjectIdParams;
  const body = req.body as AddMemberBody;
  const member = await membersService.addMember(req.user!, id, body, req.id as string);
  res.status(201).json({ data: member });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const { id, userId } = req.params as unknown as MemberIdParams;
  await membersService.removeMember(req.user!, id, userId, req.id as string);
  res.status(204).send();
}

export async function listProgressSnapshots(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ProjectIdParams;
  const query = req.query as unknown as ProgressSnapshotsQuery;
  const { rows, meta } = await membersService.listProgressSnapshots(req.user!, id, query);
  res.status(200).json({ data: rows, meta });
}
