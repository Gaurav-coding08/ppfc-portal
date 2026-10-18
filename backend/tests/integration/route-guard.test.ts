import { describe, expect, it } from 'vitest';
import { api } from '../helpers/api.js';

// Complete route inventory from docs/api-routes.md. Every route that
// exists in the app must appear here; if a new route is added and this
// list isn't updated, the route-check script (npm run routes:check)
// will catch it. The test below proves that every route except the
// two public ones rejects unauthenticated requests with 401.
const ALL_ROUTES: { method: string; path: string; public?: boolean }[] = [
  // Health
  { method: 'GET', path: '/api/v1/health', public: true },

  // Auth
  { method: 'POST', path: '/api/v1/auth/login', public: true },
  { method: 'GET', path: '/api/v1/auth/me' },
  { method: 'POST', path: '/api/v1/auth/logout' },

  // Departments
  { method: 'GET', path: '/api/v1/departments' },

  // Users
  { method: 'GET', path: '/api/v1/users' },
  { method: 'GET', path: '/api/v1/users/1' },

  // Admin
  { method: 'POST', path: '/api/v1/admin/users' },
  { method: 'PATCH', path: '/api/v1/admin/users/1' },
  { method: 'GET', path: '/api/v1/admin/audit-events' },

  // Project activity
  { method: 'GET', path: '/api/v1/projects/1/activity' },

  // Projects
  { method: 'GET', path: '/api/v1/projects' },
  { method: 'POST', path: '/api/v1/projects' },
  { method: 'GET', path: '/api/v1/projects/1' },
  { method: 'PATCH', path: '/api/v1/projects/1' },
  { method: 'GET', path: '/api/v1/projects/1/members' },
  { method: 'POST', path: '/api/v1/projects/1/members' },
  { method: 'DELETE', path: '/api/v1/projects/1/members/1' },
  { method: 'GET', path: '/api/v1/projects/1/progress-snapshots' },

  // Tasks
  { method: 'GET', path: '/api/v1/projects/1/tasks' },
  { method: 'POST', path: '/api/v1/projects/1/tasks' },
  { method: 'GET', path: '/api/v1/tasks/mine' },
  { method: 'GET', path: '/api/v1/tasks/1' },
  { method: 'PATCH', path: '/api/v1/tasks/1' },
  { method: 'DELETE', path: '/api/v1/tasks/1' },

  // Milestones
  { method: 'GET', path: '/api/v1/projects/1/milestones' },
  { method: 'POST', path: '/api/v1/projects/1/milestones' },
  { method: 'PATCH', path: '/api/v1/milestones/1' },

  // Risks
  { method: 'GET', path: '/api/v1/projects/1/risks' },
  { method: 'POST', path: '/api/v1/projects/1/risks' },
  { method: 'GET', path: '/api/v1/risks' },
  { method: 'GET', path: '/api/v1/risks/high-exposure' },
  { method: 'GET', path: '/api/v1/risks/1' },
  { method: 'PATCH', path: '/api/v1/risks/1' },

  // Change requests
  { method: 'POST', path: '/api/v1/projects/1/change-requests' },
  { method: 'GET', path: '/api/v1/change-requests' },
  { method: 'GET', path: '/api/v1/change-requests/1' },
  { method: 'POST', path: '/api/v1/change-requests/1/decision' },
  { method: 'POST', path: '/api/v1/change-requests/1/resubmit' },

  // Budget
  { method: 'GET', path: '/api/v1/projects/1/budget' },
  { method: 'POST', path: '/api/v1/projects/1/budget-revisions' },
  { method: 'POST', path: '/api/v1/budget-revisions/1/decision' },

  // Cost categories
  { method: 'GET', path: '/api/v1/cost-categories' },
  { method: 'POST', path: '/api/v1/cost-categories' },
  { method: 'PATCH', path: '/api/v1/cost-categories/1' },

  // Costs
  { method: 'GET', path: '/api/v1/projects/1/costs' },
  { method: 'POST', path: '/api/v1/projects/1/costs' },
  { method: 'GET', path: '/api/v1/costs' },
  { method: 'GET', path: '/api/v1/costs/1' },
  { method: 'PATCH', path: '/api/v1/costs/1' },
  { method: 'DELETE', path: '/api/v1/costs/1' },
  { method: 'POST', path: '/api/v1/costs/1/post' },
  { method: 'POST', path: '/api/v1/costs/1/reverse' },

  // Forecasts
  { method: 'GET', path: '/api/v1/projects/1/forecasts' },
  { method: 'PUT', path: '/api/v1/projects/1/forecasts' },

  // Financial summary
  { method: 'GET', path: '/api/v1/projects/1/financial-summary' },
  { method: 'GET', path: '/api/v1/finance/alerts' },
  { method: 'GET', path: '/api/v1/finance/comparison' },

  // Dashboard
  { method: 'GET', path: '/api/v1/dashboard/kpis' },
  { method: 'GET', path: '/api/v1/dashboard/project-health' },
  { method: 'GET', path: '/api/v1/dashboard/budget-vs-actual-eac' },
  { method: 'GET', path: '/api/v1/dashboard/monthly-spend' },
  { method: 'GET', path: '/api/v1/dashboard/spend-by-category' },
  { method: 'GET', path: '/api/v1/dashboard/overdue-by-owner' },
  { method: 'GET', path: '/api/v1/dashboard/risk-matrix' },
  { method: 'GET', path: '/api/v1/dashboard/milestones' },
  { method: 'GET', path: '/api/v1/dashboard/drill/costs' },
  { method: 'GET', path: '/api/v1/dashboard/drill/tasks' },
  { method: 'GET', path: '/api/v1/dashboard/drill/risks' },
  { method: 'GET', path: '/api/v1/dashboard/drill/change-requests' },
  { method: 'GET', path: '/api/v1/dashboard/filters' },
];

describe('route-guard: every route except public ones returns 401 without a token', () => {
  it('route inventory covers at least 70 routes', () => {
    expect(ALL_ROUTES.length).toBeGreaterThanOrEqual(70);
  });

  const protectedRoutes = ALL_ROUTES.filter((r) => !r.public);

  it.each(
    protectedRoutes.map((r) => ({
      label: `${r.method} ${r.path}`,
      method: r.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete',
      path: r.path,
    })),
  )('$label → 401 without token', async ({ method, path }) => {
    const res = await api()[method](path)
      .send(method !== 'get' && method !== 'delete' ? {} : undefined);

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });
});
