import type { Request, Response } from 'express';
import * as categoriesService from './categories.service.js';
import type {
  CategoryIdParams,
  CategoryListQuery,
  CreateCategoryBody,
  UpdateCategoryBody,
} from './categories.schemas.js';

export async function listCategories(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CategoryListQuery;
  const rows = await categoriesService.listCategories(req.user!, query.includeInactive);
  res.status(200).json({ data: rows });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateCategoryBody;
  const category = await categoriesService.createCategory(body);
  res.status(201).json({ data: category });
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CategoryIdParams;
  const body = req.body as UpdateCategoryBody;
  const category = await categoriesService.updateCategory(id, body);
  res.status(200).json({ data: category });
}
