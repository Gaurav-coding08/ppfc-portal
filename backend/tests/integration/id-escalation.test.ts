import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loginAs } from '../helpers/auth.js';
import type { LoggedInUser } from '../helpers/auth.js';

// Cross-project ID escalation: a PM of project A calls /:id routes
// with IDs belonging to project B (which the PM does not manage).
// Every call must return 404 — never 200/403 — so the caller learns
// nothing about whether the resource exists in the other project.

describe('id-escalation: PM cannot access resources from another project', () => {
  // PM of PRJ-001 (user 2) tries to access resources from PRJ-002
  let pmA: LoggedInUser;
  let projectB: { taskId: number; riskId: number; milestoneId: number; crId: number; costId: number };

  beforeAll(async () => {
    // christelle.satterfield — PM of PRJ-001, not a member of PRJ-002
    pmA = await loginAs('christelle.satterfield@ppfc.demo');

    // Resolve IDs belonging to PRJ-002 from the test DB
    const connString = process.env.DATABASE_URL_TEST;
    if (!connString) throw new Error('DATABASE_URL_TEST is not set');
    const client = new pg.Client({ connectionString: connString });
    await client.connect();

    const [tasks, risks, milestones, crs, costs] = await Promise.all([
      client.query<{ id: number }>('SELECT id FROM tasks WHERE project_id = 2 LIMIT 1'),
      client.query<{ id: number }>('SELECT id FROM risks WHERE project_id = 2 LIMIT 1'),
      client.query<{ id: number }>('SELECT id FROM milestones WHERE project_id = 2 LIMIT 1'),
      client.query<{ id: number }>('SELECT id FROM change_requests WHERE project_id = 2 LIMIT 1'),
      client.query<{ id: number }>('SELECT id FROM cost_transactions WHERE project_id = 2 LIMIT 1'),
    ]);

    await client.end();

    projectB = {
      taskId: tasks.rows[0]!.id,
      riskId: risks.rows[0]!.id,
      milestoneId: milestones.rows[0]!.id,
      crId: crs.rows[0]!.id,
      costId: costs.rows[0]!.id,
    };
  });

  // Each entry: [description, method, pathFn]
  const ESCALATION_ROUTES: [string, string, () => string, Record<string, unknown> | null][] = [
    // Read routes — should get 404
    ['GET project', 'GET', () => `/api/v1/projects/2`, null],
    ['GET project tasks', 'GET', () => `/api/v1/projects/2/tasks`, null],
    ['GET project milestones', 'GET', () => `/api/v1/projects/2/milestones`, null],
    ['GET project risks', 'GET', () => `/api/v1/projects/2/risks`, null],
    ['GET project costs', 'GET', () => `/api/v1/projects/2/costs`, null],
    ['GET project budget', 'GET', () => `/api/v1/projects/2/budget`, null],
    ['GET project forecasts', 'GET', () => `/api/v1/projects/2/forecasts`, null],
    ['GET project financial-summary', 'GET', () => `/api/v1/projects/2/financial-summary`, null],
    ['GET project members', 'GET', () => `/api/v1/projects/2/members`, null],
    ['GET project activity', 'GET', () => `/api/v1/projects/2/activity`, null],

    // Cross-project /:id reads
    ['GET task by id', 'GET', () => `/api/v1/tasks/${projectB.taskId}`, null],
    ['GET risk by id', 'GET', () => `/api/v1/risks/${projectB.riskId}`, null],
    ['GET CR by id', 'GET', () => `/api/v1/change-requests/${projectB.crId}`, null],
    ['GET cost by id', 'GET', () => `/api/v1/costs/${projectB.costId}`, null],

    // Cross-project mutations
    ['PATCH task', 'PATCH', () => `/api/v1/tasks/${projectB.taskId}`, { progress: 50, version: 1 }],
    ['PATCH risk', 'PATCH', () => `/api/v1/risks/${projectB.riskId}`, { title: 'X', version: 1 }],
    ['PATCH milestone', 'PATCH', () => `/api/v1/milestones/${projectB.milestoneId}`, { name: 'X', version: 1 }],
    ['PATCH cost', 'PATCH', () => `/api/v1/costs/${projectB.costId}`, { description: 'X', version: 1 }],

    // Project-scoped creates on the other project
    ['POST task on B', 'POST', () => `/api/v1/projects/2/tasks`, { title: 'X', priority: 'low', dueDate: '2026-06-01', weight: 1 }],
    ['POST milestone on B', 'POST', () => `/api/v1/projects/2/milestones`, { name: 'X', dueDate: '2026-06-01' }],
    ['POST risk on B', 'POST', () => `/api/v1/projects/2/risks`, { type: 'risk', title: 'X', ownerId: 1, probability: 1, impact: 1 }],
    ['POST cost on B', 'POST', () => `/api/v1/projects/2/costs`, { categoryId: 1, txnDate: '2026-06-01', amount: 100, description: 'X' }],
    ['POST CR on B', 'POST', () => `/api/v1/projects/2/change-requests`, { title: 'X' }],
  ];

  it.each(
    ESCALATION_ROUTES.map(([desc, method, pathFn, body]) => ({
      desc, method, pathFn, body,
    })),
  )('$desc → 404', async ({ method, pathFn, body }) => {
    const m = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const path = pathFn();
    let req = pmA.agent[m](path);
    if (body) req = req.send(body);
    const res = await req;
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
