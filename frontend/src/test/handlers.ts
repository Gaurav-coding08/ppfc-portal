import { http, HttpResponse } from 'msw';

// Must match the absolute origin `src/api/client.ts` uses under
// `import.meta.env.VITEST` — msw's relative-path handlers (`'/api/v1/...'`)
// don't reliably match requests built from an absolute base URL in this
// Node/undici test environment (no real browser `window.location` to
// resolve against), so every handler here uses the full URL instead.
export const API = 'http://localhost/api/v1';

// Default handlers represent a logged-out session against a reachable
// backend — the common starting point for most tests. Individual tests
// override one of these with `server.use(...)` for their specific case
// (e.g. a successful login, an authenticated `/auth/me`).
export const handlers = [
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', requestId: 'req-me-default' } },
      { status: 401 },
    ),
  ),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email === 'christelle.satterfield@ppfc.demo' && body.password === 'Demo@1234') {
      return HttpResponse.json({
        data: {
          user: {
            id: 2,
            email: body.email,
            fullName: 'Christelle Satterfield',
            role: 'project_manager',
            departmentId: 1,
          },
          token: 'test-token',
        },
      });
    }
    return HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password', requestId: 'req-login-1' } },
      { status: 401 },
    );
  }),

  http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/dashboard/kpis`, () =>
    HttpResponse.json({
      data: { kpis: [] },
      meta: {
        asOf: '2026-09-30',
        appliedFilters: [],
        ignoredFilters: [],
        generatedAt: '2026-10-18T00:00:00.000Z',
      },
    }),
  ),

  // The topbar bell polls this for every signed-in page; empty by default.
  http.get(`${API}/notifications`, () =>
    HttpResponse.json({ data: [], meta: { page: 1, pageSize: 8, total: 0 }, unreadCount: 0 }),
  ),
];
