import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes, projectActivityRoutes } from './modules/admin/admin.routes.js';
import { departmentsRoutes, usersRoutes } from './modules/users/users.routes.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { projectTasksRoutes, tasksRoutes } from './modules/tasks/tasks.routes.js';
import { milestonesRoutes, projectMilestonesRoutes } from './modules/milestones/milestones.routes.js';
import { projectRisksRoutes, risksRoutes } from './modules/risks/risks.routes.js';
import { changeRequestsRoutes, projectCrRoutes } from './modules/change-requests/changeRequests.routes.js';

// Builds the app without calling listen(), so tests can exercise it directly
// via supertest without binding a real port.
export function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
    }),
  );

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/departments', departmentsRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/projects', projectsRoutes);
  app.use('/api/v1/projects', projectActivityRoutes);
  app.use('/api/v1/projects', projectTasksRoutes);
  app.use('/api/v1/projects', projectMilestonesRoutes);
  app.use('/api/v1/tasks', tasksRoutes);
  app.use('/api/v1/milestones', milestonesRoutes);
  app.use('/api/v1/projects', projectRisksRoutes);
  app.use('/api/v1/risks', risksRoutes);
  app.use('/api/v1/projects', projectCrRoutes);
  app.use('/api/v1/change-requests', changeRequestsRoutes);

  app.get('/api/v1/health', async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ data: { status: 'ok', db: 'up' } });
    } catch (err) {
      next(err);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
