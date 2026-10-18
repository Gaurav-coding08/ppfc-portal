import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as tasksController from './tasks.controller.js';
import {
  createTaskBodySchema,
  myTasksQuerySchema,
  projectIdParamsSchema,
  projectTasksQuerySchema,
  taskDetailQuerySchema,
  taskIdParamsSchema,
  updateTaskBodySchema,
} from './tasks.schemas.js';

// Mounted at /api/v1/projects — nested under a project, alongside
// projects.routes.ts and admin.routes.ts's projectActivityRoutes.
export const projectTasksRoutes = Router();

projectTasksRoutes.get(
  '/:projectId/tasks',
  authenticate,
  validate({ params: projectIdParamsSchema, query: projectTasksQuerySchema }),
  asyncHandler(tasksController.listProjectTasks),
);

projectTasksRoutes.post(
  '/:projectId/tasks',
  authenticate,
  validate({ params: projectIdParamsSchema, body: createTaskBodySchema }),
  asyncHandler(tasksController.createTask),
);

// Mounted at /api/v1/tasks. `/mine` is registered before `/:id` so it isn't
// swallowed by the `:id` param route.
export const tasksRoutes = Router();

tasksRoutes.get(
  '/mine',
  authenticate,
  validate({ query: myTasksQuerySchema }),
  asyncHandler(tasksController.listMyTasks),
);

tasksRoutes.get(
  '/:id',
  authenticate,
  validate({ params: taskIdParamsSchema, query: taskDetailQuerySchema }),
  asyncHandler(tasksController.getTaskById),
);

tasksRoutes.patch(
  '/:id',
  authenticate,
  validate({ params: taskIdParamsSchema, body: updateTaskBodySchema }),
  asyncHandler(tasksController.updateTask),
);

tasksRoutes.delete(
  '/:id',
  authenticate,
  validate({ params: taskIdParamsSchema }),
  asyncHandler(tasksController.deleteTask),
);
