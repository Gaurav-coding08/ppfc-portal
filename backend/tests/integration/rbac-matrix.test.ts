import { beforeAll, describe, expect, it } from 'vitest';
import { asProjectMember, type LoggedInUser } from '../helpers/auth.js';

// Table-driven RBAC matrix test: a contributor who is a project member
// cannot perform mutation actions reserved for project_manager or admin.
// Per CLAUDE.md: contributor can only update own assigned task progress/status,
// submit change requests, and view. Everything else is 403 or 404.

describe('rbac-matrix: contributor is blocked from mutation routes', () => {
  let contributor: LoggedInUser;

  beforeAll(async () => {
    contributor = await asProjectMember();
  });

  // Each entry: [description, method, path, body, expectedStatus]
  // 403 = role insufficient; 404 = out of scope or resource-level denial
  const MUTATION_ROUTES: [string, string, string, Record<string, unknown> | null, number][] = [
    // Projects: create, update
    ['create project', 'POST', '/api/v1/projects', { name: 'X', departmentId: 1, ownerId: 1, status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', initialBudget: 1000 }, 403],
    ['update project', 'PATCH', '/api/v1/projects/1', { name: 'X', version: 1 }, 403],

    // Project members: add, remove
    ['add member', 'POST', '/api/v1/projects/1/members', { userId: 5, memberRole: 'contributor' }, 403],
    ['remove member', 'DELETE', '/api/v1/projects/1/members/1', null, 403],

    // Tasks: create, delete (update own is allowed, tested elsewhere)
    ['create task', 'POST', '/api/v1/projects/1/tasks', { title: 'X', priority: 'low', dueDate: '2026-06-01', weight: 1 }, 403],
    ['delete task', 'DELETE', '/api/v1/tasks/1', null, 403],

    // Milestones: create, update
    ['create milestone', 'POST', '/api/v1/projects/1/milestones', { name: 'X', dueDate: '2026-06-01' }, 403],
    ['update milestone', 'PATCH', '/api/v1/milestones/1', { name: 'X', version: 1 }, 403],

    // Risks: create, update
    ['create risk', 'POST', '/api/v1/projects/1/risks', { type: 'risk', title: 'X', ownerId: 1, probability: 1, impact: 1 }, 403],
    ['update risk', 'PATCH', '/api/v1/risks/1', { title: 'X', version: 1 }, 403],

    // Change request decisions (submit is allowed for contributors)
    ['decide CR', 'POST', '/api/v1/change-requests/1/decision', { decision: 'approve', reason: 'ok', version: 1 }, 403],

    // Costs: create, update, delete, post, reverse
    ['create cost', 'POST', '/api/v1/projects/1/costs', { categoryId: 1, txnDate: '2026-06-01', amount: 100, description: 'X' }, 403],
    ['update cost', 'PATCH', '/api/v1/costs/1', { description: 'X', version: 1 }, 403],
    ['delete cost', 'DELETE', '/api/v1/costs/1', null, 403],
    ['post cost', 'POST', '/api/v1/costs/1/post', null, 403],

    // Budget revisions
    ['create budget revision', 'POST', '/api/v1/projects/1/budget-revisions', { amount: 1000, rationale: 'Need more budget for phase two', effectiveDate: '2026-06-01' }, 403],
    // Budget revision decisions (admin only, so 403 for contributor)
    ['decide budget revision', 'POST', '/api/v1/budget-revisions/1/decision', { decision: 'approve', reason: 'ok', version: 1 }, 403],

    // Forecasts: upsert
    ['upsert forecasts', 'PUT', '/api/v1/projects/1/forecasts', { months: [{ month: '2026-11', amount: 100 }] }, 403],

    // Cost categories (admin only)
    ['create cost category', 'POST', '/api/v1/cost-categories', { code: 'TST', name: 'Test' }, 403],
    ['update cost category', 'PATCH', '/api/v1/cost-categories/1', { name: 'Test', isActive: true }, 403],

    // Admin routes
    ['create user', 'POST', '/api/v1/admin/users', { email: 'x@x.com', fullName: 'X', role: 'contributor', departmentId: 1, password: 'Demo@1234' }, 403],
    ['update user', 'PATCH', '/api/v1/admin/users/1', { fullName: 'X', version: 1 }, 403],
    ['view audit events', 'GET', '/api/v1/admin/audit-events', null, 403],

    // Automation (admin only)
    ['run overdue escalation', 'POST', '/api/v1/admin/automation/overdue-escalation/run', null, 403],
    ['list automation runs', 'GET', '/api/v1/admin/automation/runs', null, 403],
    ['list outbox', 'GET', '/api/v1/admin/automation/outbox', null, 403],
    ['retry outbox event', 'POST', '/api/v1/admin/automation/outbox/1/retry', null, 403],
  ];

  it.each(
    MUTATION_ROUTES.map(([desc, method, path, body, status]) => ({
      desc, method, path, body, status,
    })),
  )('contributor cannot: $desc → $status', async ({ method, path, body, status }) => {
    const m = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    let req = contributor.agent[m](path);
    if (body) req = req.send(body);
    // Idempotency-Key required on certain POST routes
    if (method === 'POST' && (path.includes('/post') || path.includes('/decision'))) {
      req = req.set('Idempotency-Key', `rbac-test-${Date.now()}-${Math.random()}`);
    }
    const res = await req;
    expect(res.status).toBe(status);
  });
});
