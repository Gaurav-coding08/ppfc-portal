import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { api } from '../helpers/api.js';
import { asAdmin } from '../helpers/auth.js';
import { extractRoutes } from '../helpers/routeExtractor.js';

// Complete route inventory from docs/api-routes.md. Every route that
// exists in the app must appear here; if a new route is added and this
// list isn't updated, the route-check script (npm run routes:check)
// will catch it. The test below proves that every route except the
// two public ones rejects unauthenticated requests with 401.
//
// This inventory alone can't catch a route that's added to the app but
// never added here — doc and inventory would still agree with each
// other while the real app grew an unguarded route. The
// "live app matches ALL_ROUTES" block below closes that gap by walking
// the actual Express router stack (extractRoutes, previously unused)
// and diffing it against this array in both directions.
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

describe('authGate: the global gate, not per-route authenticate, decides unmatched paths', () => {
  it('an unknown path with no cookie returns 401, not 404', async () => {
    const res = await api().get('/api/v1/does-not-exist');

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('the same unknown path with a valid cookie returns 404', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('login and health remain reachable with no cookie at all', async () => {
    const health = await api().get('/api/v1/health');
    expect(health.status).toBe(200);

    const login = await api().post('/api/v1/auth/login').send({ email: 'nobody@ppfc.demo', password: 'wrong' });
    // 401 UNAUTHENTICATED here means the login handler ran and rejected bad
    // credentials — not the gate turning the request away before it got there.
    expect(login.status).toBe(401);
    expect(login.body.error?.code).toBe('UNAUTHENTICATED');
  });
});

// Normalizes both a live Express path (real param names, e.g. :projectId)
// and an ALL_ROUTES path (literal ids, e.g. /1) to the same canonical form,
// so the two sources can be diffed regardless of how a param is spelled.
function normalizePath(p: string): string {
  const withoutTrailingSlash = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  return withoutTrailingSlash
    .split('/')
    .map((segment) => (segment.startsWith(':') || /^\d+$/.test(segment) ? ':param' : segment))
    .join('/');
}

describe('route-guard: the live Express app matches the ALL_ROUTES inventory', () => {
  // HEAD is Express's automatic companion to GET, never something a route
  // file registers on purpose — drop it so it doesn't show up as "undocumented".
  const liveRoutes = extractRoutes(buildApp()).filter((r) => r.method !== 'HEAD');

  it('the extractor is actually walking a non-trivial router stack', () => {
    // A broken extractor (e.g. an Express major-version upgrade changes the
    // internal _router.stack shape) must fail loudly here, not pass
    // silently because an empty live set trivially has no undocumented routes.
    expect(liveRoutes.length).toBeGreaterThan(0);
    expect(liveRoutes.length).toBeGreaterThanOrEqual(ALL_ROUTES.length);
  });

  const liveSet = new Set(liveRoutes.map((r) => `${r.method} ${normalizePath(r.path)}`));
  const inventorySet = new Set(ALL_ROUTES.map((r) => `${r.method} ${normalizePath(r.path)}`));

  const undocumented = [...liveSet].filter((r) => !inventorySet.has(r)).sort();
  const stale = [...inventorySet].filter((r) => !liveSet.has(r)).sort();

  it('every route registered on the live app appears in ALL_ROUTES', () => {
    // Catches exactly the gap this block was added for: a route added to
    // app.ts/*.routes.ts but never added to ALL_ROUTES (so route-guard
    // never fires a 401 check against it) and never added to the doc
    // (so routes:check has nothing to disagree about either).
    expect(undocumented).toEqual([]);
  });

  it('every route in ALL_ROUTES is actually registered on the live app', () => {
    // Catches the mirror case: a route removed or renamed in the app
    // while a stale entry lingers in ALL_ROUTES/the doc.
    expect(stale).toEqual([]);
  });
});
