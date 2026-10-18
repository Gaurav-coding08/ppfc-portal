import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireRole } from '../../lib/access.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as categoriesController from './categories.controller.js';
import {
  categoryIdParamsSchema,
  categoryListQuerySchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from './categories.schemas.js';

// Mounted at /api/v1/cost-categories
export const costCategoriesRoutes = Router();

costCategoriesRoutes.get(
  '/',
  authenticate,
  validate({ query: categoryListQuerySchema }),
  asyncHandler(categoriesController.listCategories),
);

costCategoriesRoutes.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate({ body: createCategoryBodySchema }),
  asyncHandler(categoriesController.createCategory),
);

costCategoriesRoutes.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate({ params: categoryIdParamsSchema, body: updateCategoryBodySchema }),
  asyncHandler(categoriesController.updateCategory),
);
