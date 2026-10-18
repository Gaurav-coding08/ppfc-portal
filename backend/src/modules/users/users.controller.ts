import type { Request, Response } from 'express';
import * as usersService from './users.service.js';
import type { UserIdParams, UsersListQuery } from './users.schemas.js';

export async function listDepartments(_req: Request, res: Response): Promise<void> {
  const data = await usersService.listDepartments();
  res.status(200).json({ data });
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as UsersListQuery;
  const { rows, meta } = await usersService.listUsers(req.user!, query);
  res.status(200).json({ data: rows, meta });
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as UserIdParams;
  const user = await usersService.getUserById(req.user!, id);
  res.status(200).json({ data: user });
}
